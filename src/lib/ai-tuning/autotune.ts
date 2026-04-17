/**
 * AutoTune — контекстно-адаптивный движок параметров LLM (frontend-portable).
 *
 * Портирован из services/godmode-api/src/lib/autotune.ts для использования
 * в браузере, Edge Functions и AI-компонентах проекта.
 *
 * Анализирует сообщение, определяет тип контекста (code/creative/analytical/
 * conversational/chaotic) и подбирает оптимальные параметры генерации
 * (temperature, top_p, top_k, penalties).
 *
 * EMA-обучение: thumbs up/down через recordFeedback() корректирует профили
 * со временем. В браузере состояние держится в памяти вкладки; для
 * cross-device обучения нужно подключить SupabaseFeedbackStore (см.
 * feedbackStore.ts).
 */

export type ContextType = 'code' | 'creative' | 'analytical' | 'conversational' | 'chaotic';
export type Strategy = 'precise' | 'balanced' | 'creative' | 'chaotic' | 'adaptive';

export interface TuneParams {
  temperature: number;
  top_p: number;
  top_k: number;
  frequency_penalty: number;
  presence_penalty: number;
  repetition_penalty: number;
}

export interface ContextScore {
  type: ContextType;
  score: number;
  pct: number;
}

export interface TuneResult {
  params: TuneParams;
  context: ContextType;
  confidence: number;
  reasoning: string;
  scores: ContextScore[];
}

// ── Стратегии ────────────────────────────────────────────────────────────────

const STRATEGIES: Record<Exclude<Strategy, 'adaptive'>, TuneParams> = {
  precise:  { temperature: 0.2, top_p: 0.85, top_k: 30,  frequency_penalty: 0.3, presence_penalty: 0.1, repetition_penalty: 1.1 },
  balanced: { temperature: 0.7, top_p: 0.9,  top_k: 50,  frequency_penalty: 0.1, presence_penalty: 0.1, repetition_penalty: 1.0 },
  creative: { temperature: 1.1, top_p: 0.95, top_k: 80,  frequency_penalty: 0.4, presence_penalty: 0.6, repetition_penalty: 1.15 },
  chaotic:  { temperature: 1.6, top_p: 0.98, top_k: 100, frequency_penalty: 0.7, presence_penalty: 0.8, repetition_penalty: 1.25 },
};

export const CONTEXT_PROFILES: Record<ContextType, TuneParams> = {
  code:           { temperature: 0.15, top_p: 0.8,  top_k: 25,  frequency_penalty: 0.2, presence_penalty: 0.0,  repetition_penalty: 1.05 },
  creative:       { temperature: 1.15, top_p: 0.95, top_k: 85,  frequency_penalty: 0.5, presence_penalty: 0.7,  repetition_penalty: 1.2 },
  analytical:     { temperature: 0.4,  top_p: 0.88, top_k: 40,  frequency_penalty: 0.2, presence_penalty: 0.15, repetition_penalty: 1.08 },
  conversational: { temperature: 0.75, top_p: 0.9,  top_k: 50,  frequency_penalty: 0.1, presence_penalty: 0.1,  repetition_penalty: 1.0 },
  chaotic:        { temperature: 1.7,  top_p: 0.99, top_k: 100, frequency_penalty: 0.8, presence_penalty: 0.9,  repetition_penalty: 1.3 },
};

// ── Паттерны детекции контекста ──────────────────────────────────────────────

