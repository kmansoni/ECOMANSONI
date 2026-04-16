/**
 * /v1/autotune — анализ контекста и подбор параметров LLM.
 */

import { Router } from 'express'
import { computeParams, type Strategy } from '../lib/autotune.js'

const router = Router()

router.post('/analyze', (req, res) => {
  const { message, conversation_history, strategy = 'adaptive', overrides } = req.body

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message (string) is required' })
    return
  }

  const result = computeParams({
    strategy: strategy as Strategy,
    message,
    history: conversation_history ?? [],
    overrides,
  })

  res.json({
    detected_context: result.context,
    confidence: result.confidence,
    reasoning: result.reasoning,
    params: result.params,
    context_scores: result.scores,
  })
})

export { router as autotuneRoutes }
