/**
 * 3D Road Renderer — Amap-style lane-level visualization.
 *
 * Renders road surfaces with:
 * - Lane markings (dashed/solid)
 * - Highlighted recommended lane (green glow)
 * - Road barriers/guardrails
 * - Speed limit signs
 * - Bridge/overpass elevation
 *
 * Uses MapLibre GL JS custom layers with WebGL for performance.
 */

import maplibregl from 'maplibre-gl';
import type { LaneRecommendation, LaneSegment } from './laneGraph';
import type { LatLng } from '@/types/taxi';
import type { RouteSegment, TrafficLevel } from '@/types/navigation';

// ── Constants ────────────────────────────────────────────────────────────────

const LANE_WIDTH_PX = 12; // lane width at zoom 17
const ROUTE_HIGHLIGHT_COLOR = '#00E676';
const ROUTE_HIGHLIGHT_GLOW = 'rgba(0, 230, 118, 0.3)';
const LANE_MARKING_COLOR = '#FFFFFF';
const LANE_MARKING_DASH = [2, 4]; // dashed center lines
const ROAD_SURFACE_COLOR = '#2D2D3D'; // dark road surface
const BARRIER_COLOR = '#888888';

const TRAFFIC_COLORS: Record<TrafficLevel, string> = {
  free: '#00E676',
  moderate: '#FFB300',
  slow: '#FF6D00',
  congested: '#F44336',
  unknown: '#42A5F5',
};

// ── Source/Layer IDs ─────────────────────────────────────────────────────────

const SRC_ROAD_SURFACE = 'amap-road-surface';
const SRC_LANE_MARKINGS = 'amap-lane-markings';
const SRC_ROUTE_HIGHLIGHT = 'amap-route-highlight';
const SRC_ROUTE_GLOW = 'amap-route-glow';
const SRC_LANE_ARROWS = 'amap-lane-arrows';
const SRC_BARRIERS = 'amap-barriers';
const SRC_SPEED_SIGNS = 'amap-speed-signs';

const LYR_ROAD_SURFACE = 'amap-road-surface-layer';
const LYR_LANE_MARKINGS = 'amap-lane-markings-layer';
const LYR_ROUTE_GLOW = 'amap-route-glow-layer';
const LYR_ROUTE_HIGHLIGHT = 'amap-route-highlight-layer';
const LYR_LANE_ARROWS = 'amap-lane-arrows-layer';
const LYR_BARRIERS = 'amap-barriers-layer';
const LYR_SPEED_SIGNS = 'amap-speed-signs-layer';

// ── GeoJSON helpers ──────────────────────────────────────────────────────────

function toLineString(points: LatLng[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map(p => [p.lng, p.lat]),
    },
  };
}

function toFeatureCollection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}

/** Offset a polyline laterally by a number of metres. */
function offsetPolyline(points: LatLng[], offsetMetres: number): LatLng[] {
  if (points.length < 2) return points;

  const result: LatLng[] = [];
  const M_PER_DEG_LAT = 111_320;

  for (let i = 0; i < points.length; i++) {
    let dx: number, dy: number;

    if (i === 0) {
      dx = points[1].lng - points[0].lng;
      dy = points[1].lat - points[0].lat;
    } else if (i === points.length - 1) {
      dx = points[i].lng - points[i - 1].lng;
      dy = points[i].lat - points[i - 1].lat;
    } else {
      dx = points[i + 1].lng - points[i - 1].lng;
      dy = points[i + 1].lat - points[i - 1].lat;
    }

    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-10) {
      result.push(points[i]);
      continue;
    }

    // Perpendicular (right-hand)
    const perpLat = -dx / len;
    const perpLng = dy / len;

    const mPerDegLng = M_PER_DEG_LAT * Math.cos((points[i].lat * Math.PI) / 180);
    const offsetLat = (offsetMetres * perpLat) / M_PER_DEG_LAT;
    const offsetLng = (offsetMetres * perpLng) / mPerDegLng;

    result.push({
      lat: points[i].lat + offsetLat,
      lng: points[i].lng + offsetLng,
    });
  }

  return result;
}

// ── Road 3D renderer class ───────────────────────────────────────────────────

export class Road3DRenderer {
  private map: maplibregl.Map | null = null;
  private sourcesAdded = new Set<string>();

  /** Attach to a MapLibre map instance. */
  attach(map: maplibregl.Map): void {
    this.map = map;
  }

