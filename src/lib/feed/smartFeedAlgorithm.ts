/**
 * Smart Feed Algorithm — алгоритм ранжирования ленты
 * Превосходит стандартную хронологическую ленту за счёт многофакторного ранжирования
 */

export interface FeedRankingFactors {
  engagementScore: number;      // 0-1: лайки, комментарии, сохранения, шеры
  authorAffinity: number;       // 0-1: насколько пользователь взаимодействует с автором
  recencyScore: number;         // 0-1: свежесть контента (exponential decay)
  contentRelevance: number;     // 0-1: совпадение интересов пользователя
  diversityBonus: number;       // 0-1: разнообразие контента
  isCloseFriend: boolean;       // boost x1.5
  isFollowing: boolean;         // boost x1.2
  hasInteracted: boolean;       // penalty если уже видел
  contentType: 'text' | 'image' | 'video' | 'carousel' | 'reel';
}

// Веса факторов ранжирования
const WEIGHTS = {
  engagement: 0.30,
  authorAffinity: 0.25,
  recency: 0.20,
  contentRelevance: 0.15,
  diversity: 0.10,
} as const;

// Бонусы/штрафы
const BOOSTS = {
  closeFriend: 1.5,
  following: 1.2,
  alreadySeen: 0.3,
} as const;

// Бонусы за тип контента (видео и карусели получают небольшой буст)
const CONTENT_TYPE_BONUS: Record<FeedRankingFactors['contentType'], number> = {
  reel: 1.15,
  video: 1.10,
  carousel: 1.05,
  image: 1.0,
  text: 0.95,
};

/**
 * Рассчитывает итоговый score поста для ленты
 */
export function calculateFeedScore(factors: FeedRankingFactors): number {
  // Базовый score — взвешенная сумма факторов
  const baseScore =
    factors.engagementScore * WEIGHTS.engagement +
    factors.authorAffinity * WEIGHTS.authorAffinity +
    factors.recencyScore * WEIGHTS.recency +
    factors.contentRelevance * WEIGHTS.contentRelevance +
    factors.diversityBonus * WEIGHTS.diversity;

  // Применяем мультипликаторы
  let multiplier = 1.0;

  if (factors.isCloseFriend) multiplier *= BOOSTS.closeFriend;
  else if (factors.isFollowing) multiplier *= BOOSTS.following;

  if (factors.hasInteracted) multiplier *= BOOSTS.alreadySeen;

  // Бонус за тип контента
  multiplier *= CONTENT_TYPE_BONUS[factors.contentType];

  return Math.min(1.0, baseScore * multiplier);
}

/**
 * Экспоненциальный decay для свежести контента
 * @param createdAt - дата создания
 * @param halfLifeHours - время полуспада в часах (по умолчанию 24ч)
 */
export function applyRecencyDecay(createdAt: Date, halfLifeHours: number = 24): number {
  const now = Date.now();
  const ageMs = now - createdAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  // f(t) = e^(-λt), где λ = ln(2) / halfLife
  const lambda = Math.LN2 / halfLifeHours;
  return Math.exp(-lambda * ageHours);
}

/**
 * Рассчитывает engagement rate поста
 */
export function calculateEngagementRate(
  likes: number,
  comments: number,
  saves: number,
  shares: number,
  impressions: number
): number {
  if (impressions <= 0) return 0;

  // Взвешенный engagement — комментарии и сохранения важнее лайков
  const weightedEngagement = likes * 1 + comments * 3 + saves * 4 + shares * 5;
  const rawRate = weightedEngagement / impressions;

  // Нормализуем в 0-1 (типичный engagement rate 1-5%)
  return Math.min(1.0, rawRate / 0.3);
}

/**
 * Штраф за повторяющихся авторов (для разнообразия ленты)
 * @param recentAuthors - авторы последних N постов в ленте
 * @param currentAuthor - автор текущего поста
 */
export function diversityPenalty(recentAuthors: string[], currentAuthor: string): number {
  const windowSize = Math.min(recentAuthors.length, 10);
  const recentWindow = recentAuthors.slice(-windowSize);

  // Считаем сколько раз встречается этот автор в последних постах
  const count = recentWindow.filter(a => a === currentAuthor).length;

  // diversity bonus: 1.0 если автор не встречался, снижается с повторениями
  if (count === 0) return 1.0;
  if (count === 1) return 0.7;
  if (count === 2) return 0.4;
  return 0.1; // сильный штраф за 3+ повторения
}

/**
 * Сортирует элементы ленты по score (убывание)
 */
export function rankFeedItems<T extends { score: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.score - a.score);
}

/**
 * Рассчитывает affinity score на основе истории взаимодействий
 */
export function calculateAuthorAffinity(
  likesCount: number,
  commentsCount: number,
  savesCount: number,
  viewsCount: number
): number {
  if (viewsCount <= 0) return 0;

  const interactions = likesCount * 1 + commentsCount * 3 + savesCount * 4;
  const rate = interactions / viewsCount;

  // Нормализуем: высокое взаимодействие (~20%+) → score близкий к 1
  return Math.min(1.0, rate / 0.2);
}

/**
 * Рассчитывает content relevance на основе тегов поста и интересов пользователя
 */
export function calculateContentRelevance(
  postTags: string[],
  userInterests: Map<string, number>
): number {
  if (postTags.length === 0 || userInterests.size === 0) return 0.3;

  let totalWeight = 0;
  let matchWeight = 0;

  for (const tag of postTags) {
    const interest = userInterests.get(tag);
    if (interest !== undefined) {
      matchWeight += interest;
    }
    totalWeight += 1;
  }

  if (totalWeight === 0) return 0.3;
  return Math.min(1.0, matchWeight / totalWeight);
}
