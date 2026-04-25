import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCors, enforceCors, errorResponse } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  // CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // CORS enforcement
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, origin);
  }

  try {
    // Аутентификация пользователя
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return errorResponse("Missing authorization header", 401, origin);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return errorResponse("Unauthorized", 401, origin);
    }

    const userId = user.id;

    // Подтверждение удаления
    const body = await req.json().catch(() => ({}));
    if (body.confirm !== "DELETE_MY_ACCOUNT") {
      return errorResponse(
        'Confirmation required: send {"confirm": "DELETE_MY_ACCOUNT"}',
        400,
        origin
      );
    }

    console.log(`[delete-account] Starting deletion for user ${userId}`);

    // Удаление данных из всех таблиц (порядок важен из-за FK)
    const tables = [
      // Связанные данные
      "chat_messages",
      "chat_conversations",
      "chat_participants",
      "posts",
      "comments",
      "likes",
      "follows",
      "reels",
      "stories",
      "notifications",
      "video_calls",
      "crm_contacts",
      "crm_deals",
      "orders",
      "cart_items",
      "real_estate_listings",
      "insurance_quotes",
      "taxi_rides",
      "live_streams",
      "privacy_rules",
      "privacy_rule_exceptions",
      "authorized_sites",
      "user_security_settings",
      "user_settings",
      "profiles",
    ];

    const errors: string[] = [];

    for (const table of tables) {
      try {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq("user_id", userId);

        if (error && error.code !== "PGRST116") {
          // PGRST116 = таблица не существует, игнорируем
          console.error(`[delete-account] Error deleting from ${table}:`, error);
          errors.push(`${table}: ${error.message}`);
        } else {
          console.log(`[delete-account] Deleted from ${table}`);
        }
      } catch (err) {
        console.error(`[delete-account] Exception deleting from ${table}:`, err);
        errors.push(`${table}: ${err.message}`);
      }
    }

    // Удаление файлов из Storage
    try {
      const buckets = ["avatars", "posts", "reels", "stories", "documents"];
      for (const bucket of buckets) {
        const { data: files } = await supabase.storage
          .from(bucket)
          .list(userId);

        if (files && files.length > 0) {
          const filePaths = files.map((f) => `${userId}/${f.name}`);
          await supabase.storage.from(bucket).remove(filePaths);
          console.log(`[delete-account] Deleted ${files.length} files from ${bucket}`);
        }
      }
    } catch (err) {
      console.error(`[delete-account] Error deleting storage:`, err);
      errors.push(`storage: ${err.message}`);
    }

    // Удаление auth пользователя (последний шаг)
    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      console.error(`[delete-account] Error deleting auth user:`, deleteAuthError);
      errors.push(`auth: ${deleteAuthError.message}`);
    } else {
      console.log(`[delete-account] Deleted auth user ${userId}`);
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Account deletion completed with errors",
          errors,
        }),
        {
          status: 207, // Multi-Status
          headers: {
            ...getCorsHeaders(origin),
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Account and all associated data have been permanently deleted",
      }),
      {
        status: 200,
        headers: {
          ...getCorsHeaders(origin),
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("[delete-account] Unexpected error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500,
      origin
    );
  }
});
