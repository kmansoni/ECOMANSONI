/**
 * Hybrid Recommendation Engine
 * Клиентский алгоритм рекомендаций без ML-сервера
 */

export interface UserEmbedding {
  userId: string;
  interests: Record<string, number>;          // {category: score}
  contentCreators: Record<string, number>;    // {creator_id: affinity_score}
  hashtagAffinities: Record<string, number>;  // {hashtag: score}
  avgSessionMinutes: number;
  preferredContentType: 'photo' | 'video' | 'reels' | 'mixed';
  activeHours: Record<string, number>;        // {hour: frequency}
}

export interface ContentItem {
  id: string;
  authorId: string;
  contentType: 'post' | 'reel' | 'story';
  categories: string[];
  hashtags: string[];
  engagementRate: number;     // 0-1
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  createdAt: string;
  viewsCount?: number;
}

export interface SimilarUser {
  userId: string;
  similarUserId: string;
  similarityScore: number;
}

export interface RecommendationConfig {
  weights: {
    collaborative: number;        // 0.25
    contentBased: number;         // 0.25
    trending: number;             // 0.15
    freshness: number;            // 0.15
    creatorAffinity: number;      // 0.10
    engagementPrediction: number; // 0.10
  };
  diversityPenalty: number;     // 0.3
  maxSameAuthor: number;        // 2 подряд
  freshnessDays: number;        // 7
  coldStartThreshold: number;   // 10 интеракций
}

export const DEFAULT_CONFIG: RecommendationConfig = {
  weights: {
    collaborative: 0.25,
    contentBased: 0.25,
    trending: 0.15,
    freshness: 0.15,
    creatorAffinity: 0.10,
    engagementPrediction: 0.10,
  },
  diversityPenalty: 0.3,
  maxSameAuthor: 2,
  freshnessDays: 7,
  coldStartThreshold: 10,
};

/**
 * Рассчитывает оценку свежести контента (exponential decay)
 */
function computeFreshnessScore(createdAt: string, freshnessDays: number): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.exp(-ageDays / freshnessDays);
}

/**
 * Рассчитывает оценку на основе интересов пользователя и контента
 */
function computeContentBasedScore(item: ContentItem, userEmbedding: UserEmbedding): number {
  let score = 0;
  let matches = 0;

  // Совпадение категорий
  for (const cat of item.categories) {
    const interestScore = userEmbedding.interests[cat] ?? 0;
    score += interestScore;
    matches++;
  }

  // Совпадение хэштегов
  for (const tag of item.hashtags) {
    const tagScore = userEmbedding.hashtagAffinities[tag] ?? 0;
    score += tagScore * 0.5;
    matches++;
  }

  return matches > 0 ? Math.min(score / matches, 1) : 0;
}

/**
 * Предсказывает вероятность взаимодействия с контентом
 */
export function predictEngagement(item: ContentItem, userEmbedding: UserEmbedding): number {
  const contentScore = computeContentBasedScore(item, userEmbedding);
  const creatorScore = userEmbedding.contentCreators[item.authorId] ?? 0;

  // Часовой бонус (активный час)
  const currentHour = new Date().getHours().toString();
  const hourFreq = userEmbedding.activeHours[currentHour] ?? 0;
  const maxHourFreq = Math.max(...Object.values(userEmbedding.activeHours), 1);
  const hourScore = hourFreq / maxHourFreq;

  return (contentScore * 0.5 + creatorScore * 0.3 + hourScore * 0.2);
}

/**
 * Рассчитывает итоговый score контент-элемента
 */
export function computeScore(
  item: ContentItem,
  userEmbedding: UserEmbedding,
  similarUsersItems: Map<string, number>, // contentId -> collaborativeScore
  globalTrendingScores: Map<string, number>, // contentId -> trendingScore
  config: RecommendationConfig = DEFAULT_CONFIG
): number {
  const { weights } = config;

  const collaborative = similarUsersItems.get(item.id) ?? 0;
  const contentBased = computeContentBasedScore(item, userEmbedding);
  const trending = globalTrendingScores.get(item.id) ?? 0;
  const freshness = computeFreshnessScore(item.createdAt, config.freshnessDays);
  const creatorAffinity = Math.min(userEmbedding.contentCreators[item.authorId] ?? 0, 1);
  const engagementPrediction = predictEngagement(item, userEmbedding);

  return (
    collaborative * weights.collaborative +
    contentBased * weights.contentBased +
    trending * weights.trending +
    freshness * weights.freshness +
    creatorAffinity * weights.creatorAffinity +
    engagementPrediction * weights.engagementPrediction
  );
}

/**
 * Ранжирует список контента по score
 */
