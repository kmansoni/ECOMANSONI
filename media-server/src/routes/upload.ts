/**
 * routes/upload.ts — POST /api/upload
 *
 * Protocol flow:
 *  1. Parse Authorization header → verify JWT → extract userId.
 *  2. Receive multipart/form-data stream with fields: file, bucket, path(optional).
 *  3. Buffer the file, read first 16 bytes for magic check.
 *  4. Run validateUpload() — MIME allowlist + size limit + magic bytes + filename sanitation.
 *  5. Process media:
 *     - image/* → processImage() + generateThumbnail()
 *     - video/* in (media|reels-media|stories-media) → transcodeVideo() → HLS ABR + original MP4
 *     - video/* in other buckets → generateVideoThumbnail() (original stored as-is)
 *     - audio/* / document → stored as-is
 *  6. Upload original (and thumbnail if generated) to MinIO.
 *  7. Return structured JSON response.
 *
 * Race condition note:
 *  Concurrent uploads from the same user are handled independently.
 *  Key uniqueness (userId/timestamp_uuid) prevents write conflicts in MinIO.
 *  No distributed lock is needed here — S3 PUT is idempotent.
 *
 * DoS note:
 *  @fastify/multipart limits total body size to globalMaxBytes.
 *  Individual file size check happens after buffering — consistent with Nginx body limit.
 *
 * Transcoding latency note:
 *  HLS transcoding is synchronous within the HTTP request. Nginx proxy_read_timeout is
 *  set to 600s to accommodate up to 5-min videos. Clients should show a progress indicator.
 *  Videos exceeding maxDurationSeconds (default 300s) are rejected with HTTP 422.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { verifyJwt, extractBearerToken, AuthError } from '../auth.js';
import { uploadFile, getPublicUrl } from '../storage.js';
import {
  processImage,
  generateThumbnail,
  generateVideoThumbnail,
  transcodeVideo,
  getMediaType,
  ProcessingError,
  type TranscodeResult,
} from '../processing.js';
import { validateUpload } from '../validation.js';
import { config } from '../config.js';

// ── Response shapes ─────────────────────────────────────────────────────────────

/** Response when media is stored as-is (audio, document, or video without transcoding) */
interface UploadResponse {
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  size: number;
  mimeType: string;
  bucket: string;
}

/** Extended response returned when HLS transcoding succeeds */
interface VideoUploadResponse {
  url: string;           // master.m3u8 URL — primary playback endpoint
  mp4Url: string;        // original MP4 fallback / download URL
  thumbnailUrl: string;
  width: number;
  height: number;
  duration: number;
  size: number;          // original file size in bytes
  mimeType: string;      // "application/x-mpegURL"
  bucket: string;
  variants: TranscodeResult['variants'];
}

/**
 * Buckets where video uploads trigger HLS transcoding.
 * Other buckets (e.g. "messages") store video as-is for low-latency direct playback.
 */
const TRANSCODE_BUCKETS = new Set(['media', 'reels-media', 'stories-media']);

// ── Route registration ─────────────────────────────────────────────────────────

