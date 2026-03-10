// lib/logger.ts — Structured logging with pino
//
// JSON output in production, pino-pretty in development.
// PII redaction paths strip sensitive data from all log entries.
// Child logger factory injects requestId, tenantId, messageId for correlation.

import pino from 'pino';
import { randomUUID } from 'crypto';
import { getEnv } from '../config/env.js';

// Redaction paths for PII protection
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'smtp_pass',
  'dkim_private_key',
  'body.to[*].email', // Redact email addresses in logs
  'body.html',
  'body.text',
  'email_encryption_key',
];

let _logger: pino.Logger;

export function createLogger(): pino.Logger {
  const env = getEnv();

  _logger = pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
    // В production — JSON, в dev — pretty
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' } }
        : undefined,
    base: {
      service: 'email-router',
      env: env.NODE_ENV,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  return _logger;
}

export function getLogger(): pino.Logger {
  if (!_logger) throw new Error('Logger not initialized. Call createLogger() first.');
  return _logger;
}

// Child logger factory с requestId, tenantId, messageId
export function createRequestLogger(opts: {
  requestId?: string;
  tenantId?: string;
  messageId?: string;
}): pino.Logger {
  return getLogger().child({
    requestId: opts.requestId || randomUUID(),
    tenantId: opts.tenantId,
    messageId: opts.messageId,
  });
}
