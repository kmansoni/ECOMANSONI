/**
 * DynamicRerouter — monitors traffic conditions along the current route
 * and automatically suggests better routes when significant improvements
 * are available. Uses traffic data + road events + time predictions.
 */

import type { LatLng } from '@/types/taxi';
import type { NavRoute } from '@/types/navigation';
import { fetchTrafficAround } from './trafficProvider';
import type { TrafficSegment } from './trafficProvider';
import { recordFallbackUsage } from './navigationKpi';

const REROUTE_CHECK_INTERVAL_MS = 10_000; // check every 10s
const MIN_REROUTE_INTERVAL_MS = 120_000;  // don't reroute more than once per 2min
const IMPROVEMENT_THRESHOLD = 0.10;       // 10% time improvement required
const SLOW_SPEED_THRESHOLD_KMH = 15;
const POSITION_HISTORY_MAX = 60;          // 10 min at 10s interval

export interface RerouteEvent {
  oldRoute: NavRoute;
  newRoute: NavRoute;
  timeSavedSeconds: number;
  reason: 'traffic' | 'road_event' | 'off_route';
}

export type RerouteCallback = (event: RerouteEvent) => void;

export class DynamicRerouter {
  private currentRoute: NavRoute | null = null;
  private watchInterval: ReturnType<typeof setInterval> | null = null;
  private positionProvider: (() => LatLng | null) | null = null;
  private destinationProvider: (() => LatLng | null) | null = null;
  private positionHistory: Array<{ ts: number; pos: LatLng }> = [];
  private lastRerouteTime = 0;
  private onReroute: RerouteCallback | null = null;
  private stopped = false;

  start(
    route: NavRoute,
    positionProvider: () => LatLng | null,
    destinationProvider: () => LatLng | null,
    onReroute: RerouteCallback
  ): void {
    this.currentRoute = route;
    this.positionProvider = positionProvider;
    this.destinationProvider = destinationProvider;
    this.onReroute = onReroute;
    this.positionHistory = [];
    this.stopped = false;

    this.watchInterval = setInterval(() => {
      void this.check();
    }, REROUTE_CHECK_INTERVAL_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
    this.positionHistory = [];
  }

  updateRoute(route: NavRoute): void {
    this.currentRoute = route;
  }

  private async check(): Promise<void> {
    if (this.stopped || !this.currentRoute || !this.positionProvider || !this.destinationProvider) return;

    const pos = this.positionProvider();
    const dest = this.destinationProvider();
    if (!pos || !dest) return;

    // Record position
    this.positionHistory.push({ ts: Date.now(), pos });
    if (this.positionHistory.length > POSITION_HISTORY_MAX) {
      this.positionHistory.shift();
    }

    // Don't reroute too frequently
    if (Date.now() - this.lastRerouteTime < MIN_REROUTE_INTERVAL_MS) return;

    // Get traffic around current position
    const traffic = await fetchTrafficAround(pos, 3);
    if (traffic.length === 0) return;

    // Check for slow traffic ahead on route
    const avgSpeed = this.getAverageSpeedAhead(pos, traffic);
    if (avgSpeed >= SLOW_SPEED_THRESHOLD_KMH) return;

    // Traffic is slow — try to find a better route
    try {
      const { fetchRoute } = await import('./routing');
      const result = await fetchRoute(pos, dest, true, 'car');

      if (result.source !== 'navigation_server') {
        recordFallbackUsage('routing', `dynamic_rerouter:${result.source}`);
      }

      if (!result.main || !this.currentRoute) return;

      const currentRemaining = this.estimateRemainingTime(pos);
      const newTime = result.main.totalDurationSeconds;

      if (newTime < currentRemaining * (1 - IMPROVEMENT_THRESHOLD)) {
        const event: RerouteEvent = {
          oldRoute: this.currentRoute,
          newRoute: result.main,
          timeSavedSeconds: currentRemaining - newTime,
          reason: 'traffic',
        };
        this.currentRoute = result.main;
        this.lastRerouteTime = Date.now();
        this.onReroute?.(event);
      }
    } catch {
      // Routing failed — keep current route
    }
  }

  private getAverageSpeedAhead(pos: LatLng, traffic: TrafficSegment[]): number {
    if (traffic.length === 0) return 60; // assume free flow

    // Find traffic segments near the route ahead
    let totalSpeed = 0;
    let count = 0;
    for (const seg of traffic) {
      const dlat = (seg.centerLat - pos.lat) * 111.32;
      const dlng = (seg.centerLon - pos.lng) * 111.32 * Math.cos(pos.lat * Math.PI / 180);
      const distKm = Math.sqrt(dlat * dlat + dlng * dlng);
      if (distKm < 3) { // within 3km ahead
        totalSpeed += seg.avgSpeedKmh;
        count++;
      }
    }
    return count > 0 ? totalSpeed / count : 60;
  }

  private estimateRemainingTime(currentPos: LatLng): number {
    if (!this.currentRoute) return Infinity;

    // Simple: calculate proportion of route remaining
    const geom = this.currentRoute.geometry;
    if (geom.length < 2) return this.currentRoute.totalDurationSeconds;

    // Find nearest point on route
    let minDist = Infinity;
    let nearestIdx = 0;
    for (let i = 0; i < geom.length; i++) {
      const d = (geom[i].lat - currentPos.lat) ** 2 + (geom[i].lng - currentPos.lng) ** 2;
      if (d < minDist) { minDist = d; nearestIdx = i; }
    }

    const remainingFraction = 1 - nearestIdx / geom.length;
    return this.currentRoute.totalDurationSeconds * remainingFraction;
  }

  /**
   * Estimate current user speed from position history (km/h)
   */
  getCurrentSpeed(): number {
    if (this.positionHistory.length < 2) return 0;
    const recent = this.positionHistory.slice(-5);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const timeSec = (last.ts - first.ts) / 1000;
    if (timeSec < 1) return 0;

    const dlat = (last.pos.lat - first.pos.lat) * 111.32;
    const dlng = (last.pos.lng - first.pos.lng) * 111.32 * Math.cos(first.pos.lat * Math.PI / 180);
    const distKm = Math.sqrt(dlat * dlat + dlng * dlng);
    return (distKm / timeSec) * 3600;
  }
}

export const dynamicRerouter = new DynamicRerouter();
