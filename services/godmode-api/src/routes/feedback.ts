/**
 * /v1/feedback — EMA-based feedback loop.
 *
 * Принимает оценку ответа модели → корректирует AutoTune через EMA.
 * GET /v1/feedback/stats — статистика всех контекстов.
 */

import { Router } from 'express'
import { recordFeedback, getFeedbackStats, CONTEXT_PROFILES, type ContextType } from '../lib/autotune.js'

const router = Router()

const VALID_CONTEXT_TYPES: ContextType[] = [
  'code', 'creative', 'analytical', 'conversational', 'chaotic',
]

router.post('/', (req, res) => {
  const { context, rating, model, response_id } = req.body

  if (!context || !VALID_CONTEXT_TYPES.includes(context)) {
    res.status(400).json({
      error: `context must be one of: ${VALID_CONTEXT_TYPES.join(', ')}`,
    })
    return
  }

  if (typeof rating !== 'number' || rating < 0 || rating > 1) {
    res.status(400).json({
      error: 'rating must be a number between 0 and 1',
    })
    return
  }

  const direction: 1 | -1 = rating > 0.5 ? 1 : -1
  const params = CONTEXT_PROFILES[context as ContextType]
  recordFeedback(context, { ...params }, direction)

  res.json({
    ok: true,
    context,
    rating,
    model: model ?? null,
    response_id: response_id ?? null,
    message: `Feedback recorded for context="${context}". EMA updated.`,
  })
})

router.get('/stats', (_req, res) => {
  const stats = getFeedbackStats()
  res.json({ contexts: stats })
})

router.delete('/reset', (_req, res) => {
  // cold start — просто отдаём acknowledgement, EMA перезапишется при новых оценках
  res.json({ ok: true, message: 'Feedback resets on restart. New ratings override old.' })
})

export { router as feedbackRoutes }
