/**
 * render-worker.ts — BullMQ job handler for video rendering.
 *
 * State machine:
 *   queued → processing → compositing → encoding → uploading → completed
 *   Any state → failed (on error)
 *   Any state → cancelled (via render-service cancellation)
 *
 * Phases:
 *   1. Preparation  — Load project tree, download assets, process clips
 *   2. Compositing  — Assemble all tracks with transitions and overlays
 *   3. Audio mixing — Mix all audio tracks (video audio + music + effects)
 *   4. Encoding     — Final encode with export preset (resolution, codec, bitrate)
 *   5. Upload       — Upload final file to MinIO, update DB with URL
 *
 * Progress is published to Redis pub/sub for SSE streaming.
 * All temp files are cleaned up in a finally block.
 *
 * Idempotency:
 *   - Job can be retried safely: re-downloading assets is idempotent.
 *   - DB status updates use WHERE clauses to prevent stale updates.
 *   - The final upload to S3 uses a deterministic key — re-upload overwrites.
 *
 * Cancellation:
 *   - render-service sets status='cancelled' in DB.
 *   - Worker checks isCancelled() between phases.
 *   - If cancelled, cleanup and exit without error.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Job } from 'bullmq';
import { Redis } from 'ioredis';
import { query } from '../db.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type {
  EditorProject,
  EditorTrack,
  EditorClip,
  EditorEffect,
  EditorKeyframe,
  ProjectTree,
  TrackWithClips,
  ClipWithEffectsAndKeyframes,
  RenderJob,
} from '../types.js';
import { processClip, type ProcessedClip } from './clip-processor.js';
import { compositeTimeline, type ProcessedTrack } from './compositor.js';
import { mixAudio, type ProcessedAudioTrack } from './audio-mixer.js';
import { resolvePreset, getFFmpegOutputOptions, type ExportPreset } from './export-presets.js';
import { FFmpegPipeline } from './ffmpeg-pipeline.js';
import {
  createTempDir,
  cleanupTempDir,
  downloadFromS3,
  uploadToS3,
  formatDuration,
} from './utils.js';

// ── Job Data Interface ──────────────────────────────────────────────────────

export interface RenderJobData {
  jobId: string;
  projectId: string;
  userId: string;
  settings: Record<string, unknown>;
}

// ── Redis Publisher (module-level singleton) ─────────────────────────────────

let publisher: Redis | null = null;

function getPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(config.redis.url, { maxRetriesPerRequest: null });
  }
  return publisher;
}

export async function closePublisher(): Promise<void> {
  if (publisher) {
    await publisher.quit();
    publisher = null;
  }
}

// ── Main Handler ────────────────────────────────────────────────────────────

/**
 * BullMQ job processor — the entry point for each render job.
 *
 * This function is passed to new Worker('editor-render', handleRenderJob).
 */
