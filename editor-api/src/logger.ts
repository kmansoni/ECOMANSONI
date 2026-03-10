/**
 * logger.ts — Simple structured logger for non-Fastify contexts (db, services).
 * Fastify routes use request.log (pino) provided by the framework.
 * This logger uses console with JSON output to avoid ESM/CJS interop issues with pino.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL: LogLevel = (process.env['LOG_LEVEL'] as LogLevel) ?? 'info';
const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[LOG_LEVEL];
}

function log(level: LogLevel, obj: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const line = JSON.stringify({ level, time: Date.now(), ...obj });
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (obj: Record<string, unknown>) => log('debug', obj),
  info: (obj: Record<string, unknown>) => log('info', obj),
  warn: (obj: Record<string, unknown>) => log('warn', obj),
  error: (obj: Record<string, unknown>) => log('error', obj),
};
