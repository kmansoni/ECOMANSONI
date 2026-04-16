/**
 * Auth middleware — проверяет GODMODE_API_KEY.
 *
 * Если env не задан — пропускает (open access для локальной разработки).
 */

import type { Request, Response, NextFunction } from 'express'

declare global {
  namespace Express {
    interface Request {
      apiKey?: string
    }
  }
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const envKeys = process.env.GODMODE_API_KEYS?.split(',').map(k => k.trim()).filter(Boolean)
    ?? (process.env.GODMODE_API_KEY ? [process.env.GODMODE_API_KEY] : [])

  // open access если ключи не настроены
  if (envKeys.length === 0) return next()

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization: Bearer <key>' })
    return
  }

  const key = authHeader.slice(7)
  if (!envKeys.includes(key)) {
    res.status(403).json({ error: 'Invalid API key' })
    return
  }

  req.apiKey = key
  next()
}
