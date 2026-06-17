// Content Core — Edge Function: media-containers-publish
// Atomic publish with owner check, optimistic lock, idempotency
// POST /media/containers/:id/publish

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ulid } from 'https://esm.sh/ulid';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, Idempotency-Key',
};

interface PublishRequest {
  visibility?: string;
  caption?: string;
  hashtags?: string[];
}

interface PublishResponse {
  contentItemId: string;
  status: string;
  version: number;
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

    // Extract container ID from URL path
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const containerId = pathParts[pathParts.length - 2]; // /media/containers/:id/publish
    const idempotencyKey = req.headers.get('Idempotency-Key') ?? ulid();

    const body: PublishRequest = await req.json();

    // Validate visibility
    const validVisibilities = ['public', 'followers', 'close_friends', 'private'];
    const visibility = body.visibility ?? 'public';
    if (!validVisibilities.includes(visibility)) {
      return new Response(JSON.stringify({ error: 'Invalid visibility' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get current asset state
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .select('id, owner_id, status, aggregate_version')
      .eq('id', containerId)
      .single();

    if (assetError || !asset) {
      return new Response(JSON.stringify({ error: 'Asset not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check ownership
    if (asset.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if asset is ready for publish
    if (asset.status !== 'READY') {
      return new Response(JSON.stringify({
        error: 'Asset not ready for publish',
        currentStatus: asset.status,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call atomic_publish function
    const { data: publishResult, error: publishError } = await supabase
      .rpc('atomic_publish', {
        p_asset_id: containerId,
        p_owner_id: user.id,
        p_expected_version: asset.aggregate_version,
        p_idempotency_key: idempotencyKey,
        p_target_status: 'READY',
        p_visibility: visibility,
      });

    if (publishError) {
      console.error('Publish error:', publishError);
      return new Response(JSON.stringify({ error: 'Publish failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = publishResult?.[0];
    if (!result || !result.success) {
      return new Response(JSON.stringify({
        error: result?.error_message ?? 'Publish failed',
        currentVersion: result?.new_version ?? asset.aggregate_version,
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response: PublishResponse = {
      contentItemId: containerId,
      status: 'published',
      version: result.new_version,
      idempotent: result.idempotent,
    };

    return new Response(JSON.stringify(response), {
      status: result.idempotent ? 200 : 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Publish error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
