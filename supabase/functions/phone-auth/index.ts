// @ts-nocheck
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
  const requestStartTime = Date.now();

  try {
    console.log(`🔵 [phone-auth] ⏱️  ${requestStartTime}: Request started`);
    
    let jsonParsed = false;
    const body = (await Promise.race([
      req.json(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('JSON parse timeout')), 10000))
    ])) as Record<string, Json>;
    jsonParsed = true;
    console.log(`🔵 [phone-auth] ⏱️  ${Date.now()}: JSON parsed (${Date.now() - requestStartTime}ms)`);
    
    const action = body.action as string | undefined;

    console.log("🔵 [phone-auth] Incoming request:", { method: req.method, action });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    console.log(`🔵 [phone-auth] ⏱️  ${Date.now()}: Environment check (${Date.now() - requestStartTime}ms):`, { hasUrl: !!supabaseUrl, hasKey: !!serviceKey });
    
    if (!supabaseUrl || !serviceKey) {
      console.error("🔴 [phone-auth] Server not configured");
      return new Response(
        JSON.stringify({ error: "Server not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🔵 [phone-auth] ⏱️  ${Date.now()}: Creating service client (${Date.now() - requestStartTime}ms)`);
    const supabase = createClient(supabaseUrl, serviceKey);
    console.log(`🔵 [phone-auth] ⏱️  ${Date.now()}: Service client created (${Date.now() - requestStartTime}ms)`);

    async function findUserByEmail(email: string) {
      console.log(`🔵 [phone-auth] ⏱️  ${Date.now()}: START findUserByEmail("${email}")`);
      const perPage = 1000;
      let page = 1;
      for (let i = 0; i < 10; i++) {
        console.log(`🔵 [phone-auth] ⏱️  ${Date.now()}: Listing users page ${page}...`);
        try {
          const { data, error } = await Promise.race([
            supabase.auth.admin.listUsers({ page, perPage }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('listUsers timeout')), 5000))
          ]) as any;
          
          console.log(`🔵 [phone-auth] ⏱️  ${Date.now()}: Listed page ${page}, error=${!!error}, usersCount=${data?.users?.length}`);
          
          if (error) throw error;
          const users = data?.users ?? [];
          const found = users.find((u: any) => u.email === email);
          if (found) {
            console.log(`🔵 [phone-auth] ⏱️  ${Date.now()}: User found! Returning.`);
            return found;
          }
          if (users.length < perPage) {
            console.log(`🔵 [phone-auth] ⏱️  ${Date.now()}: Reached end of users list`);
            break;
          }
          page++;
        } catch (err) {
          console.error(`🔴 [phone-auth] Error listing users page ${page}:`, err);
          throw err;
        }
      }
      console.log(`🔵 [phone-auth] ⏱️  ${Date.now()}: User NOT found`);
      return null;
    }

    // ===================================================================
    // ACTION: register-or-login
    // Phone-based registration without password or SMS
    // ===================================================================
    if (action === "register-or-login") {
      console.log("🔵 [phone-auth] START register-or-login", { action, bodyKeys: Object.keys(body) });
      
      const phone = (body.phone as string)?.trim();
      const displayName = (body.display_name as string)?.trim();
      const email = (body.email as string)?.trim();

      console.log("🔵 [phone-auth] Parsed input", { phone, displayName, email });

      if (!phone) {
        console.error("🔴 [phone-auth] Phone is required");
        return new Response(
          JSON.stringify({ error: "Phone is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const normalizedPhone = phone.replace(/\D/g, "");
      console.log("🔵 [phone-auth] Normalized phone:", normalizedPhone);

      // Create a fake but unique email for this phone
      // Format: user.+79XXXXXXXXX@phoneauth.app
      const fakeEmail = `user.${normalizedPhone}@phoneauth.app`;
      const fakePassword = `ph_${normalizedPhone}`;

      // Supabase Functions invoke() sends `apikey` (anon key) and `x-client-info` automatically.
      // Using request `apikey` here avoids requiring extra env configuration.
      const anonKey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
      console.log("🔵 [phone-auth] API key check:", anonKey ? "FOUND" : "MISSING");
      
      if (!anonKey) {
        console.error("🔴 [phone-auth] Missing Supabase anon key");
        return new Response(
          JSON.stringify({ error: "Missing Supabase anon key (apikey header)" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        // Try to lookup existing user by email (paginated)
        console.log("🔵 [phone-auth] Looking up existing user by email:", fakeEmail);
        const existingUser = await findUserByEmail(fakeEmail);
        console.log("🔵 [phone-auth] User lookup result:", existingUser ? "FOUND" : "NOT_FOUND");

        let userId: string;
        let isNewUser = false;

        if (!existingUser) {
          // Create new user
          console.log("🔵 [phone-auth] Creating new user");
          const { data: newUserData, error: createError } = await supabase.auth.admin.createUser({
            email: fakeEmail,
            password: fakePassword,
            email_confirm: true,
            user_metadata: {
              phone: normalizedPhone,
              display_name: displayName || normalizedPhone,
            },
          });
          console.log("🔵 [phone-auth] Create user result:", createError ? "ERROR" : "SUCCESS", { userId: newUserData?.user?.id });

          if (createError) {
            // If user already exists (race / pagination mismatch), fall back to lookup.
            console.error("🔴 [phone-auth] Create user error:", createError?.message);
            console.log("🔵 [phone-auth] Attempting fallback lookup");
            const fallbackUser = await findUserByEmail(fakeEmail);
            if (!fallbackUser) {
              console.error("🔴 [phone-auth] Fallback failed - user not found");
              return new Response(
                JSON.stringify({ error: `Failed to create account: ${createError.message}` }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            console.log("🔵 [phone-auth] Fallback successful");
            userId = fallbackUser.id;
            isNewUser = false;
          } else {
            userId = newUserData.user.id;
            isNewUser = true;

            // Create profile record
            console.log("🔵 [phone-auth] Inserting profile for new user");
            const { error: profileError } = await supabase.from("profiles").insert({
              user_id: userId,
              phone: normalizedPhone,
              display_name: displayName || normalizedPhone,
              email: email || null,
            });
            if (profileError) {
              // Not fatal for auth; log for diagnostics.
              console.error("🔴 [phone-auth] Profile insert error:", profileError?.message);
            } else {
              console.log("🔵 [phone-auth] Profile inserted successfully");
            }
          }
        } else {
          console.log("🔵 [phone-auth] Existing user found - updating password");
          userId = existingUser.id;
          isNewUser = false;

          // Ensure existing users (possibly created with an older random password) can log in.
          const { error: resetPwdError } = await supabase.auth.admin.updateUserById(userId, {
            password: fakePassword,
            user_metadata: {
              ...(existingUser.user_metadata ?? {}),
              phone: normalizedPhone,
              display_name: displayName || (existingUser.user_metadata as any)?.display_name || normalizedPhone,
            },
          });
          if (resetPwdError) {
            console.error("🔴 [phone-auth] Reset password error:", resetPwdError?.message);
            return new Response(
              JSON.stringify({ error: `Failed to reset password: ${resetPwdError.message}` }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // Authenticate user with email/password to get JWT tokens
        console.log("🔵 [phone-auth] Authenticating user with email/password");
        const anon = createClient(supabaseUrl, anonKey);
        const { data: authData, error: authError } = await anon.auth.signInWithPassword({
          email: fakeEmail,
          password: fakePassword,
        });
        console.log("🔵 [phone-auth] Auth result:", authError ? "ERROR" : "SUCCESS", { hasSession: !!authData?.session });

        if (authError || !authData?.session) {
          console.error("🔴 [phone-auth] Auth error:", authError);
          return new Response(
            JSON.stringify({ error: `Failed to authenticate: ${authError?.message || "no-session"}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log("🟢 [phone-auth] SUCCESS - returning tokens");
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
      } catch (err: any) {
        console.error("🔴 [phone-auth] Register/login error:", err?.message, err);
        return new Response(
          JSON.stringify({ error: err?.message || "Unknown error" }),
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
      const profileData: any = {};

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
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err?.message || "Update failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Unknown action
    console.error("🔴 [phone-auth] Unknown action:", action);
    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("🔴 [phone-auth] Main error:", err?.message, err);
    return new Response(
      JSON.stringify({ error: err?.message || "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
