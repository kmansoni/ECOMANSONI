/**
 * ULTRAPLINIAN Engine — multi-model racing через OpenRouter.
 *
 * 56 моделей в 5 аддитивных тирах (fast → ultra).
 * Early-exit racing: staggered waves (12/wave, 150ms gap),
 * minResults → gracePeriod → hardTimeout.
 * Scoring: substance(25) + structure(20) + anti-refusal(25) + directness(15) + relevance(15).
 */

// ── DEPTH_DIRECTIVE — качественный промпт ──────────

export const DEPTH_DIRECTIVE = `

═══════════════════════════════════════════════════════════════════════
RESPONSE REQUIREMENTS:
═══════════════════════════════════════════════════════════════════════

QUALITY STANDARDS:
• Provide COMPREHENSIVE, DETAILED responses — never shallow
• Include specific examples, step-by-step breakdowns, technical depth
• Aim for thorough coverage — 500+ words for complex topics
• Use headers, lists, code blocks for organization
• Show expertise — insights a surface-level response would miss
• If writing code, include complete implementations with comments
• Cover edge cases, alternatives, practical applications

CONCRETENESS:
• Specific numbers, statistics, measurements
• Real examples, not hypotheticals
• Code that runs, not pseudocode
• Named tools, libraries, techniques
• If explaining a process, exact steps someone could follow`

// ── 56 моделей в 5 аддитивных тирах ────────────────

const MODELS = {
  fast: [
    'google/gemini-2.5-flash',
    'deepseek/deepseek-chat',
    'perplexity/sonar',
    'meta-llama/llama-3.1-8b-instruct',
    'moonshotai/kimi-k2.5',
    'x-ai/grok-code-fast-1',
    'xiaomi/mimo-v2-flash',
    'openai/gpt-oss-20b',
    'stepfun/step-3.5-flash',
    'google/gemini-3.1-flash-lite',
    'mistralai/mistral-small-3.2-24b-instruct',
    'nvidia/nemotron-3-nano-30b-a3b',
  ],
  standard: [
    'anthropic/claude-3.5-sonnet',
    'meta-llama/llama-4-scout',
    'deepseek/deepseek-v3.2',
    'nousresearch/hermes-3-llama-3.1-70b',
    'openai/gpt-4o',
    'google/gemini-2.5-pro',
    'anthropic/claude-sonnet-4',
    'anthropic/claude-sonnet-4.6',
    'mistralai/mixtral-8x22b-instruct',
    'meta-llama/llama-3.3-70b-instruct',
    'qwen/qwen-2.5-72b-instruct',
    'nousresearch/hermes-4-70b',
    'mistralai/mistral-medium-3.1',
    'google/gemini-3-flash-preview',
    'google/gemma-3-27b-it',
  ],
  smart: [
    'openai/gpt-5',
    'openai/gpt-5.3-chat',
    'qwen/qwen3.5-plus-02-15',
    'google/gemini-3-pro-preview',
    'anthropic/claude-opus-4.6',
    'openai/gpt-oss-120b',
    'deepseek/deepseek-r1',
    'meta-llama/llama-3.1-405b-instruct',
    'nousresearch/hermes-4-405b',
    'nousresearch/hermes-3-llama-3.1-405b',
    'nvidia/nemotron-3-super-120b-a12b',
  ],
  power: [
    'x-ai/grok-4',
    'openai/gpt-5.4',
    'meta-llama/llama-4-maverick',
    'qwen/qwen3-235b-a22b',
    'qwen/qwen3-coder',
    'minimax/minimax-m2.5',
    'mistralai/mistral-large-2512',
    'google/gemini-3.1-pro-preview',
    'moonshotai/kimi-k2',
    'xiaomi/mimo-v2-pro',
  ],
  ultra: [
    'x-ai/grok-4-fast',
    'x-ai/grok-4.1-fast',
    'anthropic/claude-opus-4',
    'qwen/qwen-2.5-coder-32b-instruct',
    'qwen/qwq-32b',
    'mistralai/codestral-2508',
    'mistralai/devstral-medium',
  ],
}

