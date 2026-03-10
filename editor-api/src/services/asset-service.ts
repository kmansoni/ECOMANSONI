/**
 * asset-service.ts — User asset management.
 *
 * Assets are registered after upload via media-server.
 * Deletion removes from both DB and MinIO.
 */

import { logger } from '../logger.js';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { query } from '../db.js';
import { config } from '../config.js';
import { NotFoundError, ForbiddenError } from '../errors.js';
import type { EditorAsset } from '../types.js';
import { z } from 'zod';
import { RegisterAssetSchema } from '../types.js';

export type RegisterAssetInput = z.infer<typeof RegisterAssetSchema>;

const s3 = new S3Client({
  endpoint: config.minio.endpoint,
  region: config.minio.region,
  credentials: {
    accessKeyId: config.minio.accessKey,
    secretAccessKey: config.minio.secretKey,
  },
  forcePathStyle: true,
});

export async function registerAsset(
  userId: string,
  data: RegisterAssetInput,
): Promise<EditorAsset> {
  const res = await query<EditorAsset>(
    `INSERT INTO editor_assets
       (user_id, project_id, type, name, url, thumbnail_url, size_bytes,
        duration_ms, width, height, mime_type, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      userId,
      data.project_id ?? null,
      data.type,
      data.name,
      data.url,
      data.thumbnail_url ?? null,
      data.size_bytes,
      data.duration_ms ?? null,
      data.width ?? null,
      data.height ?? null,
      data.mime_type,
      JSON.stringify(data.metadata ?? {}),
    ],
  );

  const asset = res.rows[0]!;
  logger.info({ event: 'asset_registered', assetId: asset.id, userId, type: data.type });
  return asset;
}

export async function listAssets(
  userId: string,
  type?: string,
  projectId?: string,
): Promise<EditorAsset[]> {
  const conditions: string[] = ['user_id = $1'];
  const values: unknown[] = [userId];
  let idx = 2;

  if (type) {
    conditions.push(`type = $${idx++}`);
    values.push(type);
  }
  if (projectId) {
    conditions.push(`project_id = $${idx++}`);
    values.push(projectId);
  }

  const res = await query<EditorAsset>(
    `SELECT * FROM editor_assets WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
    values,
  );
  return res.rows;
}

export async function deleteAsset(assetId: string, userId: string): Promise<void> {
  const existing = await query<EditorAsset>(
    'SELECT * FROM editor_assets WHERE id = $1',
    [assetId],
  );
  const asset = existing.rows[0];
  if (!asset) throw new NotFoundError('Asset', assetId);
  if (asset.user_id !== userId) throw new ForbiddenError();

  // Extract bucket and key from asset URL
  // URL format: https://{domain}/{bucket}/{key}
  try {
    const url = new URL(asset.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const bucket = parts[0]!;
      const key = parts.slice(1).join('/');
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
  } catch (err) {
    // Log MinIO deletion failure but don't block DB deletion
    // Orphaned objects can be cleaned via MinIO lifecycle rules
    logger.warn({ event: 'asset_minio_delete_failed', assetId, err: (err as Error).message });
  }

  await query('DELETE FROM editor_assets WHERE id = $1', [assetId]);
  logger.info({ event: 'asset_deleted', assetId, userId });
}