export async function uploadRoute(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/upload',
    {
      config: {
        // Disable default body parsing — @fastify/multipart handles the stream
        rawBody: false,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const startMs = Date.now();
      let userId = 'unknown';

      try {
        // ── Step 1: JWT verification ───────────────────────────────────────────
        const token = extractBearerToken(request.headers.authorization);
        const auth = await verifyJwt(token);
        userId = auth.userId;

        // Only authenticated (non-anon) users may upload
        if (auth.role === 'anon') {
          return reply.code(401).send({ error: 'Authentication required' });
        }

        // ── Step 2: Parse multipart ────────────────────────────────────────────
        const data = await request.file();
        if (!data) {
          return reply.code(400).send({ error: 'No file provided in multipart body' });
        }

        // Extract form fields alongside the file part
        const bucket = (data.fields['bucket'] as { value?: string } | undefined)?.value;
        const customPath = (data.fields['path'] as { value?: string } | undefined)?.value;

        if (!bucket || typeof bucket !== 'string') {
          return reply.code(400).send({ error: 'Missing required field: bucket' });
        }

        // Buffer the file stream
        const fileBuffer = await data.toBuffer();
        const fileSize = fileBuffer.byteLength;
        const mimeType = data.mimetype;
        const rawFilename = data.filename ?? 'upload';

        // ── Step 3: Validation ─────────────────────────────────────────────────
        const head = fileBuffer.subarray(0, 16);
        const validation = validateUpload(bucket, mimeType, fileSize, head, rawFilename);

        if (!validation.ok) {
          return reply.code(validation.httpStatus).send({ error: validation.error });
        }

        // ── Step 4: Build storage key ──────────────────────────────────────────
        const timestamp = Date.now();
        const uuid = randomUUID();
        const mediaType = getMediaType(mimeType);

        // Default key: userId/timestamp_uuid.ext
        //
        // customPath is allowed but ALWAYS scoped under userId/ to prevent namespace
        // hijacking (e.g. attacker passing path="victim-uuid/avatar.jpg").
        // sanitiseKey strips "..", leading slashes, and invalid chars; if the result
        // is empty (all chars stripped) we fall back to a UUID key to avoid
        // producing the invalid key "userId/" (directory-like, no filename).
        const baseKey = (() => {
          if (!customPath) {
            return buildDefaultKey(userId, timestamp, uuid, mimeType, mediaType);
          }
          const sanitised = sanitiseKey(customPath);
          if (!sanitised) {
            return buildDefaultKey(userId, timestamp, uuid, mimeType, mediaType);
          }
          // Force userId prefix — user can only write inside their own namespace.
          return `${userId}/${sanitised}`;
        })();

        const thumbKey = baseKey.replace(/(\.[^.]+)?$/, '_thumb.jpg');

        // ── Step 5: Media processing ───────────────────────────────────────────
        let storedBuffer = fileBuffer;
        let storedMime = mimeType;
        let storedExt = extractExt(baseKey);
        let width: number | null = null;
        let height: number | null = null;
        let thumbnailBuffer: Buffer | null = null;

        // ── Step 5a: HLS Video Transcoding (media / reels-media / stories-media) ──
        if (mediaType === 'video' && config.transcode.enabled && TRANSCODE_BUCKETS.has(bucket)) {
          // keyPrefix is the base path for all HLS artifacts of this video.
          // Structure in MinIO:
          //   <keyPrefix>/hls/master.m3u8
          //   <keyPrefix>/hls/720p/720p.m3u8
          //   <keyPrefix>/hls/720p/seg_000.ts  …
          //   <keyPrefix>/original.mp4
          //   <keyPrefix>/thumb.jpg
          const keyPrefix = baseKey.replace(/\.[^.]+$/, '');

          const transcode = await transcodeVideo(fileBuffer, bucket, keyPrefix);

          const processingMs = Date.now() - startMs;
          app.log.info({
            event: 'transcode_success',
            userId,
            bucket,
            keyPrefix,
            originalSizeBytes: fileSize,
            width: transcode.width,
            height: transcode.height,
            duration: transcode.duration,
            variants: transcode.variants.map((v) => v.resolution),
            processingMs,
          });

          const videoResponse: VideoUploadResponse = {
            url: transcode.hlsPlaylistUrl,
            mp4Url: transcode.mp4Url,
            thumbnailUrl: transcode.thumbnailUrl,
            width: transcode.width,
            height: transcode.height,
            duration: transcode.duration,
            size: fileSize,
            mimeType: 'application/x-mpegURL',
            bucket,
            variants: transcode.variants,
          };

          return reply.code(200).send(videoResponse);
        }

        // ── Step 5b: Standard processing path (image / audio / document / non-transcode video) ──
        if (mediaType === 'image') {
          const forceJpeg = bucket === 'avatars';
          const processed = await processImage(fileBuffer, { forceJpeg });
          storedBuffer = processed.buffer;
          storedMime = processed.mimeType;
          storedExt = processed.ext;
          width = processed.width;
          height = processed.height;
          thumbnailBuffer = await generateThumbnail(storedBuffer);
        } else if (mediaType === 'video') {
          // Non-transcode bucket (e.g. chat messages): store as-is, thumbnail only
          try {
            thumbnailBuffer = await generateVideoThumbnail(fileBuffer);
          } catch (err) {
            app.log.warn(
              { err, userId, bucket },
              'Video thumbnail generation failed — storing without thumbnail',
            );
          }
        }
        // audio and document: stored as-is, no thumbnail

        // Rebuild key with correct extension after image processing
        const finalKey = mediaType === 'image'
          ? baseKey.replace(/\.[^.]+$/, `.${storedExt}`)
          : baseKey;

        // ── Step 6: Upload to MinIO ────────────────────────────────────────────
        const uploadUrl = await uploadFile(bucket, finalKey, storedBuffer, storedMime, storedBuffer.byteLength);

        let thumbnailUrl: string | null = null;
        if (thumbnailBuffer) {
          await uploadFile(bucket, thumbKey, thumbnailBuffer, 'image/jpeg', thumbnailBuffer.byteLength);
          thumbnailUrl = getPublicUrl(bucket, thumbKey);
        }

        // ── Step 7: Structured log ─────────────────────────────────────────────
        const processingMs = Date.now() - startMs;
        app.log.info({
          event: 'upload_success',
          userId,
          bucket,
          key: finalKey,
          originalSizeBytes: fileSize,
          storedSizeBytes: storedBuffer.byteLength,
          mimeType: storedMime,
          hasThumbnail: thumbnailBuffer !== null,
          processingMs,
        });

        const response: UploadResponse = {
          url: uploadUrl,
          thumbnailUrl,
          width,
          height,
          size: storedBuffer.byteLength,
          mimeType: storedMime,
          bucket,
        };

        return reply.code(200).send(response);
      } catch (err: unknown) {
        const processingMs = Date.now() - startMs;

        if (err instanceof AuthError) {
          app.log.warn({ event: 'upload_auth_error', code: err.code, processingMs });
          // 403 for INSUFFICIENT_ROLE (authenticated but not permitted);
          // 401 for all token problems (missing, invalid, expired).
          const status = err.code === 'INSUFFICIENT_ROLE' ? 403 : 401;
          return reply.code(status).send({ error: err.message });
        }

        if (err instanceof ProcessingError) {
          app.log.error({
            event: 'upload_processing_error',
            userId,
            err: err.message,
            originalCause: String(err.originalCause),
            processingMs,
          });
          return reply.code(500).send({ error: 'Media processing failed' });
        }

        // Unknown error — log with full details server-side, generic message to client
        app.log.error({
          event: 'upload_unknown_error',
          userId,
          err,
          processingMs,
        });
        return reply.code(500).send({ error: 'Internal server error' });
      }
    },
  );
}

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Builds the default storage key for an upload.
 * Format: <userId>/<timestamp>_<uuid>.<ext>
 */