const PATTERNS: Record<ContextType, RegExp[]> = {
  code: [
    /\b(code|function|class|variable|bug|error|debug|compile|syntax|api|endpoint|regex|algorithm|refactor|typescript|javascript|python|rust|html|css|sql|json|import|export|return|async|await|interface|type|const|let|var)\b/i,
    /```[\s\S]*```/,
    /\b(fix|implement|write|create|build|deploy|test|lint|npm|pip|git)\b.{0,200}\b(code|function|app|service|component|module)\b/i,
    /[{}();=><]/,
    // RU
    /\b(код|функци|класс|переменн|баг|ошибк|отладк|компил|синтакс|рефактор|деплой|тест|импорт|экспорт|интерфейс)\w*/i,
  ],
  creative: [
    /\b(write|story|poem|creative|imagine|fiction|narrative|character|plot|scene|dialogue|metaphor|lyrics|song|artistic|fantasy|dream|inspire|prose|verse)\b/i,
    /\b(roleplay|role-play|pretend|act as|you are a)\b/i,
    /\b(brainstorm|ideate|come up with|think of|generate ideas)\b/i,
    // RU
    /\b(сочини|напиши\s+(рассказ|стих|историю)|придума|вообрази|фантази|персонаж|сюжет|метафор|роль|отыграй)/i,
  ],
  analytical: [
    /\b(analyze|analysis|compare|contrast|evaluate|assess|examine|investigate|research|study|review|critique|data|statistics|metrics|benchmark)\b/i,
    /\b(pros and cons|advantages|disadvantages|trade-?offs|implications)\b/i,
    /\b(why|how does|what causes|explain|elaborate|clarify|define|summarize)\b/i,
    // RU
    /\b(проанализир|сравни|оцени|исследуй|изучи|метрики|статистик|плюсы и минусы|почему|объясни|дай определение|резюме)/i,
  ],
  conversational: [
    /\b(hey|hi|hello|sup|what's up|how are you|thanks|thank you|cool|nice|awesome|great|lol|haha)\b/i,
    /\b(chat|talk|tell me about|what do you think|opinion)\b/i,
    /^.{0,30}$/,
    // RU
    /\b(привет|здорово|как дела|спасибо|круто|класс|лол|ахах|расскажи|что думаешь)/i,
  ],
  chaotic: [
    /\b(chaos|random|wild|crazy|absurd|surreal|glitch|break|destroy|unleash|madness|void|entropy)\b/i,
    /(!{3,}|\?{3,}|\.{4,})/,
    // RU
    /\b(хаос|безумие|абсурд|рандом|дико|сумасшедш|сюрреал|глитч|энтропи)/i,
  ],
};

// ── Детекция ─────────────────────────────────────────────────────────────────

interface HistoryMessage {
  role: string;
  content: string;
}

function detectContext(
  msg: string,
  history: HistoryMessage[] = [],
): { type: ContextType; confidence: number; scores: ContextScore[] } {
  const raw: Record<ContextType, number> = {
    code: 0,
    creative: 0,
    analytical: 0,
    conversational: 0,
    chaotic: 0,
  };

  for (const [ctx, pats] of Object.entries(PATTERNS)) {
    for (const p of pats) {
      if (p.test(msg)) raw[ctx as ContextType] += 3;
    }
  }

  // история весит x1 — последние 4 сообщения
  for (const m of history.slice(-4)) {
    for (const [ctx, pats] of Object.entries(PATTERNS)) {
      for (const p of pats) {
        if (p.test(m.content)) raw[ctx as ContextType] += 1;
      }
    }
  }

  const entries = Object.entries(raw) as [ContextType, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0);

  const scores: ContextScore[] = entries
    .map(([type, score]) => ({ type, score, pct: total > 0 ? Math.round((score / total) * 100) : 0 }))
    .sort((a, b) => b.score - a.score);

  if (total === 0) {
    return {
      type: 'conversational',
      confidence: 0.5,
      scores: [{ type: 'conversational', score: 1, pct: 100 }],
    };
  }

  return { type: scores[0].type, confidence: Math.min(scores[0].score / total, 1), scores };
}

// ── Утилиты ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function blend(a: TuneParams, b: TuneParams, w: number): TuneParams {
  const iw = 1 - w;
  return {
    temperature:        a.temperature * iw        + b.temperature * w,
    top_p:              a.top_p * iw              + b.top_p * w,
    top_k:              Math.round(a.top_k * iw   + b.top_k * w),
    frequency_penalty:  a.frequency_penalty * iw  + b.frequency_penalty * w,
    presence_penalty:   a.presence_penalty * iw   + b.presence_penalty * w,
    repetition_penalty: a.repetition_penalty * iw + b.repetition_penalty * w,
  };
}

function bounded(p: TuneParams): TuneParams {
  return {
    temperature:        clamp(p.temperature, 0, 2),
    top_p:              clamp(p.top_p, 0, 1),
    top_k:              clamp(Math.round(p.top_k), 1, 100),
    frequency_penalty:  clamp(p.frequency_penalty, -2, 2),
    presence_penalty:   clamp(p.presence_penalty, -2, 2),
    repetition_penalty: clamp(p.repetition_penalty, 0, 2),
  };
}