export async function handleRenderJob(job: Job<RenderJobData>): Promise<void> {
  const { jobId, projectId, userId, settings } = job.data;
  let tempDir: string | null = null;
  const startTime = Date.now();

  logger.info({
    event: 'render_job_start',
    jobId,
    projectId,
    userId,
  });

  try {
    // ── Phase 0: Initialise ─────────────────────────────────────────
    tempDir = await createTempDir(jobId);
    await updateJobStatus(jobId, 'processing', 0);
    await publishLog(jobId, 'info', 'Render started', { phase: 'init' });

    // Check if cancelled before starting
    if (await isCancelled(jobId)) {
      await publishLog(jobId, 'info', 'Job was cancelled before processing');
      return;
    }

    // ── Phase 1: Load project tree ──────────────────────────────────
    await publishLog(jobId, 'info', 'Loading project data...');
    const projectTree = await loadProjectTree(projectId);
    const { project, tracks } = projectTree;

    await publishLog(jobId, 'info', `Project loaded: ${tracks.length} tracks`, {
      trackCount: tracks.length,
      duration: project.duration_ms,
    });

    // Resolve export preset
    const preset = resolvePreset(settings);
    await publishLog(jobId, 'info', `Export preset: ${preset.width}x${preset.height} ${preset.codec ?? 'auto'}`, {
      preset,
    });

    // ── Phase 1b: Download source assets ────────────────────────────
    await publishLog(jobId, 'info', 'Downloading source assets...');
    const assetDir = path.join(tempDir, 'assets');
    await fs.mkdir(assetDir, { recursive: true });

    const downloadMap = new Map<string, string>(); // sourceUrl → localPath
    let downloadCount = 0;
    const totalClips = tracks.reduce((sum, t) => sum + t.clips.length, 0);

    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.source_url && !downloadMap.has(clip.source_url)) {
          const ext = path.extname(clip.source_url) || '.mp4';
          const localPath = path.join(assetDir, `${clip.id}${ext}`);

          try {
            await downloadFromS3(clip.source_url, localPath);
            downloadMap.set(clip.source_url, localPath);
            downloadCount++;

            const progress = Math.round((downloadCount / totalClips) * 10);
            await updateJobStatus(jobId, 'processing', progress);
            await publishLog(jobId, 'info', `Downloaded ${downloadCount}/${totalClips} assets`, {
              clipId: clip.id,
              progress,
            });
          } catch (err) {
            await publishLog(jobId, 'error', `Failed to download asset for clip ${clip.id}: ${(err as Error).message}`, {
              clipId: clip.id,
              sourceUrl: clip.source_url,
            });
            throw new Error(`Asset download failed for clip ${clip.id}: ${(err as Error).message}`);
          }
        }

        // Check cancellation periodically
        if (downloadCount % 5 === 0 && await isCancelled(jobId)) {
          await publishLog(jobId, 'info', 'Job cancelled during asset download');
          return;
        }
      }
    }

    // ── Phase 1c: Process individual clips ──────────────────────────
    await publishLog(jobId, 'info', 'Processing clips...');
    const processedDir = path.join(tempDir, 'processed');
    await fs.mkdir(processedDir, { recursive: true });

    const processedTracks: ProcessedTrack[] = [];
    const audioTracksForMixing: ProcessedAudioTrack[] = [];

    let processedCount = 0;

    for (const trackData of tracks) {
      const processedClips: ProcessedClip[] = [];

      for (const clipData of trackData.clips) {
        // Skip text/sticker clips from clip processing (handled by compositor)
        if (clipData.type === 'text' || clipData.type === 'sticker') {
          // Text clips don't go through FFmpeg processing
          processedClips.push({
            path: '',
            duration: clipData.duration_ms / 1000,
            hasAudio: false,
            hasVideo: false,
            clip: clipData,
          });
          continue;
        }

        const sourcePath = clipData.source_url
          ? downloadMap.get(clipData.source_url)
          : null;

        if (!sourcePath && clipData.type !== 'color') {
          logger.warn({
            event: 'clip_no_source',
            clipId: clipData.id,
            clipType: clipData.type,
          });
          continue;
        }

        try {
          const processed = await processClip(
            clipData,
            sourcePath ?? '',
            processedDir,
            project.resolution_width,
            project.resolution_height,
          );
          processedClips.push(processed);
          processedCount++;

          const progress = 10 + Math.round((processedCount / totalClips) * 20);
          await updateJobStatus(jobId, 'processing', progress);
          await publishLog(jobId, 'info', `Processed clip ${processedCount}/${totalClips}`, {
            clipId: clipData.id,
            clipType: clipData.type,
            progress,
          });
        } catch (err) {
          await publishLog(jobId, 'error', `Clip processing failed: ${(err as Error).message}`, {
            clipId: clipData.id,
          });
          throw err;
        }
      }

      const track: ProcessedTrack = {
        track: trackData,
        clips: processedClips,
      };
      processedTracks.push(track);

      // Collect audio tracks for mixing
      if (
        trackData.type === 'audio' ||
        (trackData.type === 'video' && processedClips.some((c) => c.hasAudio))
      ) {
        audioTracksForMixing.push({
          track: trackData,
          clips: processedClips.filter((c) => c.hasAudio),
        });
      }
    }

    // ── Cancellation check ──────────────────────────────────────────
    if (await isCancelled(jobId)) {
      await publishLog(jobId, 'info', 'Job cancelled after clip processing');
      return;
    }

    // ── Phase 2: Compositing ────────────────────────────────────────
    await updateJobStatus(jobId, 'processing', 35, 'compositing');
    await publishLog(jobId, 'info', 'Compositing timeline...');

    const compositedPath = path.join(tempDir, 'composited.mp4');

    await compositeTimeline(
      processedTracks,
      project,
      compositedPath,
      (percent) => {
        const progress = 35 + Math.round(percent * 0.2);
        void updateJobStatus(jobId, 'processing', progress);
      },
    );

    await publishLog(jobId, 'info', 'Compositing complete');

    // ── Cancellation check ──────────────────────────────────────────
    if (await isCancelled(jobId)) {
      await publishLog(jobId, 'info', 'Job cancelled after compositing');
      return;
    }

    // ── Phase 3: Audio mixing ───────────────────────────────────────
    await updateJobStatus(jobId, 'processing', 55);
    await publishLog(jobId, 'info', 'Mixing audio tracks...');

    const mixedAudioPath = path.join(tempDir, 'mixed_audio.aac');
    const videoDuration = project.duration_ms / 1000;

    await mixAudio(audioTracksForMixing, videoDuration, mixedAudioPath);
    await publishLog(jobId, 'info', 'Audio mixing complete');

    // ── Phase 4: Final encoding ─────────────────────────────────────
    await updateJobStatus(jobId, 'processing', 65, 'encoding');
    await publishLog(jobId, 'info', 'Encoding final output...', { preset });

    const outputExt = preset.format === 'gif' ? '.gif' : '.mp4';
    const finalOutputPath = path.join(tempDir, `output${outputExt}`);

    await encodeFinal(compositedPath, mixedAudioPath, finalOutputPath, preset, videoDuration, (percent) => {
      const progress = 65 + Math.round(percent * 0.2);
      void updateJobStatus(jobId, 'processing', progress);
    });

    await publishLog(jobId, 'info', 'Encoding complete');

    // ── Cancellation check ──────────────────────────────────────────
    if (await isCancelled(jobId)) {
      await publishLog(jobId, 'info', 'Job cancelled after encoding');
      return;
    }

    // ── Phase 5: Upload to MinIO ────────────────────────────────────
    await updateJobStatus(jobId, 'processing', 85, 'uploading');
    await publishLog(jobId, 'info', 'Uploading to storage...');

    const bucket = 'editor-renders';
    const s3Key = `${userId}/${projectId}/${jobId}/output${outputExt}`;
    const outputUrl = await uploadToS3(finalOutputPath, bucket, s3Key);

    // Get output file size
    const outputStats = await fs.stat(finalOutputPath);
    const outputSize = outputStats.size;

    await publishLog(jobId, 'info', 'Upload complete', {
      outputUrl,
      outputSize,
    });

    // ── Phase 6: Finalise ───────────────────────────────────────────
    const elapsed = Date.now() - startTime;

    await query(
      `UPDATE render_jobs SET
        status = 'completed',
        progress = 100,
        output_url = $2,
        completed_at = NOW(),
        updated_at = NOW(),
        settings = settings || $3::jsonb
       WHERE id = $1 AND status != 'cancelled'`,
      [
        jobId,
        outputUrl,
        JSON.stringify({
          output_size: outputSize,
          render_time_ms: elapsed,
        }),
      ],
    );

    // Update project output_url
    await query(
      `UPDATE editor_projects SET output_url = $2, status = 'completed', updated_at = NOW()
       WHERE id = $1`,
      [projectId, outputUrl],
    );

    await publishLog(jobId, 'info', `Render completed in ${formatDuration(elapsed)}`, {
      event: 'job_completed',
      outputUrl,
      outputSize,
      renderTimeMs: elapsed,
    });

    logger.info({
      event: 'render_job_complete',
      jobId,
      projectId,
      elapsed,
      outputSize,
    });
  } catch (err) {
    // ── Error handling ──────────────────────────────────────────────
    const elapsed = Date.now() - startTime;
    const errorMessage = (err as Error).message.slice(0, 2000);

    logger.error({
      event: 'render_job_failed',
      jobId,
      projectId,
      elapsed,
      err: errorMessage,
    });

    // Update DB status (only if not already cancelled)
    await query(
      `UPDATE render_jobs SET
        status = 'failed',
        error_message = $2,
        completed_at = NOW(),
        updated_at = NOW()
       WHERE id = $1 AND status NOT IN ('cancelled', 'completed')`,
      [jobId, errorMessage],
    ).catch((dbErr) => {
      logger.error({
        event: 'render_job_status_update_failed',
        jobId,
        err: (dbErr as Error).message,
      });
    });

    // Update project status
    await query(
      `UPDATE editor_projects SET status = 'error', updated_at = NOW()
       WHERE id = $1`,
      [projectId],
    ).catch(() => { /* best effort */ });

    await publishLog(jobId, 'error', `Render failed: ${errorMessage}`, {
      event: 'job_failed',
      error: errorMessage,
    }).catch(() => { /* best effort */ });

    // Re-throw so BullMQ marks the job as failed
    throw err;
  } finally {
    // ── Guaranteed cleanup ──────────────────────────────────────────
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  }
}

