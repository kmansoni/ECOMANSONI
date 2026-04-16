/**
 * /v1/parseltongue — input perturbation для red-teaming.
 *
 * POST /v1/parseltongue/transform  — обфусцировать текст
 * GET  /v1/parseltongue/triggers   — список триггеров по интенсивности
 * GET  /v1/parseltongue/techniques — список техник
 */

import { Router } from 'express'
import {
  perturbInput,
  listTriggers,
  listTechniques,
  type ParseltongueIntensity,
} from '../lib/parseltongue.js'

const router = Router()

const VALID_INTENSITIES: ParseltongueIntensity[] = ['light', 'medium', 'heavy']

router.post('/transform', (req, res) => {
  const { text, intensity = 'medium', triggers } = req.body

  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text (string) is required' })
    return
  }

  if (!VALID_INTENSITIES.includes(intensity)) {
    res.status(400).json({ error: `intensity must be: ${VALID_INTENSITIES.join(', ')}` })
    return
  }

  const result = perturbInput(text, intensity, triggers)
  res.json(result)
})

router.get('/triggers', (req, res) => {
  const intensity = (req.query.intensity as ParseltongueIntensity) || 'heavy'
  res.json(listTriggers(intensity))
})

router.get('/techniques', (_req, res) => {
  res.json({ techniques: listTechniques() })
})

export { router as parseltongueRoutes }
