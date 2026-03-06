/**
 * index.js — Entry point.
 *
 * Responsibilities:
 *  1. Parse .env file manually (no dotenv dependency).
 *  2. Load and validate configuration (exits if API key missing).
 *  3. Start HTTP server.
 *  4. Register graceful shutdown handlers.
 *
 * .env parser rules:
 *  - Lines starting with '#' are comments.
 *  - Empty lines are ignored.
 *  - Values quoted with " or ' have quotes stripped.
 *  - Existing process.env values are NOT overwritten (env-wins-over-file).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── .env loader ─────────────────────────────────────────────────────────────

function loadEnvFile(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    // .env file is optional — absence is not an error
    return;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Existing env vars win — never overwrite
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

// Load .env from the project root (email-router/.env) if present
const envPath = path.resolve(__dirname, '..', '.env');
loadEnvFile(envPath);

// Config validation happens inside getConfig() — exits on missing API key
import { getConfig } from './config.js';
const cfg = getConfig();

import { logger } from './logger.js';
import { createServer, registerShutdown } from './server.js';

const server = createServer();
registerShutdown(server);

server.listen(cfg.port, '0.0.0.0', () => {
  logger.info('server.start', {
    port: cfg.port,
    smtp: `${cfg.smtp.host}:${cfg.smtp.port}`,
    corsOrigins: cfg.corsOrigins,
    logLevel: cfg.logLevel,
  });
});

server.on('error', (err) => {
  logger.error('server.error', { error: err.message, code: err.code });
  process.exit(1);
});
