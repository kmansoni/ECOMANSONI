/**
 * timeline-service.ts — Business logic for tracks and clips (timeline operations).
 *
 * All mutations verify ownership via project -> user_id check.
 * reorderTracks runs in a single transaction for consistency.
 * splitClip delegates to the split_clip SQL function.
 */

import { logger } from '../logger.js';
import { query, transaction } from '../db.js';
import { config } from '../config.js';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../errors.js';
import type { EditorTrack, EditorClip } from '../types.js';
import { z } from 'zod';
import {
  CreateTrackSchema,
  UpdateTrackSchema,
  CreateClipSchema,
  UpdateClipSchema,
  ReorderTracksSchema,
} from '../types.js';

export type CreateTrackInput = z.infer<typeof CreateTrackSchema>;
export type UpdateTrackInput = z.infer<typeof UpdateTrackSchema>;
export type CreateClipInput = z.infer<typeof CreateClipSchema>;
export type UpdateClipInput = z.infer<typeof UpdateClipSchema>;
export type ReorderItem = z.infer<typeof ReorderTracksSchema>[number];

// ─── Ownership helpers ────────────────────────────────────────────────────

async function assertProjectOwnership(projectId: string, userId: string): Promise<void> {
  const res = await query<{ user_id: string }>(
    'SELECT user_id FROM editor_projects WHERE id = $1',
    [projectId],
  );
  const project = res.rows[0];
  if (!project) throw new NotFoundError('Project', projectId);
  if (project.user_id !== userId) throw new ForbiddenError();
}

// ─── Tracks ───────────────────────────────────────────────────────────────

export async function createTrack(
  projectId: string,
  userId: string,
  data: CreateTrackInput,
): Promise<EditorTrack> {
  await assertProjectOwnership(projectId, userId);

  // Enforce track limit
  const countRes = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM editor_tracks WHERE project_id = $1',
    [projectId],
  );
  if (parseInt(countRes.rows[0]?.count ?? '0', 10) >= config.limits.maxTracksPerProject) {
    throw new ConflictError(`Track limit reached (max ${config.limits.maxTracksPerProject})`);
  }

  // Auto-assign sort_order if not provided
  let sortOrder = data.sort_order;
  if (sortOrder === undefined) {
    const maxRes = await query<{ max: number | null }>(
      'SELECT MAX(sort_order) AS max FROM editor_tracks WHERE project_id = $1',
      [projectId],
    );
    sortOrder = (maxRes.rows[0]?.max ?? -1) + 1;
  }

  const res = await query<EditorTrack>(
    `INSERT INTO editor_tracks
       (project_id, type, name, sort_order, is_locked, is_visible, volume, opacity, blend_mode)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      projectId,
      data.type,
      data.name,
      sortOrder,
      data.is_locked ?? false,
      data.is_visible ?? true,
      data.volume ?? 1,
      data.opacity ?? 1,
      data.blend_mode ?? 'normal',
    ],
  );

  const track = res.rows[0]!;
  logger.info({ event: 'track_created', trackId: track.id, projectId, userId });
  return track;
}

export async function updateTrack(
  trackId: string,
  projectId: string,
  userId: string,
  data: UpdateTrackInput,
): Promise<EditorTrack> {
  await assertProjectOwnership(projectId, userId);

  const existing = await query<EditorTrack>(
    'SELECT * FROM editor_tracks WHERE id = $1 AND project_id = $2',
    [trackId, projectId],
  );
  if (!existing.rows[0]) throw new NotFoundError('Track', trackId);

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const fields: (keyof UpdateTrackInput)[] = [
    'name', 'sort_order', 'is_locked', 'is_visible', 'volume', 'opacity', 'blend_mode',
  ];
  for (const field of fields) {
    if (data[field] !== undefined) {
      setClauses.push(`${field} = $${idx++}`);
      values.push(data[field]);
    }
  }

  if (setClauses.length === 0) return existing.rows[0]!;

  setClauses.push(`updated_at = NOW()`);
  values.push(trackId, projectId);

  const res = await query<EditorTrack>(
    `UPDATE editor_tracks SET ${setClauses.join(', ')} WHERE id = $${idx} AND project_id = $${idx + 1} RETURNING *`,
    values,
  );
  return res.rows[0]!;
}

export async function deleteTrack(
  trackId: string,
  projectId: string,
  userId: string,
): Promise<void> {
  await assertProjectOwnership(projectId, userId);

  const trackRes = await query<EditorTrack>(
    'SELECT * FROM editor_tracks WHERE id = $1 AND project_id = $2',
    [trackId, projectId],
  );
  const track = trackRes.rows[0];
  if (!track) throw new NotFoundError('Track', trackId);

  // Prevent deletion of last video track
  if (track.type === 'video') {
    const videoCountRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM editor_tracks
       WHERE project_id = $1 AND type = 'video'`,
      [projectId],
    );
    if (parseInt(videoCountRes.rows[0]?.count ?? '0', 10) <= 1) {
      throw new ValidationError('Cannot delete the last video track');
    }
  }

  await query('DELETE FROM editor_tracks WHERE id = $1', [trackId]);
  logger.info({ event: 'track_deleted', trackId, projectId, userId });
}

