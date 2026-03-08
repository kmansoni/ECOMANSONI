/**
 * index.ts — Entry point.
 *
 * Responsibilities:
 *  1. Start the Fastify server on config.port.
 *  2. Register SIGTERM / SIGINT handlers for graceful shutdown.
 *  3. Exit with code 1 on startup failure so Docker/systemd can detect and restart.
 *
 * Graceful shutdown protocol:
 *  - On SIGTERM (Docker stop, Kubernetes pod termination):
 *      a. Stop accepting new connections.
 *      b. Wait up to 10 s for in-flight requests to complete.
 *      c. Exit 0.
 *  - On SIGINT (Ctrl+C in dev):
 *      Same as SIGTERM.
 *  - On unhandledRejection / uncaughtException:
 *      Log and exit 1 — never silently swallow.
 */

import { buildServer } from './server.js';
import { config } from './config.js';

async function main(): Promise<void> {
  const app = await buildServer();

  // ── Graceful shutdown ──────────────────────────────────────────────────────

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ event: 'shutdown_start', signal });
    try {
      // fastify.close() stops the HTTP server and waits for in-flight reqs
      await app.close();
      app.log.info({ event: 'shutdown_complete', signal });
      process.exit(0);
    } catch (err) {
      app.log.error({ event: 'shutdown_error', err });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));

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
      // Bind to all interfaces inside Docker; Nginx restricts external access.
      host: '0.0.0.0',
    });

    app.log.info({
      event: 'server_started',
      port: config.port,
      mediaDomain: config.mediaDomain,
      minioEndpoint: config.minio.endpoint,
    });
  } catch (err) {
    app.log.error({ event: 'server_start_failed', err });
    process.exit(1);
  }
}

void main();
