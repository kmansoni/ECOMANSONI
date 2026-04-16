/**
 * /v1/transform — STM модули пост-обработки текста.
 */

import { Router } from 'express'
import { transform, listModules, type STMModule } from '../lib/stm.js'

const router = Router()

router.post('/', (req, res) => {
  const { text, modules } = req.body

  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text (string) is required' })
    return
  }

  const mods: STMModule[] = Array.isArray(modules) ? modules : ['hedge_reducer', 'direct_mode']
  const result = transform(text, mods)

  res.json({
    original_text: result.original,
    transformed_text: result.transformed,
    modules_applied: result.applied,
    changes: result.changes,
  })
})

router.get('/modules', (_req, res) => {
  res.json({ modules: listModules() })
})

export { router as transformRoutes }