export async function reorderTracks(
  projectId: string,
  userId: string,
  items: ReorderItem[],
): Promise<void> {
  await assertProjectOwnership(projectId, userId);

  await transaction(async (client) => {
    for (const item of items) {
      await client.query(
        `UPDATE editor_tracks SET sort_order = $1, updated_at = NOW()
         WHERE id = $2 AND project_id = $3`,
        [item.sort_order, item.id, projectId],
      );
    }
  });

  logger.info({ event: 'tracks_reordered', projectId, userId, count: items.length });
}

// ─── Clips ────────────────────────────────────────────────────────────────

export async function createClip(
  projectId: string,
  userId: string,
  data: CreateClipInput,
): Promise<EditorClip> {
  await assertProjectOwnership(projectId, userId);

  // Verify track belongs to the project
  const trackRes = await query<EditorTrack>(
    'SELECT id FROM editor_tracks WHERE id = $1 AND project_id = $2',
    [data.track_id, projectId],
  );
  if (!trackRes.rows[0]) throw new NotFoundError('Track', data.track_id);

  // Enforce clip limit per track
  const countRes = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM editor_clips WHERE track_id = $1',
    [data.track_id],
  );
  if (parseInt(countRes.rows[0]?.count ?? '0', 10) >= config.limits.maxClipsPerTrack) {
    throw new ConflictError(`Clip limit reached (max ${config.limits.maxClipsPerTrack})`);
  }

  const res = await query<EditorClip>(
    `INSERT INTO editor_clips
       (track_id, project_id, type, name, start_ms, duration_ms, source_url,
        source_start_ms, source_end_ms, volume, speed, speed_ramp,
        transform, crop, filters, transition_in, transition_out,
        text_content, text_style, sticker_id, sort_order, is_reversed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     RETURNING *`,
    [
      data.track_id,
      projectId,
      data.type,
      data.name ?? data.type,
      data.start_ms,
      data.duration_ms,
      data.source_url ?? null,
      data.source_start_ms ?? 0,
      data.source_end_ms ?? null,
      data.volume ?? 1,
      data.speed ?? 1,
      data.speed_ramp ? JSON.stringify(data.speed_ramp) : null,
      JSON.stringify(data.transform ?? {}),
      JSON.stringify(data.crop ?? {}),
      JSON.stringify(data.filters ?? []),
      data.transition_in ? JSON.stringify(data.transition_in) : null,
      data.transition_out ? JSON.stringify(data.transition_out) : null,
      data.text_content ?? null,
      data.text_style ? JSON.stringify(data.text_style) : null,
      data.sticker_id ?? null,
      data.sort_order ?? 0,
      data.is_reversed ?? false,
    ],
  );

  const clip = res.rows[0]!;
  logger.info({ event: 'clip_created', clipId: clip.id, trackId: data.track_id, projectId });
  return clip;
}

export async function listClips(
  projectId: string,
  userId: string,
): Promise<EditorClip[]> {
  await assertProjectOwnership(projectId, userId);

  const res = await query<EditorClip>(
    'SELECT * FROM editor_clips WHERE project_id = $1 ORDER BY track_id, sort_order ASC',
    [projectId],
  );
  return res.rows;
}