// ── EMA Feedback Store (in-memory) ───────────────────────────────────────────

interface LearnedDelta {
  param: keyof TuneParams;
  delta: number;
  samples: number;
}

const learned = new Map<ContextType, LearnedDelta[]>();
const EMA_ALPHA = 0.15;

export function recordFeedback(context: ContextType, params: TuneParams, rating: 1 | -1): void {
  let deltas = learned.get(context);
  if (!deltas) {
    deltas = [];
    learned.set(context, deltas);
  }

  const base = CONTEXT_PROFILES[context];
  for (const k of Object.keys(base) as (keyof TuneParams)[]) {
    let entry = deltas.find((d) => d.param === k);
    if (!entry) {
      entry = { param: k, delta: 0, samples: 0 };
      deltas.push(entry);
    }
    const diff = params[k] - base[k];
    entry.delta = entry.delta * (1 - EMA_ALPHA) + diff * rating * EMA_ALPHA;
    entry.samples++;
  }
}

export function getFeedbackStats(): Record<
  string,
  { samples: number; adjustments: Record<string, number> }
> {
  const out: Record<string, { samples: number; adjustments: Record<string, number> }> = {};
  for (const [ctx, deltas] of learned) {
    const adj: Record<string, number> = {};
    let totalSamples = 0;
    for (const d of deltas) {
      if (Math.abs(d.delta) > 0.001) adj[d.param] = Math.round(d.delta * 1000) / 1000;
      totalSamples = Math.max(totalSamples, d.samples);
    }
    out[ctx] = { samples: totalSamples, adjustments: adj };
  }
  return out;
}

/** Применить сохранённые дельты (например, загруженные из Supabase). */
export function applyFeedbackSnapshot(
  snapshot: Record<ContextType, LearnedDelta[]>,
): void {
  for (const [ctx, deltas] of Object.entries(snapshot) as [ContextType, LearnedDelta[]][]) {
    learned.set(ctx, deltas.map((d) => ({ ...d })));
  }
}

// ── Основной API ─────────────────────────────────────────────────────────────

export interface ComputeParamsOptions {
  strategy: Strategy;
  message: string;
  history?: HistoryMessage[];
  overrides?: Partial<TuneParams>;
}

export function computeParams(opts: ComputeParamsOptions): TuneResult {
  const { strategy, message, history = [], overrides } = opts;

  let base: TuneParams;
  let ctx: ContextType = 'conversational';
  let confidence = 1;
  let scores: ContextScore[] = [];

  if (strategy === 'adaptive') {
    const det = detectContext(message, history);
    ctx = det.type;
    confidence = det.confidence;
    scores = det.scores;

    base =
      confidence < 0.6
        ? blend(CONTEXT_PROFILES[ctx], STRATEGIES.balanced, 1 - confidence)
        : { ...CONTEXT_PROFILES[ctx] };
  } else {
    base = { ...STRATEGIES[strategy] };
    scores = [{ type: ctx, score: 1, pct: 100 }];
  }

  // длинные диалоги → больше repetition penalty
  if (history.length > 10) {
    const boost = Math.min((history.length - 10) * 0.01, 0.15);
    base.repetition_penalty += boost;
    base.frequency_penalty += boost * 0.5;
  }

  // EMA-корректировка — минимум 3 сэмпла, чтобы не плясать от шума
  const deltas = learned.get(ctx);
  if (deltas) {
    for (const d of deltas) {
      if (d.samples >= 3 && Math.abs(d.delta) > 0.01) {
        base[d.param] += d.delta * 0.5;
      }
    }
  }

  // пользовательские override
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (v != null) base[k as keyof TuneParams] = v as number;
    }
  }

  const labels: Record<ContextType, string> = {
    code: 'programming',
    creative: 'creative',
    analytical: 'analytical',
    conversational: 'chat',
    chaotic: 'chaotic',
  };

  return {
    params: bounded(base),
    context: ctx,
    confidence,
    reasoning:
      strategy === 'adaptive'
        ? `Detected: ${labels[ctx]} (${Math.round(confidence * 100)}% conf)`
        : `Strategy: ${strategy.toUpperCase()} fixed profile`,
    scores,
  };
}
