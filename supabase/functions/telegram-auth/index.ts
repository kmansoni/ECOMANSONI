/**
 * Telegram Auth Edge Function
 *
 * Verifiziert Telegram OAuth-Daten und erstellt Supabase-Session.
 *
 * Telegram Login Widget sendet: id, first_name, last_name, username, photo_url, auth_date, hash
 * Hash-Formel: SHA256(bot_token:request_data)
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCors, getCorsHeaders, checkRateLimit, rateLimitResponse, getClientId } from '../_shared/utils.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface TelegramAuthPayload {
  telegram_id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
  is_premium?: boolean;
  language_code?: string;
  start_param?: string;
}

function checkString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Verifiziert Telegram-Hash
 * Formel: SHA256(bot_token:sorted_key_value_pairs)
 */
async function verifyTelegramHash(
  payload: TelegramAuthPayload
): Promise<boolean> {
  if (!telegramBotToken) {
    console.error('[telegram-auth] TELEGRAM_BOT_TOKEN not configured');
    return false;
  }

  // Build data check string (sorted keys, excluding hash)
  const dataToCheck = Object.entries(payload)
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // SHA256(bot_token:data_check_string)
  const secret = new TextEncoder().encode(telegramBotToken);
  const key = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(dataToCheck)
  );

  const computedHash = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return computedHash === payload.hash;
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');

  // Rate limiting - 30 attempts per minute per IP (auth endpoint)
  const rl = checkRateLimit(getClientId(req), 30);
  if (!rl.allowed) {
    return rateLimitResponse(rl.resetIn, origin);
  }

  let payload: TelegramAuthPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) } }
    );
  }

  const {
    telegram_id,
    first_name,
    last_name,
    username,
    photo_url,
    auth_date,
    hash,
  } = payload;

  if (!telegram_id || !auth_date || !hash) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) } }
    );
  }

  // Verify hash
  const isValid = await verifyTelegramHash(payload);
  if (!isValid) {
    console.error('[telegram-auth] Invalid hash', { telegram_id });
    return new Response(
      JSON.stringify({ error: 'Invalid Telegram signature' }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) } }
    );
  }

  // Check auth_date is not too old (24h)
  const authTimestamp = parseInt(auth_date, 10);
  const now = Math.floor(Date.now() / 1000);
  if (now - authTimestamp > 86400) {
    return new Response(
      JSON.stringify({ error: 'Telegram auth expired' }),
      { status: 401, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) } }
    );
  }

  try {
    // Find or create user
    const { data: existingUser, error: findError } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('telegram_id', telegram_id)
      .maybeSingle();

    let userId: string;

    if (findError) {
      console.error('[telegram-auth] DB error', findError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) } }
      );
    }

    if (existingUser) {
      userId = existingUser.user_id;
      // Update existing user with fresh Telegram data
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          display_name: [first_name, last_name].filter(Boolean).join(' ') || undefined,
          full_name: [first_name, last_name].filter(Boolean).join(' ') || undefined,
          first_name: first_name || null,
          last_name: last_name || null,
          username: username || null,
          avatar_url: photo_url || null,
          is_premium: payload.is_premium ?? false,
          language_code: payload.language_code || null,
          last_login_at: new Date().toISOString(),
          referral_code: payload.start_param || null,
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('[telegram-auth] Profile update error', updateError);
      }
    } else {
      // Create new user in Supabase Auth
      const email = `${telegram_id}@telegram.mansoni.app`;
      const randomPassword = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          telegram_id,
          full_name: [first_name, last_name].filter(Boolean).join(' '),
          first_name: first_name || '',
          last_name: last_name || '',
          username: username || '',
          avatar_url: photo_url || '',
          is_premium: payload.is_premium ?? false,
          language_code: payload.language_code || '',
          referral_code: payload.start_param || '',
        },
      });

      if (createError || !newUser?.user) {
        console.error('[telegram-auth] User creation error', createError);
        return new Response(
          JSON.stringify({ error: 'Failed to create user' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) } }
        );
      }

      userId = newUser.user.id;

      // Create profile with all fields
      await supabase.from('profiles').insert({
        user_id: userId,
        telegram_id,
        display_name: [first_name, last_name].filter(Boolean).join(' '),
        full_name: [first_name, last_name].filter(Boolean).join(' '),
        first_name: first_name || null,
        last_name: last_name || null,
        username: username || null,
        avatar_url: photo_url || null,
        is_premium: payload.is_premium ?? false,
        language_code: payload.language_code || null,
        last_login_at: new Date().toISOString(),
        referral_code: payload.start_param || null,
      });
    }

    // Generate session
    const { data: session, error: sessionError } = await supabase.auth.admin.createSession({
      user_id: userId,
    });

    if (sessionError || !session) {
      console.error('[telegram-auth] Session error', sessionError);
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) } }
      );
    }

    return new Response(
      JSON.stringify({ session }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) } }
    );
  } catch (err) {
    console.error('[telegram-auth] Unexpected error', err);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) } }
    );
  }
});