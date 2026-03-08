/**
 * index.ts — Entry point for the Livestream Gateway.
 *
 * Responsibilities:
 * 1. Validate environment configuration (fail-fast via envalid)
 * 2. Build the Fastify application
 * 3. Start listening on configured host:port
 * 4. Register graceful shutdown handlers (SIGTERM, SIGINT)
 *    - Allows in-flight requests to complete (30s timeout)
 *    - Closes all connections cleanly
 *
 * Graceful shutdown flow:
 *   signal received
 *     → close HTTP server (no new connections)
 *     → wait for in-flight requests (max 30s)
 *     → app.close() triggers onClose hooks:
 *         ├─ redis.quit()
 *         └─ (supabase/livekit: HTTP clients, no persistent connections)
 *     → process.exit(0)
 */

import { config } from './config.js'
import { buildApp } from './app.js'

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30_000

async function main(): Promise<void> {
  let app: Awaited<ReturnType<typeof buildApp>> | null = null

  try {
    app = await buildApp()

    // Register graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      if (!app) return

      app.log.info({ signal }, 'Shutdown signal received — starting graceful shutdown')

      // Force exit if graceful shutdown takes too long
      const forceExitTimer = setTimeout(() => {
        app?.log.error('Graceful shutdown timed out — forcing exit')
        process.exit(1)
      }, GRACEFUL_SHUTDOWN_TIMEOUT_MS)

      forceExitTimer.unref() // Don't prevent process exit if graceful succeeds

      try {
        await app.close()
        clearTimeout(forceExitTimer)
        app.log.info('Server closed gracefully')
        process.exit(0)
      } catch (err) {
        app.log.error({ err }, 'Error during graceful shutdown')
        process.exit(1)
      }
    }

    process.once('SIGTERM', () => void shutdown('SIGTERM'))
    process.once('SIGINT', () => void shutdown('SIGINT'))

    // Unhandled rejection / uncaught exception: log and exit
    // Do NOT attempt recovery — a crashed state is dangerous in production
    process.on('unhandledRejection', (reason: unknown) => {
      app?.log.fatal({ reason }, 'Unhandled promise rejection — exiting')
      process.exit(1)
    })

    process.on('uncaughtException', (err: Error) => {
      app?.log.fatal({ err }, 'Uncaught exception — exiting')
      process.exit(1)
    })

    // Start server
    await app.listen({
      port: config.GATEWAY_PORT,
      host: config.GATEWAY_HOST,
      backlog: 511, // TCP listen backlog — queue for incoming connections
    })

    app.log.info(
      {
        port: config.GATEWAY_PORT,
        host: config.GATEWAY_HOST,
        nodeEnv: config.NODE_ENV,
        pid: process.pid,
      },
      'Livestream Gateway started',
    )
  } catch (err) {
    // config validation failure or plugin startup error
    if (app) {
      app.log.fatal({ err }, 'Fatal startup error — exiting')
    } else {
      // eslint-disable-next-line no-console
      console.error('Fatal startup error (logger not available):', err)
    }
    process.exit(1)
  }
}

void main()
