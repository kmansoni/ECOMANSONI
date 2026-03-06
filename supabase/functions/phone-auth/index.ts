import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/utils.ts";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = {
    ...getCorsHeaders(origin),
    "Access-Control-Allow-Origin": origin || "*",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as Record<string, Json>;
    const action = body.action as string | undefined;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      console.error("[phone-auth] Server not configured");
      return new Response(
        JSON.stringify({ error: "Server not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // O(1) direct lookup — replaces the old O(N) paginated listUsers scan.
    async function findUserByEmail(email: string) {
      const { data, error } = await supabase.auth.admin.getUserByEmail(email);
      if (error || !data?.user) return null;
      return data.user;
    }

    // ===================================================================
    // ACTION: register-or-login
    // Phone-based registration without password or SMS
    // ===================================================================
    if (action === "register-or-login") {
      const phone = (body.phone as string)?.trim();
      const displayName = (body.display_name as string)?.trim();
      const email = (body.email as string)?.trim();

      if (!phone) {
        return new Response(
          JSON.stringify({ error: "Phone is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const normalizedPhone = phone.replace(/\D/g, "");

      // Create a fake but unique email for this phone
      // Format: user.+79XXXXXXXXX@phoneauth.app
      const fakeEmail = `user.${normalizedPhone}@phoneauth.app`;
      const fakePassword = `ph_${normalizedPhone}`;

      // Supabase Functions invoke() sends `apikey` (anon key) and `x-client-info` automatically.
      // Using request `apikey` here avoids requiring extra env configuration.
      const anonKey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";

      if (!anonKey) {
        console.error("[phone-auth] Missing Supabase anon key");
        return new Response(
          JSON.stringify({ error: "Missing Supabase anon key (apikey header)" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const existingUser = await findUserByEmail(fakeEmail);

        let userId: string;
        let isNewUser = false;

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
            // If user already exists (race condition), fall back to lookup.
            const fallbackUser = await findUserByEmail(fakeEmail);
            if (!fallbackUser) {
              console.error("[phone-auth] Create user error:", createError?.message);
              return new Response(
                JSON.stringify({ error: `Failed to create account: ${createError.message}` }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            userId = fallbackUser.id;
            isNewUser = false;
          } else {
            userId = newUserData.user.id;
            isNewUser = true;

            // Create profile record
            const { error: profileError } = await supabase.from("profiles").insert({
              user_id: userId,
              phone: normalizedPhone,
              display_name: displayName || normalizedPhone,
              email: email || null,
            });
            if (profileError) {
              // Not fatal for auth; log for diagnostics.
              console.error("[phone-auth] Profile insert error:", profileError?.message);
            }
          }
        } else {
          userId = existingUser.id;
          isNewUser = false;

          // Ensure existing users (possibly created with an older random password) can log in.
          const { error: resetPwdError } = await supabase.auth.admin.updateUserById(userId, {
            password: fakePassword,
            user_metadata: {
              ...(existingUser.user_metadata ?? {}),
              phone: normalizedPhone,
              display_name: displayName || (existingUser.user_metadata as Record<string, unknown>)?.display_name || normalizedPhone,
            },
          });
          if (resetPwdError) {
            console.error("[phone-auth] Reset password error:", resetPwdError?.message);
            return new Response(
              JSON.stringify({ error: `Failed to reset password: ${resetPwdError.message}` }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // Authenticate user with email/password to get JWT tokens
        const anon = createClient(supabaseUrl, anonKey);
        const { data: authData, error: authError } = await anon.auth.signInWithPassword({
          email: fakeEmail,
          password: fakePassword,
        });

        if (authError || !authData?.session) {
          console.error("[phone-auth] Auth error:", authError);
          return new Response(
            JSON.stringify({ error: `Failed to authenticate: ${authError?.message || "no-session"}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            userId,
            isNewUser,
            accessToken: authData.session.access_token,
            refreshToken: authData.session.refresh_token,
            email: fakeEmail,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("[phone-auth] Register/login error:", msg);
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ===================================================================
    // ACTION: update-profile
    // Update user profile with full information
    // ===================================================================
    if (action === "update-profile") {
      const token = req.headers.get("Authorization")?.replace("Bearer ", "");
      if (!token) {
        return new Response(
          JSON.stringify({ error: "Missing authorization token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseAuthed = createClient(supabaseUrl, serviceKey, {
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
      });

      const { data: userData, error: userError } = await supabaseAuthed.auth.getUser();
      if (userError || !userData?.user?.id) {
        return new Response(
          JSON.stringify({ error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userId = userData.user.id;
      const profileData: Record<string, unknown> = {};

      if (body.full_name) profileData.full_name = body.full_name;
      if (body.birth_date) profileData.birth_date = body.birth_date;
      if (body.bio) profileData.bio = body.bio;
      if (Array.isArray(body.professions)) profileData.professions = body.professions;
      if (body.email) profileData.email = body.email;

      try {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ ...profileData, updated_at: new Date().toISOString() })
          .eq("user_id", userId);

        if (updateError) {
          return new Response(
            JSON.stringify({ error: updateError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ ok: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Update failed";
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Unknown action
    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Server error";
    console.error("[phone-auth] Unhandled error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
