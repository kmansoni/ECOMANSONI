/**
 * Call Telemetry Adapter — implements CallTelemetryPort.
 *
 * Handles:
 * - Logging call events
 * - Collecting relay metrics
 * - Reporting call quality
 */

import { logger } from "@/lib/logger";
import type { CallTelemetryPort } from "../runtime/ports";

/**
 * Telemetry adapter for call metrics.
 */
export class CallTelemetryAdapter implements CallTelemetryPort {
  private callId: string | null = null;
  private startTime: number | null = null;

  setCallId(callId: string): void {
    this.callId = callId;
    this.startTime = Date.now();
  }

  logEvent(event: {
    name: string;
    properties?: Record<string, unknown>;
    timestamp?: number;
  }): void {
    logger.info(`[CallTelemetry] ${event.name}`, {
      callId: this.callId,
      ...event.properties,
    });
  }

  logMetric(metric: {
    name: string;
    value: number;
    unit?: string;
    tags?: Record<string, string>;
  }): void {
    logger.debug(`[CallMetric] ${metric.name}`, {
      value: metric.value,
      unit: metric.unit,
      tags: metric.tags,
      callId: this.callId,
    });
  }

  trackCallQuality(data: {
    callId: string;
    roundTripTime?: number;
    packetLoss?: number;
    jitter?: number;
    bitrate?: number;
  }): void {
    logger.info("[CallQuality]", data);
  }

  trackE2EEState(state: "negotiating" | "active" | "failed"): void {
    logger.info("[E2EEState]", { state, callId: this.callId });
  }

  trackMediaBootstrap(success: boolean, durationMs?: number): void {
    logger.info("[MediaBootstrap]", { success, durationMs, callId: this.callId });
  }
}

// Singleton for app-wide use
export const callTelemetry = new CallTelemetryAdapter();