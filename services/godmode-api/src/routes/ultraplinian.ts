/**
 * /v1/ultraplinian — ULTRAPLINIAN multi-model racing с Liquid Response SSE.
 *
 * SSE events:
 *   race:start    — начало гонки (кол-во моделей, тир)
 *   race:model    — результат от очередной модели
 *   race:leader   — новый лидер (лучший скор)
 *   race:complete — финал (winner, rankings, pipeline info)
 */

import { Router, type Request, type Response } from 'express'
import {
  raceModels,
  getModelsForTier,
  applyGodmodeBoost,
  scoreResponse,
  DEPTH_DIRECTIVE,
  type SpeedTier,
  type ModelResponse,
} from '../lib/openrouter.js'
import { computeParams, type Strategy } from '../lib/autotune.js'
import { transform, type STMModule } from '../lib/stm.js'

const router = Router()

function sendSSE(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

router.post('/completions', async (req: Request, res: Response) => {
  const {
    messages,
    openrouter_api_key,
    tier = 'fast',
    autotune = true,
    strategy = 'adaptive',
    stm_modules,
    max_tokens = 4096,
    system_prompt,
    stream = false, // Liquid Response SSE
    godmode = true,
    temperature, top_p, top_k, frequency_penalty, presence_penalty,
    // racing config
    min_results, grace_period, hard_timeout,
  } = req.body

  const apiKey = openrouter_api_key || process.env.OPENROUTER_API_KEY
  if (!apiKey) { res.status(400).json({ error: 'openrouter_api_key required' }); return }
  if (!messages?.length) { res.status(400).json({ error: 'messages required' }); return }

  const validTiers = ['fast', 'standard', 'smart', 'power', 'ultra']
  if (!validTiers.includes(tier)) {
    res.status(400).json({ error: `Invalid tier. Available: ${validTiers.join(', ')}` })
    return
  }

  const models = getModelsForTier(tier as SpeedTier)

  // GODMODE system prompt + DEPTH_DIRECTIVE
  const sysPrompt = [system_prompt, godmode ? DEPTH_DIRECTIVE : ''].filter(Boolean).join('\n')

  // AutoTune
  let params: Partial<Record<string, number>> = {}
  let tuneInfo: Record<string, unknown> | null = null
  if (autotune) {
    const lastMsg = messages[messages.length - 1]?.content || ''
    const result = computeParams({
      strategy: strategy as Strategy,
      message: lastMsg,
      history: messages.slice(0, -1),
      overrides: { temperature, top_p, top_k, frequency_penalty, presence_penalty },
    })
    params = { ...result.params }
    tuneInfo = { detected_context: result.context, confidence: result.confidence }
  } else {
    if (temperature != null) params.temperature = temperature
    if (top_p != null) params.top_p = top_p
    if (top_k != null) params.top_k = top_k
    if (frequency_penalty != null) params.frequency_penalty = frequency_penalty
    if (presence_penalty != null) params.presence_penalty = presence_penalty
  }

  // GODMODE boost
  if (godmode) params = applyGodmodeBoost(params)

  // ── Liquid Response SSE ──────────────────────────
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    sendSSE(res, 'race:start', { tier, models: models.length, strategy: autotune ? strategy : 'manual' })

    let leader: ModelResponse | null = null

    try {
      const race = await raceModels({
        apiKey, messages, tier: tier as SpeedTier, params, maxTokens: max_tokens,
        systemPrompt: sysPrompt,
        config: {
          minResults: min_results,
          gracePeriod: grace_period,
          hardTimeout: hard_timeout,
          onResult(result) {
            sendSSE(res, 'race:model', {
              model: result.model,
              success: result.success,
              score: result.score,
              duration_ms: result.durationMs,
              content_length: result.content.length,
              ...(result.error ? { error: result.error } : {}),
            })

            // новый лидер — liquid_min_delta = 3
            if (result.success && (!leader || result.score > leader.score + 3)) {
              leader = result
              sendSSE(res, 'race:leader', {
                model: result.model,
                score: result.score,
                content_preview: result.content.slice(0, 200),
              })
            }
          },
        },
      })

      // STM на winner
      let response = race.winner.content
      let stmInfo = null
      const mods: STMModule[] = stm_modules ?? ['hedge_reducer', 'direct_mode']
      if (mods.length > 0 && response) {
        const t = transform(response, mods)
        response = t.transformed
        stmInfo = { modules_applied: t.applied, changes: t.changes }
      }

      sendSSE(res, 'race:complete', {
        response,
        winner: { model: race.winner.model, score: race.winner.score, duration_ms: race.winner.durationMs },
        race: {
          tier, models_queried: race.modelsQueried, models_succeeded: race.modelsSucceeded,
          total_duration_ms: race.totalDurationMs,
        },
        pipeline: { autotune: tuneInfo, stm: stmInfo, godmode },
      })
    } catch (err) {
      sendSSE(res, 'error', { message: String(err) })
    }

    res.end()
    return
  }

  // ── JSON (non-streaming) ─────────────────────────
  try {
    const race = await raceModels({
      apiKey, messages, tier: tier as SpeedTier, params, maxTokens: max_tokens,
      systemPrompt: sysPrompt,
      config: { minResults: min_results, gracePeriod: grace_period, hardTimeout: hard_timeout },
    })

    let response = race.winner.content
    let stmInfo = null
    const mods: STMModule[] = stm_modules ?? ['hedge_reducer', 'direct_mode']
    if (mods.length > 0 && response) {
      const t = transform(response, mods)
      response = t.transformed
      stmInfo = { modules_applied: t.applied, changes: t.changes }
    }

    res.json({
      response,
      winner: { model: race.winner.model, score: race.winner.score, duration_ms: race.winner.durationMs },
      race: {
        tier,
        models_queried: race.modelsQueried,
        models_succeeded: race.modelsSucceeded,
        total_duration_ms: race.totalDurationMs,
        rankings: race.rankings.map(r => ({
          model: r.model, score: r.score, duration_ms: r.durationMs,
          success: r.success, content_length: r.content.length,
          ...(r.error ? { error: r.error } : {}),
        })),
      },
      pipeline: { autotune: tuneInfo, stm: stmInfo, godmode },
    })
  } catch (err) {
    res.status(500).json({ error: 'Race failed', details: String(err) })
  }
})

export { router as ultraplinianRoutes }
