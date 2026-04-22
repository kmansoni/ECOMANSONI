/**
 * AI Route Preference Learning (Reinforcement Learning).
 * Обучается на выборах маршрутов пользователя, адаптирует веса критериев.
 * Policy gradient: после каждого выбора корректируем time/cost/eco/safety weights.
 */

import { dbLoose } from '@/lib/supabase';
import type { MultiModalRoute, NavRoute, TravelMode } from '@/types/navigation';
import type { LatLng } from '@/types/taxi';

// ── Типы ──

export interface UserRoutingProfile {
  userId: string;
  weights: RouteWeights;
  avgSpeedKmh: number;
  preferredModes: TravelMode[];
  avoidTolls: boolean;
  ecoPriority: number;           // 0..1
  timeFlexibilityMinutes: number;
  typicalDepartureTimes: Record<number, number>; // dayOfWeek → hour
  frequentDestinations: Array<{ placeId: string; frequency: number; lastVisited: Date }>;
  cluster: UserCluster | null;
  totalTrips: number;
  updatedAt: Date;
}

export interface RouteWeights {
  time: number;       // 0..1 (importance of time)
  cost: number;       // 0..1 (importance of cost)
  eco: number;        // 0..1 (importance of ecology)
  safety: number;     // 0..1 (importance of safety)
  comfort: number;    // 0..1 (importance of comfort)
  transfers: number;  // 0..1 (importance of fewer transfers)
}

export type UserCluster =
  | 'commuter_car'        // Водители-commuters
  | 'transit_rider'       // Активные пользователи ОТ
  | 'pedestrian_eco'      // Пешеходы/велосипедисты
  | 'multimodal_flexible' // Гибкие, комбинируют способы
  | 'budget_optimizer';   // Экономят деньги

export interface RouteChoice {
  chosen: RouteScores;
  alternatives: RouteScores[];
  timestamp: Date;
  context: TripContext;
}

export interface RouteScores {
  routeId: string;
  durationSeconds: number;
  distanceMeters: number;
  costRub: number;
  transfers: number;
  ecoScore: number;     // 0..10
  safetyScore: number;  // 0..1
  comfortScore: number; // 0..1
}

export interface TripContext {
  hour: number;
  dayOfWeek: number;
  isWeekend: boolean;
  weatherCondition?: 'clear' | 'rain' | 'snow' | 'fog';
  travelMode: TravelMode;
}

// ── Defaults ──

const DEFAULT_WEIGHTS: RouteWeights = {
  time: 0.35,
  cost: 0.20,
  eco: 0.10,
  safety: 0.15,
  comfort: 0.10,
  transfers: 0.10,
};

const LEARNING_RATE = 0.05;
const MIN_WEIGHT = 0.05;
const MAX_WEIGHT = 0.60;

// ── Singleton ──

class RoutePreferenceLearner {
  private profile: UserRoutingProfile | null = null;
  private choiceHistory: RouteChoice[] = [];

  /** Загрузить профиль пользователя из БД */
  async loadProfile(userId: string): Promise<UserRoutingProfile> {
    if (this.profile?.userId === userId) return this.profile;

    try {
      const { data } = await dbLoose
        .from('user_routing_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (data) {
        this.profile = {
          userId,
          weights: (data.weights as RouteWeights) ?? { ...DEFAULT_WEIGHTS },
          avgSpeedKmh: Number(data.avg_speed_kmh ?? 40),
          preferredModes: (data.preferred_modes as TravelMode[]) ?? ['car'],
          avoidTolls: Boolean(data.avoid_tolls),
          ecoPriority: Number(data.eco_priority ?? 0.1),
          timeFlexibilityMinutes: Number(data.time_flexibility_min ?? 10),
          typicalDepartureTimes: (data.typical_departures as Record<number, number>) ?? {},
          frequentDestinations: (data.frequent_destinations as UserRoutingProfile['frequentDestinations']) ?? [],
          cluster: (data.cluster as UserCluster) ?? null,
          totalTrips: Number(data.total_trips ?? 0),
          updatedAt: new Date(String(data.updated_at ?? new Date())),
        };
        return this.profile;
      }
    } catch { /* fallthrough */ }

    // New user — default profile
    this.profile = {
      userId,
      weights: { ...DEFAULT_WEIGHTS },
      avgSpeedKmh: 40,
      preferredModes: ['car'],
      avoidTolls: false,
      ecoPriority: 0.1,
      timeFlexibilityMinutes: 10,
      typicalDepartureTimes: {},
      frequentDestinations: [],
      cluster: null,
      totalTrips: 0,
      updatedAt: new Date(),
    };
    return this.profile;
  }

