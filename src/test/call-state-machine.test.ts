import { describe, expect, it } from "vitest";

import { transition } from "@/calls-v2/callStateMachine";

describe("callStateMachine PROMOTE_IN_CALL", () => {
  it("allows promotion from any connecting state", () => {
    expect(transition("bootstrapping", "PROMOTE_IN_CALL")).toBe("in_call");
    expect(transition("signaling_ready", "PROMOTE_IN_CALL")).toBe("in_call");
    expect(transition("media_acquiring", "PROMOTE_IN_CALL")).toBe("in_call");
    expect(transition("transport_connecting", "PROMOTE_IN_CALL")).toBe("in_call");
    expect(transition("media_ready", "PROMOTE_IN_CALL")).toBe("in_call");
  });
});