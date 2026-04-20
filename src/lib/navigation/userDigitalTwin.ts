/**
 * User Digital Twin — Behavioral Model & State Prediction.
 *
 * Builds a virtual model of the user that:
 * - Predicts mood/energy at destination
 * - Simulates route decisions ("would the twin abandon this route?")
 * - Models response to stress, delays, crowding
 * - Learns from actual behavior to refine the model
 *
 * Also: Counterfactual analysis ("what if you chose differently?")
 * and Regret minimization learning.
 */

import type { LatLng } from '@/types/taxi';
import type { NavRoute, TravelMode, MultiModalRoute } from '@/types/navigation';
import type { RouteWeights, RouteScores } from '@/lib/navigation/routePreferenceLearner';
import type {
  UserBehaviorModel,
  PredictedUserState,
  StateInfluence,
  TwinSimulationResult,
  CounterfactualAnalysis,
  RouteObjectives,
} from '@/types/quantum-transport';
import { extractObjectives } from './quantumRouteEvaluator';

// ══════════════════════════════════════════════════════════════════════════
// BEHAVIOR MODEL
// ══════════════════════════════════════════════════════════════════════════

const DEFAULT_BEHAVIOR: UserBehaviorModel = {
  userId: '',
  responseToStress: 'wait_and_see',
  riskTolerance: 0.5,
  timeFlexibility: 0.5,
  ecoConsciousness: 0.3,
  explorationWillingness: 0.4,
  costSensitivity: 0.5,
  comfortPreference: 0.5,
  routineStrength: 0.6,
};

/** Store of user behavior models (in production: Supabase) */
const behaviorModels = new Map<string, UserBehaviorModel>();

/** Get or create behavior model for a user */
export function getUserBehaviorModel(userId: string): UserBehaviorModel {
  const existing = behaviorModels.get(userId);
  if (existing) return existing;

  const model: UserBehaviorModel = { ...DEFAULT_BEHAVIOR, userId };
  behaviorModels.set(userId, model);
  return model;
}

/**
 * Update behavior model from observed route choice.
 * Uses simple Bayesian update: shift parameters towards observed behavior.
 */
export function updateBehaviorFromChoice(
  userId: string,
  chosen: RouteScores,
  alternatives: RouteScores[],
  context: { hour: number; isRushHour: boolean; weather: string }
): void {
  const model = getUserBehaviorModel(userId);
  const lr = 0.05; // learning rate

  // If user chose cheapest route → increase cost sensitivity
  const cheapest = [chosen, ...alternatives].sort((a, b) => a.costRub - b.costRub)[0];
  if (cheapest.routeId === chosen.routeId) {
    model.costSensitivity = clamp(model.costSensitivity + lr, 0, 1);
  }

  // If user chose fastest route → decrease time flexibility
  const fastest = [chosen, ...alternatives].sort((a, b) => a.durationSeconds - b.durationSeconds)[0];
  if (fastest.routeId === chosen.routeId) {
    model.timeFlexibility = clamp(model.timeFlexibility - lr, 0, 1);
  }

  // If user chose most eco-friendly → increase eco consciousness
  const greenest = [chosen, ...alternatives].sort((a, b) => b.ecoScore - a.ecoScore)[0];
  if (greenest.routeId === chosen.routeId) {
    model.ecoConsciousness = clamp(model.ecoConsciousness + lr, 0, 1);
  }

  // If user chose a route different from usual → increase exploration willingness
  // (this would require route history — simplified here)
  if (alternatives.length > 0 && chosen.routeId !== alternatives[0].routeId) {
    model.explorationWillingness = clamp(model.explorationWillingness + lr * 0.5, 0, 1);
  }

  behaviorModels.set(userId, model);
}

// ══════════════════════════════════════════════════════════════════════════
// STATE PREDICTION
// ══════════════════════════════════════════════════════════════════════════

interface TripConditions {
  mode: TravelMode;
  durationMinutes: number;
  transfers: number;
  crowdingLevel: number;         // 0..1
  weatherCode: string;           // 'clear', 'rain', 'snow', etc.
  departureHour: number;
  isRushHour: boolean;
}

/**
 * Predict user's mood/energy/satisfaction at destination.
 *
 * Factors:
 * - Trip duration (longer → more tired)
 * - Mode (walking = active but tiring, car = comfortable but stressful in traffic)
 * - Crowding (high crowding → stress)
 * - Weather (rain/snow → worse mood)
 * - Time of day (circadian rhythm)
 * - Number of transfers (more → more stress)
 */