export async function updateClip(
  clipId: string,
  projectId: string,
  userId: string,
  data: UpdateClipInput,
): Promise<EditorClip> {
  await assertProjectOwnership(projectId, userId);

  const existing = await query<EditorClip>(
    'SELECT * FROM editor_clips WHERE id = $1 AND project_id = $2',
    [clipId, projectId],
  );
  if (!existing.rows[0]) throw new NotFoundError('Clip', clipId);

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const jsonFields = new Set(['speed_ramp', 'transform', 'crop', 'filters', 'transition_in', 'transition_out', 'text_style']);
  const fields: (keyof UpdateClipInput)[] = [
    'name', 'start_ms', 'duration_ms', 'source_url', 'source_start_ms', 'source_end_ms',
    'volume', 'speed', 'speed_ramp', 'transform', 'crop', 'filters',
    'transition_in', 'transition_out', 'text_content', 'text_style',
    'sticker_id', 'sort_order', 'is_reversed',
  ];

  for (const field of fields) {
    if (data[field] !== undefined) {
      const value = jsonFields.has(field) ? JSON.stringify(data[field]) : data[field];
      setClauses.push(`${field} = $${idx++}`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) return existing.rows[0]!;

  setClauses.push(`updated_at = NOW()`);
  values.push(clipId, projectId);

  const res = await query<EditorClip>(
    `UPDATE editor_clips SET ${setClauses.join(', ')} WHERE id = $${idx} AND project_id = $${idx + 1} RETURNING *`,
    values,
  );
  return res.rows[0]!;
}

export async function deleteClip(
  clipId: string,
  projectId: string,
  userId: string,
): Promise<void> {
  await assertProjectOwnership(projectId, userId);

  const existing = await query<EditorClip>(
    'SELECT id FROM editor_clips WHERE id = $1 AND project_id = $2',
    [clipId, projectId],
  );
  if (!existing.rows[0]) throw new NotFoundError('Clip', clipId);

  await query('DELETE FROM editor_clips WHERE id = $1', [clipId]);
  logger.info({ event: 'clip_deleted', clipId, projectId, userId });
}

export async function splitClip(
  clipId: string,
  projectId: string,
  userId: string,
  splitAtMs: number,
): Promise<EditorClip[]> {
  await assertProjectOwnership(projectId, userId);

  const existing = await query<EditorClip>(
    'SELECT * FROM editor_clips WHERE id = $1 AND project_id = $2',
    [clipId, projectId],
  );
  const clip = existing.rows[0];
  if (!clip) throw new NotFoundError('Clip', clipId);

  if (splitAtMs <= clip.start_ms || splitAtMs >= clip.start_ms + clip.duration_ms) {
    throw new ValidationError('split_at_ms must be within clip boundaries');
  }

  // Call SQL function — returns two rows (original trimmed + new clip)
  const res = await query<EditorClip>(
    'SELECT * FROM split_clip($1, $2)',
    [clipId, splitAtMs],
  );

  logger.info({ event: 'clip_split', clipId, projectId, splitAtMs });
  return res.rows;
}

export async function duplicateClip(
  clipId: string,
  projectId: string,
  userId: string,
): Promise<EditorClip> {
  await assertProjectOwnership(projectId, userId);

  const existing = await query<EditorClip>(
    'SELECT * FROM editor_clips WHERE id = $1 AND project_id = $2',
    [clipId, projectId],
  );
  const clip = existing.rows[0];
  if (!clip) throw new NotFoundError('Clip', clipId);

  // Place duplicate immediately after the original on the timeline
  const newStartMs = clip.start_ms + clip.duration_ms;

  const res = await query<EditorClip>(
    `INSERT INTO editor_clips
       (track_id, project_id, type, name, start_ms, duration_ms, source_url,
        source_start_ms, source_end_ms, volume, speed, speed_ramp,
        transform, crop, filters, transition_in, transition_out,
        text_content, text_style, sticker_id, sort_order, is_reversed)
     SELECT track_id, project_id, type, name || ' (copy)', $2, duration_ms, source_url,
            source_start_ms, source_end_ms, volume, speed, speed_ramp,
            transform, crop, filters, transition_in, transition_out,
            text_content, text_style, sticker_id, sort_order + 1, is_reversed
     FROM editor_clips WHERE id = $1
     RETURNING *`,
    [clipId, newStartMs],
  );

  const newClip = res.rows[0]!;
  logger.info({ event: 'clip_duplicated', sourceId: clipId, newId: newClip.id, projectId });
  return newClip;
}