  /** Detach and clean up all layers/sources. */
  detach(): void {
    if (!this.map) return;
    this.removeAllLayers();
    this.map = null;
  }

  /**
   * Render the route with Amap-style 3D lane visualization.
   */
  renderRoute(
    routeGeometry: LatLng[],
    segments: RouteSegment[],
    laneRecommendation: LaneRecommendation | null,
  ): void {
    if (!this.map || routeGeometry.length < 2) return;

    // 1. Route glow (wide, semi-transparent)
    this.updateLineSource(SRC_ROUTE_GLOW, LYR_ROUTE_GLOW, routeGeometry, {
      'line-color': ROUTE_HIGHLIGHT_GLOW,
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        12, 8,
        17, 28,
        20, 60,
      ],
      'line-blur': 4,
      'line-opacity': 0.6,
    });

    // 2. Route highlight (the green path Amap shows)
    const routeFeatures: GeoJSON.Feature[] = [];
    let pointIdx = 0;

    for (const seg of segments) {
      if (seg.points.length < 2) continue;
      routeFeatures.push({
        type: 'Feature',
        properties: {
          traffic: seg.traffic,
          color: TRAFFIC_COLORS[seg.traffic] || ROUTE_HIGHLIGHT_COLOR,
        },
        geometry: {
          type: 'LineString',
          coordinates: seg.points.map(p => [p.lng, p.lat]),
        },
      });
      pointIdx += seg.points.length;
    }

    // If no traffic segments, use full route
    if (routeFeatures.length === 0) {
      routeFeatures.push({
        type: 'Feature',
        properties: { color: ROUTE_HIGHLIGHT_COLOR },
        geometry: {
          type: 'LineString',
          coordinates: routeGeometry.map(p => [p.lng, p.lat]),
        },
      });
    }