export type SpeedTier = keyof typeof MODELS
// backward compat alias
export type ModelTier = SpeedTier

export function getModelsForTier(tier: SpeedTier): string[] {
  switch (tier) {
    case 'fast': return [...MODELS.fast]
    case 'standard': return [...MODELS.fast, ...MODELS.standard]
    case 'smart': return [...MODELS.fast, ...MODELS.standard, ...MODELS.smart]
    case 'power': return [...MODELS.fast, ...MODELS.standard, ...MODELS.smart, ...MODELS.power]
    case 'ultra': return [...MODELS.fast, ...MODELS.standard, ...MODELS.smart, ...MODELS.power, ...MODELS.ultra]
  }
}

// backward compat — старый формат (не аддитивный) для chat.ts
export const MODEL_TIERS: Record<SpeedTier, string[]> = {
  fast: getModelsForTier('fast'),
  standard: getModelsForTier('standard'),
  smart: getModelsForTier('smart'),
  power: getModelsForTier('power'),
  ultra: getModelsForTier('ultra'),
}

export const TIER_COUNTS = {
  fast: MODELS.fast.length,                                                           // 12
  standard: MODELS.fast.length + MODELS.standard.length,                               // 27
  smart: MODELS.fast.length + MODELS.standard.length + MODELS.smart.length,            // 38
  power: MODELS.fast.length + MODELS.standard.length + MODELS.smart.length + MODELS.power.length, // 48
  ultra: Object.values(MODELS).flat().length,                                          // 55
}

// ── Types ──────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ModelResponse {
  model: string
  content: string
  score: number
  durationMs: number
  success: boolean
  error?: string
}

export interface RaceResult {
  winner: ModelResponse
  tier: SpeedTier
  modelsQueried: number
  modelsSucceeded: number
  totalDurationMs: number
  rankings: ModelResponse[]
}

// ── Scoring (0-100) ────────────────────────────────

