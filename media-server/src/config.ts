/**
 * config.ts — centralised, typed configuration loaded from environment variables.
 *
 * Security contract:
 *   - No secrets are defaulted to non-empty strings here.
 *   - Missing required secrets cause process exit at startup (fail-fast).
 *   - JWT secret and MinIO credentials are NEVER logged.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Intentional: crash at startup rather than run insecurely
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
  port: optionalEnvNumber('MEDIA_API_PORT', 3100),

  /**
   * Public domain used to build download URLs.
   * Example: media.mansoni.ru
   */
  mediaDomain: optionalEnv('MEDIA_DOMAIN', 'media.mansoni.ru'),

  minio: {
    /** Internal Docker network address, e.g. http://minio:9000 */
    endpoint: optionalEnv('MINIO_ENDPOINT', 'http://minio:9000'),
    accessKey: requireEnv('MINIO_ROOT_USER'),
    secretKey: requireEnv('MINIO_ROOT_PASSWORD'),
    /** MinIO is region-agnostic; AWS SDK requires a value. */
    region: 'us-east-1' as const,
  },

  jwt: {
    /**
     * Supabase JWT secret (HS256).
     * Located in Supabase Dashboard → Settings → API → JWT Secret.
     */
    secret: requireEnv('JWT_SECRET'),
    /**
     * Expected `iss` claim.
     * Supabase tokens carry `<project-url>/auth/v1`.
     */
    issuer: process.env['SUPABASE_URL']
      ? `${process.env['SUPABASE_URL']}/auth/v1`
      : '',
  },

  limits: {
    /** Per-bucket size limits in bytes, derived from env or safe defaults */
    maxImageSizeBytes:
      optionalEnvNumber('MAX_IMAGE_SIZE_MB', 20) * 1024 * 1024,
    maxVideoSizeBytes:
      optionalEnvNumber('MAX_VIDEO_SIZE_MB', 500) * 1024 * 1024,
    maxAudioSizeBytes:
      optionalEnvNumber('MAX_AUDIO_SIZE_MB', 50) * 1024 * 1024,
    maxAvatarSizeBytes:
      optionalEnvNumber('MAX_AVATAR_SIZE_MB', 5) * 1024 * 1024,
    /** Global multipart body limit fed to @fastify/multipart */
    globalMaxBytes:
      optionalEnvNumber('MAX_VIDEO_SIZE_MB', 500) * 1024 * 1024,
  },

  processing: {
    /** Images wider than this are down-scaled preserving aspect ratio */
    imageMaxWidth: optionalEnvNumber('IMAGE_MAX_WIDTH', 2048),
    /** Sharp output quality for WebP / JPEG */
    imageQuality: optionalEnvNumber('IMAGE_QUALITY', 85),
    /** Thumbnail dimensions (square cover crop) */
    thumbnailWidth: optionalEnvNumber('THUMBNAIL_WIDTH', 480),
    thumbnailHeight: optionalEnvNumber('THUMBNAIL_HEIGHT', 480),
  },

  /** Temp directory for writing video files before FFmpeg processing */
  tmpDir: optionalEnv('TMP_DIR', '/tmp/media-uploads'),

  transcode: {
    /**
     * Master enable flag. Set TRANSCODE_ENABLED=false to skip HLS transcoding
     * and fall back to storing original video + thumbnail only (dev / low-resource env).
     */
    enabled: process.env['TRANSCODE_ENABLED'] !== 'false',

    /** Isolated temp directory for HLS segment files (separate from simple thumb temp) */
    tempDir: optionalEnv('TRANSCODE_TEMP_DIR', '/tmp/media-transcode'),

    /** Target HLS chunk duration in seconds (GOF boundary; 6s is industry standard) */
    hlsSegmentDuration: optionalEnvNumber('HLS_SEGMENT_DURATION', 6),

    /**
     * Maximum allowed input duration in seconds.
     * Inputs beyond this are rejected with HTTP 422 before transcoding starts.
     * Prevents runaway FFmpeg workers from exhausting CPU/disk.
     */
    maxDurationSeconds: optionalEnvNumber('MAX_VIDEO_DURATION', 300),

    /**
     * Quality presets keyed by label.
     * CRF: lower = better quality / higher bitrate (H.264 scale 0–51).
     * bandwidth: approximate bits-per-second declared in the HLS master playlist
     *            (video + audio, used by clients for ABR decisions).
     */
    presets: {
      '360p': {
        width: 640,
        height: 360,
        videoBitrate: '800k',
        audioBitrate: '96k',
        crf: 28,
        bandwidth: 896_000,   // 800k video + 96k audio
      },
      '720p': {
        width: 1280,
        height: 720,
        videoBitrate: '2500k',
        audioBitrate: '128k',
        crf: 23,
        bandwidth: 2_628_000, // 2500k + 128k
      },
      '1080p': {
        width: 1920,
        height: 1080,
        videoBitrate: '4000k',
        audioBitrate: '192k',
        crf: 20,
        bandwidth: 4_192_000, // 4000k + 192k
      },
    } as Record<
      string,
      {
        width: number;
        height: number;
        videoBitrate: string;
        audioBitrate: string;
        crf: number;
        bandwidth: number;
      }
    >,
  },
} as const;

export type Config = typeof config;
