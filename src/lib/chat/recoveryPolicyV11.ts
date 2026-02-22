export interface ChatV11RecoveryPolicyConfig {
  maxAttempts: number;
  minDelayMs: number;
  maxDelayMs: number;
  exponentialBaseMs: number;
  jitterRatio: number;
}

type EnvSource = Record<string, unknown> | undefined;

function readNumberEnv(name: string, envSource?: EnvSource): number | null {
  try {
    const raw = String((envSource ?? (import.meta as any)?.env ?? {})[name] ?? "").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function getChatV11RecoveryPolicyConfig(envSource?: EnvSource): ChatV11RecoveryPolicyConfig {
  const maxAttemptsRaw = readNumberEnv("VITE_CHAT_V11_RECOVERY_MAX_ATTEMPTS", envSource);
  const minDelayRaw = readNumberEnv("VITE_CHAT_V11_RECOVERY_MIN_DELAY_MS", envSource);
  const maxDelayRaw = readNumberEnv("VITE_CHAT_V11_RECOVERY_MAX_DELAY_MS", envSource);
  const baseRaw = readNumberEnv("VITE_CHAT_V11_RECOVERY_EXP_BASE_MS", envSource);
  const jitterRaw = readNumberEnv("VITE_CHAT_V11_RECOVERY_JITTER_RATIO", envSource);

  const maxAttempts = Math.max(1, Math.floor(maxAttemptsRaw ?? 5));
  const minDelayMs = Math.max(100, Math.floor(minDelayRaw ?? 1_000));
  const maxDelayMs = Math.max(minDelayMs, Math.floor(maxDelayRaw ?? 60_000));
  const exponentialBaseMs = Math.max(minDelayMs, Math.floor(baseRaw ?? 1_000));
  const jitterRatio = Math.max(0, Math.min(1, jitterRaw ?? 0.1));

  return {
    maxAttempts,
    minDelayMs,
    maxDelayMs,
    exponentialBaseMs,
    jitterRatio,
  };
}
