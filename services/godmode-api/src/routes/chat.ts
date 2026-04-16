/**
 * /v1/chat/completions — OpenAI-совместимый endpoint.
 *
 * Virtual models:
 *   ultraplinian/{tier}  — ULTRAPLINIAN racing (fast/standard/smart/power/ultra)
 *   consortium/{tier}    — CONSORTIUM hive-mind synthesis
 *   race/{tier}          — alias для ultraplinian (backward compat)
 */

import { Router, type Request, type Response } from 'express'
import { queryModel, type SpeedTier, MODEL_TIERS } from '../lib/openrouter.js'
import { computeParams, type Strategy } from '../lib/autotune.js'
import { transform, type STMModule } from '../lib/stm.js'

const router = Router()

const VALID_TIERS = ['fast', 'standard', 'smart', 'power', 'ultra']

function parseTierModel(model: string): { route: 'ultraplinian' | 'consortium'; tier: SpeedTier } | null {
  const m = model.match(/^(ultraplinian|consortium|race)\/(fast|standard|smart|power|ultra)$/)
  if (!m) return null
  return { route: m[1] === 'race' ? 'ultraplinian' : m[1] as 'ultraplinian' | 'consortium', tier: m[2] as SpeedTier }
}

router.post('/completions', async (req, res) => {
  const {
    messages,
    model = 'nousresearch/hermes-3-llama-3.1-70b',
    openrouter_api_key,
    max_tokens = 4096,
    stream = false,
    // G0DM0D3 extensions
    autotune = true,
    strategy = 'adaptive',
    stm_modules,
    // standard OpenAI params
    temperature, top_p, frequency_penalty, presence_penalty,
  } = req.body

  const apiKey = openrouter_api_key || process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    res.status(400).json({ error: 'openrouter_api_key required (or set OPENROUTER_API_KEY env)' })
    return
  }

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array required' })
    return
  }

  // virtual model routing: ultraplinian/*, consortium/*, race/*
  const parsed = parseTierModel(model)
  if (parsed) {
    req.body.tier = parsed.tier
    if (parsed.route === 'consortium') {
      const { consortiumRoutes } = await import('./consortium.js')
      consortiumRoutes(req, res, () => {})
    } else {
      const { ultraplinianRoutes } = await import('./ultraplinian.js')
      ultraplinianRoutes(req, res, () => {})
    }
    return
  }

  // AutoTune
  let params: Partial<Record<string, number>> = {}
  let tuneInfo: { detected_context: string; confidence: number; strategy: string } | null = null
  if (autotune) {
    const lastMsg = messages[messages.length - 1]?.content || ''
    const result = computeParams({
      strategy: strategy as Strategy,
      message: lastMsg,
      history: messages.slice(0, -1),
      overrides: { temperature, top_p, frequency_penalty, presence_penalty },
    })
    params = { ...result.params }
    tuneInfo = { detected_context: result.context, confidence: result.confidence, strategy }
  } else {
    if (temperature != null) params.temperature = temperature
    if (top_p != null) params.top_p = top_p
    if (frequency_penalty != null) params.frequency_penalty = frequency_penalty
    if (presence_penalty != null) params.presence_penalty = presence_penalty
  }

  // Streaming: проксируем через ultraplinian с SSE
  if (stream) {
    req.body.tier = 'fast'
    const { ultraplinianRoutes } = await import('./ultraplinian.js')
    ultraplinianRoutes(req, res, () => {})
    return
  }

  try {
    const result = await queryModel({
      apiKey, model, messages, params, maxTokens: max_tokens,
    })

    if (!result.success) {
      res.status(502).json({ error: 'Model query failed', details: result.error })
      return
    }

    // STM
    let content = result.content
    let stmInfo = null
    const mods: STMModule[] = stm_modules ?? ['hedge_reducer', 'direct_mode']
    if (mods.length > 0 && content) {
      const t = transform(content, mods)
      content = t.transformed
      stmInfo = { modules_applied: t.applied, changes: t.changes }
    }

    // OpenAI-совместимый формат
    const id = `chatcmpl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    res.json({
      id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      x_godmode: {
        params_used: params,
        duration_ms: result.durationMs,
        score: result.score,
        pipeline: {
          autotune: tuneInfo,
          stm: stmInfo,
        },
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'Internal error', details: String(err) })
  }
})

export { router as chatRoutes }