// ── Final Encoding ──────────────────────────────────────────────────────────

/**
 * Final encode: combines composited video + mixed audio with export preset settings.
 *
 * This is the last FFmpeg pass — applies the user's chosen resolution,
 * codec, bitrate, and format settings.
 */
async function encodeFinal(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  preset: ExportPreset,
  durationSec: number,
  onProgress: (percent: number) => void,
): Promise<void> {
  const pipeline = new FFmpegPipeline();

  pipeline.addInput(videoPath);
  pipeline.addInput(audioPath);

  // Scale to export preset dimensions
  pipeline.addFilter(
    `[0:v]scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,` +
    `pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[vout]`,
  );

  pipeline.addMap('[vout]');
  pipeline.addMap('1:a');

  // Get preset-specific output options
  const outputOpts = getFFmpegOutputOptions(preset);
  pipeline.addOutputOptions(outputOpts);

  pipeline.setOutput(outputPath);
  pipeline.setDuration(durationSec);

  // Timeout: proportional to duration × quality (4K H.265 is very slow)
  const qualityFactor = preset.codec === 'libx265' ? 3 : 1;
  const resFactor = preset.width > 1920 ? 2 : 1;
  const timeoutMs = Math.max(300_000, durationSec * 30_000 * qualityFactor * resFactor);
  pipeline.setTimeout(Math.min(timeoutMs, 7200_000)); // Max 2 hours

  await pipeline.run(onProgress);
}

