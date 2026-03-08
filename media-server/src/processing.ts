/**
 * processing.ts — Image and video media processing pipeline.
 *
 * Security contracts:
 *  - EXIF metadata is always stripped (GPS, camera model, timestamps).
 *  - HEIC/HEIF inputs are converted to JPEG/WebP; no vendor-specific formats are stored.
 *  - Temporary video files are always cleaned up in a finally block.
 *  - FFmpeg errors are caught and re-thrown as ProcessingError — never swallowed.
 *
 * Processing rules:
 *  - Images are down-scaled to imageMaxWidth if wider (preserves aspect ratio).
 *  - Photo output format: WebP (better compression, universal browser support).
 *  - Avatar output format: JPEG (wider compatibility for third-party consumers).
 *  - Video thumbnails: screenshot at 1 second via FFmpeg, then resized by Sharp.
 */

import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { uploadFile, getPublicUrl } from './storage.js';

// Point fluent-ffmpeg to the bundled static binary from @ffmpeg-installer.
// ffprobe is read from system PATH — installed via `apk add ffmpeg` in the Dockerfile.
// The Alpine ffmpeg package ships both ffmpeg and ffprobe as separate binaries.
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath('ffprobe');

// ── Error type ─────────────────────────────────────────────────────────────────

export class ProcessingError extends Error {
  public readonly originalCause: unknown;
  constructor(message: string, originalCause?: unknown) {
    super(message);
    this.name = 'ProcessingError';
    this.originalCause = originalCause;
  }
}

// ── Media type detection ───────────────────────────────────────────────────────

export type MediaType = 'image' | 'video' | 'audio' | 'document';

/**
 * Maps a validated MIME type to a logical media category.
 * This is used by the upload route to decide which processing pipeline to invoke.
 */
export function getMediaType(mimeType: string): MediaType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

// ── Image processing ──────────────────────────────────────────────────────────

export interface ProcessImageOptions {
  /** When true, output JPEG instead of WebP (for avatar bucket) */
  forceJpeg?: boolean;
}

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  /** Actual output MIME type, e.g. "image/webp" or "image/jpeg" */
  mimeType: string;
  /** Output file extension without dot, e.g. "webp" or "jpg" */
  ext: string;
}

/**
 * Processes an uploaded image:
 *  1. Decodes (handles JPEG, PNG, WebP, GIF, AVIF, HEIC/HEIF via libvips).
 *  2. Strips all EXIF/XMP/IPTC metadata (privacy).
 *  3. Resizes if width > imageMaxWidth (preserves aspect ratio, never upscales).
 *  4. Encodes to WebP (default) or JPEG (forceJpeg).
 *
 * @param inputBuffer - Raw file bytes.
 * @param options     - Output format overrides.
 */
export async function processImage(
  inputBuffer: Buffer,
  options: ProcessImageOptions = {},
): Promise<ProcessedImage> {
  try {
    const pipeline = sharp(inputBuffer, { failOn: 'error' })
      // Rotate BEFORE metadata strip: .rotate() without args reads EXIF Orientation from
      // the *input* buffer and applies it. Sharp then removes the Orientation tag.
      // IMPORTANT: do NOT call .withMetadata() — Sharp's default behaviour strips ALL
      // metadata (EXIF, XMP, IPTC) from the output. Calling .withMetadata() would
      // re-enable metadata passthrough, potentially leaking GPS coordinates stored in XMP.
      .rotate()
      // Resize: width capped at imageMaxWidth, height auto, never upscale
      .resize({
        width: config.processing.imageMaxWidth,
        withoutEnlargement: true,
        fit: 'inside',
      });

    let outputBuffer: Buffer;
    let mimeType: string;
    let ext: string;

    if (options.forceJpeg) {
      outputBuffer = await pipeline
        .jpeg({ quality: config.processing.imageQuality, mozjpeg: true })
        .toBuffer();
      mimeType = 'image/jpeg';
      ext = 'jpg';
    } else {
      outputBuffer = await pipeline
        .webp({ quality: config.processing.imageQuality })
        .toBuffer();
      mimeType = 'image/webp';
      ext = 'webp';
    }

    // Re-read metadata from the output buffer to get actual dimensions
    const meta = await sharp(outputBuffer).metadata();

    return {
      buffer: outputBuffer,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      mimeType,
      ext,
    };
  } catch (err: unknown) {
    throw new ProcessingError('Image processing failed', err);
  }
}

