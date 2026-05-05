/**
 * Edge Function: record-ad-impression
 *
 * Серверная запись впечатлений (impressions, clicks, conversions).
 * Клиенты НЕ могут писать напрямую в ad_impressions (RLS запрещён).
 *
 * Security:
 * - Rate limiting: 30 req/min на (viewer_id + creative_id)
 * - Deduplication: ±10 минут на одинаковые (viewer_id, creative_id, action)
 * - Creative validation: только approved/active креативы
 * - Input validation: schema проверка
 *
 * Environ:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Body: { creative_id, viewer_id?, action, client_ts?, metadata? }
 */

import { serve } from 'std/http/server.ts';
import { createClient } from 'supabase';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false },
  db: { schema: 'public' }
});

// In-memory rate limiter: { key: [timestamps] }
// В продакшене: Redis или Supabase rate_limit table
const rateLimits = new Map<string, number[]>();

const RATE_LIMIT = 30;        // max requests
const RATE_WINDOW_SEC = 60;   // per minute
const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 минут

interface ImpressionRequest {
  creative_id: string;
  viewer_id?: string;
  action: 'impression' | 'click' | 'conversion';
  client_ts?: string;
  metadata?: Record<string, unknown>;
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const windowMs = RATE_WINDOW_SEC * 1000;
  const timestamps = rateLimits.get(key) || [];

  const recent = timestamps.filter(t => now - t < windowMs);
  if (recent.length >= RATE_LIMIT) return true;

  recent.push(now);
  rateLimits.set(key, recent);
  return false;
}

function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

async function validateCreative(creativeId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('ad_creatives')
    .select('id, status, deleted_at')
    .eq('id', creativeId)
    .single();

  if (error || !data) return false;
  return data.deleted_at IS NULL && data.status === 'approved';
}

async function isDuplicate(
  creativeId: string,
  viewerId: string | null,
  action: string,
  clientTs?: string
): Promise<boolean> {
  const timeThreshold = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

  const { count } = await supabase
    .from('ad_impressions')
    .select('*', { count: 'exact', head: true })
    .eq('creative_id', creativeId)
    .eq('viewer_id', viewerId)
    .eq('action', action)
    .gte('created_at', timeThreshold);

  return (count ?? 0) > 0;
}

serve(async (req: Request): Promise<Response> => {
  const start = Date.now();

  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }

  let body: ImpressionRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const { creative_id, viewer_id, action, client_ts, metadata } = body;

  // === Валидация входных данных ===
  const errors: string[] = [];

  if (!creative_id) errors.push('creative_id required');
  else if (!isValidUUID(creative_id)) errors.push('creative_id invalid UUID');

  if (!action) errors.push('action required');
  else if (!['impression', 'click', 'conversion'].includes(action)) {
    errors.push('action must be impression|click|conversion');
  }

  if (client_ts) {
    const ts = parseInt(client_ts, 10);
    if (isNaN(ts) || ts <= 0) errors.push('client_ts must be valid timestamp');
  }

  if (errors.length > 0) {
    return jsonError(errors.join('; '), 400);
  }

  // === Rate limiting ===
  const rateKey = `${viewer_id ?? 'anon'}:${creative_id}`;
  if (isRateLimited(rateKey)) {
    return jsonError('Rate limit exceeded', 429);
  }

  try {
    // === Проверка креатива ===
    const creativeValid = await validateCreative(creative_id);
    if (!creativeValid) {
      return jsonError('Creative not found or not approved', 404);
    }

    // === Deduplication ===
    if (await isDuplicate(creative_id, viewer_id ?? null, action, client_ts)) {
      return jsonResponse({ success: true, duplicate: true });
    }

    // === Вставка впечатления ===
    const { error: insertErr } = await supabase.from('ad_impressions').insert({
      creative_id,
      viewer_id: viewer_id ?? null,
      action,
      created_at: client_ts ? new Date(parseInt(client_ts, 10)).toISOString() : new Date().toISOString(),
      metadata: metadata ?? {},
    });

    if (insertErr) {
      console.error('Failed to insert impression:', insertErr);
      return jsonError('Failed to record impression', 500);
    }

    const durationMs = Date.now() - start;
    console.log(`[impression] ${action} ${creative_id} viewer=${viewer_id} in ${durationMs}ms`);

    return jsonResponse({ success: true });

  } catch (error) {
    console.error('Impression recording exception:', error);
    return jsonError('Internal server error', 500);
  }
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function jsonError(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}
