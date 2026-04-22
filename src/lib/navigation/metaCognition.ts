/**
 * Meta-Cognition & Self-Improvement Engine.
 *
 * The system reflects on its own performance:
 * - Collects routing latency, failures, and user feedback
 * - Performs root-cause analysis
 * - Proposes auto-remediations
 * - Produces self-improvement plans
 * - Supports abductive reasoning over observations
 */

import type {
  SystemSelfReport,
  RootCauseAnalysis,
  AutoRemediation,
  AbductiveHypothesis,
} from '@/types/quantum-transport';
import { dbLoose } from '@/lib/supabase';

interface RoutingEvent {
  timestamp: Date;
  latencyMs: number;
  success: boolean;
  errorType?: string;
  feedback?: 'positive' | 'negative' | 'neutral';
  context?: Record<string, unknown>;
}

const routingEvents: RoutingEvent[] = [];
const remediations: AutoRemediation[] = [];

function extractUserId(context?: Record<string, unknown>): string | null {
  return typeof context?.userId === 'string' ? context.userId : null;
}

async function persistRoutingEvent(event: RoutingEvent): Promise<void> {
  const userId = extractUserId(event.context);
  if (!userId) return;

  await dbLoose.from('nav_meta_cognition_events').insert({
    user_id: userId,
    occurred_at: event.timestamp.toISOString(),
    latency_ms: Math.max(0, Math.round(event.latencyMs)),
    success: event.success,
    error_type: event.errorType ?? null,
    feedback: event.feedback ?? null,
    context: event.context ?? {},
    source: 'quantum_transport',
  });
}

async function persistRemediation(userId: string, remediation: AutoRemediation): Promise<void> {
  await dbLoose.from('nav_meta_cognition_remediations').insert({
    user_id: userId,
    action: remediation.action,
    status: remediation.status,
    impact: remediation.impact,
    deployed_at: remediation.deployedAt?.toISOString() ?? null,
    updated_at: new Date().toISOString(),
  });
}

export function recordRoutingEvent(event: RoutingEvent): void {
  routingEvents.push(event);
  trimOldEvents();
  void persistRoutingEvent(event);
}

export function recordFeedback(feedback: RoutingEvent['feedback'], context?: Record<string, unknown>): void {
  const event: RoutingEvent = {
    timestamp: new Date(),
    latencyMs: 0,
    success: feedback !== 'negative',
    feedback,
    context,
  };
  routingEvents.push(event);
  trimOldEvents();
  void persistRoutingEvent(event);
}

export function registerRemediation(action: string, impact: string, status: AutoRemediation['status'] = 'proposed', userId?: string): void {
  const remediation: AutoRemediation = {
    action,
    status,
    impact,
    deployedAt: status === 'deployed' ? new Date() : undefined,
  };
  remediations.push(remediation);
  if (userId) {
    void persistRemediation(userId, remediation);
  }
}