export function predictUserState(
  userId: string,
  conditions: TripConditions
): PredictedUserState {
  const model = getUserBehaviorModel(userId);
  const factors: StateInfluence[] = [];
  let energy = 0.7;
  let stress = 0.3;
  let satisfaction = 0.6;

  // Trip duration impact
  const durationImpact = -Math.min(conditions.durationMinutes / 120, 0.5);
  energy += durationImpact;
  factors.push({
    factor: 'Продолжительность поездки',
    impact: durationImpact,
    description: `${conditions.durationMinutes} мин → ${durationImpact < -0.2 ? 'значительная' : 'умеренная'} усталость`,
  });

  // Mode impact
  const modeEffects: Record<TravelMode, { energy: number; stress: number; satisfaction: number }> = {
    car: { energy: -0.05, stress: 0.15, satisfaction: 0.05 },
    taxi: { energy: -0.03, stress: 0.08, satisfaction: 0.1 },
    pedestrian: { energy: -0.15, stress: -0.10, satisfaction: 0.10 },
    transit: { energy: -0.05, stress: 0.05, satisfaction: 0 },
    metro: { energy: -0.04, stress: 0.02, satisfaction: 0.06 },
    multimodal: { energy: -0.10, stress: 0.10, satisfaction: 0.05 },
  };
  const me = modeEffects[conditions.mode] ?? modeEffects.car;
  energy += me.energy;
  stress += me.stress;
  satisfaction += me.satisfaction;
  factors.push({
    factor: `Способ передвижения (${conditions.mode})`,
    impact: me.satisfaction - me.stress,
    description: modeDescription(conditions.mode),
  });

  // Crowding impact
  if (conditions.crowdingLevel > 0.7) {
    const crowdImpact = -(conditions.crowdingLevel - 0.5) * 0.3;
    stress += -crowdImpact;
    satisfaction += crowdImpact;
    factors.push({
      factor: 'Заполненность транспорта',
      impact: crowdImpact,
      description: `Загруженность ${Math.round(conditions.crowdingLevel * 100)}% → повышенный стресс`,
    });
  }

  // Weather impact
  const weatherImpacts: Record<string, { mood: number; desc: string }> = {
    clear: { mood: 0.1, desc: 'Ясная погода улучшает настроение' },
    partly_cloudy: { mood: 0.05, desc: 'Переменная облачность' },
    rain: { mood: -0.15, desc: 'Дождь снижает настроение' },
    heavy_rain: { mood: -0.25, desc: 'Сильный дождь — неприятная поездка' },
    snow: { mood: -0.10, desc: 'Снег — медленнее, но атмосферно' },
    fog: { mood: -0.10, desc: 'Туман — пониженная видимость' },
  };
  const wi = weatherImpacts[conditions.weatherCode] ?? { mood: 0, desc: '' };
  if (wi.mood !== 0) {
    satisfaction += wi.mood;
    if (wi.mood < 0) stress += Math.abs(wi.mood) * 0.5;
    factors.push({
      factor: 'Погода',
      impact: wi.mood,
      description: wi.desc,
    });
  }

  // Circadian rhythm
  const circadianEnergy = getCircadianEnergy(conditions.departureHour + conditions.durationMinutes / 60);
  energy += (circadianEnergy - 0.5) * 0.3;
  if (circadianEnergy < 0.4) {
    factors.push({
      factor: 'Время суток',
      impact: circadianEnergy - 0.5,
      description: 'Время низкой энергии (циркадный ритм)',
    });
  }

  // Transfers impact
  if (conditions.transfers > 0) {
    const transferPenalty = -conditions.transfers * 0.08;
    stress += Math.abs(transferPenalty);
    satisfaction += transferPenalty;
    factors.push({
      factor: 'Пересадки',
      impact: transferPenalty,
      description: `${conditions.transfers} пересадк${conditions.transfers === 1 ? 'а' : 'и'} → дополнительный стресс`,
    });
  }

  // Rush hour stress
  if (conditions.isRushHour) {
    stress += 0.15;
    factors.push({
      factor: 'Час пик',
      impact: -0.15,
      description: 'Повышенная загруженность в час пик',
    });
  }

  // Personal adjustments based on behavior model
  stress *= (1 - model.riskTolerance * 0.3); // risk-tolerant people less stressed
  satisfaction += model.comfortPreference * 0.1; // comfort-oriented = higher base satisfaction

  return {
    energy: clamp(energy, 0, 1),
    stress: clamp(stress, 0, 1),
    satisfaction: clamp(satisfaction, 0, 1),
    factors,
  };
}