    this.updateSource(SRC_ROUTE_HIGHLIGHT, toFeatureCollection(routeFeatures));
    this.ensureLayer(LYR_ROUTE_HIGHLIGHT, SRC_ROUTE_HIGHLIGHT, 'line', {
      'line-color': ['get', 'color'],
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        12, 4,
        17, 14,
        20, 30,
      ],
      'line-opacity': 0.9,
    }, {
      'line-cap': 'round',
      'line-join': 'round',
    });

    // 3. Lane markings along the route
    this.renderLaneMarkings(routeGeometry, laneRecommendation);

    // 4. Lane arrows (if recommendation available)
    if (laneRecommendation) {
      this.renderLaneArrows(routeGeometry, laneRecommendation);
    }
  }

  /**
   * Render lane markings (white dashed/solid lines between lanes).
   */
  private renderLaneMarkings(
    routeGeometry: LatLng[],
    recommendation: LaneRecommendation | null,
  ): void {
    if (!this.map) return;

    const totalLanes = recommendation?.totalLanes ?? 2;
    const features: GeoJSON.Feature[] = [];

    // Generate offset lines for each lane boundary
    const laneWidth = 3.5; // metres
    const totalWidth = totalLanes * laneWidth;

    for (let i = 1; i < totalLanes; i++) {
      const offset = (i - totalLanes / 2) * laneWidth;
      const offsetPoints = offsetPolyline(routeGeometry, offset);

      const isSolid =
        i === 0 || i === totalLanes; // edge lines are solid

      features.push({
        type: 'Feature',
        properties: {
          dashArray: isSolid ? null : LANE_MARKING_DASH,
          width: isSolid ? 2 : 1,
          color: LANE_MARKING_COLOR,
        },
        geometry: {
          type: 'LineString',
          coordinates: offsetPoints.map(p => [p.lng, p.lat]),
        },
      });
    }

    // Edge lines (road boundaries)
    const leftEdge = offsetPolyline(routeGeometry, -totalWidth / 2);
    const rightEdge = offsetPolyline(routeGeometry, totalWidth / 2);

    features.push({
      type: 'Feature',
      properties: { width: 2, color: '#FFFFFF' },
      geometry: {
        type: 'LineString',
        coordinates: leftEdge.map(p => [p.lng, p.lat]),
      },
    });

    features.push({
      type: 'Feature',
      properties: { width: 2, color: '#FFFFFF' },
      geometry: {
        type: 'LineString',
        coordinates: rightEdge.map(p => [p.lng, p.lat]),
      },
    });

    this.updateSource(SRC_LANE_MARKINGS, toFeatureCollection(features));
    this.ensureLayer(LYR_LANE_MARKINGS, SRC_LANE_MARKINGS, 'line', {
      'line-color': ['get', 'color'],
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        14, 0.5,
        17, 2,
        20, 4,
      ],
      'line-opacity': [
        'interpolate', ['linear'], ['zoom'],
        14, 0,
        15, 0.4,
        17, 0.8,
      ],
      'line-dasharray': [2, 4],
    }, {
      'line-cap': 'butt',
    });
  }

  /**
   * Render lane direction arrows on the road surface.
   */
  private renderLaneArrows(
    routeGeometry: LatLng[],
    recommendation: LaneRecommendation,
  ): void {
    if (!this.map || routeGeometry.length < 2) return;

    const features: GeoJSON.Feature[] = [];
    const laneWidth = 3.5;
    const totalLanes = recommendation.totalLanes;

    // Place arrows every ~100m along the route, near the decision point
    const arrowSpacing = 100; // metres
    const M_PER_DEG = 111_320;

    // Calculate distance along route
    let totalDist = 0;
    const distances: number[] = [0];
    for (let i = 1; i < routeGeometry.length; i++) {
      const d = Math.sqrt(
        ((routeGeometry[i].lat - routeGeometry[i - 1].lat) * M_PER_DEG) ** 2 +
          ((routeGeometry[i].lng - routeGeometry[i - 1].lng) * M_PER_DEG * Math.cos((routeGeometry[i].lat * Math.PI) / 180)) ** 2,
      );
      totalDist += d;
      distances.push(totalDist);
    }

    // Only render arrows within 500m of the decision point
    const startDist = Math.max(0, totalDist - recommendation.distanceToDecision);
    const endDist = totalDist;

    for (let dist = startDist; dist < endDist; dist += arrowSpacing) {
      // Find point at this distance
      let segIdx = 0;
      while (segIdx < distances.length - 1 && distances[segIdx + 1] < dist) segIdx++;

      if (segIdx >= routeGeometry.length - 1) continue;

      const segDist = distances[segIdx + 1] - distances[segIdx];
      const t = segDist > 0 ? (dist - distances[segIdx]) / segDist : 0;

      const baseLat = routeGeometry[segIdx].lat + t * (routeGeometry[segIdx + 1].lat - routeGeometry[segIdx].lat);
      const baseLng = routeGeometry[segIdx].lng + t * (routeGeometry[segIdx + 1].lng - routeGeometry[segIdx].lng);

      // Place arrow for each lane
      for (const lane of recommendation.lanes) {
        const offset = (lane.index - (totalLanes - 1) / 2) * laneWidth;
        const mPerDegLng = M_PER_DEG * Math.cos((baseLat * Math.PI) / 180);

        // Simple perpendicular offset
        const dx = routeGeometry[segIdx + 1].lng - routeGeometry[segIdx].lng;
        const dy = routeGeometry[segIdx + 1].lat - routeGeometry[segIdx].lat;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-10) continue;

        const perpLat = -dx / len;
        const perpLng = dy / len;

        const arrowLat = baseLat + (offset * perpLat) / M_PER_DEG;
        const arrowLng = baseLng + (offset * perpLng) / mPerDegLng;

        // Arrow direction symbol
        const dirSymbol = lane.directions[0] ?? 'through';

        features.push({
          type: 'Feature',
          properties: {
            direction: dirSymbol,
            isRecommended: lane.isRecommended,
            color: lane.isRecommended ? ROUTE_HIGHLIGHT_COLOR : '#AAAAAA',
            rotation: bearingDeg(
              routeGeometry[segIdx].lat, routeGeometry[segIdx].lng,
              routeGeometry[segIdx + 1].lat, routeGeometry[segIdx + 1].lng,
            ),
          },
          geometry: {
            type: 'Point',
            coordinates: [arrowLng, arrowLat],
          },
        });
      }
    }

    this.updateSource(SRC_LANE_ARROWS, toFeatureCollection(features));
    this.ensureLayer(LYR_LANE_ARROWS, SRC_LANE_ARROWS, 'symbol', {
      'text-color': ['get', 'color'],
      'text-size': [
        'interpolate', ['linear'], ['zoom'],
        15, 10,
        17, 18,
        20, 30,
      ],
      'text-opacity': [
        'interpolate', ['linear'], ['zoom'],
        14, 0,
        16, 0.7,
        17, 1,
      ],
    }, {
      'text-field': '↑',
      'text-rotate': ['get', 'rotation'],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    });
  }

  /**
   * Render speed limit signs along the route.
   */
  renderSpeedSigns(
    signs: Array<{ location: LatLng; speedLimit: number }>,
  ): void {
    if (!this.map) return;

    const features: GeoJSON.Feature[] = signs.map(sign => ({
      type: 'Feature',
      properties: {
        speedLimit: sign.speedLimit,
        label: `${sign.speedLimit}`,
      },
      geometry: {
        type: 'Point',
        coordinates: [sign.location.lng, sign.location.lat],
      },
    }));

    this.updateSource(SRC_SPEED_SIGNS, toFeatureCollection(features));
    this.ensureLayer(LYR_SPEED_SIGNS, SRC_SPEED_SIGNS, 'symbol', {
      'text-color': '#FF0000',
      'text-halo-color': '#FFFFFF',
      'text-halo-width': 2,
    }, {
      'text-field': ['get', 'label'],
      'text-size': 14,
      'icon-allow-overlap': true,
    });
  }

  /**
   * Render road barriers/guardrails.
   */
  renderBarriers(barrierLines: LatLng[][]): void {
    if (!this.map) return;

    const features: GeoJSON.Feature[] = barrierLines.map(line => ({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: line.map(p => [p.lng, p.lat]),
      },
    }));

    this.updateSource(SRC_BARRIERS, toFeatureCollection(features));
    this.ensureLayer(LYR_BARRIERS, SRC_BARRIERS, 'line', {
      'line-color': BARRIER_COLOR,
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        15, 1,
        17, 3,
        20, 6,
      ],
      'line-opacity': 0.7,
    });
  }

  /** Remove all renderer layers and sources. */
  removeAllLayers(): void {
    if (!this.map) return;
    const layerIds = [
      LYR_ROAD_SURFACE, LYR_LANE_MARKINGS, LYR_ROUTE_GLOW,
      LYR_ROUTE_HIGHLIGHT, LYR_LANE_ARROWS, LYR_BARRIERS, LYR_SPEED_SIGNS,
    ];
    const sourceIds = [
      SRC_ROAD_SURFACE, SRC_LANE_MARKINGS, SRC_ROUTE_GLOW,
      SRC_ROUTE_HIGHLIGHT, SRC_LANE_ARROWS, SRC_BARRIERS, SRC_SPEED_SIGNS,
    ];

    for (const id of layerIds) {
      if (this.map.getLayer(id)) {
        this.map.removeLayer(id);
      }
    }
    for (const id of sourceIds) {
      if (this.map.getSource(id)) {
        this.map.removeSource(id);
      }
    }
    this.sourcesAdded.clear();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private updateLineSource(
    sourceId: string,
    layerId: string,
    points: LatLng[],
    paint: Record<string, unknown>,
    layout?: Record<string, unknown>,
  ): void {
    const geojson = toFeatureCollection([toLineString(points)]);
    this.updateSource(sourceId, geojson);
    this.ensureLayer(layerId, sourceId, 'line', paint, layout);
  }

  private updateSource(sourceId: string, data: GeoJSON.FeatureCollection): void {
    if (!this.map) return;

    const source = this.map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
    } else {
      this.map.addSource(sourceId, {
        type: 'geojson',
        data,
      });
      this.sourcesAdded.add(sourceId);
    }
  }

  private ensureLayer(
    layerId: string,
    sourceId: string,
    type: 'line' | 'fill' | 'symbol' | 'circle',
    paint: Record<string, unknown>,
    layout?: Record<string, unknown>,
  ): void {
    if (!this.map) return;

    if (this.map.getLayer(layerId)) {
      // Update paint properties
      for (const [key, value] of Object.entries(paint)) {
        this.map.setPaintProperty(layerId, key, value);
      }
      return;
    }

    this.map.addLayer({
      id: layerId,
      type,
      source: sourceId,
      paint: paint as Record<string, unknown>,
      layout: layout as Record<string, unknown>,
    } as maplibregl.LayerSpecification);
  }
}

// ── Bearing helper ───────────────────────────────────────────────────────────

function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ── Singleton ────────────────────────────────────────────────────────────────

let _renderer: Road3DRenderer | null = null;

export function getRoad3DRenderer(): Road3DRenderer {
  if (!_renderer) {
    _renderer = new Road3DRenderer();
  }
  return _renderer;
}