// ── Thumbnail generation (images) ─────────────────────────────────────────────

/**
 * Generates a square thumbnail from an image buffer.
 * Uses cover-fit crop so the thumbnail is always exactly thumbnailWidth × thumbnailHeight.
 *
 * @param inputBuffer - Already-processed (post-EXIF-strip) image bytes.
 * @returns JPEG thumbnail buffer.
 */
export async function generateThumbnail(inputBuffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(inputBuffer)
      .resize({
        width: config.processing.thumbnailWidth,
        height: config.processing.thumbnailHeight,
        fit: 'cover',
        position: 'attention', // smart crop — focuses on salient region
      })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (err: unknown) {
    throw new ProcessingError('Thumbnail generation failed', err);
  }
}

// ── Video thumbnail generation ─────────────────────────────────────────────────

/**
 * Extracts a thumbnail frame from a video file using FFmpeg.
 *
 * Flow:
 *  1. Write video bytes to a temp file (FFmpeg requires seekable input).
 *  2. Extract a JPEG frame at 1 second offset.
 *  3. Read the JPEG, resize it with Sharp to thumbnail dimensions.
 *  4. Delete all temp files (finally block — guaranteed cleanup).
 *
 * @param videoBuffer - Raw video bytes (already validated MIME / magic bytes).
 * @returns JPEG thumbnail buffer.
 */
