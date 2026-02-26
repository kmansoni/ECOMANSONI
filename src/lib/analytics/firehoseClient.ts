import type { AnalyticsBatchV1, AnalyticsEventV1 } from "./types";

export interface FirehoseClientOptions {
  endpoint: string;
  maxBatch?: number;
  flushIntervalMs?: number;
  maxQueue?: number;
  enabled?: boolean;
}

export class AnalyticsFirehoseClient {
  private readonly endpoint: string;
  private readonly maxBatch: number;
  private readonly flushIntervalMs: number;
  private readonly maxQueue: number;
  private readonly enabled: boolean;

  private queue: AnalyticsEventV1[] = [];
  private flushing = false;
  private timer: number | null = null;

  constructor(options: FirehoseClientOptions) {
    this.endpoint = options.endpoint;
    this.maxBatch = options.maxBatch ?? 100;
    this.flushIntervalMs = options.flushIntervalMs ?? 2000;
    this.maxQueue = options.maxQueue ?? 1000;
    this.enabled = options.enabled ?? Boolean(options.endpoint);

    if (this.enabled && typeof window !== "undefined") {
      this.timer = window.setInterval(() => void this.flush(), this.flushIntervalMs);
      window.addEventListener("beforeunload", () => {
        this.flush(true);
      });
    }
  }

  track(event: AnalyticsEventV1): void {
    if (!this.enabled) return;
    if (this.queue.length >= this.maxQueue) {
      this.queue.shift();
    }
    this.queue.push(event);
    if (this.queue.length >= this.maxBatch) {
      void this.flush();
    }
  }

  async flush(sync = false): Promise<void> {
    if (!this.enabled) return;
    if (this.flushing || this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.maxBatch);
    const payload: AnalyticsBatchV1 = { v: 1, events: batch };

    const body = JSON.stringify(payload);

    if (sync && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const ok = navigator.sendBeacon(this.endpoint, body);
      if (!ok) {
        this.queue.unshift(...batch);
      }
      return;
    }

    this.flushing = true;
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      });
      if (!res.ok) {
        this.queue.unshift(...batch);
      }
    } catch {
      this.queue.unshift(...batch);
    } finally {
      this.flushing = false;
    }
  }
}
