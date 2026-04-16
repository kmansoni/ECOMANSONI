/**
 * G0DM0D3 API Server — мульти-модельный AI gateway.
 *
 * Endpoints:
 *   POST /v1/chat/completions          — OpenAI-compatible (+ virtual models)
 *   POST /v1/ultraplinian/completions  — ULTRAPLINIAN racing + Liquid Response SSE
 *   POST /v1/consortium/completions    — CONSORTIUM hive-mind synthesis + SSE
 *   POST /v1/autotune/analyze          — контекстный анализ + оптимальные параметры
 *   POST /v1/transform                 — STM текстовые трансформации
 *   GET  /v1/transform/modules         — STM модули
 *   POST /v1/feedback                  — EMA feedback loop
 *   GET  /v1/feedback/stats            — статистика обратной связи
 *   GET  /v1/models                    — все модели по тирам + виртуальные
 *   GET  /health                       — health check
 *   GET  /v1/info                      — описание API
 */

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { chatRoutes } from './routes/chat.js'
import { ultraplinianRoutes } from './routes/ultraplinian.js'
import { consortiumRoutes } from './routes/consortium.js'
import { autotuneRoutes } from './routes/autotune.js'
import { transformRoutes } from './routes/transform.js'
import { feedbackRoutes } from './routes/feedback.js'
import { classicRoutes } from './routes/classic.js'
import { parseltongueRoutes } from './routes/parseltongue.js'
import { rateLimit } from './middleware/rate-limit.js'
import { apiKeyAuth } from './middleware/auth.js'
import { MODEL_TIERS, TIER_COUNTS, getModelsForTier, type SpeedTier } from './lib/openrouter.js'

const app = express()
const PORT = Number(process.env.PORT) || 3077

app.use(helmet())
app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(apiKeyAuth)
app.use(rateLimit)

// routes
app.use('/v1/chat', chatRoutes)
app.use('/v1/ultraplinian', ultraplinianRoutes)
app.use('/v1/consortium', consortiumRoutes)
app.use('/v1/autotune', autotuneRoutes)
app.use('/v1/transform', transformRoutes)
app.use('/v1/feedback', feedbackRoutes)
app.use('/v1/classic', classicRoutes)
app.use('/v1/parseltongue', parseltongueRoutes)

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'godmode-api',
    version: '2.0.0',
    uptime: process.uptime(),
    has_openrouter_key: !!process.env.OPENROUTER_API_KEY,
  })
})

app.get('/v1/models', (_req, res) => {
  const tiers: SpeedTier[] = ['fast', 'standard', 'smart', 'power', 'ultra']
  const tierData = tiers.map(tier => ({
    tier,
    count: getModelsForTier(tier).length,
    models: getModelsForTier(tier),
  }))

  const virtualModels = tiers.flatMap(tier => [
    `ultraplinian/${tier}`,
    `consortium/${tier}`,
    `race/${tier}`,
  ])

  res.json({
    tiers: tierData,
    total_unique: getModelsForTier('ultra').length,
    virtual_models: virtualModels,
  })
})

app.get('/v1/info', (_req, res) => {
  res.json({
    name: 'G0DM0D3 API',
    version: '2.0.0',
    description: 'Мульти-модельный AI gateway: ULTRAPLINIAN racing + CONSORTIUM synthesis + AutoTune + STM',
    endpoints: [
      'POST /v1/chat/completions          — OpenAI-compatible (+ virtual models)',
      'POST /v1/ultraplinian/completions  — ULTRAPLINIAN racing + Liquid Response SSE',
      'POST /v1/consortium/completions    — CONSORTIUM hive-mind synthesis + SSE',
      'POST /v1/autotune/analyze          — context analysis + optimal params',
      'POST /v1/transform                 — STM text transformations',
      'GET  /v1/transform/modules         — available STM modules',
      'POST /v1/feedback                  — EMA feedback loop',
      'GET  /v1/feedback/stats            — feedback statistics',
      'GET  /v1/models                    — all models by tier + virtual models',
      'POST /v1/classic/completions        — GODMODE CLASSIC 5 combos racing',
      'GET  /v1/classic/combos             — available Classic combos',
      'POST /v1/parseltongue/transform     — Parseltongue input perturbation',
      'GET  /v1/parseltongue/triggers      — trigger words by intensity',
      'GET  /v1/parseltongue/techniques    — available obfuscation techniques',
    ],
    model_tiers: TIER_COUNTS,
    features: {
      ultraplinian: '56 моделей в 5 тирах, early-exit racing с staggered waves, DEPTH_DIRECTIVE, Liquid Response SSE',
      consortium: 'Все модели отвечают → orchestrator (Claude) синтезирует ground-truth',
      autotune: 'Автоматическая подстройка параметров (temperature, top_p) под контекст',
      stm: 'Semantic Transform Modules — пост-обработка (hedge_reducer, direct_mode и др.)',
      godmode_boost: '+0.1 temp, +0.15 presence_penalty, +0.1 frequency_penalty',
      classic: '5 battle-tested model+prompt combos racing in parallel',
      parseltongue: 'Input perturbation engine — 33 triggers, 6 techniques, 3 intensity tiers',
    },
  })
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', hint: 'GET /v1/info for available endpoints' })
})

// global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[GODMODE] Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

const server = app.listen(PORT, () => {
  const banner = [
    '',
    '  ╔══════════════════════════════════════╗',
    '  ║        G 0 D M 0 D 3   A P I        ║',
    '  ║  ULTRAPLINIAN + CONSORTIUM v2.0.0    ║',
    '  ╚══════════════════════════════════════╝',
    '',
    `  → http://localhost:${PORT}`,
    `  → Models: ${getModelsForTier('ultra').length} across 5 tiers`,
    `  → OpenRouter: ${process.env.OPENROUTER_API_KEY ? '✓' : '✗ (set OPENROUTER_API_KEY)'}`,
    `  → Auth: ${process.env.GODMODE_API_KEY || process.env.GODMODE_API_KEYS ? 'Bearer token' : 'open'}`,
    '',
  ]
  console.log(banner.join('\n'))
})

// graceful shutdown
process.on('SIGTERM', () => { server.close(); process.exit(0) })
process.on('SIGINT', () => { server.close(); process.exit(0) })

export { app }
