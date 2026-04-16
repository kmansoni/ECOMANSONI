/**
 * Rate limiter — простой in-memory rate limit по IP/ключу.
 */

import type { Request, Response, NextFunction } from 'express'

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
const WINDOW_MS = 60_000      // 1 минута
const MAX_PER_WINDOW = 60     // 60 запросов/мин

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = (req.headers['x-api-key'] as string) || req.ip || 'anon'
  const now = Date.now()

  let bucket = buckets.get(key)
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS }
    buckets.set(key, bucket)
  }

  bucket.count++

  res.setHeader('X-RateLimit-Limit', String(MAX_PER_WINDOW))
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, MAX_PER_WINDOW - bucket.count)))
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

  if (bucket.count > MAX_PER_WINDOW) {
    res.status(429).json({ error: 'Rate limit exceeded', retryAfterMs: bucket.resetAt - now })
    return
  }

  next()
}

// Очистка устаревших бакетов каждые 5 минут
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt + WINDOW_MS) buckets.delete(key)
  }
}, 300_000)
