// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceCors, getCorsHeaders, handleCors, isProductionEnv } from "../_shared/utils.ts";

serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (isProductionEnv()) {
    return new Response("not found", { status: 404, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Server not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = (await req.json()) as Record<string, unknown>;
    const action = body.action as string | undefined;

    // ===================================================================
    // ACTION: setup-owner-and-testuser
    // Create Owner (khan@mansoni.ru) and Test User (+79999999999)
    // ===================================================================
    if (action === "setup-owner-and-testuser") {
      const setupSecret = body.setupSecret as string | undefined;
      
      // For initial setup, accept with environment secret
      const requiredSecret = Deno.env.get("SETUP_SECRET") || "setup-default-secret";
      
      if (setupSecret !== requiredSecret && setupSecret !== "dev-setup-token") {
        // Allow only if:
        // 1. setupSecret matches SETUP_SECRET environment variable
        // 2. Or it's dev-setup-token (for development)
        // 3. Or authorization token is valid (for Owner after creation)
        const authToken = (req.headers.get("Authorization") || "").replace("Bearer ", "");
        if (!authToken) {
          return new Response(
            JSON.stringify({ ok: false, error: "Unauthorized: provide setupSecret or Authorization header" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Verify auth token via Supabase
        const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);
        if (authError || !user) {
          return new Response(
            JSON.stringify({ ok: false, error: "Invalid authorization token" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      try {
        const results: any = {
          owner: null,
          testUser: null,
          errors: [],
        };

        // ===== CREATE OWNER =====
        try {
          const ownerEmail = "khan@mansoni.ru";
          const ownerPassword = "Ag121212.";
          const ownerPhone = "79333222922";
          const ownerFullName = "Мансуров Джехангир Мирзаевич";

          // Check if owner already exists
          const { data: existingOwner } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("email", ownerEmail)
            .maybeSingle();

          if (existingOwner) {
            results.owner = {
              status: "already_exists",
              userId: existingOwner.user_id,
            };
          } else {
            // Create auth user
            const { data: newOwner, error: ownerCreateError } = await supabase.auth.admin.createUser({
              email: ownerEmail,
              password: ownerPassword,
              email_confirm: true,
              user_metadata: {
                phone: ownerPhone,
                display_name: ownerFullName,
                full_name: ownerFullName,
              },
            });

            if (ownerCreateError) {
              results.errors.push(`Owner creation error: ${ownerCreateError.message}`);
            } else {
              const ownerId = newOwner.user.id;

              // Create profile
              await supabase.from("profiles").insert({
                user_id: ownerId,
                phone: ownerPhone,
                email: ownerEmail,
                full_name: ownerFullName,
                display_name: ownerFullName,
                birth_date: "1996-03-24",
                age: 29,
                bio: "Юрист\nПредприниматель\nПросто хороший человек",
                professions: ["Юрист", "Предприниматель", "Просто хороший человек"],
                verified: true,
              });

              // Create user verification (owner badge)
              await supabase.from("user_verifications").insert({
                user_id: ownerId,
                verification_type: "owner",
                is_active: true,
                reason: "Platform Owner - Mansoni",
              });

              // Create admin_users record
              await supabase.from("admin_users").insert({
                user_id: ownerId,
                email: ownerEmail,
                display_name: ownerFullName,
                status: "active",
              });

              // Assign owner role to admin
              const { data: ownerRole } = await supabase
                .from("admin_roles")
                .select("id")
                .eq("name", "owner")
                .maybeSingle();

              if (ownerRole) {
                const { data: adminUser } = await supabase
                  .from("admin_users")
                  .select("id")
                  .eq("email", ownerEmail)
                  .maybeSingle();

                if (adminUser) {
                  await supabase.from("admin_user_roles").insert({
                    admin_user_id: adminUser.id,
                    role_id: ownerRole.id,
                  });
                }
              }

              results.owner = {
                status: "created",
                userId: ownerId,
                email: ownerEmail,
                phone: ownerPhone,
              };
            }
          }
        } catch (err: any) {
          results.errors.push(`Owner setup error: ${err?.message || String(err)}`);
        }

        // ===== CREATE TEST USER =====
        try {
          const testPhone = "79999999999";
          const testFakeEmail = `user.${testPhone}@phoneauth.app`;
          const testFakePassword = `ph_${testPhone}_${Date.now()}`;

          // Check if test user already exists
          const { data: existingTest } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("phone", testPhone)
            .maybeSingle();

          if (existingTest) {
            results.testUser = {
              status: "already_exists",
              userId: existingTest.user_id,
            };
          } else {
            // Create auth user
            const { data: newTest, error: testCreateError } = await supabase.auth.admin.createUser({
              email: testFakeEmail,
              password: testFakePassword,
              email_confirm: true,
              user_metadata: {
                phone: testPhone,
                display_name: "Test User",
              },
            });

            if (testCreateError) {
              results.errors.push(`Test user creation error: ${testCreateError.message}`);
            } else {
              const testId = newTest.user.id;

              // Create profile
              await supabase.from("profiles").insert({
                user_id: testId,
                phone: testPhone,
                display_name: "Тестовый Пользователь",
                verified: false,
              });

              results.testUser = {
                status: "created",
                userId: testId,
                phone: testPhone,
              };
            }
          }
        } catch (err: any) {
          results.errors.push(`Test user setup error: ${err?.message || String(err)}`);
        }

        return new Response(
          JSON.stringify({
            ok: true,
            data: results,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err?.message || "Setup failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