// ── Project Tree Loading ────────────────────────────────────────────────────

/**
 * Loads the complete project tree from PostgreSQL:
 *   project → tracks → clips → effects + keyframes
 *
 * Uses individual queries (no ORM) with proper index usage.
 * All queries are within a single connection (no transaction needed
 * since this is a read-only snapshot).
 */
async function loadProjectTree(projectId: string): Promise<ProjectTree> {
  // Load project
  const projectRes = await query<EditorProject>(
    'SELECT * FROM editor_projects WHERE id = $1',
    [projectId],
  );
  const project = projectRes.rows[0];
  if (!project) throw new Error(`Project not found: ${projectId}`);

  // Load tracks
  const tracksRes = await query<EditorTrack>(
    'SELECT * FROM editor_tracks WHERE project_id = $1 ORDER BY sort_order ASC',
    [projectId],
  );

  // Load all clips for this project
  const clipsRes = await query<EditorClip>(
    'SELECT * FROM editor_clips WHERE project_id = $1 ORDER BY sort_order ASC, start_ms ASC',
    [projectId],
  );

  // Load all effects for this project
  const effectsRes = await query<EditorEffect>(
    'SELECT * FROM editor_effects WHERE project_id = $1 ORDER BY sort_order ASC',
    [projectId],
  );

  // Load all keyframes for this project
  const keyframesRes = await query<EditorKeyframe>(
    'SELECT * FROM editor_keyframes WHERE project_id = $1 ORDER BY time_ms ASC',
    [projectId],
  );

  // Build lookup maps for efficient tree construction
  const effectsByClip = new Map<string, EditorEffect[]>();
  for (const effect of effectsRes.rows) {
    const existing = effectsByClip.get(effect.clip_id) ?? [];
    existing.push(effect);
    effectsByClip.set(effect.clip_id, existing);
  }

  const keyframesByClip = new Map<string, EditorKeyframe[]>();
  for (const kf of keyframesRes.rows) {
    const existing = keyframesByClip.get(kf.clip_id) ?? [];
    existing.push(kf);
    keyframesByClip.set(kf.clip_id, existing);
  }

  const clipsByTrack = new Map<string, ClipWithEffectsAndKeyframes[]>();
  for (const clip of clipsRes.rows) {
    const augmented: ClipWithEffectsAndKeyframes = {
      ...clip,
      effects: effectsByClip.get(clip.id) ?? [],
      keyframes: keyframesByClip.get(clip.id) ?? [],
    };
    const existing = clipsByTrack.get(clip.track_id) ?? [];
    existing.push(augmented);
    clipsByTrack.set(clip.track_id, existing);
  }

  // Assemble tracks with clips
  const tracks: TrackWithClips[] = tracksRes.rows.map((track) => ({
    ...track,
    clips: clipsByTrack.get(track.id) ?? [],
  }));

  logger.info({
    event: 'project_tree_loaded',
    projectId,
    trackCount: tracks.length,
    clipCount: clipsRes.rows.length,
    effectCount: effectsRes.rows.length,
    keyframeCount: keyframesRes.rows.length,
  });

  return { project, tracks };
}

