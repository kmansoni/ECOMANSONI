import { describe, expect, it } from "vitest";
import { resolveChatV11RecoveryAction } from "@/lib/chat/rpcErrorPolicyV11";

describe("chat v1.1 rpc error policy", () => {
  it("maps throttled error to retry_later with bounded delay", () => {
    const action = resolveChatV11RecoveryAction({
      code: "ERR_RESYNC_THROTTLED",
      message: "ERR_RESYNC_THROTTLED",
      retry_after_ms: 1200,
    });
    expect(action.kind).toBe("retry_later");
    if (action.kind === "retry_later") {
      expect(action.retryAfterMs).toBe(1200);
    }
  });

  it("maps range unavailable to full_state_required", () => {
    const action = resolveChatV11RecoveryAction({
      code: "ERR_RESYNC_RANGE_UNAVAILABLE",
      message: "ERR_RESYNC_RANGE_UNAVAILABLE",
    });
    expect(action.kind).toBe("full_state_required");
  });

  it("maps unknown errors to rethrow", () => {
    const action = resolveChatV11RecoveryAction({
      code: "ERR_SOMETHING_ELSE",
      message: "ERR_SOMETHING_ELSE",
    });
    expect(action.kind).toBe("rethrow");
  });
});