function buildDefaultKey(
  userId: string,
  timestamp: number,
  uuid: string,
  mimeType: string,
  mediaType: ReturnType<typeof getMediaType>,
): string {
  const ext = mimeTypeToExt(mimeType, mediaType);
  return `${userId}/${timestamp}_${uuid}.${ext}`;
}

/**
 * Sanitises a custom sub-path supplied by the client.
 *
 * Rules:
 *  - `..` segments removed (belt-and-suspenders; MinIO keys are opaque strings,
 *    but defence-in-depth against future behavioural changes).
 *  - Leading slashes stripped.
 *  - Consecutive slashes collapsed to one (avoid empty key segments).
 *  - `./` prefix collapsed (cosmetic, not a security issue in S3 semantics).
 *  - Only [-\w./] characters kept; everything else → '_'.
 *  - Truncated to 512 bytes.
 *
 * @returns Sanitised path string, or `null` if the result is empty.
 *          Callers MUST treat null as "use default key" to avoid generating
 *          directory-like keys (e.g. "userId/").
 */
function sanitiseKey(raw: string): string | null {
  const result = raw
    .replace(/\.\./g, '')          // remove ".."
    .replace(/^[./]+/, '')         // strip leading slashes and dots (prevents "./etc")
    .replace(/\/+/g, '/')          // collapse consecutive slashes
    .replace(/[^\w.\-/]/g, '_')    // allow only safe chars
    .replace(/\/$/, '')            // strip trailing slash
    .slice(0, 512)
    .trim();
  return result || null;
}

function extractExt(key: string): string {
  const match = key.match(/\.([^.]+)$/);
  return match?.[1] ?? 'bin';
}

/**
 * Maps MIME type to a safe file extension for storage.
 * Avoids executable extensions regardless of claimed MIME.
 */
function mimeTypeToExt(mimeType: string, mediaType: ReturnType<typeof getMediaType>): string {
  const MAP: Record<string, string> = {
    'image/jpeg':     'jpg',
    'image/png':      'png',
    'image/gif':      'gif',
    'image/webp':     'webp',
    'image/avif':     'avif',
    'image/heic':     'heic',
    'video/mp4':      'mp4',
    'video/webm':     'webm',
    'video/quicktime':'mov',
    'video/x-msvideo':'avi',
    'audio/mpeg':     'mp3',
    'audio/ogg':      'oga',
    'audio/webm':     'weba',
    'audio/mp4':      'm4a',
    'application/pdf':'pdf',
  };
  return MAP[mimeType] ?? (mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : 'bin');
}
