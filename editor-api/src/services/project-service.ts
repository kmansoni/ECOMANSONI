/**
 * project-service.ts — Business logic for editor projects.
 *
 * All mutations go through ownership checks.
 * createProject always runs inside a transaction to ensure
 * atomic project + default tracks creation.
 */

import { logger } from '../logger.js';
import { query, transaction } from '../db.js';
import { config } from '../config.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../errors.js';
import type {
  EditorProject,
  ProjectTree,
  TrackWithClips,
  ClipWithEffectsAndKeyframes,
} from '../types.js';
import { z } from 'zod';
import { CreateProjectSchema, UpdateProjectSchema } from '../types.js';

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

export interface ListProjectsOptions {
  limit?: number;
  offset?: number;
  sort?: 'created_at' | 'updated_at' | 'title';
  order?: 'asc' | 'desc';
}

/**
 * Create a new project with default video and audio tracks.
 * Enforces per-user project limit before inserting.
 */
export async function createProject(
  userId: string,
  data: CreateProjectInput,
): Promise<EditorProject> {
  // Rate-gate: count existing projects before inserting
  const countRes = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM editor_projects WHERE user_id = $1',
    [userId],
  );
  const count = parseInt(countRes.rows[0]?.count ?? '0', 10);
  if (count >= config.limits.maxProjectsPerUser) {
    throw new ConflictError(
      `Project limit reached (max ${config.limits.maxProjectsPerUser})`,
    );
  }

  return transaction(async (client) => {
    const projectRes = await client.query<EditorProject>(
      `INSERT INTO editor_projects
         (user_id, title, description, aspect_ratio,
          resolution_width, resolution_height, fps, settings)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        userId,
        data.title,
        data.description ?? null,
        data.aspect_ratio ?? '16:9',
        data.resolution_width ?? 1920,
        data.resolution_height ?? 1080,
        data.fps ?? 30,
        JSON.stringify(data.settings ?? {}),
      ],
    );

    const project = projectRes.rows[0];
    if (!project) throw new Error('Failed to create project');

    // Default video track
    await client.query(
      `INSERT INTO editor_tracks (project_id, type, name, sort_order)
       VALUES ($1,'video','Video',$2)`,
      [project.id, 0],
    );

    // Default audio track
    await client.query(
      `INSERT INTO editor_tracks (project_id, type, name, sort_order)
       VALUES ($1,'audio','Audio',$2)`,
      [project.id, 1],
    );

    logger.info({ event: 'project_created', projectId: project.id, userId });
    return project;
  });
}

/**
 * Fetch full project tree: project → tracks → clips → effects → keyframes.
 * Enforces ownership.
 */
export async function getProjectTree(
  projectId: string,
  userId: string,
): Promise<ProjectTree> {
  const projectRes = await query<EditorProject>(
    'SELECT * FROM editor_projects WHERE id = $1',
    [projectId],
  );
  const project = projectRes.rows[0];
  if (!project) throw new NotFoundError('Project', projectId);
  if (project.user_id !== userId) throw new ForbiddenError();

  // Fetch all tracks for this project
  const tracksRes = await query<TrackWithClips>(
    'SELECT * FROM editor_tracks WHERE project_id = $1 ORDER BY sort_order ASC',
    [projectId],
  );

  const tracks: TrackWithClips[] = tracksRes.rows.map((t) => ({ ...t, clips: [] }));
  const trackMap = new Map(tracks.map((t) => [t.id, t]));

  if (tracks.length > 0) {
    // Fetch all clips for the project in a single query
    const clipsRes = await query<ClipWithEffectsAndKeyframes>(
      `SELECT * FROM editor_clips WHERE project_id = $1 ORDER BY track_id, sort_order ASC`,
      [projectId],
    );

    const clips: ClipWithEffectsAndKeyframes[] = clipsRes.rows.map((c) => ({
      ...c,
      effects: [],
      keyframes: [],
    }));
    const clipMap = new Map(clips.map((c) => [c.id, c]));

    // Attach clips to tracks
    for (const clip of clips) {
      const track = trackMap.get(clip.track_id);
      if (track) track.clips.push(clip);
    }

    if (clips.length > 0) {
      const clipIds = clips.map((c) => c.id);
      const placeholders = clipIds.map((_, i) => `$${i + 1}`).join(',');

      // Fetch effects for all clips
      const effectsRes = await query(
        `SELECT * FROM editor_effects WHERE clip_id IN (${placeholders}) ORDER BY sort_order ASC`,
        clipIds,
      );
      for (const effect of effectsRes.rows) {
        const clip = clipMap.get(effect.clip_id as string);
        if (clip) clip.effects.push(effect as never);
      }

      // Fetch keyframes for all clips
      const kfRes = await query(
        `SELECT * FROM editor_keyframes WHERE clip_id IN (${placeholders}) ORDER BY time_ms ASC`,
        clipIds,
      );
      for (const kf of kfRes.rows) {
        const clip = clipMap.get(kf.clip_id as string);
        if (clip) clip.keyframes.push(kf as never);
      }
    }
  }

  return { project, tracks };
}

/**
 * List projects for a user with pagination and sorting.
 */
export async function listProjects(
  userId: string,
  opts: ListProjectsOptions = {},
): Promise<{ projects: EditorProject[]; total: number }> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = opts.offset ?? 0;
  const sort = ['created_at', 'updated_at', 'title'].includes(opts.sort ?? '')
    ? opts.sort ?? 'updated_at'
    : 'updated_at';
  const order = opts.order === 'asc' ? 'ASC' : 'DESC';

  const [dataRes, countRes] = await Promise.all([
    query<EditorProject>(
      `SELECT * FROM editor_projects WHERE user_id = $1
       ORDER BY ${sort} ${order}
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    ),
    query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM editor_projects WHERE user_id = $1',
      [userId],
    ),
  ]);

  return {
    projects: dataRes.rows,
    total: parseInt(countRes.rows[0]?.count ?? '0', 10),
  };
}

