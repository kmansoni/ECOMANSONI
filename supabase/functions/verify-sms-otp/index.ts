import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceCors, getCorsHeaders, handleCors } from "../_shared/utils.ts";

const MAX_ATTEMPTS = 5;

type AdminLookupClient = {
  auth: {
    admin: {
      listUsers(params: { page: number; perPage: number }): Promise<{
        data?: { users?: Array<{ id: string; email?: string | null }> };
        error?: { message: string } | null;
      }>;
    };
  };
};

/**
 * Derive the deterministic HMAC-based password for the SMS OTP auth path.
 * This ensures verify-sms-otp creates users / signs in with
 * the exact same credentials on repeated verifications.
 */
async function derivePassword(normalizedPhone: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", keyMaterial, encoder.encode(normalizedPhone));
  const hexHmac = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `v1:${hexHmac}`;
}

async function findAuthUserByEmail(adminClient: AdminLookupClient, email: string) {
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) return { user: null, error };
  const user = (data?.users ?? []).find((entry) => String(entry.email ?? "").toLowerCase() === email.toLowerCase()) ?? null;
  return { user, error: null };
}

serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { phone, code, challenge_id, displayName } = await req.json();

    if (!phone || !code) {
      return new Response(
        JSON.stringify({ error: "Телефон и код обязательны" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedPhone = phone.replace(/\D/g, "");
    const normalizedCode = code.trim();

    // Validate code format early — reject non-6-digit codes before any DB work.
    if (!/^\d{6}$/.test(normalizedCode)) {
      return new Response(
        JSON.stringify({ error: "Неверный формат кода. Ожидается 6 цифр." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const phoneAuthSecret = Deno.env.get("PHONE_AUTH_SECRET");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[verify-sms-otp] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ error: "Server not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!phoneAuthSecret) {
      console.error("[verify-sms-otp] PHONE_AUTH_SECRET env var is not set");
      return new Response(
        JSON.stringify({ error: "Server misconfiguration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Look up the OTP record in DB ──────────────────────────────────────
    let otpLookup = supabase
      .from("phone_otps")
      .select("*")
      .eq("phone", normalizedPhone);

    if (challenge_id) {
      otpLookup = otpLookup.eq("id", challenge_id);
    }

    const { data: otpRecord, error: fetchError } = await otpLookup.single();

    if (fetchError || !otpRecord) {
      return new Response(
        JSON.stringify({ error: "Код подтверждения не найден. Запросите новый." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check expiry
    if (new Date(otpRecord.expires_at) < new Date()) {
      let deleteExpired = supabase.from("phone_otps").delete().eq("phone", normalizedPhone);
      if (challenge_id) {
        deleteExpired = deleteExpired.eq("id", challenge_id);
      }
      await deleteExpired;
      return new Response(
        JSON.stringify({ error: "Код истёк. Запросите новый." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check attempts
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      let deleteAttempts = supabase.from("phone_otps").delete().eq("phone", normalizedPhone);
      if (challenge_id) {
        deleteAttempts = deleteAttempts.eq("id", challenge_id);
      }
      await deleteAttempts;
      return new Response(
        JSON.stringify({ error: "Слишком много попыток. Запросите новый код." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Timing-safe comparison: pads both to same length, no early exit on length mismatch.
    function timingSafeEqual(a: string, b: string): boolean {
      const enc = new TextEncoder();
      const bufA = enc.encode(a);
      const bufB = enc.encode(b);
      const len = Math.max(bufA.length, bufB.length);
      const padA = new Uint8Array(len);
      const padB = new Uint8Array(len);
      padA.set(bufA);
      padB.set(bufB);
      let diff = bufA.length ^ bufB.length;
      for (let i = 0; i < len; i++) {
        diff |= padA[i] ^ padB[i];
      }
      return diff === 0;
    }

    if (!timingSafeEqual(otpRecord.code, normalizedCode)) {
      let updateAttempts = supabase
        .from("phone_otps")
        .update({ attempts: otpRecord.attempts + 1 })
        .eq("phone", normalizedPhone);
      if (challenge_id) {
        updateAttempts = updateAttempts.eq("id", challenge_id);
      }
      await updateAttempts;

      const remaining = MAX_ATTEMPTS - otpRecord.attempts - 1;
      return new Response(
        JSON.stringify({
          error: `Неверный код. Осталось попыток: ${remaining}.`,
          remainingAttempts: remaining,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── OTP is valid — delete it and create/sign-in user ─────────────────
    let deleteValid = supabase.from("phone_otps").delete().eq("phone", normalizedPhone);
    if (challenge_id) {
      deleteValid = deleteValid.eq("id", challenge_id);
    }
    await deleteValid;

    // Use the deterministic email+password pattern so repeated SMS OTP logins share one account.
    const fakeEmail = `user.${normalizedPhone}@phoneauth.app`;
    const fakePassword = await derivePassword(normalizedPhone, phoneAuthSecret);

    const anonKey =
      req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";

    // Try to find existing user
    let userId: string;
    let isNewUser = false;

    const { user: existingUser, error: existingUserLookupError } = await findAuthUserByEmail(supabase, fakeEmail);
    if (existingUserLookupError) {
      console.error("[verify-sms-otp] Existing user lookup error:", existingUserLookupError.message);
      return new Response(
        JSON.stringify({ error: "Не удалось проверить существующий аккаунт" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!existingUser) {
      // Create new user
      const { data: newUserData, error: createError } = await supabase.auth.admin.createUser({
        email: fakeEmail,
        password: fakePassword,
        email_confirm: true,
        user_metadata: {
          phone: normalizedPhone,
          display_name: displayName || normalizedPhone,
        },
      });

      if (createError) {
        // Race condition — try lookup again
        const { user: fallbackUser } = await findAuthUserByEmail(supabase, fakeEmail);
        if (!fallbackUser) {
          console.error("[verify-sms-otp] Create user error:", createError.message);
          return new Response(
            JSON.stringify({ error: "Не удалось создать аккаунт" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        userId = fallbackUser.id;
      } else {
        userId = newUserData.user.id;
        isNewUser = true;

        // Create profile
        const { error: profileError } = await supabase.from("profiles").insert({
          user_id: userId,
          phone: normalizedPhone,
          display_name: displayName || normalizedPhone,
        });
        if (profileError) {
          console.error("[verify-sms-otp] Profile insert error:", profileError.message);
        }
      }
    } else {
      userId = existingUser.id;

      // Ensure password matches the latest HMAC derivation
      const { error: resetPwdError } = await supabase.auth.admin.updateUserById(userId, {
        password: fakePassword,
        user_metadata: {
          ...((existingUser as any).user_metadata ?? {}),
          phone: normalizedPhone,
          display_name:
            displayName ||
            ((existingUser as any).user_metadata as Record<string, unknown>)?.display_name ||
            normalizedPhone,
        },
      });
      if (resetPwdError) {
        console.error("[verify-sms-otp] Reset password error:", resetPwdError.message);
        return new Response(
          JSON.stringify({ error: "Ошибка аутентификации" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Sign in with email+password to get real JWT tokens
    const anon = createClient(supabaseUrl, anonKey);
    const { data: authData, error: authError } = await anon.auth.signInWithPassword({
      email: fakeEmail,
      password: fakePassword,
    });

    if (authError || !authData?.session) {
      console.error("[verify-sms-otp] signInWithPassword error:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Не удалось выполнить вход" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        userId,
        isNewUser,
        accessToken: authData.session.access_token,
        refreshToken: authData.session.refresh_token,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[verify-sms-otp] Error:", error);
    return new Response(
      JSON.stringify({ error: "Внутренняя ошибка сервера" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
