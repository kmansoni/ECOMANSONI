/**
 * useAmapNavigation — integration hook that wires the full
 * Amap-level navigation pipeline together.
 *
 * Pipeline:
 *   Raw GPS → Kalman Filter → HMM Map Matching → Lane Graph → Lane Recommendation
 *                                                                     ↓
 *                                                              Road 3D Renderer
 *                                                              Navigation HUD
 *
 * This hook replaces/augments the existing useNavigation hook for
 * when the user is in active navigation mode.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { LatLng } from '@/types/taxi';
import type { NavigationState, NavRoute, RouteSegment, Maneuver } from '@/types/navigation';
import type { MatchedPosition } from '@/lib/navigation/mapMatcher';
import type { LaneRecommendation } from '@/lib/navigation/laneGraph';
import type { KalmanState, GPSReading } from '@/lib/navigation/kalmanFilter';
import { NavigationKalmanFilter } from '@/lib/navigation/kalmanFilter';
import { HMMMapMatcher, initMapMatcher } from '@/lib/navigation/mapMatcher';
import { getLaneGraph, getLaneRecommendation, type LaneGraph } from '@/lib/navigation/laneGraph';
import { loadOsmGraph, type OSMGraph } from '@/lib/navigation/osmGraph';
import { getRoad3DRenderer, type Road3DRenderer } from '@/lib/navigation/road3DRenderer';
import { recordFallbackUsage, recordPipelineConfidence } from '@/lib/navigation/navigationKpi';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AmapNavigationState {
  /** Kalman-filtered GPS state */
  filteredPosition: KalmanState | null;
  /** Map-matched position on road */
  matchedPosition: MatchedPosition | null;
  /** Lane recommendation for next maneuver */
  laneRecommendation: LaneRecommendation | null;
  /** Whether the pipeline is fully initialized */
  isReady: boolean;
  /** Pipeline initialization errors */
  errors: string[];
  /** Current speed from Kalman filter (km/h) */
  smoothedSpeed: number;
  /** Current heading from Kalman filter (degrees) */
  smoothedHeading: number;
  /** Road-matched speed limit (km/h) */
  currentSpeedLimit: number | null;
  /** Road name from map matching */
  currentRoadName: string;
  /** Match confidence [0..1] */
  matchConfidence: number;
}

