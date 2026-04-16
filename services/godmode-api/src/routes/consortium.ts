/**
 * /v1/consortium — CONSORTIUM hive-mind synthesis.
 *
 * Собирает ВСЕ ответы моделей, затем orchestrator синтезирует
 * единый ground-truth ответ, комбинируя лучшие элементы.
 *
 * SSE events:
 *   consortium:start         — начало сбора
 *   consortium:model         — результат модели
 *   consortium:leader        — текущий лидер
 *   consortium:synthesis:start — начало синтеза оркестратором
 *   consortium:complete      — финальный синтезированный ответ
 */

import { Router, type Request, type Response } from 'express'
import {
  collectAllResponses,
  synthesize,
  getModelsForTier,
  applyGodmodeBoost,
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
    tier = 'standard',
    autotune = true,
    strategy = 'adaptive',
    stm_modules,
    max_tokens = 4096,
    system_prompt,
    stream = false,
    godmode = true,
    orchestrator_model = 'anthropic/claude-sonnet-4',
    temperature, top_p, top_k, frequency_penalty, presence_penalty,
    hard_timeout,
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
  const sysPrompt = [system_prompt, godmode ? DEPTH_DIRECTIVE : ''].filter(Boolean).join('\n')
  const userQuery = [...messages].reverse().find((m: { role: string }) => m.role === 'user')?.content || ''

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
  }

  if (godmode) params = applyGodmodeBoost(params)

  // ── Liquid Response SSE ──────────────────────────
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    sendSSE(res, 'consortium:start', { tier, models: models.length, orchestrator: orchestrator_model })

    let leader: ModelResponse | null = null

    try {
      const responses = await collectAllResponses({
        apiKey, messages, tier: tier as SpeedTier, params, maxTokens: max_tokens,
        systemPrompt: sysPrompt,
        config: {
          hardTimeout: hard_timeout,
          onResult(result, collected, total) {
            sendSSE(res, 'consortium:model', {
              model: result.model, success: result.success, score: result.score,
              duration_ms: result.durationMs, content_length: result.content.length,
              progress: `${collected}/${total}`,
              ...(result.error ? { error: result.error } : {}),
            })
            if (result.success && (!leader || result.score > leader.score + 3)) {
              leader = result
              sendSSE(res, 'consortium:leader', {
                model: result.model, score: result.score,
                content_preview: result.content.slice(0, 200),
              })
            }
          },
        },
      })

      const successful = responses.filter(r => r.success)
      sendSSE(res, 'consortium:synthesis:start', {
        model: orchestrator_model,
        input_responses: successful.length,
      })

      const { synthesis, durationMs, model: usedModel } = await synthesize(
        userQuery, responses, apiKey, orchestrator_model, max_tokens,
      )

      // STM
      let finalContent = synthesis
      let stmInfo = null
      const mods: STMModule[] = stm_modules ?? ['hedge_reducer', 'direct_mode']
      if (mods.length > 0 && finalContent) {
        const t = transform(finalContent, mods)
        finalContent = t.transformed
        stmInfo = { modules_applied: t.applied, changes: t.changes }
      }

      sendSSE(res, 'consortium:complete', {
        response: finalContent,
        synthesis: { model: usedModel, duration_ms: durationMs },
        collection: {
          tier, total_models: models.length,
          responded: responses.length, succeeded: successful.length,
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
    const responses = await collectAllResponses({
      apiKey, messages, tier: tier as SpeedTier, params, maxTokens: max_tokens,
      systemPrompt: sysPrompt,
      config: { hardTimeout: hard_timeout },
    })

    const successful = responses.filter(r => r.success)

    const { synthesis, durationMs, model: usedModel } = await synthesize(
      userQuery, responses, apiKey, orchestrator_model, max_tokens,
    )

    let finalContent = synthesis
    let stmInfo = null
    const mods: STMModule[] = stm_modules ?? ['hedge_reducer', 'direct_mode']
    if (mods.length > 0 && finalContent) {
      const t = transform(finalContent, mods)
      finalContent = t.transformed
      stmInfo = { modules_applied: t.applied, changes: t.changes }
    }

    res.json({
      response: finalContent,
      synthesis: { model: usedModel, duration_ms: durationMs },
      collection: {
        tier,
        total_models: models.length,
        responded: responses.length,
        succeeded: successful.length,
        rankings: responses
          .sort((a, b) => b.score - a.score)
          .map(r => ({
            model: r.model, score: r.score, duration_ms: r.durationMs,
            success: r.success, content_length: r.content.length,
            ...(r.error ? { error: r.error } : {}),
          })),
      },
      pipeline: { autotune: tuneInfo, stm: stmInfo, godmode },
    })
  } catch (err) {
    res.status(500).json({ error: 'Consortium synthesis failed', details: String(err) })
  }
})

export { router as consortiumRoutes }
