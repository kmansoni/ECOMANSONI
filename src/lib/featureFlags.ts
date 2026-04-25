import { supabase } from '@/lib/supabase';

// Все флаги платформы
export type FeatureFlag =
  | 'reels_v2'
  | 'calls_v2'
  | 'live_streaming'
  | 'marketplace_v2'
  | 'ai_assistant'
  | 'navigation_hd'
  | 'insurance_kasko'
  | 'crm_v2'
  | 'dark_mode_v2'
  | 'stories_reactions'
  | 'e2ee_sfu'
  | 'canary_rollout';

interface FlagConfig {
  enabled: boolean;
  rollout_percent: number;  // 0-100, для постепенного rollout
  allowed_user_ids?: string[];  // whitelist конкретных юзеров
}

type FlagStore = Record<FeatureFlag, FlagConfig>;

// Дефолты — всё выключено, включаем явно
const DEFAULTS: FlagStore = {
  reels_v2:          { enabled: true,  rollout_percent: 100 },
  calls_v2:          { enabled: true,  rollout_percent: 100 },
  live_streaming:    { enabled: true,  rollout_percent: 100 },
  marketplace_v2:    { enabled: false, rollout_percent: 0 },
  ai_assistant:      { enabled: true,  rollout_percent: 100 },
  navigation_hd:     { enabled: false, rollout_percent: 10 },
  insurance_kasko:   { enabled: true,  rollout_percent: 100 },
  crm_v2:            { enabled: false, rollout_percent: 0 },
  dark_mode_v2:      { enabled: false, rollout_percent: 20 },
  stories_reactions: { enabled: true,  rollout_percent: 100 },
  e2ee_sfu:          { enabled: true,  rollout_percent: 100 },
  canary_rollout:    { enabled: false, rollout_percent: 5 },
};

let cache: FlagStore | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

async function loadFlags(): Promise<FlagStore> {
  const now = Date.now();
  if (cache && now < cacheExpiry) return cache;

  try {
    const { data, error } = await supabase
      .from('feature_flags')
      .select('flag_key, enabled, rollout_percent, allowed_user_ids')
      .limit(100);

    if (error || !data?.length) return DEFAULTS;

    const store = { ...DEFAULTS };
    for (const row of data) {
      const key = row.flag_key as FeatureFlag;
      if (key in store) {
        store[key] = {
          enabled: row.enabled,
          rollout_percent: row.rollout_percent ?? 100,
          allowed_user_ids: row.allowed_user_ids ?? undefined,
        };
      }
    }

    cache = store;
    cacheExpiry = now + CACHE_TTL;
    return store;
  } catch {
    return DEFAULTS;
  }
}

// Детерминированный rollout по user_id — один юзер всегда в одной группе
function isInRollout(userId: string, percent: number): boolean {
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 100) < percent;
}

export async function isEnabled(flag: FeatureFlag, userId?: string): Promise<boolean> {
  const flags = await loadFlags();
  const config = flags[flag];

  if (!config.enabled) return false;

  // Whitelist проверка
  if (userId && config.allowed_user_ids?.includes(userId)) return true;

  // Rollout проверка
  if (userId) return isInRollout(userId, config.rollout_percent);

  return config.rollout_percent >= 100;
}

// Синхронная версия — только из кэша, для рендера без async
export function isEnabledSync(flag: FeatureFlag, userId?: string): boolean {
  if (!cache) return DEFAULTS[flag].enabled && DEFAULTS[flag].rollout_percent >= 100;
  const config = cache[flag];
  if (!config.enabled) return false;
  if (userId && config.allowed_user_ids?.includes(userId)) return true;
  if (userId) return isInRollout(userId, config.rollout_percent);
  return config.rollout_percent >= 100;
}

export function invalidateCache() {
  cache = null;
  cacheExpiry = 0;
}
