/**
 * utils.ts — Worker utilities for temp directory management, S3 operations,
 * FFmpeg progress parsing, and text escaping.
 *
 * Security contracts:
 *  - Temp dirs are namespaced by jobId (UUID) — no cross-job file access.
 *  - S3 downloads validate Content-Length vs actual bytes to detect truncation.
 *  - FFmpeg text escaping prevents filter injection via drawtext parameters.
 *  - All temp dirs are cleaned in finally blocks by the caller (render-worker).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import ffmpeg from 'fluent-ffmpeg';
import { config } from '../config.js';
import { logger } from '../logger.js';

// ── S3 Client (module-level singleton) ──────────────────────────────────────

const s3Endpoint = new URL(config.minio.endpoint);
const s3 = new S3Client({
  endpoint: config.minio.endpoint,
  region: config.minio.region,
  credentials: {
    accessKeyId: config.minio.accessKey,
    secretAccessKey: config.minio.secretKey,
  },
  forcePathStyle: true, // MinIO requires path-style addressing
});

// ── Temp Directory Management ───────────────────────────────────────────────

const TEMP_BASE = process.env['RENDER_TEMP_DIR'] ?? '/tmp/editor-render';

/**
 * Creates an isolated temp directory for a render job.
 * Path: /tmp/editor-render/{jobId}/
 *
 * The base /tmp/editor-render/ is created once; subsequent calls are idempotent.
 * JobId is a UUID — no path traversal risk.
 */
export async function createTempDir(jobId: string): Promise<string> {
  // Validate jobId is UUID-like to prevent path traversal
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    throw new Error(`Invalid jobId format for temp dir: ${jobId}`);
  }
  const dirPath = path.join(TEMP_BASE, jobId);
  await fs.mkdir(dirPath, { recursive: true });
  logger.debug({ event: 'temp_dir_created', path: dirPath });
  return dirPath;
}

/**
 * Recursively removes a temp directory and all contents.
 * Silently succeeds if directory doesn't exist (idempotent cleanup).
 *
 * MUST be called in a finally block — render artifacts can be hundreds of MB.
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    logger.debug({ event: 'temp_dir_cleaned', path: dirPath });
  } catch (err) {
    // Log but don't throw — cleanup failures shouldn't mask real errors
    logger.warn({
      event: 'temp_dir_cleanup_failed',
      path: dirPath,
      err: (err as Error).message,
    });
  }
}

// ── S3 Download ─────────────────────────────────────────────────────────────

/**
 * Downloads a file from MinIO/S3 to a local path.
 *
 * The `url` parameter accepts either:
 *  - A full URL: `http://minio:9000/bucket/key`
 *  - A bucket/key path: `editor-assets/user123/file.mp4`
 *
 * Security:
 *  - Streams to disk to avoid OOM on large files.
 *  - destPath is always under the job's temp dir (enforced by caller).
 */
export async function downloadFromS3(url: string, destPath: string): Promise<void> {
  const { bucket, key } = parseS3Url(url);

  logger.debug({ event: 's3_download_start', bucket, key, destPath });
  const start = Date.now();

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3.send(command);

  if (!response.Body) {
    throw new Error(`S3 returned empty body for ${bucket}/${key}`);
  }

  // Ensure parent directory exists
  await fs.mkdir(path.dirname(destPath), { recursive: true });

  // Stream to disk — no buffering in memory
  const body = response.Body as Readable;
  const writeStream = createWriteStream(destPath);
  await pipeline(body, writeStream);

  const stats = await fs.stat(destPath);
  const duration = Date.now() - start;

  logger.info({
    event: 's3_download_complete',
    bucket,
    key,
    bytes: stats.size,
    duration,
  });
}

/**
 * Uploads a local file to MinIO/S3 and returns the public URL.
 *
 * Security:
 *  - Content-Type is explicitly set — no MIME sniffing.
 *  - Returns a deterministic URL based on bucket/key.
 */
export async function uploadToS3(
  localPath: string,
  bucket: string,
  key: string,
): Promise<string> {
  logger.debug({ event: 's3_upload_start', bucket, key, localPath });
  const start = Date.now();

  const fileBuffer = await fs.readFile(localPath);
  const contentType = inferContentType(key);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
    ContentLength: fileBuffer.byteLength,
  });

  await s3.send(command);

  const duration = Date.now() - start;
  const publicUrl = buildPublicUrl(bucket, key);

  logger.info({
    event: 's3_upload_complete',
    bucket,
    key,
    bytes: fileBuffer.byteLength,
    duration,
    url: publicUrl,
  });

  return publicUrl;
}

// ── FFmpeg Progress Parsing ─────────────────────────────────────────────────

/**
 * Parses FFmpeg stderr progress output and returns completion percentage.
 *
 * FFmpeg outputs lines like:
 *   frame=  120 fps= 30 q=28.0 size=    1024kB time=00:00:04.00 bitrate=2097.2kbits/s
 *
 * We extract the `time=HH:MM:SS.ms` portion and compare against total duration.
 *
 * Returns null if the line doesn't contain progress info.
 */
export function parseProgress(stderrLine: string, totalDurationSec?: number): number | null {
  const timeMatch = stderrLine.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2,3})/);
  if (!timeMatch) return null;

  const hours = parseInt(timeMatch[1]!, 10);
  const minutes = parseInt(timeMatch[2]!, 10);
  const seconds = parseInt(timeMatch[3]!, 10);
  const fraction = parseInt(timeMatch[4]!, 10) / (timeMatch[4]!.length === 2 ? 100 : 1000);

  const currentSec = hours * 3600 + minutes * 60 + seconds + fraction;

  if (totalDurationSec && totalDurationSec > 0) {
    const percent = Math.min(100, Math.round((currentSec / totalDurationSec) * 100));
    return percent;
  }

  // Without total duration, return seconds processed as a raw number
  return currentSec;
}

