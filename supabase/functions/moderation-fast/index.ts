// Content Core — Edge Function: moderation-fast
// Fast moderation stage: hash lookup, CSAM detection
// Triggered on processing_jobs completion

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ulid } from 'https://esm.sh/ulid';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ModerationSignal {
  algorithm: string;
  flags: string[];
  confidence: number;
  processingTimeMs: number;
}

interface FastModerationResult {
  decision: 'allow' | 'reject' | 'quarantine';
  flags: string[];
  confidence: number;
  requiresDeepScan: boolean;
  signals: ModerationSignal[];
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

    const body = await req.json();
    const { assetId, storageKey, mimeType } = body;

    if (!assetId) {
      return new Response(JSON.stringify({ error: 'Missing assetId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();
    const signals: ModerationSignal[] = [];
    const flags: string[] = [];

    // 1. Hash lookup - check against known content databases
    // In production, this would query a hash database (PhotoDNA, MD5, etc.)
    const hashLookupResult = await performHashLookup(supabase, storageKey);
    if (hashLookupResult.flag) {
      flags.push(hashLookupResult.flag);
      signals.push({
        algorithm: 'hash_lookup',
        flags: [hashLookupResult.flag],
        confidence: 0.99,
        processingTimeMs: hashLookupResult.processingTimeMs,
      });
    }

    // 2. CSAM detection - check for child sexual abuse material
    // In production, this would use a specialized CSAM detection service
    const csamResult = await performCsamCheck(supabase, assetId);
    if (csamResult.detected) {
      flags.push('csam');
      signals.push({
        algorithm: 'csam_detector',
        flags: ['csam'],
        confidence: 0.99,
        processingTimeMs: csamResult.processingTimeMs,
      });
    }

    // 3. Text safety check (for images with text, video thumbnails)
    // In production, this would use OCR + text classification
    if (mimeType?.startsWith('image/') || mimeType?.startsWith('video/')) {
      const textSafetyResult = await performTextSafetyCheck(supabase, assetId);
      if (textSafetyResult.flags.length > 0) {
        flags.push(...textSafetyResult.flags);
        signals.push({
          algorithm: 'text_safety',
          flags: textSafetyResult.flags,
          confidence: textSafetyResult.confidence,
          processingTimeMs: textSafetyResult.processingTimeMs,
        });
      }
    }

    const processingTimeMs = Date.now() - startTime;

    // Determine decision
    let decision: 'allow' | 'reject' | 'quarantine' = 'allow';
    let confidence = 0.1;
    let requiresDeepScan = true;

    if (flags.includes('csam') || flags.includes('terrorist_content')) {
      decision = 'quarantine';
      confidence = 0.99;
      requiresDeepScan = false;
    } else if (flags.length > 0) {
      // Other flags detected in fast stage
      confidence = 0.85;
      requiresDeepScan = true;
    }

    const result: FastModerationResult = {
      decision,
      flags,
      confidence,
      requiresDeepScan,
      signals,
    };

    // Store moderation signal (in production, this would create a moderation_case record)
    // For now, log the result
    console.log('[FastModeration]', JSON.stringify({
      assetId,
      result,
      processingTimeMs,
    }));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Fast moderation error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ============================================================================
// Fast Moderation Algorithms
// ============================================================================

async function performHashLookup(
  supabase: ReturnType<typeof createClient>,
  storageKey: string | undefined
): Promise<{ flag: string | null; processingTimeMs: number }> {
  const startTime = Date.now();

  // In production:
  // 1. Compute hash of the file
  // 2. Query against hash databases (NCMEC, IWF, etc.)
  // 3. Return matching flag if found

  // Simulated: check if storageKey contains known bad patterns
  if (storageKey?.includes('known_violation') || storageKey?.includes('csam_hash')) {
    return {
      flag: 'csam',
      processingTimeMs: Date.now() - startTime,
    };
  }

  return {
    flag: null,
    processingTimeMs: Date.now() - startTime,
  };
}

async function performCsamCheck(
  supabase: ReturnType<typeof createClient>,
  assetId: string
): Promise<{ detected: boolean; processingTimeMs: number }> {
  const startTime = Date.now();

  // In production, this would call a specialized CSAM detection API
  // e.g., Microsoft PhotoDNA, Google Content Safety API, etc.

  // For demo: always pass fast stage
  return {
    detected: false,
    processingTimeMs: Date.now() - startTime,
  };
}

async function performTextSafetyCheck(
  supabase: ReturnType<typeof createClient>,
  assetId: string
): Promise<{ flags: string[]; confidence: number; processingTimeMs: number }> {
  const startTime = Date.now();

  // In production:
  // 1. Extract text from image/video (OCR)
  // 2. Classify text using text safety model
  // 3. Return flags if violations detected

  return {
    flags: [],
    confidence: 0.1,
    processingTimeMs: Date.now() - startTime,
  };
}
