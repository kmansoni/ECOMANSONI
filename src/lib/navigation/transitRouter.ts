/**
 * TransitRouter — RAPTOR-like multimodal route planner.
 * Finds optimal transit routes with walk access/egress, transfers,
 * and optional taxi alternatives from transfer points.
 */

import type { LatLng } from '@/types/taxi';
import type {
  MultiModalRoute,
  MultiModalSegment,
  TransitStop,
  TransitTrip,
  TransitRoutingOptions,
  TransitType,
  TravelMode,
} from '@/types/navigation';
import {
  findNearbyStops,
  loadGTFSRoutes,
  loadGTFSTripsForRoute,
  loadStopTimesForTrip,
  loadGTFSCalendar,
  isServiceActiveOnDate,
  currentDaySeconds,
  secondsToTimeString,
  type GTFSRoute,
  type GTFSTrip,
  type GTFSStopTime,
} from '@/lib/transit/gtfsLoader';

const PEDESTRIAN_SPEED_KMH = 5.0;
const TRANSFER_PENALTY_SECONDS = 180; // 3 min transfer penalty
const MAX_WALK_KM = 1.5;
const MAX_CANDIDATES = 50;

// Haversine distance in km
function haversineKm(a: LatLng, b: LatLng): number {
  const dlat = (a.lat - b.lat) * 111.32;
  const dlng = (a.lng - b.lng) * 111.32 * Math.cos(a.lat * Math.PI / 180);
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

function walkDurationSeconds(distKm: number): number {
  return (distKm / PEDESTRIAN_SPEED_KMH) * 3600;
}

function walkSegment(from: LatLng, to: LatLng): MultiModalSegment {
  const dist = haversineKm(from, to);
  return {
    mode: 'walk',
    from,
    to,
    distanceMeters: dist * 1000,
    durationSeconds: walkDurationSeconds(dist),
    geometry: [from, to],
  };
}

interface TripCandidate {
  route: GTFSRoute;
  trip: GTFSTrip;
  stopTimes: GTFSStopTime[];
  boardStopIdx: number;
  alightStopIdx: number;
  boardStop: TransitStop;
  alightStop: TransitStop;
  boardTime: number;    // seconds since midnight
  alightTime: number;
  waitSeconds: number;
}

interface RouteCandidate {
  segments: MultiModalSegment[];
  totalDuration: number;
  totalDistance: number;
  transfers: number;
  description: string;
}

class TransitRouterEngine {
  private city = 'moscow'; // default city, can be set dynamically

  setCity(city: string): void {
    this.city = city;
  }

  async buildTransitRoute(
    from: LatLng,
    to: LatLng,
    opts: TransitRoutingOptions = {}
  ): Promise<{ main: MultiModalRoute; alternatives: MultiModalRoute[] }> {
    const maxTransfers = opts.maxTransfers ?? 2;
    const departureTime = opts.departureTime ?? new Date();
    const departureSecs = departureTime.getHours() * 3600 + departureTime.getMinutes() * 60;

    // 1. Find nearby stops from origin and destination
    const [fromStops, toStops] = await Promise.all([
      findNearbyStops(from, MAX_WALK_KM),
      findNearbyStops(to, MAX_WALK_KM),
    ]);

    if (fromStops.length === 0 || toStops.length === 0) {
      throw new Error('Остановки не найдены в радиусе доступности');
    }

    // 2. Load routes and calendar for city
    const [routes, calendars] = await Promise.all([
      loadGTFSRoutes(this.city),
      loadGTFSCalendar(this.city),
    ]);

    // Active service IDs for departure date
    const activeServices = new Set(
      calendars
        .filter(c => isServiceActiveOnDate(c, departureTime))
        .map(c => c.serviceId)
    );

    // 3. For each from-stop, find trips departing after departureTime
    const candidates: RouteCandidate[] = [];

    // Direct routes (0 transfers)
    for (const fs of fromStops.slice(0, 8)) {
      for (const ts of toStops.slice(0, 8)) {
        const directTrips = await this.findDirectTrips(
          fs.stop, ts.stop, routes, activeServices, departureSecs
        );

        for (const tc of directTrips.slice(0, 3)) {
          const accessWalk = walkSegment(from, fs.stop.location);
          const egressWalk = walkSegment(ts.stop.location, to);
          const transitSeg = this.tripToSegment(tc);

          const totalDur = accessWalk.durationSeconds + tc.waitSeconds +
            (tc.alightTime - tc.boardTime) + egressWalk.durationSeconds;

          candidates.push({
            segments: [accessWalk, transitSeg, egressWalk],
            totalDuration: totalDur,
            totalDistance: accessWalk.distanceMeters + transitSeg.distanceMeters + egressWalk.distanceMeters,
            transfers: 0,
            description: `${tc.route.shortName} (${secondsToTimeString(tc.boardTime)}–${secondsToTimeString(tc.alightTime)})`,
          });
        }
      }
    }

    // 1-transfer routes
    if (maxTransfers >= 1 && candidates.length < 5) {
      const transferCandidates = await this.findOneTransferRoutes(
        from, to, fromStops, toStops, routes, activeServices, departureSecs
      );
      candidates.push(...transferCandidates);
    }

    // Sort by optimization criteria
    const sortKey = opts.minimize ?? 'time';
    candidates.sort((a, b) => {
      if (sortKey === 'transfers') return a.transfers - b.transfers || a.totalDuration - b.totalDuration;
      return a.totalDuration - b.totalDuration;
    });

    if (candidates.length === 0) {
      throw new Error('Маршруты общественного транспорта не найдены');
    }

    const toMultiModal = (c: RouteCandidate, idx: number): MultiModalRoute => ({
      id: `transit-${Date.now()}-${idx}`,
      travelMode: 'transit' as TravelMode,
      segments: c.segments,
      totalDistanceMeters: c.totalDistance,
      totalDurationSeconds: c.totalDuration,
      transfers: c.transfers,
      accessibilityScore: this.computeAccessibility(c.segments, opts),
      ecoScore: this.computeEcoScore(c.segments),
      description: c.description,
    });

    const main = toMultiModal(candidates[0], 0);
    const alternatives = candidates.slice(1, 4).map((c, i) => toMultiModal(c, i + 1));

    return { main, alternatives };
  }

  private async findDirectTrips(
    fromStop: TransitStop,
    toStop: TransitStop,
    routes: GTFSRoute[],
    activeServices: Set<string>,
    departureSecs: number
  ): Promise<TripCandidate[]> {
    const results: TripCandidate[] = [];

    for (const route of routes) {
      const trips = await loadGTFSTripsForRoute(route.id);
      const activeTrips = trips.filter(t => activeServices.has(t.serviceId));

      for (const trip of activeTrips.slice(0, 5)) {
        const stopTimes = await loadStopTimesForTrip(trip.id);

        const boardIdx = stopTimes.findIndex(st => st.stopId === fromStop.id);
        const alightIdx = stopTimes.findIndex(st => st.stopId === toStop.id);

        if (boardIdx >= 0 && alightIdx > boardIdx) {
          const boardTime = stopTimes[boardIdx].departureSeconds;
          const alightTime = stopTimes[alightIdx].arrivalSeconds;

          if (boardTime >= departureSecs) {
            results.push({
              route,
              trip,
              stopTimes,
              boardStopIdx: boardIdx,
              alightStopIdx: alightIdx,
              boardStop: fromStop,
              alightStop: toStop,
              boardTime,
              alightTime,
              waitSeconds: boardTime - departureSecs,
            });
          }
        }
      }
    }

    return results.sort((a, b) => a.boardTime - b.boardTime).slice(0, MAX_CANDIDATES);
  }

  private async findOneTransferRoutes(
    from: LatLng,
    to: LatLng,
    fromStops: Array<{ stop: TransitStop; distKm: number }>,
    toStops: Array<{ stop: TransitStop; distKm: number }>,
    routes: GTFSRoute[],
    activeServices: Set<string>,
    departureSecs: number
  ): Promise<RouteCandidate[]> {
    const candidates: RouteCandidate[] = [];

    // Strategy: for each from-stop, find trips to all intermediate stops,
    // then from those intermediate stops find trips to destination stops.
    for (const fs of fromStops.slice(0, 5)) {
      for (const route1 of routes.slice(0, 20)) {
        const trips1 = await loadGTFSTripsForRoute(route1.id);
        const activeTrips1 = trips1.filter(t => activeServices.has(t.serviceId));

        for (const trip1 of activeTrips1.slice(0, 2)) {
          const stopTimes1 = await loadStopTimesForTrip(trip1.id);
          const boardIdx1 = stopTimes1.findIndex(st => st.stopId === fs.stop.id);
          if (boardIdx1 < 0) continue;
          if (stopTimes1[boardIdx1].departureSeconds < departureSecs) continue;

          // Check each subsequent stop as a transfer point
          for (let i = boardIdx1 + 1; i < stopTimes1.length && i < boardIdx1 + 15; i++) {
            const transferStopId = stopTimes1[i].stopId;
            const transferArrival = stopTimes1[i].arrivalSeconds;

            // Find trips from transfer stop to destination
            for (const ts of toStops.slice(0, 5)) {
              for (const route2 of routes.slice(0, 20)) {
                if (route2.id === route1.id) continue;
                const trips2 = await loadGTFSTripsForRoute(route2.id);
                const activeTrips2 = trips2.filter(t => activeServices.has(t.serviceId));

                for (const trip2 of activeTrips2.slice(0, 2)) {
                  const stopTimes2 = await loadStopTimesForTrip(trip2.id);
                  const boardIdx2 = stopTimes2.findIndex(st => st.stopId === transferStopId);
                  const alightIdx2 = stopTimes2.findIndex(st => st.stopId === ts.stop.id);

                  if (boardIdx2 >= 0 && alightIdx2 > boardIdx2) {
                    const boardTime2 = stopTimes2[boardIdx2].departureSeconds;
                    if (boardTime2 < transferArrival + TRANSFER_PENALTY_SECONDS) continue;

                    const accessWalk = walkSegment(from, fs.stop.location);
                    const seg1 = this.tripCandidateToSegment(
                      route1, trip1, stopTimes1, boardIdx1, i, fs.stop
                    );
                    const transferWalk = walkSegment(
                      { lat: 0, lng: 0 }, // placeholder — same stop
                      { lat: 0, lng: 0 }
                    );
                    transferWalk.durationSeconds = TRANSFER_PENALTY_SECONDS;
                    transferWalk.distanceMeters = 0;

                    const seg2 = this.tripCandidateToSegment(
                      route2, trip2, stopTimes2, boardIdx2, alightIdx2, ts.stop
                    );
                    const egressWalk = walkSegment(ts.stop.location, to);

                    const totalDur = accessWalk.durationSeconds +
                      (stopTimes1[i].arrivalSeconds - stopTimes1[boardIdx1].departureSeconds) +
                      TRANSFER_PENALTY_SECONDS +
                      (stopTimes2[alightIdx2].arrivalSeconds - boardTime2) +
                      egressWalk.durationSeconds;

                    candidates.push({
                      segments: [accessWalk, seg1, transferWalk, seg2, egressWalk],
                      totalDuration: totalDur,
                      totalDistance: accessWalk.distanceMeters + seg1.distanceMeters + seg2.distanceMeters + egressWalk.distanceMeters,
                      transfers: 1,
                      description: `${route1.shortName} → ${route2.shortName}`,
                    });

                    if (candidates.length >= MAX_CANDIDATES) return candidates;
                  }
                }
              }
            }
          }
        }
      }
    }

    return candidates;
  }

  private tripToSegment(tc: TripCandidate): MultiModalSegment {
    const transitTrip: TransitTrip = {
      id: tc.trip.tripId,
      routeId: tc.route.routeId,
      routeName: tc.route.shortName || tc.route.longName,
      routeType: tc.route.type,
      routeColor: tc.route.color,
      headsign: tc.trip.headsign,
      stops: [],
      duration: tc.alightTime - tc.boardTime,
      distance: 0,
      schedule: {},
      predictedArrivals: [],
    };

    return {
      mode: 'transit',
      from: tc.boardStop.location,
      to: tc.alightStop.location,
      distanceMeters: haversineKm(tc.boardStop.location, tc.alightStop.location) * 1000 * 1.3,
      durationSeconds: tc.alightTime - tc.boardTime,
      geometry: [tc.boardStop.location, tc.alightStop.location],
      trip: transitTrip,
      fromStop: tc.boardStop,
      toStop: tc.alightStop,
    };
  }

  private tripCandidateToSegment(
    route: GTFSRoute,
    trip: GTFSTrip,
    stopTimes: GTFSStopTime[],
    boardIdx: number,
    alightIdx: number,
    boardOrAlightStop: TransitStop
  ): MultiModalSegment {
    const duration = stopTimes[alightIdx].arrivalSeconds - stopTimes[boardIdx].departureSeconds;

    const transitTrip: TransitTrip = {
      id: trip.tripId,
      routeId: route.routeId,
      routeName: route.shortName || route.longName,
      routeType: route.type,
      routeColor: route.color,
      headsign: trip.headsign,
      stops: [],
      duration,
      distance: 0,
      schedule: {},
      predictedArrivals: [],
    };

    return {
      mode: 'transit',
      from: boardOrAlightStop.location,
      to: boardOrAlightStop.location,
      distanceMeters: 0,
      durationSeconds: duration,
      geometry: [boardOrAlightStop.location],
      trip: transitTrip,
      fromStop: boardOrAlightStop,
      toStop: boardOrAlightStop,
    };
  }

  private computeAccessibility(
    segments: MultiModalSegment[],
    opts: TransitRoutingOptions
  ): number {
    if (!opts.wheelchairAccessible) return 1.0;
    let score = 1.0;
    for (const seg of segments) {
      if (seg.mode === 'walk' && seg.distanceMeters > 500) score -= 0.2;
      // Transit accessibility can be checked from trip.wheelchairAccessible
    }
    return Math.max(0, Math.min(1, score));
  }

  private computeEcoScore(segments: MultiModalSegment[]): number {
    let score = 8; // transit is eco-friendly baseline
    for (const seg of segments) {
      if (seg.mode === 'walk') score += 0.5;
      if (seg.mode === 'car') score -= 3;
      if (seg.trip?.routeType === 'metro' || seg.trip?.routeType === 'tram') score += 0.5;
    }
    return Math.max(0, Math.min(10, score));
  }
}

export const transitRouter = new TransitRouterEngine();