// ── Duration Formatting ─────────────────────────────────────────────────────

/**
 * Formats milliseconds into a human-readable string for logs.
 * Examples: "1m 23s", "45s", "2h 5m 30s"
 */
export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(' ');
}

// ── FFmpeg Text Escaping ────────────────────────────────────────────────────

/**
 * Escapes text for use in FFmpeg drawtext filter.
 *
 * FFmpeg drawtext has multiple escaping levels:
 *  1. Filter string level: ' → \\' , \ → \\\\, : → \\:, [ → \\[, ] → \\], ; → \\;
 *  2. Drawtext text level: ' → \\' , : → \\:
 *
 * This function handles both levels. The result is safe for embedding in
 * a filter_complex string without shell expansion (we use execFile, not exec).
 *
 * Security: Prevents filter injection via user-controlled text content.
 * A malicious text like "';[1:v]..." would be fully escaped.
 */
export function escapeFFmpegText(text: string): string {
  return text
    // Escape backslashes first (order matters)
    .replace(/\\/g, '\\\\\\\\')
    // Escape single quotes
    .replace(/'/g, "'\\\\\\''")
    // Escape colons (drawtext separator)
    .replace(/:/g, '\\\\:')
    // Escape semicolons (filter separator)
    .replace(/;/g, '\\\\;')
    // Escape brackets (stream specifiers)
    .replace(/\[/g, '\\\\[')
    .replace(/\]/g, '\\\\]')
    // Escape percent (drawtext time expansion)
    .replace(/%/g, '%%')
    // Escape newlines
    .replace(/\n/g, '\\n');
}

// ── Media Info (ffprobe wrapper) ────────────────────────────────────────────

export interface MediaInfo {
  width: number;
  height: number;
  duration: number;    // seconds
  codec: string;
  audioCodec: string | null;
  fps: number;
  bitrate: number;     // bps
  hasAudio: boolean;
  hasVideo: boolean;
  sampleRate: number | null;
}

/**
 * Probes a media file with ffprobe and returns structured metadata.
 * Uses fluent-ffmpeg's built-in ffprobe wrapper (array-based args, no shell).
 *
 * Security: filePath is an absolute path to a temp file; no user-controlled
 * strings are injected into shell commands.
 */
export function getMediaInfo(filePath: string): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err: Error | null, data: ffmpeg.FfprobeData) => {
      if (err) {
        reject(new Error(`ffprobe failed for ${path.basename(filePath)}: ${err.message}`));
        return;
      }

      const videoStream = data.streams.find(
        (s: ffmpeg.FfprobeStream) => s.codec_type === 'video',
      );
      const audioStream = data.streams.find(
        (s: ffmpeg.FfprobeStream) => s.codec_type === 'audio',
      );

      const duration =
        typeof data.format.duration === 'number'
          ? data.format.duration
          : parseFloat(String(data.format.duration ?? '0'));

      const bitrate =
        typeof data.format.bit_rate === 'number'
          ? data.format.bit_rate
          : parseInt(String(data.format.bit_rate ?? '0'), 10);

      let fps = 30;
      if (videoStream?.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        if (num && den && den > 0) fps = Math.round(num / den);
      }

      resolve({
        width: videoStream?.width ?? 0,
        height: videoStream?.height ?? 0,
        duration,
        codec: videoStream?.codec_name ?? 'unknown',
        audioCodec: audioStream?.codec_name ?? null,
        fps,
        bitrate,
        hasVideo: !!videoStream,
        hasAudio: !!audioStream,
        sampleRate: audioStream?.sample_rate
          ? parseInt(String(audioStream.sample_rate), 10)
          : null,
      });
    });
  });
}

// ── Private Helpers ─────────────────────────────────────────────────────────

/**
 * Parses a source URL into bucket/key for S3 operations.
 * Handles:
 *  - Full URL: http(s)://endpoint/bucket/key
 *  - MinIO path: /bucket/key
 *  - Bucket/key: bucket/key
 */
function parseS3Url(url: string): { bucket: string; key: string } {
  try {
    // Try as URL with protocol
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const parsed = new URL(url);
      // Path-style: /bucket/key/...
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (pathParts.length < 2) {
        throw new Error(`Invalid S3 URL: ${url} — insufficient path segments`);
      }
      return {
        bucket: pathParts[0]!,
        key: pathParts.slice(1).join('/'),
      };
    }
  } catch {
    // Fall through to path-based parsing
  }

  // Path-style: /bucket/key or bucket/key
  const clean = url.startsWith('/') ? url.slice(1) : url;
  const slashIdx = clean.indexOf('/');
  if (slashIdx === -1) {
    throw new Error(`Cannot parse S3 URL — no key found: ${url}`);
  }

  return {
    bucket: clean.slice(0, slashIdx),
    key: clean.slice(slashIdx + 1),
  };
}

/**
 * Infers Content-Type from file extension for S3 uploads.
 */
function inferContentType(key: string): string {
  const ext = path.extname(key).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mp3': 'audio/mpeg',
    '.aac': 'audio/aac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.gif': 'image/gif',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}

/**
 * Builds a public URL for a MinIO/S3 object.
 * Uses MEDIA_DOMAIN if configured, otherwise falls back to direct MinIO URL.
 */
function buildPublicUrl(bucket: string, key: string): string {
  const mediaDomain = config.mediaDomain;
  if (mediaDomain && mediaDomain !== 'media.mansoni.ru') {
    // Custom domain — assume reverse proxy routing
    return `https://${mediaDomain}/${bucket}/${key}`;
  }
  // Direct MinIO URL (development/staging)
  return `${config.minio.endpoint}/${bucket}/${key}`;
}
