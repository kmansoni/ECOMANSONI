/**
 * storage.ts — MinIO S3 client wrapper.
 *
 * Architecture notes:
 *  - S3Client is created once at module level (singleton) — connection pool reuse.
 *  - All bucket/key pairs are validated by the caller (validation.ts) before reaching here.
 *  - Public URLs are constructed from mediaDomain, not from S3 presigned URLs,
 *    because Nginx proxies GET / → MinIO, making all buckets publicly readable.
 *  - deleteFile does not throw on 404 — idempotent by design (supports retry loops).
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { config } from './config.js';

// ── S3 Client initialization ──────────────────────────────────────────────────

const s3 = new S3Client({
  endpoint: config.minio.endpoint,
  region: config.minio.region,
  credentials: {
    accessKeyId: config.minio.accessKey,
    secretAccessKey: config.minio.secretKey,
  },
  /**
   * forcePathStyle = true is mandatory for MinIO.
   * AWS S3 uses virtual-hosted style (bucket.s3.amazonaws.com),
   * but MinIO uses path style (minio:9000/bucket/key).
   */
  forcePathStyle: true,
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Uploads a file to MinIO and returns the public URL.
 *
 * @param bucket      - Target bucket name (pre-validated by caller).
 * @param key         - Object key, e.g. "user-id/timestamp_uuid.webp".
 * @param body        - File content as a Buffer.
 * @param contentType - MIME type for the object metadata.
 * @param sizeBytes   - Declared content length — required by MinIO for streaming integrity.
 * @returns Public download URL via Nginx proxy.
 */
export async function uploadFile(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
  sizeBytes: number,
): Promise<string> {
  const params: PutObjectCommandInput = {
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    ContentLength: sizeBytes,
    // Disable server-side encryption at rest for now; add SSE-S3 if needed.
  };

  await s3.send(new PutObjectCommand(params));

  return getPublicUrl(bucket, key);
}

/**
 * Deletes a file from MinIO.
 * Idempotent: does not throw on 404.
 *
 * @param bucket - Bucket name.
 * @param key    - Object key.
 */
export async function deleteFile(bucket: string, key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err: unknown) {
    // S3 DeleteObject does not return 404; it's a no-op if the object doesn't exist.
    // However guard defensively for unexpected errors.
    const code =
      err instanceof Error && 'Code' in err ? (err as { Code?: string }).Code : undefined;
    if (code !== 'NoSuchKey') {
      throw err;
    }
  }
}

/**
 * Builds the public Nginx-proxied URL for a stored object.
 *
 * URL format: https://<mediaDomain>/<bucket>/<key>
 *
 * The Nginx config proxies `GET /` to MinIO, so no auth is required for reads.
 *
 * @param bucket - Bucket name.
 * @param key    - Object key.
 */
export function getPublicUrl(bucket: string, key: string): string {
  return `https://${config.mediaDomain}/${bucket}/${key}`;
}

/**
 * Probes MinIO connectivity by sending a HeadBucket request.
 * Used by the /health route.
 *
 * @param bucket - Any known bucket to probe against.
 * @returns true if MinIO responded without error.
 */
export async function checkMinioHealth(bucket: string = 'avatars'): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch {
    return false;
  }
}
