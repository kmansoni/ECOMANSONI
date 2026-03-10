/**
 * index.ts — Entry point.
 *
 * Responsibilities:
 *  1. Start the Fastify server on config.port.
 *  2. Register SIGTERM / SIGINT handlers for graceful shutdown.
 *  3. Exit with code 1 on startup failure so Docker/systemd can detect and restart.
 *
 * Graceful shutdown protocol:
 *  - On SIGTERM: stop accepting new connections → wait up to 10s for in-flight
 *    requests → close DB pool + Redis → exit 0.
 *  - On unhandledRejection / uncaughtException: log and exit 1.
 */

import { buildServer } from './server.js';
import { config } from './config.js';
import { gracefulShutdown as dbShutdown } from './db.js';
import { closeConnections as redisShutdown } from './services/render-service.js';

async function main(): Promise<void> {
  const app = await buildServer();

  // ── Graceful shutdown ──────────────────────────────────────────────────────

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ event: 'shutdown_start', signal });
    try {
      await app.close();
      await dbShutdown();
      await redisShutdown();
      app.log.info({ event: 'shutdown_complete', signal });
      process.exit(0);
    } catch (err) {
      app.log.error({ event: 'shutdown_error', err });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // ── Unhandled errors ───────────────────────────────────────────────────────

  process.on('unhandledRejection', (reason) => {
    app.log.error({ event: 'unhandled_rejection', reason });
    process.exit(1);
  });

  process.on('uncaughtException', (err) => {
    app.log.error({ event: 'uncaught_exception', err });
    process.exit(1);
  });

  // ── Start ──────────────────────────────────────────────────────────────────

  try {
    await app.listen({
      port: config.port,
      host: config.host,
    });

    app.log.info({
      event: 'server_started',
      port: config.port,
      host: config.host,
    });
  } catch (err) {
    app.log.error({ event: 'server_start_failed', err });
    process.exit(1);
  }
}

void main();
