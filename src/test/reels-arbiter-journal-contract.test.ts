import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function makeSupabaseMock({
  suppressionRow,
  monitorSnapshot,
  monitorError,
}: {
  suppressionRow: any;
  monitorSnapshot: any;
  monitorError?: Error | null;
}) {
  const rpc = vi.fn(async (fn: string, args: any) => {
    if (fn === "reels_engine_get_pipeline_suppression") {
      return { data: [suppressionRow], error: null };
    }

    if (fn === "reels_engine_monitor_snapshot_v1") {
      if (monitorError) return { data: null, error: { message: monitorError.message } };
      return { data: monitorSnapshot, error: null };
    }

    if (fn === "reels_engine_apply_action") {
      return { data: [{ status: "executed" }], error: null };
    }

    if (fn === "reels_engine_record_decision_v1") {
      return { data: [{ status: args?.p_status ?? "rejected" }], error: null };
    }

    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  });

  return { rpc };
}

describe("reels-arbiter journal contract (P1)", () => {
  const realNow = Date.now;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-21T20:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    Date.now = realNow;
  });

  it("NO-SET is observable via record_decision_v1 (floor breached, lag null)", async () => {
    const { tick } = await import("../../server/reels-arbiter/index.mjs");

    const supabase = makeSupabaseMock({
      suppressionRow: { suppressed_until: null, reason: null, is_suppressed: false },
      monitorSnapshot: { impressions_total: 0, event_time_lag_seconds: null },
    });

    const cfg: any = {
      environment: "prod",
      segments: ["global"],
      segmentParents: new Map(),
      windowMinutes: 10,
      minImpressionsInWindow: 1,
      idempotencyBucketMinutes: 5,
      lagSuppressSeconds: 900,
      lagClearSeconds: 180,
      greenMinutesToClear: 12,
      suppressionTtlMinutes: 45,
    };

    const runtimeState = new Map();

    await tick({ supabase, cfg, runtimeState });

    expect((supabase as any).rpc).toHaveBeenCalledWith(
      "reels_engine_record_decision_v1",
      expect.objectContaining({
        p_environment: "prod",
        p_segment_key: "global",
        p_action_type: "set_pipeline_suppression",
        p_status: "rejected",
        p_reason_code: "conditions_not_met",
        p_is_major: false,
        p_decision_source: "das",
      }),
    );
  });

  it("SET happens only when lag>=900 AND floor breached", async () => {
    const { tick } = await import("../../server/reels-arbiter/index.mjs");

    const supabase = makeSupabaseMock({
      suppressionRow: { suppressed_until: null, reason: null, is_suppressed: false },
      monitorSnapshot: { impressions_total: 0, event_time_lag_seconds: 901 },
    });

    const cfg: any = {
      environment: "prod",
      segments: ["global"],
      segmentParents: new Map(),
      windowMinutes: 10,
      minImpressionsInWindow: 1,
      idempotencyBucketMinutes: 5,
      lagSuppressSeconds: 900,
      lagClearSeconds: 180,
      greenMinutesToClear: 12,
      suppressionTtlMinutes: 45,
    };

    const runtimeState = new Map();

    await tick({ supabase, cfg, runtimeState });

    expect((supabase as any).rpc).toHaveBeenCalledWith(
      "reels_engine_apply_action",
      expect.objectContaining({
        p_environment: "prod",
        p_segment_key: "global",
        p_action_type: "set_pipeline_suppression",
        p_is_major: true,
      }),
    );
  });

  it("NO-CLEAR is observable via record_decision_v1 when lag>180 even if green streak ok", async () => {
    const { tick } = await import("../../server/reels-arbiter/index.mjs");

    const supabase = makeSupabaseMock({
      suppressionRow: { suppressed_until: "2099-01-01T00:00:00Z", reason: "x", is_suppressed: true },
      monitorSnapshot: { impressions_total: 10, event_time_lag_seconds: 181 },
    });

    const cfg: any = {
      environment: "prod",
      segments: ["global"],
      segmentParents: new Map(),
      windowMinutes: 10,
      minImpressionsInWindow: 1,
      idempotencyBucketMinutes: 5,
      lagSuppressSeconds: 900,
      lagClearSeconds: 180,
      greenMinutesToClear: 0,
      suppressionTtlMinutes: 45,
    };

    const runtimeState = new Map([
      ["global", { is_suppressed: true, _firstGreenAtMs: Date.now() - 60_000 }],
    ]);

    await tick({ supabase, cfg, runtimeState });

    expect((supabase as any).rpc).toHaveBeenCalledWith(
      "reels_engine_record_decision_v1",
      expect.objectContaining({
        p_environment: "prod",
        p_segment_key: "global",
        p_action_type: "clear_pipeline_suppression",
        p_status: "rejected",
        p_reason_code: "lag_not_green",
        p_is_major: false,
        p_decision_source: "das",
      }),
    );
  });
});
