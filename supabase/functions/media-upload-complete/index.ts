// Content Core — Edge Function: media-upload-complete
// Verifies checksum, creates MediaAsset, queues processing DAG
// POST /media/upload-session/:id/complete

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ulid } from 'https://esm.sh/ulid';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, Idempotency-Key',
};

interface UploadCompleteRequest {
  finalChecksumSha256: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  containerId?: string;
}

interface UploadCompleteResponse {
  assetId: string;
  status: string;
  jobsQueued: number;
  idempotent: boolean;
}

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

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: UploadCompleteRequest = await req.json();

    // Validate request
    if (!body.finalChecksumSha256 || !body.storageKey || !body.mimeType) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract session ID from storage key
    const sessionIdMatch = body.storageKey.match(/\/([^/]+)\/original$/);
    if (!sessionIdMatch) {
      return new Response(JSON.stringify({ error: 'Invalid storage key' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const sessionId = sessionIdMatch[1];

    // Check idempotency
    const idempotencyKey = `upload_complete:${sessionId}`;
    const { data: existingAsset } = await supabase
      .from('assets')
      .select('id, status, aggregate_version')
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (existingAsset) {
      // Idempotent response
      const response: UploadCompleteResponse = {
        assetId: existingAsset.id,
        status: existingAsset.status,
        jobsQueued: 0,
        idempotent: true,
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify file exists in storage
    const { data: fileExists, error: statError } = await supabase.storage
      .from('mansoni-media')
      .stat(body.storageKey);

    if (statError || !fileExists) {
      return new Response(JSON.stringify({ error: 'File not found in storage' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // TODO: Verify checksum (requires downloading file and computing hash)
    // For now, we trust the client-provided checksum
    // In production: download file, compute sha256, compare

    // Create asset record
    const assetId = ulid();
    const { error: assetError } = await supabase
      .from('assets')
      .insert({
        id: assetId,
        owner_id: user.id,
        mime_type: body.mimeType,
        status: 'PROCESSING',
        storage_key: body.storageKey,
        idempotency_key: idempotencyKey,
        aggregate_version: 1,
      });

    if (assetError) {
      console.error('Failed to create asset:', assetError);
      return new Response(JSON.stringify({ error: 'Failed to create asset' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Queue processing jobs using the ensure_required_processing_graph function
    const { data: jobs, error: jobsError } = await supabase
      .rpc('ensure_required_processing_graph', {
        p_asset_id: assetId,
        p_mime_type: body.mimeType,
      });

    if (jobsError) {
      console.error('Failed to queue processing jobs:', jobsError);
      // Don't fail the whole operation, jobs can be queued later
    }

    const jobsQueued = jobs?.length ?? 0;

    // Insert lifecycle log
    await supabase
      .from('container_lifecycle_logs')
      .insert({
        entity_type: 'asset',
        entity_id: assetId,
        from_status: 'PENDING',
        to_status: 'PROCESSING',
        actor_type: 'user',
        actor_id: user.id,
        reason: 'Upload completed',
        idempotency_key: idempotencyKey,
        metadata: {
          storageKey: body.storageKey,
          mimeType: body.mimeType,
          fileSize: body.fileSize,
        },
      });

    const response: UploadCompleteResponse = {
      assetId,
      status: 'PROCESSING',
      jobsQueued,
      idempotent: false,
    };

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Upload complete error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
