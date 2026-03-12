/**
 * validate-key-session — Edge Function для серверной валидации E2EE PreKeyBundle
 *
 * Проверяет корректность PreKeyBundle при первом контакте между пользователями:
 *   1. Все обязательные поля присутствуют и имеют правильный формат
 *   2. Signed Pre-Key подпись верифицируется identity ключом
 *   3. One-time Pre-Key (OPK) аннулируется атомарно (single-use enforcement)
 *   4. Fingerprint identity key совпадает с публично опубликованным в БД
 *
 * НЕ имеет доступа к приватным ключам участников.
 * НЕ кеширует, НЕ логирует key material.
 *
 * POST /validate-key-session
 * Body: { userId: string, preKeyBundle: PreKeyBundle, clientPublicKey: string }
 * Response: { valid: boolean, reason?: string, consumedOpkId?: string }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/utils.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PreKeyBundle {
  identityKeyPublic: string;    // base64 SPKI ECDH P-256
  signedPreKeyPublic: string;   // base64 SPKI ECDH P-256
  signedPreKeySignature: string; // base64 ECDSA-P256-SHA256 signature
  oneTimePreKeyPublic?: string; // base64 SPKI ECDH P-256
  oneTimePreKeyId?: string;     // UUID of the OPK record
}

interface ValidateRequest {
  userId: string;
  preKeyBundle: PreKeyBundle;
  clientPublicKey?: string; // base64 SPKI — caller's identity key (for mutual auth)
}

interface ValidateResponse {
  valid: boolean;
  reason?: string;
  consumedOpkId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function b64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function importEcdhSpki(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    b64ToArrayBuffer(spkiB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
}

async function importEcdsaSpki(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    b64ToArrayBuffer(spkiB64),
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );
}

async function sha256Fingerprint(spkiB64: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', b64ToArrayBuffer(spkiB64));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(req) });
  }

  let body: ValidateRequest;
  try {
    body = await req.json() as ValidateRequest;
  } catch {
    return jsonResponse({ valid: false, reason: 'Invalid JSON body' }, 400, req);
  }

  const { userId, preKeyBundle } = body;

  // ── 1. Input validation ─────────────────────────────────────────────────
  if (!userId || typeof userId !== 'string' || userId.length > 128) {
    return jsonResponse({ valid: false, reason: 'userId missing or invalid' }, 400, req);
  }
  if (
    !preKeyBundle?.identityKeyPublic ||
    !preKeyBundle?.signedPreKeyPublic ||
    !preKeyBundle?.signedPreKeySignature
  ) {
    return jsonResponse({ valid: false, reason: 'preKeyBundle missing required fields' }, 400, req);
  }

  // ── 2. Parse keys (fail-fast on malformed base64/SPKI) ─────────────────
  let identityKey: CryptoKey;
  let signedPreKey: CryptoKey;

  try {
    identityKey = await importEcdsaSpki(preKeyBundle.identityKeyPublic);
    signedPreKey = await importEcdhSpki(preKeyBundle.signedPreKeyPublic);
  } catch (e) {
    return jsonResponse({ valid: false, reason: `Key parse error: ${(e as Error).message}` }, 400, req);
  }

  // ── 3. Verify SPK signature ─────────────────────────────────────────────
  // Signed data: SPKI bytes of signedPreKeyPublic
  let spkSigValid: boolean;
  try {
    spkSigValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      identityKey,
      b64ToArrayBuffer(preKeyBundle.signedPreKeySignature),
      b64ToArrayBuffer(preKeyBundle.signedPreKeyPublic),
    );
  } catch {
    spkSigValid = false;
  }

  if (!spkSigValid) {
    return jsonResponse(
      { valid: false, reason: 'Signed pre-key signature verification failed' },
      422,
      req,
    );
  }

  // ── 4. Verify identity key matches DB record ────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: dbRecord, error: dbErr } = await supabase
    .from('user_encryption_keys')
    .select('public_key_raw, fingerprint')
    .eq('user_id', userId)
    .maybeSingle();

  if (dbErr) {
    return jsonResponse({ valid: false, reason: 'DB lookup error' }, 500, req);
  }
  if (!dbRecord) {
    return jsonResponse({ valid: false, reason: 'No published identity key found for userId' }, 422, req);
  }

  // Compare fingerprint of submitted key vs stored record
  const submittedFingerprint = await sha256Fingerprint(preKeyBundle.identityKeyPublic);
  if (submittedFingerprint !== dbRecord.fingerprint) {
    return jsonResponse(
      { valid: false, reason: 'Identity key fingerprint mismatch — possible key substitution' },
      422,
      req,
    );
  }

  // ── 5. OPK single-use enforcement ──────────────────────────────────────
  let consumedOpkId: string | undefined;
  if (preKeyBundle.oneTimePreKeyId) {
    const opkId = preKeyBundle.oneTimePreKeyId;

    // Atomic delete-and-check: only delete if record exists and belongs to userId
    const { data: opkRow, error: opkErr } = await supabase
      .from('one_time_prekeys')
      .delete()
      .eq('id', opkId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();

    if (opkErr) {
      // Log server-side, return generic error (do not reveal DB schema)
      console.error('[validate-key-session] OPK delete error:', opkErr.message);
      return jsonResponse({ valid: false, reason: 'OPK validation error' }, 500, req);
    }

    if (!opkRow) {
      // OPK already consumed or never existed — reject
      return jsonResponse(
        { valid: false, reason: 'One-time pre-key already used or invalid' },
        422,
        req,
      );
    }

    consumedOpkId = opkRow.id;
  }

  // ── 6. All checks passed ────────────────────────────────────────────────
  return jsonResponse({ valid: true, consumedOpkId }, 200, req);
});

function jsonResponse(body: ValidateResponse, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}
