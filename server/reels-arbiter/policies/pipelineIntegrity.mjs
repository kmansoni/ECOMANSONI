import { stableIdempotencyKey } from "../util.mjs";

/**
 * Ingestion-only data quality policy.
 *
 * Signal: impressions in last N minutes.
 * Action: set/clear pipeline suppression.
 *
 * This intentionally avoids any KPI/quality tuning.
 */
export async function evaluatePipelineIntegrity({
  supabase,
  environment,
  segmentKey,
  cfg,
  state,
}) {
  const bucket = String(Math.floor(Date.now() / (cfg.idempotencyBucketMinutes * 60_000)));

  // Global monitoring snapshot (DB-maintained) includes both:
  //  - impressions in window
  //  - event-time lag seconds
  const snapRes = await supabase.rpc("reels_engine_monitor_snapshot_v1", {
    p_window_minutes: cfg.windowMinutes,
  });

  if (snapRes.error) {
    return {
      ok: false,
      reason: `db_error:${snapRes.error.message}`,
      metrics: { impressionsInWindow: null, lagSeconds: null },
      decide: {
        kind: "apply",
        type: "set_pipeline_suppression",
        suppressedUntilIso: new Date(Date.now() + cfg.suppressionTtlMinutes * 60_000).toISOString(),
        idempotencyKey: stableIdempotencyKey(["set_pipeline_suppression", environment, segmentKey, bucket]),
        reasonCode: "db_error",
        decisionTrace: {
          db_error: true,
          db_error_message: snapRes.error.message,
          lagSec: null,
          impressionsInWindow: null,
          floor: cfg.minImpressionsInWindow,
        },
      },
    };
  }

  const snap = snapRes.data ?? null;
  const impressionsInWindow = Number(snap?.impressions_total ?? 0);
  const lagSecondsRaw = snap?.event_time_lag_seconds;
  const lagSeconds = Number.isFinite(Number(lagSecondsRaw)) ? Number(lagSecondsRaw) : null;

  const floorBreached = impressionsInWindow < cfg.minImpressionsInWindow;
  const lagHigh = lagSeconds !== null && lagSeconds >= cfg.lagSuppressSeconds;

  // SET contract (strict AND):
  //   db_error OR (lag>=900 AND impressions<floor)
  if (floorBreached) {
    if (lagHigh) {
      return {
        ok: false,
        reason: `lag_and_floor:lag=${lagSeconds}:impressions=${impressionsInWindow}`,
        metrics: { impressionsInWindow, lagSeconds },
        decide: {
          kind: "apply",
          type: "set_pipeline_suppression",
          suppressedUntilIso: new Date(Date.now() + cfg.suppressionTtlMinutes * 60_000).toISOString(),
          idempotencyKey: stableIdempotencyKey(["set_pipeline_suppression", environment, segmentKey, bucket]),
          reasonCode: "lag_and_floor",
          decisionTrace: {
            db_error: false,
            lagSec: lagSeconds,
            impressionsInWindow,
            floor: cfg.minImpressionsInWindow,
          },
        },
      };
    }

    // No-op (observable): floor breached but lag not high (or unknown).
    return {
      ok: false,
      reason: `conditions_not_met:floor_breached:lag=${lagSeconds ?? "null"}:impressions=${impressionsInWindow}`,
      metrics: { impressionsInWindow, lagSeconds },
      decide: {
        kind: "record",
        type: "set_pipeline_suppression",
        status: "rejected",
        idempotencyKey: stableIdempotencyKey(["noop", "set_pipeline_suppression", environment, segmentKey, bucket]),
        reasonCode: "conditions_not_met",
        decisionTrace: {
          db_error: false,
          lagSec: lagSeconds,
          impressionsInWindow,
          floor: cfg.minImpressionsInWindow,
        },
      },
    };
  }

  // If we are suppressed, only clear after green streak.
  if (state?.is_suppressed) {
    const firstGreenAt = state._firstGreenAtMs ?? null;
    const now = Date.now();
    const nextFirstGreenAt = firstGreenAt ?? now;
    const greenForMs = now - nextFirstGreenAt;

    if (greenForMs < cfg.greenMinutesToClear * 60_000) {
      return {
        ok: true,
        reason: "green_but_waiting_to_clear",
        metrics: { impressionsInWindow, lagSeconds, greenForMs },
        nextStatePatch: { _firstGreenAtMs: nextFirstGreenAt },
        decide: {
          kind: "record",
          type: "clear_pipeline_suppression",
          status: "rejected",
          idempotencyKey: stableIdempotencyKey(["noop", "clear_pipeline_suppression", environment, segmentKey, bucket]),
          reasonCode: "green_streak_not_met",
          decisionTrace: {
            lagSec: lagSeconds,
            impressionsInWindow,
            greenStreakMinutes: Math.floor(greenForMs / 60_000),
            requiredGreenMinutes: cfg.greenMinutesToClear,
          },
        },
      };
    }

    // Lag gate for clearing suppression.
    if (lagSeconds === null) {
      return {
        ok: true,
        reason: "green_but_lag_unknown",
        metrics: { impressionsInWindow, lagSeconds, greenForMs },
        nextStatePatch: { _firstGreenAtMs: nextFirstGreenAt },
        decide: {
          kind: "record",
          type: "clear_pipeline_suppression",
          status: "rejected",
          idempotencyKey: stableIdempotencyKey(["noop", "clear_pipeline_suppression", environment, segmentKey, bucket]),
          reasonCode: "lag_not_green",
          decisionTrace: {
            lagSec: null,
            impressionsInWindow,
            greenStreakMinutes: Math.floor(greenForMs / 60_000),
            requiredGreenMinutes: cfg.greenMinutesToClear,
          },
        },
      };
    }

    if (lagSeconds > cfg.lagClearSeconds) {
      return {
        ok: true,
        reason: `green_but_lag_high:${lagSeconds}`,
        metrics: { impressionsInWindow, lagSeconds, greenForMs },
        nextStatePatch: { _firstGreenAtMs: nextFirstGreenAt },
        decide: {
          kind: "record",
          type: "clear_pipeline_suppression",
          status: "rejected",
          idempotencyKey: stableIdempotencyKey(["noop", "clear_pipeline_suppression", environment, segmentKey, bucket]),
          reasonCode: "lag_not_green",
          decisionTrace: {
            lagSec: lagSeconds,
            lagClearSec: cfg.lagClearSeconds,
            impressionsInWindow,
            greenStreakMinutes: Math.floor(greenForMs / 60_000),
            requiredGreenMinutes: cfg.greenMinutesToClear,
          },
        },
      };
    }

    return {
      ok: true,
      reason: "green_clear",
      metrics: { impressionsInWindow, lagSeconds, greenForMs },
      nextStatePatch: { _firstGreenAtMs: null },
      decide: {
        kind: "apply",
        type: "clear_pipeline_suppression",
        idempotencyKey: stableIdempotencyKey(["clear_pipeline_suppression", environment, segmentKey, bucket]),
        reasonCode: "auto_clear",
        decisionTrace: {
          lagSec: lagSeconds,
          lagClearSec: cfg.lagClearSeconds,
          impressionsInWindow,
          greenStreakMinutes: Math.floor(greenForMs / 60_000),
          requiredGreenMinutes: cfg.greenMinutesToClear,
        },
      },
    };
  }

  // Not suppressed and ok.
  return {
    ok: true,
    reason: "green",
    metrics: { impressionsInWindow, lagSeconds },
    nextStatePatch: { _firstGreenAtMs: null },
    decide: null,
  };
}
