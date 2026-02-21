import process from "node:process";
import { loadConfig } from "./config.mjs";
import { createServiceClient } from "./supabaseClient.mjs";
import { isoNow, sleep } from "./util.mjs";
import { evaluatePipelineIntegrity } from "./policies/pipelineIntegrity.mjs";

function log(level, msg, extra) {
  const base = { ts: isoNow(), level, msg };
  const line = extra ? { ...base, ...extra } : base;
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line));
}

async function getSuppressionState({ supabase, environment, segmentKey }) {
  const { data, error } = await supabase.rpc("reels_engine_get_pipeline_suppression", {
    p_environment: environment,
    p_segment_key: segmentKey,
  });

  if (error) return { error };
  // Supabase returns rows for TABLE returns.
  const row = Array.isArray(data) ? data[0] : null;
  return { row };
}

async function applyAction({ supabase, environment, segmentKey, actionType, idempotencyKey, payload, reason }) {
  const { data, error } = await supabase.rpc("reels_engine_apply_action", {
    p_environment: environment,
    p_segment_key: segmentKey,
    p_action_type: actionType,
    p_idempotency_key: idempotencyKey,
    p_payload: payload ?? {},
    p_priority: 0,
    p_is_major: true,
    p_reason: reason ?? null,
  });

  if (error) return { error };
  const row = Array.isArray(data) ? data[0] : null;
  return { row };
}

async function recordDecision({
  supabase,
  environment,
  segmentKey,
  actionType,
  idempotencyKey,
  status,
  reasonCode,
  payload,
  reason,
  decisionSource,
}) {
  const { data, error } = await supabase.rpc("reels_engine_record_decision_v1", {
    p_environment: environment,
    p_segment_key: segmentKey,
    p_action_type: actionType,
    p_idempotency_key: idempotencyKey,
    p_status: status,
    p_reason_code: reasonCode,
    p_payload: payload ?? {},
    p_priority: 0,
    p_is_major: false,
    p_reason: reason ?? null,
    p_decision_source: decisionSource ?? "das",
  });

  if (error) return { error };
  const row = Array.isArray(data) ? data[0] : null;
  return { row };
}

function computeSegmentChain(segmentKey, segmentParents) {
  const chain = [];
  const seen = new Set();
  let cur = segmentKey;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    cur = segmentParents.get(cur) ?? null;
  }
  return chain;
}

export async function tick({ supabase, cfg, runtimeState }) {
  for (const segmentKey of cfg.segments) {
    const chain = computeSegmentChain(segmentKey, cfg.segmentParents);
    const effectiveSegment = chain[0];

    const { row: suppressionRow, error: suppressionError } = await getSuppressionState({
      supabase,
      environment: cfg.environment,
      segmentKey: effectiveSegment,
    });

    const state = runtimeState.get(effectiveSegment) ?? {};
    if (suppressionRow) {
      state.is_suppressed = !!suppressionRow.is_suppressed;
      state.suppressed_until = suppressionRow.suppressed_until ?? null;
      state.suppression_reason = suppressionRow.reason ?? null;
    }

    const evaluation = await evaluatePipelineIntegrity({
      supabase,
      environment: cfg.environment,
      segmentKey: effectiveSegment,
      cfg,
      state,
    });

    if (evaluation.nextStatePatch) Object.assign(state, evaluation.nextStatePatch);
    runtimeState.set(effectiveSegment, state);

    log("info", "arbiter.evaluate", {
      environment: cfg.environment,
      segment: effectiveSegment,
      ok: evaluation.ok,
      reason: evaluation.reason,
      suppressed: !!state.is_suppressed,
      suppressed_until: state.suppressed_until,
      metrics: evaluation.metrics,
    });

    if (!evaluation.decide) continue;

    const actionType = evaluation.decide.type;
    const decisionTrace = evaluation.decide.decisionTrace ?? null;

    if (evaluation.decide.kind === "record") {
      const rec = await recordDecision({
        supabase,
        environment: cfg.environment,
        segmentKey: effectiveSegment,
        actionType,
        idempotencyKey: evaluation.decide.idempotencyKey,
        status: evaluation.decide.status ?? "rejected",
        reasonCode: evaluation.decide.reasonCode,
        payload: {
          decision_trace: decisionTrace,
          decision_source: "das",
        },
        reason: evaluation.reason,
        decisionSource: "das",
      });

      if (rec.error) {
        log("error", "arbiter.record_failed", {
          environment: cfg.environment,
          segment: effectiveSegment,
          actionType,
          error: rec.error.message,
        });
        continue;
      }

      log("info", "arbiter.record", {
        environment: cfg.environment,
        segment: effectiveSegment,
        actionType,
        result: rec.row,
      });

      continue;
    }

    const payload =
      actionType === "set_pipeline_suppression"
        ? {
            suppressed_until: evaluation.decide.suppressedUntilIso,
            decision_source: "das",
            decision_trace: decisionTrace,
          }
        : {
            decision_source: "das",
            decision_trace: decisionTrace,
          };

    const apply = await applyAction({
      supabase,
      environment: cfg.environment,
      segmentKey: effectiveSegment,
      actionType,
      idempotencyKey: evaluation.decide.idempotencyKey,
      payload,
      reason: evaluation.reason,
    });

    if (apply.error) {
      log("error", "arbiter.apply_failed", {
        environment: cfg.environment,
        segment: effectiveSegment,
        actionType,
        error: apply.error.message,
      });
      continue;
    }

    log("info", "arbiter.apply", {
      environment: cfg.environment,
      segment: effectiveSegment,
      actionType,
      result: apply.row,
    });
  }
}

export async function main() {
  const cfg = loadConfig();
  const supabase = createServiceClient({
    supabaseUrl: cfg.supabaseUrl,
    supabaseServiceRoleKey: cfg.supabaseServiceRoleKey,
  });

  const runtimeState = new Map();

  log("info", "arbiter.start", {
    environment: cfg.environment,
    segments: cfg.segments,
    pollIntervalMs: cfg.pollIntervalMs,
    windowMinutes: cfg.windowMinutes,
    minImpressionsInWindow: cfg.minImpressionsInWindow,
    greenMinutesToClear: cfg.greenMinutesToClear,
    idempotencyBucketMinutes: cfg.idempotencyBucketMinutes,
    lagSuppressSeconds: cfg.lagSuppressSeconds,
    lagClearSeconds: cfg.lagClearSeconds,
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick({ supabase, cfg, runtimeState });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("error", "arbiter.tick_crash", { error: msg });
    }
    await sleep(cfg.pollIntervalMs);
  }
}

function isEntrypoint() {
  // When imported (e.g. vitest), do not start the infinite loop.
  try {
    const argv1 = process.argv?.[1];
    if (!argv1) return false;
    return import.meta.url === new URL(argv1, "file:").href;
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  main().catch((err) => {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(msg);
    process.exit(1);
  });
}
