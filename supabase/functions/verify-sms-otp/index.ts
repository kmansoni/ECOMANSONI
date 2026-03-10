import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceCors, getCorsHeaders, handleCors } from "../_shared/utils.ts";

const MAX_ATTEMPTS = 5;

/**
 * Derive the same HMAC-based password that phone-auth uses.
 * This ensures verify-sms-otp creates users / signs in with
 * the exact same credentials as the direct phone-auth flow.
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

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { phone, code, displayName } = await req.json();

    if (!phone || !code) {
      return new Response(
        JSON.stringify({ error: "Телефон и код обязательны" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedPhone = phone.replace(/\D/g, "");
    const normalizedCode = code.trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
    const { data: otpRecord, error: fetchError } = await supabase
      .from("phone_otps")
      .select("*")
      .eq("phone", normalizedPhone)
      .single();

    if (fetchError || !otpRecord) {
      return new Response(
        JSON.stringify({ error: "Код подтверждения не найден. Запросите новый." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check expiry
    if (new Date(otpRecord.expires_at) < new Date()) {
      await supabase.from("phone_otps").delete().eq("phone", normalizedPhone);
      return new Response(
        JSON.stringify({ error: "Код истёк. Запросите новый." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check attempts
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      await supabase.from("phone_otps").delete().eq("phone", normalizedPhone);
      return new Response(
        JSON.stringify({ error: "Слишком много попыток. Запросите новый код." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Timing-safe comparison
    function timingSafeEqual(a: string, b: string): boolean {
      const aBytes = new TextEncoder().encode(a);
      const bBytes = new TextEncoder().encode(b);
      if (aBytes.length !== bBytes.length) return false;
      let diff = 0;
      for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
      return diff === 0;
    }

    if (!timingSafeEqual(otpRecord.code, normalizedCode)) {
      await supabase
        .from("phone_otps")
        .update({ attempts: otpRecord.attempts + 1 })
        .eq("phone", normalizedPhone);

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
    await supabase.from("phone_otps").delete().eq("phone", normalizedPhone);

    // Use the same email+password pattern as phone-auth so accounts are shared.
    const fakeEmail = `user.${normalizedPhone}@phoneauth.app`;
    const fakePassword = await derivePassword(normalizedPhone, phoneAuthSecret);

    const anonKey =
      req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";

    // Try to find existing user
    let userId: string;
    let isNewUser = false;

    const { data: existingUserData } = await supabase.auth.admin.getUserByEmail(fakeEmail);
    const existingUser = existingUserData?.user ?? null;

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
        const { data: fallbackData } = await supabase.auth.admin.getUserByEmail(fakeEmail);
        if (!fallbackData?.user) {
          console.error("[verify-sms-otp] Create user error:", createError.message);
          return new Response(
            JSON.stringify({ error: "Не удалось создать аккаунт" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        userId = fallbackData.user.id;
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
