import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatV11RecoveryService } from "@/lib/chat/recoveryV11";

describe("ChatV11RecoveryService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-22T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs timeout step after initial delay", async () => {
    const onAckTimeout = vi.fn();
    const runStep = vi.fn(async () => undefined);
    const service = new ChatV11RecoveryService({ onAckTimeout, runStep });

    service.arm({
      clientWriteSeq: 1,
      clientMsgId: "m-1",
      deviceId: "d-1",
    });

    expect(onAckTimeout).not.toHaveBeenCalled();
    expect(runStep).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_100);

    expect(onAckTimeout).toHaveBeenCalledTimes(1);
    expect(runStep).toHaveBeenCalledTimes(1);
  });

  it("retries when step returns deferredMs", async () => {
    const onAckTimeout = vi.fn();
    const runStep = vi
      .fn()
      .mockResolvedValueOnce({ deferredMs: 1_200 })
      .mockResolvedValueOnce(undefined);
    const service = new ChatV11RecoveryService({ onAckTimeout, runStep });

    service.arm({
      clientWriteSeq: 2,
      clientMsgId: "m-2",
      deviceId: "d-2",
    });

    await vi.advanceTimersByTimeAsync(10_100);
    expect(onAckTimeout).toHaveBeenCalledTimes(1);
    expect(runStep).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_300);
    expect(onAckTimeout).toHaveBeenCalledTimes(2);
    expect(runStep).toHaveBeenCalledTimes(2);
  });

  it("acknowledgeReceipt cancels pending recovery and returns latency", async () => {
    const onAckTimeout = vi.fn();
    const runStep = vi.fn(async () => undefined);
    const service = new ChatV11RecoveryService({ onAckTimeout, runStep });

    service.arm({
      clientWriteSeq: 3,
      clientMsgId: "m-3",
      deviceId: "d-3",
    });

    await vi.advanceTimersByTimeAsync(2_000);
    const latency = service.acknowledgeReceipt(3, "d-3");
    expect(typeof latency).toBe("number");
    expect((latency as number) >= 2_000).toBe(true);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(onAckTimeout).not.toHaveBeenCalled();
    expect(runStep).not.toHaveBeenCalled();
  });

  it("calls onFailure and clears watch on step error", async () => {
    const onAckTimeout = vi.fn();
    const runStep = vi.fn(async () => {
      throw new Error("boom");
    });
    const onFailure = vi.fn();
    const service = new ChatV11RecoveryService({ onAckTimeout, runStep, onFailure });

    service.arm({
      clientWriteSeq: 4,
      clientMsgId: "m-4",
      deviceId: "d-4",
    });

    await vi.advanceTimersByTimeAsync(10_100);
    expect(onAckTimeout).toHaveBeenCalledTimes(1);
    expect(runStep).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(onAckTimeout).toHaveBeenCalledTimes(1);
    expect(runStep).toHaveBeenCalledTimes(1);
  });

  it("stops retrying after maxAttempts and emits ERR_RECOVERY_MAX_ATTEMPTS", async () => {
    const onAckTimeout = vi.fn();
    const runStep = vi.fn(async () => ({ deferredMs: 1_000 }));
    const onFailure = vi.fn();
    const service = new ChatV11RecoveryService({
      onAckTimeout,
      runStep,
      onFailure,
      maxAttempts: 2,
    });

    service.arm({
      clientWriteSeq: 5,
      clientMsgId: "m-5",
      deviceId: "d-5",
    });

    await vi.advanceTimersByTimeAsync(10_100);
    await vi.advanceTimersByTimeAsync(1_100);
    await vi.advanceTimersByTimeAsync(2_100);

    expect(onAckTimeout).toHaveBeenCalledTimes(2);
    expect(runStep).toHaveBeenCalledTimes(2);
    expect(onFailure).toHaveBeenCalledTimes(1);
    const err = onFailure.mock.calls[0]?.[1] as Error;
    expect(String(err?.message || "")).toContain("ERR_RECOVERY_MAX_ATTEMPTS");
  });

  it("applies retry policy caps and exponential delay", async () => {
    const onAckTimeout = vi.fn();
    const runStep = vi
      .fn()
      .mockResolvedValueOnce({ deferredMs: 200 }) // below min
      .mockResolvedValueOnce({ deferredMs: 200 }) // exponential should dominate
      .mockResolvedValueOnce(undefined);

    const service = new ChatV11RecoveryService({
      onAckTimeout,
      runStep,
      retryPolicy: {
        minDelayMs: 1_000,
        maxDelayMs: 1_500,
        exponentialBaseMs: 1_000,
        jitterRatio: 0,
      },
    });

    service.arm({
      clientWriteSeq: 6,
      clientMsgId: "m-6",
      deviceId: "d-6",
    });

    await vi.advanceTimersByTimeAsync(10_100); // first tick, schedule +1000
    expect(runStep).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_100); // second tick, exp=2000 => capped 1500
    expect(runStep).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1_600); // third tick
    expect(runStep).toHaveBeenCalledTimes(3);
  });
});