export async function hydrateMetaCognition(userId: string, periodHours = 24): Promise<void> {
  const fromIso = new Date(Date.now() - periodHours * 60 * 60 * 1000).toISOString();
  const [{ data: events }, { data: savedRemediations }] = await Promise.all([
    dbLoose
      .from('nav_meta_cognition_events')
      .select('occurred_at, latency_ms, success, error_type, feedback, context')
      .eq('user_id', userId)
      .gte('occurred_at', fromIso)
      .order('occurred_at', { ascending: false })
      .limit(1000),
    dbLoose
      .from('nav_meta_cognition_remediations')
      .select('action, status, impact, deployed_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  routingEvents.length = 0;
  remediations.length = 0;

  if (Array.isArray(events)) {
    for (const event of events) {
      routingEvents.push({
        timestamp: new Date(String(event.occurred_at)),
        latencyMs: Number(event.latency_ms ?? 0),
        success: Boolean(event.success),
        errorType: typeof event.error_type === 'string' ? event.error_type : undefined,
        feedback: typeof event.feedback === 'string'
          ? event.feedback as RoutingEvent['feedback']
          : undefined,
        context: event.context as Record<string, unknown> | undefined,
      });
    }
  }

  if (Array.isArray(savedRemediations)) {
    for (const remediation of savedRemediations) {
      remediations.push({
        action: remediation.action,
        status: remediation.status,
        impact: remediation.impact,
        deployedAt: remediation.deployed_at ? new Date(String(remediation.deployed_at)) : undefined,
      });
    }
  }

  trimOldEvents();
}

export function generateSelfReport(periodHours = 24): SystemSelfReport {
  const now = new Date();
  const from = new Date(now.getTime() - periodHours * 60 * 60 * 1000);
  const events = routingEvents.filter(e => e.timestamp >= from);

  const routesBuilt = events.filter(e => e.latencyMs > 0).length;
  const latencyEvents = events.filter(e => e.latencyMs > 0);
  const avgLatencyMs = latencyEvents.length > 0
    ? latencyEvents.reduce((sum, e) => sum + e.latencyMs, 0) / latencyEvents.length
    : 0;

  const errors: Record<string, number> = {};
  const userFeedback: Record<string, number> = { positive: 0, negative: 0, neutral: 0 };

  for (const event of events) {
    if (!event.success) {
      const key = event.errorType ?? 'unknown';
      errors[key] = (errors[key] ?? 0) + 1;
    }
    if (event.feedback) {
      userFeedback[event.feedback] = (userFeedback[event.feedback] ?? 0) + 1;
    }
  }

  const rootCauses = analyzeRootCauses(events, avgLatencyMs, errors, userFeedback);
  const autoRemediations = proposeRemediations(rootCauses);
  const selfImprovementPlan = buildImprovementPlan(rootCauses, autoRemediations);

  return {
    period: { from, to: now },
    stats: {
      routesBuilt,
      avgLatencyMs,
      errors,
      userFeedback,
    },
    rootCauses,
    remediations: [...remediations, ...autoRemediations],
    selfImprovementPlan,
  };
}

export function abductiveReason(observation: string): AbductiveHypothesis {
  const recent = routingEvents.slice(-200);
  const hypotheses: AbductiveHypothesis['hypotheses'] = [];
  const lower = observation.toLowerCase();

  if (lower.includes('мед') || lower.includes('slow') || lower.includes('latency')) {
    const highLatency = recent.filter(e => e.latencyMs > 1500).length;
    if (highLatency > 0) {
      hypotheses.push({
        hypothesis: 'Рост времени расчёта из-за сложных графов или лишних проходов',
        confidence: Math.min(0.5 + highLatency / 50, 0.9),
        evidence: [`Событий с высокой задержкой: ${highLatency}`],
        contradictions: [],
      });
    }
    const apiErrors = recent.filter(e => e.errorType === 'api_timeout').length;
    if (apiErrors > 0) {
      hypotheses.push({
        hypothesis: 'Внешние API деградировали или таймаутят',
        confidence: Math.min(0.4 + apiErrors / 30, 0.85),
        evidence: [`API timeout: ${apiErrors}`],
        contradictions: [],
      });
    }
  }

  if (lower.includes('ошиб') || lower.includes('error') || lower.includes('fail')) {
    const grouped = groupErrors(recent);
    for (const [errorType, count] of Object.entries(grouped)) {
      hypotheses.push({
        hypothesis: `Повторяющаяся ошибка типа: ${errorType}`,
        confidence: Math.min(0.35 + count / 20, 0.9),
        evidence: [`Количество: ${count}`],
        contradictions: [],
      });
    }
  }

  if (lower.includes('недоволен') || lower.includes('negative') || lower.includes('жалоб')) {
    const negative = recent.filter(e => e.feedback === 'negative').length;
    if (negative > 0) {
      hypotheses.push({
        hypothesis: 'Маршруты не соответствуют пользовательским приоритетам',
        confidence: Math.min(0.45 + negative / 25, 0.85),
        evidence: [`Негативный фидбек: ${negative}`],
        contradictions: [],
      });
    }
  }

  hypotheses.sort((a, b) => b.confidence - a.confidence);
  const best = hypotheses[0];

  return {
    observation,
    hypotheses,
    bestHypothesis: best?.hypothesis ?? 'Недостаточно данных',
    conclusion: best
      ? `Вероятнее всего: ${best.hypothesis}`
      : 'Недостаточно сигнала для уверенного вывода',
  };
}

function analyzeRootCauses(
  events: RoutingEvent[],
  avgLatencyMs: number,
  errors: Record<string, number>,
  userFeedback: Record<string, number>
): RootCauseAnalysis[] {
  const findings: RootCauseAnalysis[] = [];

  if (avgLatencyMs > 1200) {
    findings.push({
      symptom: 'Высокая средняя задержка построения маршрута',
      rootCause: 'Избыточная вычислительная нагрузка или частые fallback-вызовы',
      evidence: [`Средняя задержка: ${Math.round(avgLatencyMs)} мс`, `Событий: ${events.length}`],
      confidence: 0.82,
    });
  }

  const topErrors = Object.entries(errors).sort((a, b) => b[1] - a[1]);
  if (topErrors.length > 0) {
    const [errorType, count] = topErrors[0];
    findings.push({
      symptom: `Повторяющиеся ошибки ${errorType}`,
      rootCause: inferRootCauseFromError(errorType),
      evidence: [`Повторений: ${count}`],
      confidence: Math.min(0.5 + count / 25, 0.9),
    });
  }

  if ((userFeedback.negative ?? 0) > (userFeedback.positive ?? 0)) {
    findings.push({
      symptom: 'Негативный пользовательский фидбек преобладает',
      rootCause: 'Ранжирование маршрутов недостаточно адаптировано под реальные предпочтения',
      evidence: [
        `Негативный фидбек: ${userFeedback.negative ?? 0}`,
        `Позитивный фидбек: ${userFeedback.positive ?? 0}`,
      ],
      confidence: 0.76,
    });
  }

  if (findings.length === 0) {
    findings.push({
      symptom: 'Критичных отклонений не обнаружено',
      rootCause: 'Система работает в ожидаемых пределах',
      evidence: ['Недостаточно сигналов для проблемного паттерна'],
      confidence: 0.7,
    });
  }

  return findings;
}

function proposeRemediations(rootCauses: RootCauseAnalysis[]): AutoRemediation[] {
  const proposals: AutoRemediation[] = [];

  for (const cause of rootCauses) {
    if (cause.rootCause.includes('fallback') || cause.rootCause.includes('API')) {
      proposals.push({
        action: 'Снизить частоту внешних fallback-запросов и усилить локальный кэш графа',
        status: 'proposed',
        impact: 'Снижение задержки и зависимости от внешних сервисов',
      });
    }

    if (cause.rootCause.includes('адаптировано') || cause.rootCause.includes('предпочтения')) {
      proposals.push({
        action: 'Увеличить вес онлайн-обучения пользовательских предпочтений',
        status: 'proposed',
        impact: 'Более персонализированная выдача маршрутов',
      });
    }

    if (cause.rootCause.includes('вычислительная нагрузка')) {
      proposals.push({
        action: 'Оптимизировать вычисление Pareto/frontier и сократить лишние итерации',
        status: 'proposed',
        impact: 'Снижение latency на горячем пути расчёта маршрутов',
      });
    }
  }

  return proposals;
}

function buildImprovementPlan(rootCauses: RootCauseAnalysis[], proposals: AutoRemediation[]): string[] {
  const plan: string[] = [];

  if (rootCauses.some(c => c.symptom.includes('задержка'))) {
    plan.push('Профилировать горячий путь построения маршрута и убрать избыточные вычисления');
  }

  if (rootCauses.some(c => c.symptom.includes('фидбек'))) {
    plan.push('Скорректировать веса ранжирования на основе counterfactual/regret анализа');
  }

  if (proposals.length > 0) {
    plan.push('Прогнать A/B тест предложенных авто-ремедиаций на ограниченной выборке');
  }

  if (plan.length === 0) {
    plan.push('Продолжать мониторинг и накапливать сигналы для следующего self-review');
  }

  return plan;
}

function inferRootCauseFromError(errorType: string): string {
  if (errorType.includes('timeout')) return 'Сетевые задержки или деградация внешнего API';
  if (errorType.includes('graph')) return 'Неполные данные графа или ошибка индекса';
  if (errorType.includes('parse')) return 'Некорректный формат входных данных';
  if (errorType.includes('auth')) return 'Проблема авторизации или истекший токен';
  return 'Неустранённый системный дефект';
}

function groupErrors(events: RoutingEvent[]): Record<string, number> {
  const errors: Record<string, number> = {};
  for (const event of events) {
    if (!event.errorType) continue;
    errors[event.errorType] = (errors[event.errorType] ?? 0) + 1;
  }
  return errors;
}

function trimOldEvents(maxEvents = 2000): void {
  if (routingEvents.length > maxEvents) {
    routingEvents.splice(0, routingEvents.length - maxEvents);
  }
}
