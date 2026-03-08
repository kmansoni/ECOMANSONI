/**
 * plugins/redis.ts — IORedis connection as Fastify plugin.
 *
 * Decorates the Fastify instance with `redis` (IORedis client).
 * Connection is established once at startup; reconnects automatically
 * via IORedis built-in retry strategy (exponential backoff, max 30s).
 * Plugin is encapsulated at app level (fastify-plugin unwraps scope).
 */

import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import Redis from 'ioredis'
import { config } from '../config.js'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

async function redisPlugin(app: FastifyInstance): Promise<void> {
  const redis = new Redis(config.REDIS_URL, {
    // Exponential backoff: 50ms → 2000ms, max 30 retries
    retryStrategy(times: number): number | null {
      if (times > 30) return null // Stop retrying after 30 attempts → emit error
      return Math.min(50 * Math.pow(2, times), 2000)
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    connectTimeout: 5000,
    commandTimeout: 3000,
  })

  redis.on('error', (err: Error) => {
    app.log.error({ err }, 'Redis connection error')
  })

  redis.on('connect', () => {
    app.log.info('Redis connected')
  })

  redis.on('ready', () => {
    app.log.info('Redis ready')
  })

  redis.on('reconnecting', () => {
    app.log.warn('Redis reconnecting...')
  })

  // Wait for the connection to be ready or fail
  await new Promise<void>((resolve, reject) => {
    const onReady = (): void => {
      cleanup()
      resolve()
    }
    const onError = (err: Error): void => {
      cleanup()
      reject(err)
    }
    const cleanup = (): void => {
      redis.off('ready', onReady)
      redis.off('error', onError)
    }
    redis.once('ready', onReady)
    redis.once('error', onError)
    // Safety timeout: if neither fires in 5s, abort
    setTimeout(() => {
      cleanup()
      reject(new Error('Redis connection timed out after 5s'))
    }, 5000)
  })

  app.decorate('redis', redis)

  app.addHook('onClose', async () => {
    app.log.info('Closing Redis connection')
    await redis.quit()
  })
}

export default fp(redisPlugin, {
  name: 'redis',
  fastify: '>=4.0.0',
})
