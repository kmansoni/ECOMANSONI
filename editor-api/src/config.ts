/**
 * config.ts — Centralised typed configuration loaded from environment variables.
 *
 * Security contract:
 *  - No secrets defaulted to non-empty strings.
 *  - Missing required secrets cause process exit at startup (fail-fast).
 *  - JWT secret and MinIO credentials are NEVER logged.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] FATAL: required env var "${name}" is not set`);
    process.exit(1);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function optionalEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    console.error(`[config] FATAL: env var "${name}" is not a valid number (got "${raw}")`);
    process.exit(1);
  }
  return parsed;
}

export const config = {
  port: optionalEnvNumber('PORT', 3002),
  host: optionalEnv('HOST', '0.0.0.0'),

  mediaDomain: optionalEnv('MEDIA_DOMAIN', 'media.mansoni.ru'),

  db: {
    connectionString: requireEnv('DATABASE_URL'),
    poolMin: 2,
    poolMax: 20,
  },

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    issuer: process.env['SUPABASE_URL']
      ? `${process.env['SUPABASE_URL']}/auth/v1`
      : '',
  },

  redis: {
    url: requireEnv('REDIS_URL'),
  },

  minio: {
    endpoint: optionalEnv('MINIO_ENDPOINT', 'http://minio:9000'),
    accessKey: requireEnv('MINIO_ACCESS_KEY'),
    secretKey: requireEnv('MINIO_SECRET_KEY'),
    bucketPrefix: optionalEnv('MINIO_BUCKET_PREFIX', 'mansoni'),
    region: 'us-east-1' as const,
  },

  limits: {
    maxProjectsPerUser: optionalEnvNumber('MAX_PROJECTS_PER_USER', 100),
    maxTracksPerProject: optionalEnvNumber('MAX_TRACKS_PER_PROJECT', 20),
    maxClipsPerTrack: optionalEnvNumber('MAX_CLIPS_PER_TRACK', 200),
  },

  render: {
    queueName: optionalEnv('RENDER_QUEUE_NAME', 'editor-render'),
  },
} as const;

export type Config = typeof config;
