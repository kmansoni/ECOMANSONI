import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, handleCors, enforceCors, errorResponse, getClientId } from "../_shared/utils.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TABLES_TO_EXPORT: { table: string; userColumn: string }[] = [
  { table: "profiles", userColumn: "user_id" },
  { table: "user_settings", userColumn: "user_id" },
  { table: "messages", userColumn: "sender_id" },
  { table: "chat_participants", userColumn: "user_id" },
  { table: "chat_conversations", userColumn: "id" },
  { table: "posts", userColumn: "user_id" },
  { table: "comments", userColumn: "user_id" },
  { table: "likes", userColumn: "user_id" },
  { table: "follows", userColumn: "follower_id" },
  { table: "stories", userColumn: "user_id" },
  { table: "reels", userColumn: "user_id" },
  { table: "notifications", userColumn: "user_id" },
  { table: "user_contacts", userColumn: "user_id" },
  { table: "user_blocklist", userColumn: "user_id" },
  { table: "user_sessions", userColumn: "user_id" },
  { table: "user_analytics_events", userColumn: "user_id" },
];

const RATE_LIMIT_PER_HOUR = 3;
const SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsError = enforceCors(req);
  if (corsError) return corsError;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, origin);
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return errorResponse("Missing authorization header", 401, origin);
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return errorResponse("Unauthorized", 401, origin);
    }

    const userId = user.id;

    // DB-based rate limit: max N exports per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await adminClient
      .from("gdpr_exports")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", oneHourAgo);

    if (countError) {
      console.error("[gdpr-export] Rate limit check failed:", countError);
      return errorResponse("Internal error", 500, origin);
    }

    if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Max 3 exports per hour." }),
        { status: 429, headers: { ...getCorsHeaders(origin), "Content-Type": "application/json", "Retry-After": "3600" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const format = body.format === "csv" ? "csv" : "json";

    const exportData: Record<string, unknown> = {
      user_id: userId,
      exported_at: new Date().toISOString(),
    };

    // Export all tables
    const results = await Promise.allSettled(
      TABLES_TO_EXPORT.map(async ({ table, userColumn }) => {
        const { data, error } = await adminClient
          .from(table)
          .select("*")
          .eq(userColumn, userId)
          .limit(10000);
        if (error) {
          console.warn(`[gdpr-export] Table ${table} query failed:`, error.message);
          return { table, data: [], error: error.message };
        }
        return { table, data: data ?? [] };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        exportData[result.value.table] = result.value.data;
      }
    }

    let fileContent: string;
    let mimeType: string;

    if (format === "csv") {
      // CSV: export all tables as JSON-per-table (full data, not just messages)
      const csvSections: string[] = [];
      for (const { table } of TABLES_TO_EXPORT) {
        const rows = exportData[table];
        if (Array.isArray(rows) && rows.length > 0) {
          const headers = Object.keys(rows[0]);
          const csvRows = rows.map((row: Record<string, unknown>) =>
            headers.map(h => {
              const val = row[h];
              if (val === null || val === undefined) return "";
              if (typeof val === "object") return JSON.stringify(val).replace(/"/g, '""');
              return String(val).replace(/"/g, '""');
            }).map(v => `"${v}"`).join(",")
          );
          csvSections.push(`# ${table}\n${headers.join(",")}\n${csvRows.join("\n")}`);
        }
      }
      fileContent = csvSections.join("\n\n");
      mimeType = "text/csv";
    } else {
      fileContent = JSON.stringify(exportData, null, 2);
      mimeType = "application/json";
    }

    // Store in user-scoped path for RLS
    const filePath = `${userId}/gdpr-export-${Date.now()}.${format === "csv" ? "csv" : "json"}`;
    const bucket = "user-exports";

    const { error: uploadError } = await adminClient.storage
      .from(bucket)
      .upload(filePath, new Blob([fileContent], { type: mimeType }), {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[gdpr-export] Storage upload error:", uploadError);
      return errorResponse(`Failed to store export file: ${uploadError.message}`, 500, origin);
    }

    // Generate signed URL (private bucket)
    const { data: signedData, error: signedError } = await adminClient.storage
      .from(bucket)
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY_SECONDS);

    if (signedError || !signedData?.signedUrl) {
      console.error("[gdpr-export] Signed URL error:", signedError);
      return errorResponse("Failed to generate download link", 500, origin);
    }

    await adminClient.from("gdpr_exports").insert({
      user_id: userId,
      file_url: filePath,
      file_name: filePath.split("/").pop(),
      format,
      status: "completed",
    });

    return new Response(
      JSON.stringify({
        success: true,
        downloadUrl: signedData.signedUrl,
        fileName: filePath.split("/").pop(),
        format,
        expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000).toISOString(),
      }),
      {
        status: 200,
        headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[gdpr-export] Unexpected error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Internal server error",
      500,
      origin
    );
  }
});
