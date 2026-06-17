// Content Core — Edge Function: media-cleanup
// pg_cron every hour - orphan detection, soft delete, hard delete
// Retention: soft delete after 7 days orphan, hard delete after 30 days

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLEANUP_CONFIG = {
  softDeleteRetentionDays: 7,
  hardDeleteRetentionDays: 30,
  batchSize: 100,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const results = {
      softDeletes: 0,
      hardDeletes: 0,
      cdnPurges: 0,
      errors: [] as string[],
    };

    // Step 1: Find orphan assets (no active references)
    const orphanAssets = await findOrphanAssets(supabase);
    console.log(`[Cleanup] Found ${orphanAssets.length} orphan assets`);

    // Step 2: Soft delete assets that have been orphan for >= retention period
    const softDeleteCutoff = new Date();
    softDeleteCutoff.setDate(softDeleteCutoff.getDate() - CLEANUP_CONFIG.softDeleteRetentionDays);

    const assetsToSoftDelete = orphanAssets.filter((asset) =>
      new Date(asset.updated_at) <= softDeleteCutoff
    );

    for (const asset of assetsToSoftDelete.slice(0, CLEANUP_CONFIG.batchSize)) {
      try {
        await softDeleteAsset(supabase, asset);
        results.softDeletes++;
      } catch (error) {
        results.errors.push(`Soft delete failed for ${asset.id}: ${error}`);
      }
    }

    // Step 3: Hard delete assets that have been soft-deleted for >= retention period
    const hardDeleteCutoff = new Date();
    hardDeleteCutoff.setDate(hardDeleteCutoff.getDate() - CLEANUP_CONFIG.hardDeleteRetentionDays);

    const { data: orphanedAssets } = await supabase
      .from('assets')
      .select('id, storage_key')
      .eq('status', 'ORPHANED')
      .lte('updated_at', hardDeleteCutoff.toISOString())
      .limit(CLEANUP_CONFIG.batchSize);

    if (orphanedAssets) {
      for (const asset of orphanedAssets) {
        try {
          // Purge CDN first
          if (asset.storage_key) {
            await purgeCdnPaths(supabase, asset.storage_key);
            results.cdnPurges++;
          }

          // Hard delete
          await hardDeleteAsset(supabase, asset.id);
          results.hardDeletes++;
        } catch (error) {
          results.errors.push(`Hard delete failed for ${asset.id}: ${error}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    return new Response(JSON.stringify({
      error: 'Cleanup failed',
      message: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ============================================================================
// Cleanup Operations
// ============================================================================

interface OrphanAsset {
  id: string;
  owner_id: string;
  status: string;
  storage_key: string | null;
  updated_at: string;
}

async function findOrphanAssets(
  supabase: ReturnType<typeof createClient>
): Promise<OrphanAsset[]> {
  // Find assets that are ready but have no active content_asset_references
  const { data, error } = await supabase
    .from('assets')
    .select('id, owner_id, status, storage_key, updated_at')
    .eq('status', 'READY')
    .limit(1000);

  if (error) {
    console.error('Failed to fetch assets:', error);
    return [];
  }

  // Filter out assets that have active references
  // In production, this would be a more efficient SQL query with JOIN
  const orphanAssets: OrphanAsset[] = [];

  for (const asset of data ?? []) {
    const { data: refs } = await supabase
      .from('content_asset_references')
      .select('id')
      .eq('asset_id', asset.id)
      .is('withdrawn_at', null)
      .limit(1);

    if (!refs || refs.length === 0) {
      orphanAssets.push(asset);
    }
  }

  return orphanAssets;
}

async function softDeleteAsset(
  supabase: ReturnType<typeof createClient>,
  asset: OrphanAsset
): Promise<void> {
  // Update status to ORPHANED (soft delete)
  const { error } = await supabase
    .from('assets')
    .update({
      status: 'ORPHANED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', asset.id)
    .eq('status', 'READY'); // Only if still in READY status

  if (error) {
    throw error;
  }

  // Log the transition
  await supabase
    .from('container_lifecycle_logs')
    .insert({
      entity_type: 'asset',
      entity_id: asset.id,
      from_status: 'READY',
      to_status: 'ORPHANED',
      actor_type: 'system',
      actor_id: '00000000-0000-0000-0000-000000000000', // System user
      reason: 'Orphan cleanup: no active references',
      metadata: { storageKey: asset.storage_key },
    });

  console.log(`[Cleanup] Soft-deleted asset: ${asset.id}`);
}

async function hardDeleteAsset(
  supabase: ReturnType<typeof createClient>,
  assetId: string
): Promise<void> {
  // Hard delete: remove from database and storage
  const { error } = await supabase
    .from('assets')
    .delete()
    .eq('id', assetId);

  if (error) {
    throw error;
  }

  // Log the deletion
  await supabase
    .from('container_lifecycle_logs')
    .insert({
      entity_type: 'asset',
      entity_id: assetId,
      from_status: 'ORPHANED',
      to_status: 'DELETED',
      actor_type: 'system',
      actor_id: '00000000-0000-0000-0000-000000000000',
      reason: 'Hard delete: retention period expired',
      metadata: {},
    });

  console.log(`[Cleanup] Hard-deleted asset: ${assetId}`);
}

async function purgeCdnPaths(
  supabase: ReturnType<typeof createClient>,
  storageKey: string
): Promise<void> {
  // In production, this would call the CDN's purge API
  // e.g., CloudFlare, Fastly, etc.

  // For demo, we just log the purge
  console.log(`[Cleanup] CDN purge: ${storageKey}`);

  // In production:
  // await supabase.storage.from('mansoni-media').remove([storageKey]);
}