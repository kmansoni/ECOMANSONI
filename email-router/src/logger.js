/**
 * logger.js — Structured JSON logger.
 *
 * Outputs one JSON object per line to stdout/stderr.
 * Never buffered: each call is a synchronous write, safe under load.
 *
 * Usage:
 *   logger.log('info',  'email.sent',  { to: 'user@example.com', messageId: '...' })
 *   logger.log('error', 'smtp.error',  { code: 421, message: 'Service unavailable' })
 *   logger.log('debug', 'smtp.command',{ cmd: 'EHLO', response: '250 ...' })
 */

import { getConfig } from './config.js';

const LEVELS = { debug: 0, info: 1, error: 2 };

function emit(level, event, fields = {}) {
  const cfg = getConfig();
  const minLevel = LEVELS[cfg.logLevel] ?? LEVELS.info;
  if ((LEVELS[level] ?? 0) < minLevel) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  /** @param {string} level @param {string} event @param {Record<string,unknown>} [fields] */
  log: emit,
  info: (event, fields) => emit('info', event, fields),
  debug: (event, fields) => emit('debug', event, fields),
  error: (event, fields) => emit('error', event, fields),
};
