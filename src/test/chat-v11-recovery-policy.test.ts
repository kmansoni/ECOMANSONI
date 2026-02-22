import { describe, expect, it, vi } from "vitest";

describe("chat v1.1 recovery policy config", () => {
  it("returns sane defaults when env is empty", async () => {
    vi.resetModules();
    const { getChatV11RecoveryPolicyConfig } = await import("@/lib/chat/recoveryPolicyV11");
    const cfg = getChatV11RecoveryPolicyConfig();

    expect(cfg.maxAttempts).toBeGreaterThanOrEqual(1);
    expect(cfg.minDelayMs).toBeGreaterThanOrEqual(100);
    expect(cfg.maxDelayMs).toBeGreaterThanOrEqual(cfg.minDelayMs);
    expect(cfg.exponentialBaseMs).toBeGreaterThanOrEqual(cfg.minDelayMs);
    expect(cfg.jitterRatio).toBeGreaterThanOrEqual(0);
    expect(cfg.jitterRatio).toBeLessThanOrEqual(1);
  });

  it("clamps invalid env values into safe bounds", async () => {
    vi.resetModules();
    const { getChatV11RecoveryPolicyConfig } = await import("@/lib/chat/recoveryPolicyV11");
    const cfg = getChatV11RecoveryPolicyConfig({
      VITE_CHAT_V11_RECOVERY_MAX_ATTEMPTS: "-10",
      VITE_CHAT_V11_RECOVERY_MIN_DELAY_MS: "1",
      VITE_CHAT_V11_RECOVERY_MAX_DELAY_MS: "50",
      VITE_CHAT_V11_RECOVERY_EXP_BASE_MS: "10",
      VITE_CHAT_V11_RECOVERY_JITTER_RATIO: "2",
    });

    expect(cfg.maxAttempts).toBe(1);
    expect(cfg.minDelayMs).toBe(100);
    expect(cfg.maxDelayMs).toBe(100);
    expect(cfg.exponentialBaseMs).toBe(100);
    expect(cfg.jitterRatio).toBe(1);
  });
});
