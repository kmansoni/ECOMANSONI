/**
 * Rank Config — конфигурация алгоритма ранжирования ленты
 * Значения загружаются из /rank-config.json (можно обновлять без передеплоя)
 */

export interface RankConfig {
  weights: {
    engagement: number;        // 0-1
    authorAffinity: number;    // 0-1
    recency: number;           // 0-1
    contentRelevance: number;  // 0-1
    diversity: number;         // 0-1
  };
  boosts: {
    closeFriend: number;       // множитель
    following: number;         // множитель
    alreadySeen: number;       // штраф (множитель)
  };
  contentTypeBonus: Record<string, number>; // reel, video, carousel, image, text
}

/**
 * Дефолтная конфигурация (fallback, если remote config недоступен)
 * Соответствует текущим весам в smartFeedAlgorithm.ts
 */
export const DEFAULT_RANK_CONFIG: RankConfig = {
  weights: {
    engagement: 0.30,
    authorAffinity: 0.25,
    recency: 0.20,
    contentRelevance: 0.15,
    diversity: 0.10,
  },
  boosts: {
    closeFriend: 1.5,
    following: 1.2,
    alreadySeen: 0.3,
  },
  contentTypeBonus: {
    reel: 1.15,
    video: 1.10,
    carousel: 1.05,
    image: 1.0,
    text: 0.95,
  },
};

let cachedConfig: RankConfig = DEFAULT_RANK_CONFIG;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Загружает конфиг из /rank-config.json (public folder)
 * Автоматически фолбечит на DEFAULT_RANK_CONFIG при ошибках
 */
export async function loadRankConfig(): Promise<RankConfig> {
  const now = Date.now();
  if (now < cacheExpiry && cachedConfig) {
    return cachedConfig;
  }

  try {
    const res = await fetch('/rank-config.json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const remote = (await res.json()) as RankConfig;
      // Глубокий мерж с дефолтом ( preserve missing keys )
      cachedConfig = {
        weights: { ...DEFAULT_RANK_CONFIG.weights, ...remote.weights },
        boosts: { ...DEFAULT_RANK_CONFIG.boosts, ...remote.boosts },
        contentTypeBonus: { ...DEFAULT_RANK_CONFIG.contentTypeBonus, ...remote.contentTypeBonus },
      };
    } else {
      console.warn('[RankConfig] Failed to fetch config, using defaults');
    }
  } catch (err) {
    console.warn('[RankConfig] Error loading config:', err);
  } finally {
    cacheExpiry = Date.now() + CACHE_TTL;
  }

  return cachedConfig;
}

/**
 * Синхронный геттер для использования в hot path
 * Возвращает текущий кэшированный конфиг (может быть stale)
 */
export function getRankConfig(): RankConfig {
  return cachedConfig;
}

/**
 * Инициализирует загрузку конфига при старте приложения
 * Вызывать из App.tsx / main.tsx один раз
 */
export async function initRankConfig(): Promise<void> {
  await loadRankConfig();
}
