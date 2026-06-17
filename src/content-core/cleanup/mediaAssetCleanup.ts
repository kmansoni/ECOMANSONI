// Content Core вЂ” Media Asset Cleanup
// Orphan detection, soft delete, hard delete, and retention policies

function generateId(): string { return crypto.randomUUID(); }
import type { MediaAsset, MediaAssetStatus, ContentAssetReference } from '../domain/listing';

// ============================================================================
// Cleanup Types
// ============================================================================

export type CleanupStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface CleanupTask {
  id: string;
  assetId: string;
  action: 'soft_delete' | 'hard_delete' | 'cdn_purge';
  status: CleanupStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  retryCount: number;
}

export interface CleanupPolicy {
  softDeleteRetentionDays: number;
  hardDeleteRetentionDays: number;
  orphanCheckIntervalHours: number;
  batchSize: number;
  cdnPurgeBeforeHardDelete: boolean;
}

export const DEFAULT_CLEANUP_POLICY: CleanupPolicy = {
  softDeleteRetentionDays: 7,
  hardDeleteRetentionDays: 30,
  orphanCheckIntervalHours: 1,
  batchSize: 100,
  cdnPurgeBeforeHardDelete: true,
};

// ============================================================================
// Orphan Detection
// ============================================================================

export interface OrphanCheckResult {
  assetId: string;
  isOrphan: boolean;
  referenceCount: number;
  references: ContentAssetReference[];
  lastReferencedAt: string | null;
}

export function checkOrphanStatus(
  asset: MediaAsset,
  references: ContentAssetReference[]
): OrphanCheckResult {
  const assetReferences = references.filter((ref) => ref.assetId === asset.id);

  // Filter out withdrawn references (they don't count)
  const activeReferences = assetReferences.filter((ref) => ref.withdrawnAt === null);

  const lastReferenced = activeReferences.length > 0
    ? activeReferences.reduce((latest, ref) =>
        new Date(ref.createdAt) > new Date(latest.createdAt) ? ref : latest
      )
    : null;

  return {
    assetId: asset.id,
    isOrphan: activeReferences.length === 0,
    referenceCount: activeReferences.length,
    references: activeReferences,
    lastReferencedAt: lastReferenced?.createdAt ?? null,
  };
}

export function findOrphanAssets(
  assets: MediaAsset[],
  references: ContentAssetReference[],
  statusFilter: MediaAssetStatus[] = ['ready', 'flagged']
): OrphanCheckResult[] {
  return assets
    .filter((asset) => statusFilter.includes(asset.status))
    .map((asset) => checkOrphanStatus(asset, references))
    .filter((result) => result.isOrphan);
}

// ============================================================================
// Cleanup Task Factory
// ============================================================================

export function createCleanupTask(
  assetId: string,
  action: 'soft_delete' | 'hard_delete' | 'cdn_purge'
): CleanupTask {
  return {
    id: generateId(),
    assetId,
    action,
    status: 'pending',
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    error: null,
    retryCount: 0,
  };
}

export function createCleanupTasksForOrphans(
  orphanAssets: OrphanCheckResult[],
  action: 'soft_delete' | 'hard_delete'
): CleanupTask[] {
  return orphanAssets.map((orphan) =>
    createCleanupTask(orphan.assetId, action)
  );
}

// ============================================================================
// Soft Delete
// ============================================================================

export function markForSoftDelete(asset: MediaAsset): MediaAsset {
  return {
    ...asset,
    status: 'orphaned',
    updatedAt: new Date().toISOString(),
  };
}

export function isEligibleForSoftDelete(
  asset: MediaAsset,
  orphanResult: OrphanCheckResult,
  policy: CleanupPolicy
): { eligible: boolean; reason?: string } {
  // Must be an orphan
  if (!orphanResult.isOrphan) {
    return { eligible: false, reason: 'Asset has active references' };
  }

  // Must not already be soft-deleted
  if (asset.status === 'orphaned') {
    return { eligible: false, reason: 'Already soft-deleted' };
  }

  // Must be in eligible status
  const eligibleStatuses: MediaAssetStatus[] = ['ready', 'flagged'];
  if (!eligibleStatuses.includes(asset.status)) {
    return { eligible: false, reason: `Asset in ${asset.status} status` };
  }

  return { eligible: true };
}

