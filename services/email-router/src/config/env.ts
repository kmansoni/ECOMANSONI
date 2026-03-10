// config/env.ts — Zod-validated environment configuration
//
// Parses process.env through a strict zod schema.
// Fails fast on startup if any required variable is missing or invalid.
// All secrets are read here and nowhere else — single source of truth.

import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3100),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // PostgreSQL
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),

  // Supabase JWT
  SUPABASE_JWT_SECRET: z.string().min(32),
  SUPABASE_JWKS_URL: z.string().url(),

  // SMTP
  SMTP_HOST: z.string().default('postfix'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // Email defaults
  DEFAULT_FROM_EMAIL: z.string().email().default('noreply@mansoni.ru'),
  DEFAULT_FROM_NAME: z.string().default('Mansoni Platform'),

  // Rate limiting
  RATE_LIMIT_PER_TENANT_PER_MINUTE: z.coerce.number().default(60),
  RATE_LIMIT_BULK_PER_HOUR: z.coerce.number().default(1000),

  // Circuit breaker
  CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().default(5),
  CIRCUIT_BREAKER_RESET_MS: z.coerce.number().default(30000),

  // Encryption
  EMAIL_ENCRYPTION_KEY: z.string().min(32),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),

  // Admin
  ADMIN_IP_ALLOWLIST: z.string().default('127.0.0.1,::1'),

  // Bounce webhook HMAC authentication.
  // Must be a shared secret between this service and the bounce notification
  // source (Postfix milter, Rspamd, or external ESP). Generate with:
  //   openssl rand -hex 32
  // Leave empty string to disable HMAC verification (NOT recommended in production).
  BOUNCE_WEBHOOK_SECRET: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env;

export function loadEnv(): Env {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }
  _env = result.data;
  return _env;
}

export function getEnv(): Env {
  if (!_env) throw new Error('Environment not loaded. Call loadEnv() first.');
  return _env;
}
