/**
 * validation.ts — Upload validation pipeline.
 *
 * Security contracts:
 *  - Content-Type header is NOT trusted for security decisions.
 *  - Magic bytes (file signature) are used to confirm actual file format.
 *  - File size is checked BEFORE reading full buffer (multipart streaming limit).
 *  - File names are sanitised: path-traversal sequences and dangerous chars removed.
 *  - Bucket-to-MIME allowlist enforced — no cross-bucket MIME abuse.
 *
 * Threat model:
 *  - Attacker sends video with Content-Type: image/jpeg → blocked by magic bytes.
 *  - Attacker sends filename "../../etc/passwd.jpg" → sanitised to "etcpasswd.jpg".
 *  - Attacker sends a 2GB file to a 5MB avatar bucket → blocked before processing.
 */

import { config } from './config.js';

// ── MIME allowlists per bucket ─────────────────────────────────────────────────

const BUCKET_MIME_ALLOWLIST: Record<string, readonly string[]> = {
  'media':          ['image/', 'video/'],
  'chat-media':     ['image/', 'video/', 'application/pdf'],
  'voice-messages': ['audio/webm', 'audio/ogg', 'audio/mp4'],
  'reels-media':    ['video/'],
  'avatars':        ['image/'],
  'stories-media':  ['image/', 'video/'],
} as const;

// ── Size limits per bucket ─────────────────────────────────────────────────────

const BUCKET_SIZE_LIMITS: Record<string, number> = {
  'media':          config.limits.maxVideoSizeBytes,   // 500 MB — video dominant
  'chat-media':     config.limits.maxVideoSizeBytes / 5, // 100 MB
  'voice-messages': config.limits.maxAudioSizeBytes,   // 50 MB
  'reels-media':    config.limits.maxVideoSizeBytes,   // 500 MB
  'avatars':        config.limits.maxAvatarSizeBytes,  // 5 MB
  'stories-media':  config.limits.maxVideoSizeBytes / 5, // 100 MB
};

// ── Magic bytes signatures ─────────────────────────────────────────────────────

interface MagicSignature {
  mimePrefix: string;
  /** Byte offset where the magic bytes start */
  offset: number;
  /** Expected byte pattern */
  bytes: readonly number[];
}

/**
 * Minimal magic-byte table covering our allowed MIME types.
 * Extended from IANA/Wikipedia file signatures list.
 *
 * Note: 'image/' prefix matches any image/* MIME; we check the actual bytes.
 */