// ============================================================================
// Hard Delete
// ============================================================================

export function isEligibleForHardDelete(
  asset: MediaAsset,
  policy: CleanupPolicy
): { eligible: boolean; reason?: string; daysUntilEligible?: number } {
  // Must be soft-deleted
  if (asset.status !== 'orphaned') {
    return { eligible: false, reason: 'Asset not soft-deleted' };
  }

  const updatedAt = new Date(asset.updatedAt);
  const now = new Date();
  const daysSinceSoftDelete = Math.floor(
    (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const daysUntilEligible = policy.hardDeleteRetentionDays - daysSinceSoftDelete;

  if (daysUntilEligible > 0) {
    return {
      eligible: false,
      reason: `Retention period not expired (${daysUntilEligible} days remaining)`,
      daysUntilEligible,
    };
  }

  return { eligible: true };
}

export function markForHardDelete(asset: MediaAsset): MediaAsset {
  return {
    ...asset,
    status: 'deleted',
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// CDN Purge
// ============================================================================

export interface CdnPurgeResult {
  success: boolean;
  assetId: string;
  purgedPaths: string[];
  error?: string;
}

export async function purgeCdnPaths(
  asset: MediaAsset,
  paths: string[]
): Promise<CdnPurgeResult> {
  // In production, this would call the CDN's purge API
  // Example: CloudFlare API, Fastly purge, etc.
  const purgedPaths: string[] = [];

  for (const path of paths) {
    try {
      // Simulate CDN purge
      console.log(`[CDN] Purging: ${path}`);
      purgedPaths.push(path);
    } catch (error) {
      return {
        success: false,
        assetId: asset.id,
        purgedPaths,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    success: true,
    assetId: asset.id,
    purgedPaths,
  };
}

export function generateCdnPaths(asset: MediaAsset): string[] {
  const paths: string[] = [];

  // Original path
  if (asset.originalPath) {
    paths.push(asset.originalPath);
  }

  // Variant paths
  for (const variant of asset.variants) {
    paths.push(variant.path);
  }

  // Thumbnails
  paths.push(`thumbnails/${asset.id}/thumb.jpg`);

  // Covers
  paths.push(`covers/${asset.id}/cover.jpg`);

  // Previews
  paths.push(`previews/${asset.id}/preview.mp4`);

  return paths;
}

// ============================================================================
// Cleanup Task State Machine
// ============================================================================

export function startTask(task: CleanupTask): CleanupTask {
  return {
    ...task,
    status: 'processing',
    startedAt: new Date().toISOString(),
  };
}

export function completeTask(task: CleanupTask): CleanupTask {
  return {
    ...task,
    status: 'completed',
    completedAt: new Date().toISOString(),
  };
}

export function failTask(task: CleanupTask, error: string): CleanupTask {
  return {
    ...task,
    status: 'failed',
    error,
    retryCount: task.retryCount + 1,
  };
}

export function resetTask(task: CleanupTask): CleanupTask {
  return {
    ...task,
    status: 'pending',
    error: null,
  };
}

// ============================================================================
// Cleanup Orchestrator
// ============================================================================

export interface CleanupBatch {
  tasks: CleanupTask[];
  successCount: number;
  failureCount: number;
  skippedCount: number;
}

export async function executeSoftDeleteBatch(
  assets: MediaAsset[],
  references: ContentAssetReference[],
  policy: CleanupPolicy = DEFAULT_CLEANUP_POLICY
): Promise<CleanupBatch> {
  const tasks: CleanupTask[] = [];
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  for (const asset of assets) {
    const orphanResult = checkOrphanStatus(asset, references);
    const eligibility = isEligibleForSoftDelete(asset, orphanResult, policy);

    if (!eligibility.eligible) {
      skippedCount++;
      continue;
    }

    const task = createCleanupTask(asset.id, 'soft_delete');
    const startedTask = startTask(task);

    try {
      // Apply soft delete
      const softDeletedAsset = markForSoftDelete(asset);

      // Complete task
      tasks.push(completeTask(startedTask));
      successCount++;

      // In production: persist softDeletedAsset to database
      console.log(`[Cleanup] Soft-deleted asset: ${asset.id}`);
    } catch (error) {
      const failedTask = failTask(
        startedTask,
        error instanceof Error ? error.message : String(error)
      );
      tasks.push(failedTask);
      failureCount++;
    }
  }

  return { tasks, successCount, failureCount, skippedCount };
}

export async function executeHardDeleteBatch(
  assets: MediaAsset[],
  policy: CleanupPolicy = DEFAULT_CLEANUP_POLICY
): Promise<CleanupBatch> {
  const tasks: CleanupTask[] = [];
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  for (const asset of assets) {
    const eligibility = isEligibleForHardDelete(asset, policy);

    if (!eligibility.eligible) {
      skippedCount++;
      continue;
    }

    const task = createCleanupTask(asset.id, 'hard_delete');
    const startedTask = startTask(task);

    try {
      // Purge CDN first if policy requires
      if (policy.cdnPurgeBeforeHardDelete) {
        const cdnPaths = generateCdnPaths(asset);
        const purgeResult = await purgeCdnPaths(asset, cdnPaths);

        if (!purgeResult.success) {
          throw new Error(`CDN purge failed: ${purgeResult.error}`);
        }
      }

      // Apply hard delete
      const hardDeletedAsset = markForHardDelete(asset);

      // Complete task
      tasks.push(completeTask(startedTask));
      successCount++;

      // In production: persist hardDeletedAsset to database
      console.log(`[Cleanup] Hard-deleted asset: ${asset.id}`);
    } catch (error) {
      const failedTask = failTask(
        startedTask,
        error instanceof Error ? error.message : String(error)
      );
      tasks.push(failedTask);
      failureCount++;
    }
  }

  return { tasks, successCount, failureCount, skippedCount };
}

// ============================================================================
// Retention Policy Enforcement
// ============================================================================

export interface RetentionStats {
  totalAssets: number;
  activeAssets: number;
  orphanedAssets: number;
  softDeletedAssets: number;
  eligibleForHardDelete: number;
  daysUntilNextHardDelete: number[];
}

export function computeRetentionStats(
  assets: MediaAsset[],
  references: ContentAssetReference[],
  policy: CleanupPolicy = DEFAULT_CLEANUP_POLICY
): RetentionStats {
  const activeStatuses: MediaAssetStatus[] = ['ready', 'processing', 'flagged'];
  const activeAssets = assets.filter((a) => activeStatuses.includes(a.status));
  const orphanedAssets = assets.filter((a) => a.status === 'orphaned');
  const softDeletedAssets = assets.filter((a) => a.status === 'deleted');

  let eligibleForHardDelete = 0;
  const daysUntilNextHardDelete: number[] = [];

  for (const asset of orphanedAssets) {
    const eligibility = isEligibleForHardDelete(asset, policy);
    if (eligibility.eligible) {
      eligibleForHardDelete++;
    } else if (eligibility.daysUntilEligible !== undefined) {
      daysUntilNextHardDelete.push(eligibility.daysUntilEligible);
    }
  }

  return {
    totalAssets: assets.length,
    activeAssets: activeAssets.length,
    orphanedAssets: orphanedAssets.length,
    softDeletedAssets: softDeletedAssets.length,
    eligibleForHardDelete,
    daysUntilNextHardDelete: daysUntilNextHardDelete.sort((a, b) => a - b),
  };
}

// ============================================================================
// Cleanup Schedule
// ============================================================================

export interface CleanupSchedule {
  nextOrphanCheckAt: string;
  nextHardDeleteAt: string;
  nextMetricsReportAt: string;
}

export function computeNextCleanupSchedule(
  policy: CleanupPolicy = DEFAULT_CLEANUP_POLICY
): CleanupSchedule {
  const now = new Date();

  const nextOrphanCheck = new Date(now);
  nextOrphanCheck.setHours(nextOrphanCheck.getHours() + policy.orphanCheckIntervalHours);

  const nextHardDelete = new Date(now);
  nextHardDelete.setDate(nextHardDelete.getDate() + 1); // Daily hard delete run

  const nextMetricsReport = new Date(now);
  nextMetricsReport.setDate(nextMetricsReport.getDate() + 1); // Daily metrics

  return {
    nextOrphanCheckAt: nextOrphanCheck.toISOString(),
    nextHardDeleteAt: nextHardDelete.toISOString(),
    nextMetricsReportAt: nextMetricsReport.toISOString(),
  };
}