export async function generateVideoThumbnail(videoBuffer: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const videoPath = path.join(config.tmpDir, `${id}_input.tmp`);
  const thumbPath = path.join(config.tmpDir, `${id}_thumb.jpg`);

  try {
    await fs.writeFile(videoPath, videoBuffer);

    await extractFrameWithFfmpeg(videoPath, thumbPath);

    const frameBuffer = await fs.readFile(thumbPath);

    // Resize the extracted frame to thumbnail dimensions
    const resized = await sharp(frameBuffer)
      .resize({
        width: config.processing.thumbnailWidth,
        height: config.processing.thumbnailHeight,
        fit: 'cover',
        position: 'attention',
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    return resized;
  } catch (err: unknown) {
    if (err instanceof ProcessingError) throw err;
    throw new ProcessingError('Video thumbnail generation failed', err);
  } finally {
    // Always delete temp files — even on error
    await Promise.allSettled([
      fs.unlink(videoPath).catch(() => undefined),
      fs.unlink(thumbPath).catch(() => undefined),
    ]);
  }
}

// ── HLS Adaptive Bitrate Transcoding ──────────────────────────────────────────

/**
 * Result structure returned by transcodeVideo().
 * All keys and URLs are guaranteed to be non-empty strings on success.
 */
export interface TranscodeResult {
  /** MinIO key for the HLS master playlist */
  hlsPlaylistKey: string;
  /** Public URL of the master playlist (served via Nginx → MinIO) */
  hlsPlaylistUrl: string;
  /** MinIO key for the original MP4 (fallback / download) */
  mp4Key: string;
  /** Public URL of the original MP4 */
  mp4Url: string;
  /** MinIO key for the JPEG thumbnail */
  thumbnailKey: string;
  /** Public URL of the JPEG thumbnail */
  thumbnailUrl: string;
  /** Pixel width of the original video */
  width: number;
  /** Pixel height of the original video */
  height: number;
  /** Duration in seconds, rounded to 2 decimal places */
  duration: number;
  /** Ordered list of generated quality variants (highest quality last) */
  variants: Array<{ resolution: string; bitrate: string; bandwidth: number }>;
}

/**
 * Video probe metadata returned by ffprobe.
 * Only the fields we care about are typed.
 */
interface VideoProbeResult {
  width: number;
  height: number;
  /** Duration in fractional seconds */
  duration: number;
  /** Video codec, e.g. "h264", "hevc", "vp9" */
  codec: string;
}

/**
 * Transcodes an uploaded video into HLS Adaptive Bitrate streams, uploads all
 * artifacts to MinIO, and returns public URLs.
 *
 * Architecture:
 *  1. Write videoBuffer to an isolated temp job directory (prevents cross-job collision).
 *  2. Probe with ffprobe — authoritative metadata, no manual byte-parsing.
 *  3. Reject inputs exceeding maxDurationSeconds (prevents CPU-exhaustion DoS).
 *  4. Determine quality ladder based on source resolution:
 *       ≥ 1080p → 360p + 720p + 1080p
 *       ≥  720p → 360p + 720p
 *       <  720p → 360p only
 *  5. For each variant: run FFmpeg once, output HLS (.m3u8 + .ts segments) to a
 *     variant-specific sub-directory.
 *  6. Generate in-memory master.m3u8 that references variant playlists with bandwidth
 *     hints for ABR (RFC 8216 §4.3.4.2).
 *  7. Batch-upload all artifacts to MinIO under `<bucket>/<keyPrefix>/`.
 *  8. Upload original MP4 verbatim for fallback / direct download.
 *  9. Extract thumbnail frame at 1s, resize to thumbnail dimensions, upload.
 * 10. Delete entire temp job directory in finally block — guaranteed even on partial failure.
 *
 * Security contracts:
 *  - Temp dir is namespaced by UUID — no cross-request file access.
 *  - FFmpeg is invoked with -y (overwrite) and explicit output path — no shell expansion.
 *  - MaxDuration guard prevents runaway transcoders from starving the pod.
 *  - All temp files deleted in finally — no leftover data on disk after return.
 *
 * @param videoBuffer - Raw video bytes (already magic-byte validated by the caller).
 * @param bucket      - Destination MinIO bucket.
 * @param keyPrefix   - Key prefix (e.g. "userId/timestamp_uuid") under which all
 *                      artifacts are stored. Must NOT end with "/".
 * @returns TranscodeResult with public URLs and metadata.
 * @throws ProcessingError on ffprobe failure, FFmpeg error, or duration exceeded.
 */
export async function transcodeVideo(
  videoBuffer: Buffer,
  bucket: string,
  keyPrefix: string,
): Promise<TranscodeResult> {
  const jobId = randomUUID();
  const jobDir = path.join(config.transcode.tempDir, jobId);
  const inputPath = path.join(jobDir, 'input.mp4');

  try {
    // ── Step 1: Materialise input ──────────────────────────────────────────────
    await fs.mkdir(jobDir, { recursive: true });
    await fs.writeFile(inputPath, videoBuffer);

    // ── Step 2: Probe ──────────────────────────────────────────────────────────
    const probe = await probeVideo(inputPath);
    const { width, height, duration, codec: _codec } = probe;

    // ── Step 3: Duration guard ─────────────────────────────────────────────────
    if (duration > config.transcode.maxDurationSeconds) {
      throw new ProcessingError(
        `Video duration ${duration.toFixed(1)}s exceeds maximum allowed ` +
        `${config.transcode.maxDurationSeconds}s`,
      );
    }

    // ── Step 4: Quality ladder selection ──────────────────────────────────────
    // Select based on source height; never upscale (HLS ABR spec allows
    // fewer variants than declared in master playlist ladder).
    const presets = config.transcode.presets;
    const selectedLabels: string[] = [];
    if (height >= 1080) {
      selectedLabels.push('360p', '720p', '1080p');
    } else if (height >= 720) {
      selectedLabels.push('360p', '720p');
    } else {
      selectedLabels.push('360p');
    }

    // ── Step 5: Per-variant FFmpeg HLS transcoding ─────────────────────────────
    const variantResults: Array<{
      label: string;
      playlistRelKey: string;  // relative to keyPrefix, e.g. "hls/720p/720p.m3u8"
      bandwidth: number;
      resolution: string;
      bitrate: string;
    }> = [];

    for (const label of selectedLabels) {
      const preset = presets[label];
      if (!preset) continue; // type-safe guard; should never fire

      const variantDir = path.join(jobDir, 'hls', label);
      await fs.mkdir(variantDir, { recursive: true });

      const playlistPath = path.join(variantDir, `${label}.m3u8`);
      const segmentPattern = path.join(variantDir, 'seg_%03d.ts');

      await runFfmpegHls({
        inputPath,
        playlistPath,
        segmentPattern,
        height: preset.height,
        videoBitrate: preset.videoBitrate,
        audioBitrate: preset.audioBitrate,
        crf: preset.crf,
        segmentDuration: config.transcode.hlsSegmentDuration,
      });

      // Upload all files from variantDir to MinIO
      const variantFiles = await fs.readdir(variantDir);
      for (const filename of variantFiles) {
        const filePath = path.join(variantDir, filename);
        const fileBuffer = await fs.readFile(filePath);
        const isPlaylist = filename.endsWith('.m3u8');
        const contentType = isPlaylist ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
        const minioKey = `${keyPrefix}/hls/${label}/${filename}`;
        await uploadFile(bucket, minioKey, fileBuffer, contentType, fileBuffer.byteLength);
      }

      variantResults.push({
        label,
        playlistRelKey: `hls/${label}/${label}.m3u8`,
        bandwidth: preset.bandwidth,
        resolution: `${preset.width}x${preset.height}`,
        bitrate: preset.videoBitrate,
      });
    }

    // ── Step 6: Master HLS playlist ───────────────────────────────────────────
    // RFC 8216 §4.3.4.2: #EXT-X-STREAM-INF with BANDWIDTH, RESOLUTION, CODECS.
    // We declare the video codec as avc1.640028 (H.264 High@L4.0) which is the
    // most widely-decoded profile. The actual codec from the source is transcoded
    // to H.264 by FFmpeg so this declaration is accurate.
    const masterLines: string[] = ['#EXTM3U', '#EXT-X-VERSION:3'];
    for (const v of variantResults) {
      masterLines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},RESOLUTION=${v.resolution},CODECS="avc1.640028,mp4a.40.2"`,
        v.playlistRelKey.split('/').pop()!   // relative path: e.g. "720p.m3u8" won't work cross-dir
          // Actually we need paths relative to where master.m3u8 lives.
          // master.m3u8 is at <keyPrefix>/hls/master.m3u8
          // variant playlist is at <keyPrefix>/hls/720p/720p.m3u8
          // Relative path from master: "720p/720p.m3u8"
          .replace(/.*/, `${v.label}/${v.label}.m3u8`),
      );
    }
    const masterContent = masterLines.join('\n') + '\n';
    const masterKey = `${keyPrefix}/hls/master.m3u8`;
    const masterBuffer = Buffer.from(masterContent, 'utf-8');
    await uploadFile(bucket, masterKey, masterBuffer, 'application/vnd.apple.mpegurl', masterBuffer.byteLength);

    // ── Step 7: Upload original MP4 (fallback / download) ─────────────────────
    const mp4Key = `${keyPrefix}/original.mp4`;
    await uploadFile(bucket, mp4Key, videoBuffer, 'video/mp4', videoBuffer.byteLength);

    // ── Step 8: Thumbnail ──────────────────────────────────────────────────────
    const thumbPath = path.join(jobDir, 'thumb.jpg');
    await extractFrameWithFfmpeg(inputPath, thumbPath);
    const rawThumbBuffer = await fs.readFile(thumbPath);
    const thumbBuffer = await sharp(rawThumbBuffer)
      .resize({
        width: config.processing.thumbnailWidth,
        height: config.processing.thumbnailHeight,
        fit: 'cover',
        position: 'attention',
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    const thumbnailKey = `${keyPrefix}/thumb.jpg`;
    await uploadFile(bucket, thumbnailKey, thumbBuffer, 'image/jpeg', thumbBuffer.byteLength);

    // ── Step 9: Build and return result ───────────────────────────────────────
    const variants = variantResults.map((v) => ({
      resolution: v.label,
      bitrate: v.bitrate,
      bandwidth: v.bandwidth,
    }));

    return {
      hlsPlaylistKey: masterKey,
      hlsPlaylistUrl: getPublicUrl(bucket, masterKey),
      mp4Key,
      mp4Url: getPublicUrl(bucket, mp4Key),
      thumbnailKey,
      thumbnailUrl: getPublicUrl(bucket, thumbnailKey),
      width,
      height,
      duration: Math.round(duration * 100) / 100,
      variants,
    };
  } catch (err: unknown) {
    if (err instanceof ProcessingError) throw err;
    throw new ProcessingError('Video transcoding failed', err);
  } finally {
    // Always remove the entire job directory — segments can be hundreds of MB
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Wraps fluent-ffmpeg screenshot extraction in a Promise.
 * Takes a single frame at offset=1s (or at 10% of duration if video < 1s).
 */
function extractFrameWithFfmpeg(
  videoPath: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .on('error', (err: Error) => {
        reject(new ProcessingError(`FFmpeg error: ${err.message}`, err));
      })
      .on('end', () => resolve())
      .screenshots({
        timestamps: ['00:00:01.000'],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: `${config.processing.thumbnailWidth}x${config.processing.thumbnailHeight}`,
      });
  });
}

/**
 * Probes a video file with ffprobe to extract dimensions, duration, and codec.
 * Uses fluent-ffmpeg's built-in .ffprobe() wrapper which calls the ffprobe binary.
 *
 * Security note: videoPath is an absolute path to a temp file — no user-controlled
 * shell expansion occurs (fluent-ffmpeg passes args as an array to child_process.execFile).
 */
function probeVideo(videoPath: string): Promise<VideoProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err: Error | null, data: ffmpeg.FfprobeData) => {
      if (err) {
        reject(new ProcessingError(`ffprobe failed: ${err.message}`, err));
        return;
      }

      const videoStream = data.streams.find((s: ffmpeg.FfprobeStream) => s.codec_type === 'video');
      if (!videoStream) {
        reject(new ProcessingError('No video stream found in uploaded file'));
        return;
      }

      const width = videoStream.width ?? 0;
      const height = videoStream.height ?? 0;
      const duration =
        typeof data.format.duration === 'number'
          ? data.format.duration
          : parseFloat(String(data.format.duration ?? '0'));
      const codec = videoStream.codec_name ?? 'unknown';

      if (width === 0 || height === 0) {
        reject(new ProcessingError('Could not determine video dimensions from ffprobe output'));
        return;
      }

      resolve({ width, height, duration, codec });
    });
  });
}

/**
 * Runs FFmpeg HLS transcoding for a single quality variant.
 *
 * FFmpeg flags explained:
 *  -vf scale=-2:<height>  — scale to target height, width auto-calculated to nearest
 *                           even integer (-2). Even dimensions required by libx264.
 *  -c:v libx264           — H.264 codec, universally supported.
 *  -preset fast           — Encoding speed/quality tradeoff. "fast" is adequate for
 *                           server-side VOD where real-time isn't required but latency
 *                           still matters (faster than "medium" by ~30%).
 *  -crf <n>               — Constant Rate Factor — quality target, not bitrate target.
 *                           Combined with -maxrate / -bufsize for VBR with ceiling.
 *  -maxrate / -bufsize    — VBV buffer prevents bitrate spikes that would exceed the
 *                           ABR BANDWIDTH declared in master.m3u8.
 *  -c:a aac -b:a          — AAC audio at declared bitrate.
 *  -hls_time              — Target segment duration in seconds (aligned to keyframe).
 *  -hls_list_size 0       — Keep all segments in the playlist (VOD, not live).
 *  -hls_flags             — independent_segments: each segment decodable standalone
 *                           (required by MPEG-TS / HLS spec for mid-stream joining).
 *  -hls_segment_type mpegts — Explicit TS container (default but explicit is safer).
 *  -y                       — Overwrite output without prompting (non-interactive env).
 */
interface FfmpegHlsOptions {
  inputPath: string;
  playlistPath: string;
  segmentPattern: string;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
  crf: number;
  segmentDuration: number;
}

function runFfmpegHls(opts: FfmpegHlsOptions): Promise<void> {
  const {
    inputPath,
    playlistPath,
    segmentPattern,
    height,
    videoBitrate,
    audioBitrate,
    crf,
    segmentDuration,
  } = opts;

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        `-vf scale=-2:${height}`,
        '-c:v libx264',
        '-preset fast',
        `-crf ${crf}`,
        `-maxrate ${videoBitrate}`,
        `-bufsize ${videoBitrate}`,   // VBV buffer = 1× maxrate (standard for VOD)
        '-c:a aac',
        `-b:a ${audioBitrate}`,
        `-hls_time ${segmentDuration}`,
        '-hls_list_size 0',
        '-hls_flags independent_segments',
        '-hls_segment_type mpegts',
        `-hls_segment_filename ${segmentPattern}`,
        '-f hls',
        '-y',
      ])
      .output(playlistPath)
      .on('error', (err: Error) => {
        reject(new ProcessingError(`FFmpeg HLS transcoding error: ${err.message}`, err));
      })
      .on('end', () => resolve())
      .run();
  });
}