export function rankContent(
  items: ContentItem[],
  userEmbedding: UserEmbedding,
  similarUsersItems: Map<string, number>,
  globalTrendingScores: Map<string, number>,
  config: RecommendationConfig = DEFAULT_CONFIG
): Array<ContentItem & { _score: number }> {
  return items
    .map((item) => ({
      ...item,
      _score: computeScore(item, userEmbedding, similarUsersItems, globalTrendingScores, config),
    }))
    .sort((a, b) => b._score - a._score);
}

/**
 * Диверсификация результатов — не более maxSameAuthor постов подряд от одного автора
 */
export function diversifyResults(
  items: Array<ContentItem & { _score: number }>,
  maxSameAuthor: number = 2
): Array<ContentItem & { _score: number }> {
  const result: Array<ContentItem & { _score: number }> = [];
  const deferred: Array<ContentItem & { _score: number }> = [];
  const authorConsecutive: Map<string, number> = new Map();

  for (const item of items) {
    const count = authorConsecutive.get(item.authorId) ?? 0;
    if (count < maxSameAuthor) {
      result.push(item);
      // Сбрасываем счетчики других авторов при добавлении нового автора
      if (result.length > 0) {
        const lastAuthor = result[result.length - 2]?.authorId;
        if (lastAuthor && lastAuthor !== item.authorId) {
          authorConsecutive.set(lastAuthor, 0);
        }
      }
      authorConsecutive.set(item.authorId, count + 1);
    } else {
      deferred.push(item);
    }
  }

  // Добавляем отложенные элементы в конец
  return [...result, ...deferred];
}

/**
 * Рекомендации для новых пользователей (cold start) — на основе трендов
 */
export function coldStartRecommendations(
  items: ContentItem[],
  limit = 20
): ContentItem[] {
  return items
    .sort((a, b) => {
      const engA = a.engagementRate + computeFreshnessScore(a.createdAt, 3) * 0.3;
      const engB = b.engagementRate + computeFreshnessScore(b.createdAt, 3) * 0.3;
      return engB - engA;
    })
    .slice(0, limit);
}

/**
 * Обновляет embedding пользователя на основе его взаимодействий
 */
export function updateUserEmbedding(
  current: UserEmbedding,
  interactions: Array<{
    contentType: string;
    categories: string[];
    hashtags: string[];
    authorId: string;
    interactionType: string;
    value: number;
  }>
): UserEmbedding {
  const updated = { ...current };
  const interests = { ...current.interests };
  const creators = { ...current.contentCreators };
  const hashtags = { ...current.hashtagAffinities };

  const DECAY = 0.95; // затухание старых интересов
  const LEARN_RATE = 0.1;

  // Затухание
  for (const k of Object.keys(interests)) interests[k] *= DECAY;
  for (const k of Object.keys(creators)) creators[k] *= DECAY;
  for (const k of Object.keys(hashtags)) hashtags[k] *= DECAY;

  for (const interaction of interactions) {
    const weight = interaction.interactionType === 'skip' ? -0.05 :
      interaction.interactionType === 'like' ? 0.15 :
      interaction.interactionType === 'comment' ? 0.20 :
      interaction.interactionType === 'save' ? 0.25 :
      interaction.interactionType === 'share' ? 0.20 :
      interaction.interactionType === 'dwell_time' ? Math.min(interaction.value / 60, 1) * 0.10 :
      0.05;

    for (const cat of interaction.categories) {
      interests[cat] = Math.min((interests[cat] ?? 0) + weight * LEARN_RATE, 1);
    }
    for (const tag of interaction.hashtags) {
      hashtags[tag] = Math.min((hashtags[tag] ?? 0) + weight * LEARN_RATE * 0.5, 1);
    }
    creators[interaction.authorId] = Math.min(
      (creators[interaction.authorId] ?? 0) + weight * LEARN_RATE,
      1
    );
  }

  updated.interests = interests;
  updated.contentCreators = creators;
  updated.hashtagAffinities = hashtags;
  return updated;
}

/**
 * Вычисляет похожих пользователей методом cosine similarity
 */
export function computeSimilarUsers(
  userEmbedding: UserEmbedding,
  allEmbeddings: UserEmbedding[]
): SimilarUser[] {
  const cosineSimilarity = (a: Record<string, number>, b: Record<string, number>): number => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let dot = 0, normA = 0, normB = 0;
    for (const k of keys) {
      const va = a[k] ?? 0;
      const vb = b[k] ?? 0;
      dot += va * vb;
      normA += va * va;
      normB += vb * vb;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  return allEmbeddings
    .filter((e) => e.userId !== userEmbedding.userId)
    .map((e) => {
      const interestSim = cosineSimilarity(userEmbedding.interests, e.interests);
      const hashtagSim = cosineSimilarity(userEmbedding.hashtagAffinities, e.hashtagAffinities);
      const score = interestSim * 0.6 + hashtagSim * 0.4;
      return { userId: userEmbedding.userId, similarUserId: e.userId, similarityScore: score };
    })
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 50);
}
