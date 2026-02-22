import { parseRpcError } from "@/lib/chat/rpcError";

export type ChatV11RecoveryAction =
  | { kind: "retry_later"; retryAfterMs: number }
  | { kind: "full_state_required" }
  | { kind: "rethrow"; code: string | null };

export function resolveChatV11RecoveryAction(err: unknown): ChatV11RecoveryAction {
  const info = parseRpcError(err);
  const code = info.code;

  if (code === "ERR_RESYNC_THROTTLED") {
    return {
      kind: "retry_later",
      retryAfterMs: Math.max(1_000, Math.min(info.retryAfterMs ?? 2_000, 60_000)),
    };
  }

  if (code === "ERR_RESYNC_RANGE_UNAVAILABLE") {
    return { kind: "full_state_required" };
  }

  return { kind: "rethrow", code };
}