const MAGIC_SIGNATURES: readonly MagicSignature[] = [
  // JPEG
  { mimePrefix: 'image/jpeg',   offset: 0, bytes: [0xFF, 0xD8, 0xFF] },
  // PNG
  { mimePrefix: 'image/png',    offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47] },
  // GIF87a / GIF89a
  { mimePrefix: 'image/gif',    offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP (RIFF....WEBP)
  { mimePrefix: 'image/webp',   offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
  // AVIF / HEIC — ftyp box; check "ftyp" at offset 4
  { mimePrefix: 'image/avif',   offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  { mimePrefix: 'image/heic',   offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  // MP4 — also uses ftyp
  { mimePrefix: 'video/mp4',    offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  // MOV / QuickTime
  { mimePrefix: 'video/quicktime', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  // WebM / MKV
  { mimePrefix: 'video/webm',   offset: 0, bytes: [0x1A, 0x45, 0xDF, 0xA3] },
  { mimePrefix: 'video/x-matroska', offset: 0, bytes: [0x1A, 0x45, 0xDF, 0xA3] },
  // OGG (Ogg container — audio/ogg, audio/webm fallback, video/ogg)
  { mimePrefix: 'audio/ogg',    offset: 0, bytes: [0x4F, 0x67, 0x67, 0x53] },
  { mimePrefix: 'video/ogg',    offset: 0, bytes: [0x4F, 0x67, 0x67, 0x53] },
  // WebM audio
  { mimePrefix: 'audio/webm',   offset: 0, bytes: [0x1A, 0x45, 0xDF, 0xA3] },
  // MP4 audio (m4a) — same ftyp box
  { mimePrefix: 'audio/mp4',    offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  // PDF
  { mimePrefix: 'application/pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  // AVI
  { mimePrefix: 'video/x-msvideo', offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
] as const;

// ── Validation result ──────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true; sanitisedFilename: string }
  | { ok: false; error: string; httpStatus: 400 | 413 | 415 };

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Validates an incoming upload against bucket rules.
 *
 * @param bucket       - Target bucket name from multipart field.
 * @param mimeType     - MIME type from multipart part headers (NOT trusted on its own).
 * @param sizeBytes    - Declared or measured file size in bytes.
 * @param fileHead     - First 16 bytes of the file content for magic check.
 * @param rawFilename  - Original filename from Content-Disposition header.
 */
export function validateUpload(
  bucket: string,
  mimeType: string,
  sizeBytes: number,
  fileHead: Buffer,
  rawFilename: string,
): ValidationResult {
  // 1. Bucket must be known
  const allowedMimePrefixes = BUCKET_MIME_ALLOWLIST[bucket];
  if (!allowedMimePrefixes) {
    return { ok: false, error: `Unknown bucket: ${bucket}`, httpStatus: 400 };
  }

  // 2. MIME type allowed for this bucket
  const mimeAllowed = allowedMimePrefixes.some(
    (prefix) => mimeType === prefix || mimeType.startsWith(prefix),
  );
  if (!mimeAllowed) {
    return {
      ok: false,
      error: `MIME type "${mimeType}" is not allowed in bucket "${bucket}"`,
      httpStatus: 415,
    };
  }

  // 3. File size check
  const sizeLimit = BUCKET_SIZE_LIMITS[bucket] ?? 0;
  if (sizeBytes > sizeLimit) {
    const limitMB = Math.round(sizeLimit / 1024 / 1024);
    return {
      ok: false,
      error: `File size ${sizeBytes} bytes exceeds limit of ${limitMB} MB for bucket "${bucket}"`,
      httpStatus: 413,
    };
  }

  // 4. Magic bytes check — verify the actual file format matches claimed MIME
  const magicOk = checkMagicBytes(mimeType, fileHead);
  if (!magicOk) {
    return {
      ok: false,
      error: `File content does not match declared MIME type "${mimeType}"`,
      httpStatus: 415,
    };
  }

  // 5. Filename sanitation
  const sanitisedFilename = sanitiseFilename(rawFilename);

  return { ok: true, sanitisedFilename };
}

/**
 * Returns the allowed MIME type prefixes for a given bucket.
 * Used by the delete route to validate that the key extension matches the bucket.
 */
export function getBucketMimePrefixes(bucket: string): readonly string[] | undefined {
  return BUCKET_MIME_ALLOWLIST[bucket];
}

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Verifies that the first bytes of the file match at least one magic signature
 * for the claimed MIME type.
 *
 * @param mimeType - Claimed MIME type.
 * @param head     - First ≥16 bytes of the file (caller must ensure length).
 */
function checkMagicBytes(mimeType: string, head: Buffer): boolean {
  const candidates = MAGIC_SIGNATURES.filter((sig) =>
    mimeType.startsWith(sig.mimePrefix) || sig.mimePrefix === mimeType,
  );

  // If we have no signature for this MIME, allow through (e.g. exotic video codecs)
  // This is a known trade-off: coverage vs. false-positives.
  if (candidates.length === 0) return true;

  return candidates.some((sig) => {
    const { offset, bytes } = sig;
    if (head.length < offset + bytes.length) return false;
    return bytes.every((byte, i) => head[offset + i] === byte);
  });
}

/**
 * Sanitises a filename for safe storage:
 *  - Strips directory components (path traversal prevention).
 *  - Removes non-alphanumeric characters except safe ones (. - _).
 *  - Truncates to 128 characters.
 *  - Falls back to "upload" if the result is empty.
 */
export function sanitiseFilename(raw: string): string {
  // Strip directory separators (both Unix and Windows)
  let name = raw.replace(/[/\\]/g, '');

  // Remove any remaining dangerous characters
  name = name.replace(/[^a-zA-Z0-9._\-]/g, '_');

  // Remove leading dots to prevent hidden files
  name = name.replace(/^\.+/, '');

  // Truncate
  name = name.slice(0, 128);

  return name || 'upload';
}
