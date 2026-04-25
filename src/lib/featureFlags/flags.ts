/**
 * Feature Flags System
 *
 * Gradual rollout, A/B testing, cohort isolation, emergency killswitch.
 */

const FLAG_STORAGE_KEY = 'mansoni-flags';
const KILLSWITCH_KEY = 'mansoni-killswitch';

interface FlagDefinition {
  key: string;
  rolloutPercent: number;
  experimentId?: string;
  variants?: string[];
  description: string;
}

const flagRegistry: Record<string, FlagDefinition> = {
  'new-chat-ui': { key: 'new-chat-ui', rolloutPercent: 10, description: 'New chat interface' },
  'experimental-reels': { key: 'experimental-reels', rolloutPercent: 5, description: 'Reels A/B test' },
  'buggy-feature': { key: 'buggy-feature', rolloutPercent: 100, description: 'Temporary flag for testing' },
};

type KillswitchMap = Record<string, boolean>;

function getKillswitches(): KillswitchMap {
  try {
    const raw = localStorage.getItem(KILLSWITCH_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setKillswitch(flagKey: string, enabled: boolean): void {
  const map = getKillswitches();
  map[flagKey] = enabled;
  try {
    localStorage.setItem(KILLSWITCH_KEY, JSON.stringify(map));
  } catch {
    // storage quota exceeded
  }
}

export function isFeatureEnabled(flagKey: string, userId: string, options?: {
  forceEnable?: boolean;
  forceDisable?: boolean;
}): boolean {
  if (options?.forceDisable) return false;
  if (options?.forceEnable) return true;

  // Check global killswitch first
  const killswitches = getKillswitches();
  if (killswitches[flagKey] === true) {
    return false;
  }

  const flag = flagRegistry[flagKey];
  if (!flag) return false;

  // If rollout 100%, always enabled (unless killswitch)
  if (flag.rolloutPercent >= 100) return true;
  if (flag.rolloutPercent <= 0) return false;

  // Deterministic cohort assignment: hash(userId) % 100 < rolloutPercent
  const bucket = hashToBucket(userId, flag.experimentId || flagKey);
  return bucket < flag.rolloutPercent;
}

export function getCohortAssignment(userId: string, flagKey: string, options?: {
  rolloutPercent?: number;
  experimentId?: string;
  variants?: string[];
}): { inRollout: boolean; variant?: string; bucket: number } {
  const flag = flagRegistry[flagKey] || {
    key: flagKey,
    rolloutPercent: options?.rolloutPercent ?? 100,
    experimentId: options?.experimentId,
    variants: options?.variants,
  };

  const bucket = hashToBucket(userId, flag.experimentId || flagKey);
  const inRollout = bucket < (options?.rolloutPercent ?? flag.rolloutPercent);

  let variant: string | undefined;
  if (inRollout && flag.variants && flag.variants.length > 0) {
    // Assign variant deterministically (user hashes to variant index)
    const variantIndex = Math.abs(hashString(userId + flag.experimentId)) % flag.variants.length;
    variant = flag.variants[variantIndex];
  }

  return { inRollout, variant, bucket };
}

function hashToBucket(input: string, salt: string): number {
  // Deterministic hash → 0-99
  const str = input + salt;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0; // FNV-1a
  }
  return h % 100;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h = h & h; // convert to 32bit
  }
  return h;
}

export async function trackFlagMetric(userId: string, flagKey: string, value: boolean, metadata?: Record<string, any>): Promise<void> {
  // Send to analytics (aggregated only, no PII)
  const payload = {
    event: 'flag_exposure',
    flag_key: flagKey,
    value,
    ...metadata,
  };
  // fire-and-forget to /api/analytics/flag (strip userId)
  try {
    await fetch('/api/analytics/flag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore
  }
}

export async function emergencyDisableFeature(flagKey: string, options?: { clear?: boolean }): Promise<void> {
  if (options?.clear) {
    const map = getKillswitches();
    delete map[flagKey];
    localStorage.setItem(KILLSWITCH_KEY, JSON.stringify(map));
  } else {
    setKillswitch(flagKey, true);
  }
}