/**
 * Partially update project metadata. Enforces ownership.
 */
export async function updateProject(
  projectId: string,
  userId: string,
  data: UpdateProjectInput,
): Promise<EditorProject> {
  const existing = await query<EditorProject>(
    'SELECT id, user_id FROM editor_projects WHERE id = $1',
    [projectId],
  );
  const project = existing.rows[0];
  if (!project) throw new NotFoundError('Project', projectId);
  if (project.user_id !== userId) throw new ForbiddenError();

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const fields: (keyof UpdateProjectInput)[] = [
    'title', 'description', 'aspect_ratio', 'resolution_width',
    'resolution_height', 'fps', 'settings',
  ];

  for (const field of fields) {
    if (data[field] !== undefined) {
      const dbValue = field === 'settings' ? JSON.stringify(data[field]) : data[field];
      setClauses.push(`${field} = $${idx++}`);
      values.push(dbValue);
    }
  }

  if (setClauses.length === 0) {
    // No changes — return current
    const res = await query<EditorProject>('SELECT * FROM editor_projects WHERE id = $1', [projectId]);
    return res.rows[0]!;
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(projectId);

  const res = await query<EditorProject>(
    `UPDATE editor_projects SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );

  logger.info({ event: 'project_updated', projectId, userId });
  return res.rows[0]!;
}

/**
 * Delete project and all cascaded data. Enforces ownership.
 */
export async function deleteProject(
  projectId: string,
  userId: string,
): Promise<void> {
  const existing = await query<EditorProject>(
    'SELECT id, user_id FROM editor_projects WHERE id = $1',
    [projectId],
  );
  const project = existing.rows[0];
  if (!project) throw new NotFoundError('Project', projectId);
  if (project.user_id !== userId) throw new ForbiddenError();

  await query('DELETE FROM editor_projects WHERE id = $1', [projectId]);
  logger.info({ event: 'project_deleted', projectId, userId });
}

/**
 * Duplicate project using the DB-level SQL function.
 * Returns the newly created project.
 */
export async function duplicateProject(
  projectId: string,
  userId: string,
): Promise<EditorProject> {
  const existing = await query<EditorProject>(
    'SELECT id, user_id FROM editor_projects WHERE id = $1',
    [projectId],
  );
  const project = existing.rows[0];
  if (!project) throw new NotFoundError('Project', projectId);
  if (project.user_id !== userId) throw new ForbiddenError();

  // Call DB function that deep-copies project + all tracks/clips/effects/keyframes
  const res = await query<EditorProject>(
    'SELECT * FROM duplicate_project($1, $2)',
    [projectId, userId],
  );
  const newProject = res.rows[0];
  if (!newProject) throw new Error('duplicate_project returned no rows');

  logger.info({ event: 'project_duplicated', sourceId: projectId, newId: newProject.id, userId });
  return newProject;
}