  /** Рассчитать utility score маршрута по текущим весам */
  calculateUtility(scores: RouteScores, weights?: RouteWeights): number {
    const w = weights ?? this.profile?.weights ?? DEFAULT_WEIGHTS;

    // Normalize each dimension to 0..1 range
    const timeScore = 1 - Math.min(scores.durationSeconds / 7200, 1);      // 2h max
    const costScore = 1 - Math.min(scores.costRub / 5000, 1);              // 5000₽ max
    const ecoScore = scores.ecoScore / 10;
    const safetyScore = scores.safetyScore;
    const comfortScore = scores.comfortScore;
    const transferScore = 1 - Math.min(scores.transfers / 4, 1);           // 4 transfers max

    return (
      w.time * timeScore +
      w.cost * costScore +
      w.eco * ecoScore +
      w.safety * safetyScore +
      w.comfort * comfortScore +
      w.transfers * transferScore
    );
  }

  /** Ранжировать маршруты по utility */
  rankRoutes(routes: RouteScores[]): RouteScores[] {
    return [...routes].sort((a, b) =>
      this.calculateUtility(b) - this.calculateUtility(a)
    );
  }

  /**
   * Записать выбор маршрута и обновить веса (policy gradient).
   * Вызывать после того, как пользователь выбрал маршрут.
   */
  async onRouteSelected(
    chosen: RouteScores,
    alternatives: RouteScores[],
    context: TripContext
  ): Promise<void> {
    if (!this.profile) return;

    const choice: RouteChoice = {
      chosen,
      alternatives,
      timestamp: new Date(),
      context,
    };
    this.choiceHistory.push(choice);

    // Policy gradient update
    const chosenUtil = this.calculateUtility(chosen);
    const avgAltUtil = alternatives.length > 0
      ? alternatives.reduce((s, a) => s + this.calculateUtility(a), 0) / alternatives.length
      : 0;

    const advantage = chosenUtil - avgAltUtil;
    const weights = this.profile.weights;

    // Find which dimensions the chosen route is better/worse at
    const chosenNorm = this.normalizeScores(chosen);
    const avgAltNorm = alternatives.length > 0
      ? this.averageNormScores(alternatives.map(a => this.normalizeScores(a)))
      : chosenNorm;

    // Gradient: increase weight of dimensions where chosen > avg alternative
    const dims: Array<{ key: keyof RouteWeights; chosenVal: number; altVal: number }> = [
      { key: 'time', chosenVal: chosenNorm.time, altVal: avgAltNorm.time },
      { key: 'cost', chosenVal: chosenNorm.cost, altVal: avgAltNorm.cost },
      { key: 'eco', chosenVal: chosenNorm.eco, altVal: avgAltNorm.eco },
      { key: 'safety', chosenVal: chosenNorm.safety, altVal: avgAltNorm.safety },
      { key: 'comfort', chosenVal: chosenNorm.comfort, altVal: avgAltNorm.comfort },
      { key: 'transfers', chosenVal: chosenNorm.transfers, altVal: avgAltNorm.transfers },
    ];

    for (const dim of dims) {
      const diff = dim.chosenVal - dim.altVal;
      if (Math.abs(diff) > 0.05) {
        weights[dim.key] += LEARNING_RATE * diff;
        weights[dim.key] = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, weights[dim.key]));
      }
    }

    // Re-normalize weights to sum = 1
    const sum = Object.values(weights).reduce((s, v) => s + v, 0);
    for (const key of Object.keys(weights) as Array<keyof RouteWeights>) {
      weights[key] /= sum;
    }

    this.profile.totalTrips++;
    this.profile.updatedAt = new Date();

    // Classify cluster
    this.profile.cluster = this.classifyCluster(weights, context);

    // Update preferred modes
    if (!this.profile.preferredModes.includes(context.travelMode)) {
      this.profile.preferredModes.push(context.travelMode);
    }

    // Persist to DB
    await this.persistProfile();
  }

  /** Получить текущий профиль */
  getProfile(): UserRoutingProfile | null {
    return this.profile;
  }

  /** Получить рекомендации на основе кластера */
  getRecommendations(): string[] {
    if (!this.profile?.cluster) return [];

    const recs: Record<UserCluster, string[]> = {
      commuter_car: [
        'Динамический перерасчёт маршрута в пробках',
        'Поиск парковки у назначения',
        'Оптимизатор заправок',
      ],
      transit_rider: [
        'Прибытие транспорта в реальном времени',
        'Занятость вагонов',
        'Оптимизация пересадок',
      ],
      pedestrian_eco: [
        'Оценка безопасности маршрута',
        'Прогноз времени пешком',
        'Экологические бонусы',
      ],
      multimodal_flexible: [
        'Первая/последняя миля (самокат, велосипед)',
        'Сравнение стоимости всех вариантов',
        'Компромисс время/стоимость',
      ],
      budget_optimizer: [
        'Мониторинг цен такси в реальном времени',
        'Подписка на безлимит метро',
        'Попутчики для экономии',
      ],
    };

    return recs[this.profile.cluster] ?? [];
  }

  // ── Private ──

  private normalizeScores(s: RouteScores) {
    return {
      time: 1 - Math.min(s.durationSeconds / 7200, 1),
      cost: 1 - Math.min(s.costRub / 5000, 1),
      eco: s.ecoScore / 10,
      safety: s.safetyScore,
      comfort: s.comfortScore,
      transfers: 1 - Math.min(s.transfers / 4, 1),
    };
  }

  private averageNormScores(scores: Array<ReturnType<typeof this.normalizeScores>>) {
    const n = scores.length || 1;
    const sum = { time: 0, cost: 0, eco: 0, safety: 0, comfort: 0, transfers: 0 };
    for (const s of scores) {
      sum.time += s.time; sum.cost += s.cost; sum.eco += s.eco;
      sum.safety += s.safety; sum.comfort += s.comfort; sum.transfers += s.transfers;
    }
    return {
      time: sum.time / n, cost: sum.cost / n, eco: sum.eco / n,
      safety: sum.safety / n, comfort: sum.comfort / n, transfers: sum.transfers / n,
    };
  }

  private classifyCluster(weights: RouteWeights, ctx: TripContext): UserCluster {
    if ((ctx.travelMode === 'car' || ctx.travelMode === 'taxi') && weights.time > 0.3) return 'commuter_car';
    if ((ctx.travelMode === 'transit' || ctx.travelMode === 'metro') && weights.transfers > 0.15) return 'transit_rider';
    if (ctx.travelMode === 'pedestrian' && weights.eco > 0.15) return 'pedestrian_eco';
    if (weights.cost > 0.3) return 'budget_optimizer';
    return 'multimodal_flexible';
  }

  private async persistProfile(): Promise<void> {
    if (!this.profile) return;
    try {
      await dbLoose.from('user_routing_preferences').upsert({
        user_id: this.profile.userId,
        weights: this.profile.weights,
        avg_speed_kmh: this.profile.avgSpeedKmh,
        preferred_modes: this.profile.preferredModes,
        avoid_tolls: this.profile.avoidTolls,
        eco_priority: this.profile.ecoPriority,
        time_flexibility_min: this.profile.timeFlexibilityMinutes,
        typical_departures: this.profile.typicalDepartureTimes,
        frequent_destinations: this.profile.frequentDestinations,
        cluster: this.profile.cluster,
        total_trips: this.profile.totalTrips,
        updated_at: this.profile.updatedAt.toISOString(),
      });
    } catch { /* silent */ }
  }
}

export const routePreferenceLearner = new RoutePreferenceLearner();
