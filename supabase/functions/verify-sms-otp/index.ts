import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_ATTEMPTS = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, code, displayName } = await req.json();

    if (!phone || !code) {
      return new Response(
        JSON.stringify({ error: "Phone and code are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedPhone = phone.replace(/\D/g, "");
    const normalizedCode = code.trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get OTP record
    const { data: otpRecord, error: fetchError } = await supabase
      .from("phone_otps")
      .select("*")
      .eq("phone", normalizedPhone)
      .single();

    if (fetchError || !otpRecord) {
      return new Response(
        JSON.stringify({ error: "No verification code found. Please request a new one." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if expired
    if (new Date(otpRecord.expires_at) < new Date()) {
      await supabase.from("phone_otps").delete().eq("phone", normalizedPhone);
      return new Response(
        JSON.stringify({ error: "Verification code has expired. Please request a new one." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check attempts
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      await supabase.from("phone_otps").delete().eq("phone", normalizedPhone);
      return new Response(
        JSON.stringify({ error: "Too many failed attempts. Please request a new code." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify code
    if (otpRecord.code !== normalizedCode) {
      // Increment attempts
      await supabase
        .from("phone_otps")
        .update({ attempts: otpRecord.attempts + 1 })
        .eq("phone", normalizedPhone);

      const remainingAttempts = MAX_ATTEMPTS - otpRecord.attempts - 1;
      return new Response(
        JSON.stringify({ 
          error: `Invalid code. ${remainingAttempts} attempts remaining.`,
          remainingAttempts 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Code is valid! Delete OTP record
    await supabase.from("phone_otps").delete().eq("phone", normalizedPhone);

    // Create or get user using phone-based email
    const fakeEmail = `user.${normalizedPhone}@phoneauth.app`;
    const password = `ph_${normalizedPhone}_secure_${Date.now()}`;

    // Try to sign in first (existing user)
    const { data: signInData, error: signInError } = await supabase.auth.admin.listUsers();
    const existingUser = signInData?.users?.find(u => u.email === fakeEmail);

    let userId: string;
    let accessToken: string;
    let refreshToken: string;

    if (existingUser) {
      // User exists - generate new session
      const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: fakeEmail,
      });

      if (sessionError) {
        console.error("Failed to generate session:", sessionError);
        return new Response(
          JSON.stringify({ error: "Authentication failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Sign in using the magic link token
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: sessionData.properties?.hashed_token || "",
        type: "magiclink",
      });

      if (verifyError || !verifyData.session) {
        // Fallback: create a new session directly
        const { data: adminSession, error: adminError } = await supabase.auth.admin.createUser({
          email: fakeEmail,
          email_confirm: true,
          user_metadata: { full_name: displayName || normalizedPhone },
        });

        if (adminError && !adminError.message.includes("already been registered")) {
          console.error("Failed to create user session:", adminError);
          return new Response(
            JSON.stringify({ error: "Authentication failed" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      userId = existingUser.id;
      
      // Generate session tokens for existing user
      const { data: tokenData, error: tokenError } = await supabase.auth.admin.generateLink({
        type: "magiclink", 
        email: fakeEmail,
      });

      if (tokenError) {
        return new Response(
          JSON.stringify({ error: "Failed to create session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Return magic link for client to verify
      return new Response(
        JSON.stringify({
          success: true,
          userId: existingUser.id,
          email: fakeEmail,
          isNewUser: false,
          magicLinkToken: tokenData.properties?.hashed_token,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: fakeEmail,
        password: password,
        email_confirm: true,
        user_metadata: { 
          full_name: displayName || normalizedPhone,
          phone: normalizedPhone,
        },
      });

      if (createError) {
        console.error("Failed to create user:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to create account" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = newUser.user.id;

      // Create profile
      await supabase
        .from("profiles")
        .upsert({
          user_id: userId,
          phone: normalizedPhone,
          display_name: displayName || normalizedPhone,
        }, { onConflict: "user_id" });

      // Generate magic link for new user
      const { data: tokenData, error: tokenError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: fakeEmail,
      });

      if (tokenError) {
        return new Response(
          JSON.stringify({ error: "Failed to create session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          userId: userId,
          email: fakeEmail,
          password: password, // For client to sign in
          isNewUser: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    console.error("Error in verify-sms-otp:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