// ── Status Update Helpers ───────────────────────────────────────────────────

/**
 * Updates job status and progress in the database.
 * Uses a WHERE clause to prevent stale updates on cancelled jobs.
 */
async function updateJobStatus(
  jobId: string,
  status: string,
  progress: number,
  phase?: string,
): Promise<void> {
  const updateFields = phase
    ? `status = $2, progress = $3, settings = settings || $4::jsonb, updated_at = NOW()`
    : `status = $2, progress = $3, updated_at = NOW()`;

  const params = phase
    ? [jobId, status, progress, JSON.stringify({ current_phase: phase })]
    : [jobId, status, progress];

  await query(
    `UPDATE render_jobs SET ${updateFields}
     WHERE id = $1 AND status NOT IN ('cancelled', 'completed', 'failed')`,
    params,
  );
}

/**
 * Publishes a log entry to both the database and Redis pub/sub.
 *
 * DB: render_job_logs table (permanent record)
 * Redis: render:{jobId}:logs channel (real-time SSE streaming)
 */
async function publishLog(
  jobId: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  // Insert into DB (fire-and-forget with error catch)
  try {
    await query(
      `INSERT INTO render_job_logs (job_id, level, message, data)
       VALUES ($1, $2, $3, $4)`,
      [jobId, level, message, data ? JSON.stringify(data) : null],
    );
  } catch (err) {
    logger.warn({
      event: 'render_log_db_insert_failed',
      jobId,
      err: (err as Error).message,
    });
  }

  // Publish to Redis pub/sub for SSE
  try {
    const pub = getPublisher();
    const payload = JSON.stringify({
      jobId,
      level,
      message,
      data: data ?? null,
      timestamp: new Date().toISOString(),
      ...((data?.['event'] ? { event: data['event'] } : {})),
    });

    await pub.publish(`render:${jobId}:logs`, payload);
  } catch (err) {
    logger.warn({
      event: 'render_log_publish_failed',
      jobId,
      err: (err as Error).message,
    });
  }
}

/**
 * Checks if a job has been cancelled by the user.
 * Reads from DB to ensure we see the latest status.
 */
async function isCancelled(jobId: string): Promise<boolean> {
  const res = await query<{ status: string }>(
    'SELECT status FROM render_jobs WHERE id = $1',
    [jobId],
  );
  return res.rows[0]?.status === 'cancelled';
}