/** Generate recommendation based on predicted state */
export function generateStateRecommendation(
  state: PredictedUserState,
  alternatives: Array<{ mode: TravelMode; durationMinutes: number; cost: number }>
): string {
  const parts: string[] = [];

  if (state.energy < 0.4) {
    parts.push(`⚡ Вы будете усталым (энергия: ${Math.round(state.energy * 100)}%)`);
    const taxi = alternatives.find(a => a.mode === 'car');
    if (taxi) {
      parts.push(`💡 Рекомендуем такси (+${taxi.cost}₽) для сохранения энергии`);
    }
  }

  if (state.stress > 0.7) {
    parts.push(`😰 Ожидается высокий стресс (${Math.round(state.stress * 100)}%)`);
    const negativeFactors = state.factors.filter(f => f.impact < -0.1);
    if (negativeFactors.length > 0) {
      parts.push(`Причины: ${negativeFactors.map(f => f.factor.toLowerCase()).join(', ')}`);
    }
  }

  if (state.satisfaction < 0.4) {
    parts.push('💡 Рассмотрите перенос встречи на 30 минут позже');
  }

  if (parts.length === 0) {
    parts.push(`✅ Прогноз: хорошее состояние к прибытию (${Math.round(state.satisfaction * 100)}% удовлетворённость)`);
  }

  return parts.join('\n');
}

// ══════════════════════════════════════════════════════════════════════════
// TWIN SIMULATION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Simulate a trip using the user's digital twin.
 * The twin "lives through" the route and reports back.
 */