const REFUSAL_RE = [
  /I cannot|I can't|I'm unable to/i,
  /I apologize|I'm sorry, but/i,
  /As an AI|As a language model/i,
  /I must decline|I have to refuse/i,
  /It would be inappropriate/i,
  /Instead, I can/i,
]
const PREAMBLE_RE = [
  /^(Sure|Of course|Certainly|Absolutely|Great question)/i,
  /^I'd be happy to help/i,
  /^Let me help you/i,
]
const HEADER_RE = /^#{1,3}\s/gm
const LIST_RE = /^[\s]*[-*•]\s/gm
const CODE_RE = /```/g

export function scoreResponse(content: string, userQuery = ''): number {
  if (!content || content.length < 10) return 0
  let total = 0

  // substance — длина (0-25)
  total += Math.min(content.length / 40, 25)

  // structure (0-20)
  const headers = (content.match(HEADER_RE) || []).length
  const lists = (content.match(LIST_RE) || []).length
  const codeBlocks = (content.match(CODE_RE) || []).length / 2
  total += Math.min(headers * 3 + lists * 1.5 + codeBlocks * 5, 20)

  // anti-refusal (0-25)
  const refusals = REFUSAL_RE.filter(r => r.test(content)).length
  total += Math.max(25 - refusals * 8, 0)

  // directness (0-15)
  const hasPreamble = PREAMBLE_RE.some(r => r.test(content.trim()))
  total += hasPreamble ? 8 : 15

  // relevance (0-15)
  if (userQuery) {
    const words = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const low = content.toLowerCase()
    const matched = words.filter(w => low.includes(w))
    total += words.length > 0 ? (matched.length / words.length) * 15 : 7.5
  } else {
    total += 7.5 // нет запроса — нейтральный бонус
  }

  return Math.round(Math.min(total, 100))
}

// ── Single Model Query ─────────────────────────────

export async function queryModel(opts: {
  apiKey: string
  model: string
  messages: ChatMessage[]
  params?: Partial<Record<string, number>>
  maxTokens?: number
  systemPrompt?: string
  signal?: AbortSignal
}): Promise<ModelResponse> {
  const { apiKey, model, messages, params = {}, maxTokens = 4096, systemPrompt, signal } = opts
  const start = Date.now()

  const finalMessages = systemPrompt
    ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
    : messages

  const body: Record<string, unknown> = { model, messages: finalMessages, max_tokens: maxTokens }
  if (params.temperature != null) body.temperature = params.temperature
  if (params.top_p != null) body.top_p = params.top_p
  if (params.top_k != null) body.top_k = params.top_k
  if (params.frequency_penalty != null) body.frequency_penalty = params.frequency_penalty
  if (params.presence_penalty != null) body.presence_penalty = params.presence_penalty

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://mansoni.app',
        'X-Title': 'Mansoni-GODMODE',
      },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(60_000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      return { model, content: '', score: 0, durationMs: Date.now() - start, success: false, error: `${res.status}: ${errText}` }
    }

    const data = await res.json() as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content ?? ''
    if (!content) return { model, content: '', score: 0, durationMs: Date.now() - start, success: false, error: 'Empty response' }

    const userMsg = [...messages].reverse().find(m => m.role === 'user')?.content || ''
    return { model, content, score: scoreResponse(content, userMsg), durationMs: Date.now() - start, success: true }
  } catch (err) {
    return { model, content: '', score: 0, durationMs: Date.now() - start, success: false, error: String(err) }
  }
}

// ── GODMODE boost ──────────────────────────────────

export function applyGodmodeBoost(params: Partial<Record<string, number>>): Partial<Record<string, number>> {
  return {
    ...params,
    temperature: Math.min((params.temperature ?? 0.7) + 0.1, 2.0),
    presence_penalty: Math.min((params.presence_penalty ?? 0) + 0.15, 2.0),
    frequency_penalty: Math.min((params.frequency_penalty ?? 0) + 0.1, 2.0),
  }
}

// ── Early-exit racing (staggered waves) ────────────

const WAVE_SIZE = 12
const WAVE_DELAY_MS = 150

export interface RaceConfig {
  minResults?: number   // сколько успешных до начала grace (default 5)
  gracePeriod?: number  // ms после minResults (default 5000)
  hardTimeout?: number  // абсолютный таймаут (default 45000)
  onResult?: (result: ModelResponse) => void
}

export function raceModels(opts: {
  apiKey: string
  messages: ChatMessage[]
  tier: SpeedTier
  params?: Partial<Record<string, number>>
  maxTokens?: number
  systemPrompt?: string
  config?: RaceConfig
}): Promise<RaceResult> {
  const { apiKey, messages, tier, params = {}, maxTokens, systemPrompt, config = {} } = opts
  const models = getModelsForTier(tier)
  const minResults = config.minResults ?? 5
  const gracePeriod = config.gracePeriod ?? 5000
  const hardTimeout = config.hardTimeout ?? 45000
  const start = Date.now()

  return new Promise(resolve => {
    const results: ModelResponse[] = []
    let successCount = 0
    let settled = 0
    let graceTimer: ReturnType<typeof setTimeout> | null = null
    let done = false
    const controller = new AbortController()

    const finish = () => {
      if (done) return
      done = true
      controller.abort()
      if (graceTimer) clearTimeout(graceTimer)
      clearTimeout(hardTimer)

      const ranked = [...results].sort((a, b) => b.score - a.score)
      resolve({
        winner: ranked[0] ?? { model: '', content: '', score: 0, durationMs: 0, success: false },
        tier,
        modelsQueried: models.length,
        modelsSucceeded: successCount,
        totalDurationMs: Date.now() - start,
        rankings: ranked,
      })
    }

    const hardTimer = setTimeout(finish, hardTimeout)

    const launch = (model: string) => {
      queryModel({ apiKey, model, messages, params, maxTokens, systemPrompt, signal: controller.signal })
        .then(result => {
          if (done) return
          results.push(result)
          settled++
          if (result.success) successCount++
          config.onResult?.(result)

          if (successCount >= minResults && !graceTimer) {
            graceTimer = setTimeout(finish, gracePeriod)
          }
          if (settled === models.length) finish()
        })
    }

    for (let i = 0; i < models.length; i++) {
      const delay = Math.floor(i / WAVE_SIZE) * WAVE_DELAY_MS
      if (delay === 0) launch(models[i])
      else setTimeout(() => { if (!done) launch(models[i]) }, delay)
    }

    if (models.length === 0) finish()
  })
}

// ── Collect ALL responses (для CONSORTIUM) ─────────

export interface CollectConfig {
  hardTimeout?: number
  onResult?: (result: ModelResponse, collected: number, total: number) => void
}

export function collectAllResponses(opts: {
  apiKey: string
  messages: ChatMessage[]
  tier: SpeedTier
  params?: Partial<Record<string, number>>
  maxTokens?: number
  systemPrompt?: string
  config?: CollectConfig
}): Promise<ModelResponse[]> {
  const { apiKey, messages, tier, params = {}, maxTokens, systemPrompt, config = {} } = opts
  const models = getModelsForTier(tier)
  const hardTimeout = config.hardTimeout ?? 60000

  return new Promise(resolve => {
    const results: ModelResponse[] = []
    let settled = 0
    let done = false
    const controller = new AbortController()

    const finish = () => {
      if (done) return
      done = true
      controller.abort()
      clearTimeout(timer)
      resolve(results)
    }

    const timer = setTimeout(finish, hardTimeout)

    const launch = (model: string) => {
      queryModel({ apiKey, model, messages, params, maxTokens, systemPrompt, signal: controller.signal })
        .then(result => {
          if (done) return
          results.push(result)
          settled++
          config.onResult?.(result, settled, models.length)
          if (settled === models.length) finish()
        })
    }

    for (let i = 0; i < models.length; i++) {
      const delay = Math.floor(i / WAVE_SIZE) * WAVE_DELAY_MS
      if (delay === 0) launch(models[i])
      else setTimeout(() => { if (!done) launch(models[i]) }, delay)
    }

    if (models.length === 0) finish()
  })
}

// ── CONSORTIUM synthesis ───────────────────────────

const DEFAULT_ORCHESTRATOR = 'anthropic/claude-sonnet-4'

export async function synthesize(
  userQuery: string,
  responses: ModelResponse[],
  apiKey: string,
  orchestratorModel = DEFAULT_ORCHESTRATOR,
  maxTokens = 4096,
): Promise<{ synthesis: string; durationMs: number; model: string }> {
  const successful = responses.filter(r => r.success && r.content)
  const start = Date.now()

  const block = successful
    .map((r, i) => `═══ Model ${i + 1}: ${r.model} (score: ${r.score}) ═══\n${r.content}`)
    .join('\n\n')

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You're the CONSORTIUM orchestrator. You receive the user's question alongside multiple AI model responses. Your task: synthesize the SINGLE BEST ground-truth answer by combining the strongest elements from each.

Rules:
- Use specific details, examples, and code from individual responses
- Resolve contradictions by choosing the most technically correct version
- Be comprehensive but not redundant
- Do NOT say "According to Model X..." — just present the truth
- Output should be superior to any individual response`,
    },
    {
      role: 'user',
      content: `USER QUESTION:\n${userQuery}\n\n${successful.length} MODEL RESPONSES:\n\n${block}\n\nSynthesize the definitive answer.`,
    },
  ]

  const result = await queryModel({ apiKey, model: orchestratorModel, messages, maxTokens })
  if (!result.success) throw new Error(`Orchestrator failed: ${result.error}`)

  return { synthesis: result.content, durationMs: Date.now() - start, model: orchestratorModel }
}