interface AmapNavigationConfig {
  /** Enable Kalman filtering (default: true) */
  enableKalman?: boolean;
  /** Enable HMM map matching (default: true) */
  enableMapMatching?: boolean;
  /** Enable lane-level guidance (default: true) */
  enableLaneGuidance?: boolean;
  /** Enable 3D road rendering (default: true) */
  enable3DRoads?: boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAmapNavigation(
  navigationState: NavigationState,
  config: AmapNavigationConfig = {},
): AmapNavigationState & {
  /** Feed a raw GPS reading into the pipeline */
  feedGPS: (reading: GPSReading) => void;
  /** Get the 3D renderer instance (attach to map) */
  renderer: Road3DRenderer;
  /** Reset the pipeline (e.g., new trip) */
  resetPipeline: () => void;
} {
  const {
    enableKalman = true,
    enableMapMatching = true,
    enableLaneGuidance = true,
  } = config;

  // ── State ──────────────────────────────────────────────────────────────
  const [state, setState] = useState<AmapNavigationState>({
    filteredPosition: null,
    matchedPosition: null,
    laneRecommendation: null,
    isReady: false,
    errors: [],
    smoothedSpeed: 0,
    smoothedHeading: 0,
    currentSpeedLimit: null,
    currentRoadName: '',
    matchConfidence: 0,
  });

  // ── Refs (mutable pipeline components) ─────────────────────────────────
  const kalmanRef = useRef<NavigationKalmanFilter | null>(null);
  const matcherRef = useRef<HMMMapMatcher | null>(null);
  const laneGraphRef = useRef<LaneGraph | null>(null);
  const osmGraphRef = useRef<OSMGraph | null>(null);
  const rendererRef = useRef<Road3DRenderer>(getRoad3DRenderer());
  const initRef = useRef(false);

  // ── Initialize pipeline ────────────────────────────────────────────────
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const errors: string[] = [];

    async function init() {
      // 1. Kalman Filter
      if (enableKalman) {
        kalmanRef.current = new NavigationKalmanFilter({
          processNoiseAccel: 1.8e-5, // urban driving
          minMeasurementNoise: 2e-9,
          maxDtBeforeReset: 10,
          minSpeedForHeading: 1.5,
        });
      }

      // 2. Map Matcher
      if (enableMapMatching) {
        const matcherOk = await initMapMatcher();
        if (matcherOk) {
          matcherRef.current = new HMMMapMatcher();
          await matcherRef.current.init();
        } else {
          errors.push('Map matching: failed to load graph');
          recordFallbackUsage('pipeline', 'map_matching_init_failed');
        }
      }

      // 3. Lane Graph
      if (enableLaneGuidance) {
        const graph = await loadOsmGraph();
        if (graph) {
          osmGraphRef.current = graph;
          laneGraphRef.current = await getLaneGraph(graph);
        } else {
          errors.push('Lane guidance: failed to load graph');
          recordFallbackUsage('pipeline', 'lane_graph_init_failed');
        }
      }

      setState(prev => ({
        ...prev,
        isReady: true,
        errors,
      }));

      if (errors.length > 0) {
        console.warn('[AmapNav] Initialization warnings:', errors);
        recordPipelineConfidence(0.45, 'amap_pipeline', true, errors.join('; '));
      } else {
        console.log('[AmapNav] Pipeline fully initialized');
        recordPipelineConfidence(1, 'amap_pipeline', false, 'initialized');
      }
    }

    init();
  }, [enableKalman, enableLaneGuidance, enableMapMatching]);

  // ── Feed GPS reading through pipeline ──────────────────────────────────
  const feedGPS = useCallback(
    (reading: GPSReading) => {
      let filtered: KalmanState | null = null;
      let matched: MatchedPosition | null = null;
      let laneRec: LaneRecommendation | null = null;

      // Step 1: Kalman Filter
      if (kalmanRef.current) {
        filtered = kalmanRef.current.update(reading);
      } else {
        // Passthrough if Kalman disabled
        filtered = {
          lat: reading.lat,
          lng: reading.lng,
          vLat: 0,
          vLng: 0,
          speedMps: reading.speed ?? 0,
          heading: reading.heading ?? 0,
          accuracy: reading.accuracy ?? 15,
          timestamp: reading.timestamp,
        };
      }

      // Step 2: Map Matching
      if (matcherRef.current?.isReady && filtered) {
        matched = matcherRef.current.match(filtered);
      }

      if (filtered) {
        const confidence = matched?.confidence ?? 0;
        const fallback = !matched;
        recordPipelineConfidence(confidence, 'amap_live', fallback, fallback ? 'using_kalman_without_map_match' : 'matched');
      }

      // Step 3: Lane Recommendation
      if (
        laneGraphRef.current &&
        matched &&
        navigationState.nextInstruction
      ) {
        laneRec = getLaneRecommendation(
          matched.edgeIndex,
          navigationState.nextInstruction.type,
          navigationState.distanceToNextTurn,
          laneGraphRef.current,
        );
      }

      // Step 4: Update state
      setState(prev => ({
        ...prev,
        filteredPosition: filtered,
        matchedPosition: matched,
        laneRecommendation: laneRec,
        smoothedSpeed: filtered ? filtered.speedMps * 3.6 : prev.smoothedSpeed,
        smoothedHeading: filtered ? filtered.heading : prev.smoothedHeading,
        currentSpeedLimit: matched?.speedLimit ?? prev.currentSpeedLimit,
        currentRoadName: matched?.roadName ?? prev.currentRoadName,
        matchConfidence: matched?.confidence ?? prev.matchConfidence,
      }));
    },
    [navigationState.nextInstruction, navigationState.distanceToNextTurn],
  );

  // ── Auto-feed from navigator position updates ──────────────────────────
  useEffect(() => {
    if (!state.isReady) return;
    if (navigationState.phase !== 'navigating') return;
    if (!navigationState.currentPosition) return;

    const reading: GPSReading = {
      lat: navigationState.currentPosition.lat,
      lng: navigationState.currentPosition.lng,
      speed: (navigationState.currentSpeed / 3.6) || undefined, // km/h → m/s
      heading: navigationState.currentHeading || undefined,
      timestamp: Date.now(),
    };

    feedGPS(reading);
  }, [
    state.isReady,
    navigationState.phase,
    navigationState.currentPosition?.lat,
    navigationState.currentPosition?.lng,
    navigationState.currentSpeed,
    navigationState.currentHeading,
    feedGPS,
  ]);

  // ── Update 3D renderer when route changes ──────────────────────────────
  useEffect(() => {
    if (!state.isReady) return;
    if (!navigationState.route) return;

    const renderer = rendererRef.current;
    renderer.renderRoute(
      navigationState.route.geometry,
      navigationState.route.segments,
      state.laneRecommendation,
    );
  }, [
    state.isReady,
    state.laneRecommendation,
    navigationState.route,
  ]);

  // ── Reset pipeline ─────────────────────────────────────────────────────
  const resetPipeline = useCallback(() => {
    kalmanRef.current?.reset();
    matcherRef.current?.reset();
    rendererRef.current.removeAllLayers();
    setState(prev => ({
      ...prev,
      filteredPosition: null,
      matchedPosition: null,
      laneRecommendation: null,
      smoothedSpeed: 0,
      smoothedHeading: 0,
      currentSpeedLimit: null,
      currentRoadName: '',
      matchConfidence: 0,
    }));
  }, []);

  return {
    ...state,
    feedGPS,
    renderer: rendererRef.current,
    resetPipeline,
  };
}