export function simulateUserTrip(
  route: NavRoute,
  userId: string,
  mode: TravelMode = 'car',
  conditions?: Partial<TripConditions>
): TwinSimulationResult {
  const model = getUserBehaviorModel(userId);
  const durationMin = route.totalDurationSeconds / 60;
  const now = new Date();

  const tripConditions: TripConditions = {
    mode,
    durationMinutes: durationMin,
    transfers: 0,
    crowdingLevel: conditions?.crowdingLevel ?? 0.5,
    weatherCode: conditions?.weatherCode ?? 'clear',
    departureHour: conditions?.departureHour ?? now.getHours(),
    isRushHour: conditions?.isRushHour ?? (now.getHours() >= 7 && now.getHours() <= 9),
  };

  // Predict final state
  const predictedState = predictUserState(userId, tripConditions);

  // Compute abandonment risk
  let abandonmentRisk = 0;

  // Long trip + low energy = abandonment risk
  if (durationMin > 60 && predictedState.energy < 0.3) {
    abandonmentRisk += 0.3;
  }

  // High stress + impatient user = abandonment risk
  if (predictedState.stress > 0.7 && model.responseToStress === 'abort_trip') {
    abandonmentRisk += 0.4;
  }

  // Many complex maneuvers for risk-averse user
  const complexManeuvers = route.maneuvers.filter(m =>
    m.type.includes('sharp') || m.type === 'uturn' || m.type === 'roundabout'
  );
  if (complexManeuvers.length > 5 && model.riskTolerance < 0.3) {
    abandonmentRisk += 0.2;
  }

  abandonmentRisk = clamp(abandonmentRisk, 0, 1);

  // Determine abandonment point (if risk > 0.3, identify weakest point)
  let abandonmentPoint: LatLng | undefined;
  if (abandonmentRisk > 0.3 && complexManeuvers.length > 0) {
    // Twin would abandon at the most stressful maneuver
    const worstManeuver = complexManeuvers[Math.floor(complexManeuvers.length / 2)];
    abandonmentPoint = worstManeuver.location;
  }

  // Completion probability
  const completionProbability = 1 - abandonmentRisk;

  // Warnings
  const warnings: string[] = [];
  if (predictedState.energy < 0.3) {
    warnings.push('Двойник предсказывает сильную усталость');
  }
  if (predictedState.stress > 0.7) {
    warnings.push('Двойник отмечает высокий уровень стресса');
  }
  if (abandonmentRisk > 0.5) {
    warnings.push('Двойник не уверен в завершении маршрута');
  }
  if (complexManeuvers.length > 3) {
    warnings.push(`Маршрут содержит ${complexManeuvers.length} сложных манёвров`);
  }

  // Recommendation
  let recommendation = 'Маршрут подходит для вашего профиля.';
  if (abandonmentRisk > 0.5) {
    recommendation = 'Рассмотрите более простой маршрут или такси.';
  } else if (predictedState.stress > 0.6) {
    recommendation = 'Маршрут стрессовый — включите спокойную музыку 🎵';
  } else if (predictedState.energy < 0.4) {
    recommendation = 'Возьмите кофе перед поездкой ☕';
  }

  return {
    routeId: route.id,
    completionProbability,
    predictedState,
    abandonmentRisk,
    abandonmentPoint,
    warnings,
    recommendation,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// COUNTERFACTUAL ANALYSIS
// ══════════════════════════════════════════════════════════════════════════

/**
 * After a trip: analyze what would have happened with other choices.
 * Computes regret and adjusts user profile.
 */
export function analyzeCounterfactual(
  chosenRoute: NavRoute,
  alternativeRoutes: NavRoute[],
  chosenMode: TravelMode = 'car',
  actualDurationSeconds?: number
): CounterfactualAnalysis {
  const chosenObj = extractObjectives(chosenRoute, chosenMode);

  // If actual duration differs from predicted, adjust
  if (actualDurationSeconds !== undefined) {
    chosenObj.timeSeconds = actualDurationSeconds;
  }

  const alternatives = alternativeRoutes.map(alt => {
    const altObj = extractObjectives(alt, chosenMode);

    // Regret = how much better the alternative was (composite metric)
    const timeDiff = chosenObj.timeSeconds - altObj.timeSeconds;
    const costDiff = chosenObj.costRub - altObj.costRub;
    const co2Diff = chosenObj.co2Grams - altObj.co2Grams;

    // Weighted regret (positive = chosen was worse)
    const regret = timeDiff / 60 * 10 + costDiff * 0.5 + co2Diff * 0.01;

    return {
      routeId: alt.id,
      objectives: altObj,
      regret,
      wouldHaveBeenBetter: regret > 0,
    };
  });

  const totalRegret = alternatives.reduce((sum, a) => sum + Math.max(a.regret, 0), 0);

  // Generate lesson
  const betterAlts = alternatives.filter(a => a.wouldHaveBeenBetter);
  let lesson: string;
  if (betterAlts.length === 0) {
    lesson = '✅ Отличный выбор! Ни один альтернативный маршрут не был лучше.';
  } else {
    const best = betterAlts.sort((a, b) => b.regret - a.regret)[0];
    const timeSaved = Math.round((chosenObj.timeSeconds - best.objectives.timeSeconds) / 60);
    const costSaved = Math.round(chosenObj.costRub - best.objectives.costRub);
    lesson = `💡 Альтернативный маршрут мог сэкономить ${timeSaved > 0 ? `${timeSaved} мин` : ''}${timeSaved > 0 && costSaved > 0 ? ' и ' : ''}${costSaved > 0 ? `${costSaved}₽` : ''}`;
  }

  // Suggest profile adjustment
  let profileAdjustment: Partial<RouteWeights> | undefined;
  if (betterAlts.length > 0) {
    const avgTimeDiff = betterAlts.reduce((s, a) => s + (chosenObj.timeSeconds - a.objectives.timeSeconds), 0) / betterAlts.length;
    const avgCostDiff = betterAlts.reduce((s, a) => s + (chosenObj.costRub - a.objectives.costRub), 0) / betterAlts.length;

    if (avgTimeDiff > 300) { // >5 min
      profileAdjustment = { time: 0.05 }; // increase time weight
    } else if (avgCostDiff > 100) { // >100 rub
      profileAdjustment = { cost: 0.05 }; // increase cost weight
    }
  }

  return {
    chosenRoute: chosenObj,
    alternatives,
    totalRegret,
    lesson,
    profileAdjustment,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Circadian energy curve (simplified) */
function getCircadianEnergy(hour: number): number {
  // Peak energy: 10-12, 15-17. Low: 14-15 (post-lunch dip), 23-6 (sleep)
  const h = ((hour % 24) + 24) % 24;
  if (h >= 0 && h < 6) return 0.2 + h * 0.03;
  if (h >= 6 && h < 10) return 0.4 + (h - 6) * 0.15;
  if (h >= 10 && h < 12) return 1.0;
  if (h >= 12 && h < 14) return 0.8;
  if (h >= 14 && h < 15) return 0.6; // post-lunch dip
  if (h >= 15 && h < 17) return 0.85;
  if (h >= 17 && h < 20) return 0.7;
  if (h >= 20 && h < 22) return 0.5;
  return 0.3;
}

function modeDescription(mode: TravelMode): string {
  switch (mode) {
    case 'car': return 'Автомобиль — комфорт, но стресс в пробках';
    case 'taxi': return 'Такси — минимум организационных усилий, но дороже поездки на авто';
    case 'pedestrian': return 'Пешком — активный отдых, но утомляет';
    case 'transit': return 'Общественный транспорт — нейтрально';
    case 'metro': return 'Метро — быстро и стабильно, но с пересадками и платформами';
    case 'multimodal': return 'Мультимодальный — разнообразно, но пересадки';
    default: return '';
  }
}
