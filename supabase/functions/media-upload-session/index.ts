// Content Core — Edge Function: media-upload-session
// Creates upload session and returns signed URL for direct upload
// POST /media/upload-session

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ulid } from 'https://esm.sh/ulid';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, Idempotency-Key',
};

interface UploadSessionRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksumSha256: string;
  containerId?: string;
}

interface UploadSessionResponse {
  uploadSessionId: string;
  uploadUrl: string;
  expiresAt: string;
  storageKey: string;
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

    const body: UploadSessionRequest = await req.json();

    // Validate request
    if (!body.fileName || !body.fileSize || !body.mimeType || !body.checksumSha256) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate mime type
    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
      'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac',
    ];
    if (!allowedMimeTypes.includes(body.mimeType)) {
      return new Response(JSON.stringify({ error: 'Unsupported mime type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate file size (max 500MB)
    const maxFileSize = 500 * 1024 * 1024;
    if (body.fileSize > maxFileSize) {
      return new Response(JSON.stringify({ error: 'File too large' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate storage key
    const sessionId = ulid();
    const storageKey = `uploads/${user.id}/${sessionId}/original`;

    // Create signed URL for upload
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    const { data: signedUrl, error: signError } = await supabase.storage
      .from('mansoni-media')
      .createSignedUploadUrl(storageKey);

    if (signError) {
      console.error('Failed to create signed URL:', signError);
      return new Response(JSON.stringify({ error: 'Failed to create upload URL' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Store upload session metadata (in production, use a dedicated table)
    // For now, we rely on the storage key for tracking

    const response: UploadSessionResponse = {
      uploadSessionId: sessionId,
      uploadUrl: signedUrl.signedUrl,
      expiresAt: expiresAt.toISOString(),
      storageKey,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Upload session error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
