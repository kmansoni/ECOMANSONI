import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

type RequestBody = {
  limit?: number;
  offset?: number;
  author_ids?: string[];
};

type StorageObjectRow = {
  name: string;
  bucket_id: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

function normalizeBaseUrl(url: string): string {
  return String(url || "").replace(/\/+$/, "");
}

function buildPublicStorageUrl(supabaseUrl: string, bucket: string, objectPath: string): string {
  const base = normalizeBaseUrl(supabaseUrl);
  const cleanPath = String(objectPath || "").replace(/^\/+/, "");
  const encoded = cleanPath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encoded}`;
}

function isProbablyVideoObject(obj: StorageObjectRow): boolean {
  const nameLower = String(obj?.name || "").toLowerCase();
  const meta = (obj?.metadata || {}) as any;
  const mime = String(meta?.mimetype || meta?.contentType || "").toLowerCase();
  if (mime.startsWith("video/")) return true;
  return /\.(mp4|webm|mov|avi|m4v)(\?|#|$)/.test(nameLower);
}

function extractAuthorIdFromObjectName(name: string): string | null {
  const firstSeg = String(name || "").split("/")[0] || "";
  const v = firstSeg.trim();
  if (!v) return null;
  // Basic UUID v4-ish validation (Supabase auth user ids are UUIDs).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) {
    return null;
  }
  return v;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: "Server not configured" }, 500);
  }

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    // allow empty body
  }

  const limit = clampInt(body.limit, 50, 1, 100);
  const offset = clampInt(body.offset, 0, 0, 5000);
  const authorIds = Array.isArray(body.author_ids)
    ? body.author_ids.map((x) => String(x)).filter(Boolean)
    : null;

  const supabase = createClient(supabaseUrl, serviceKey);

  const syncStorageObjectsToReels = async () => {
    // Goal: ensure every video object in reels-media bucket is represented in public.reels.
    // This allows legacy uploads (storage-only) to appear in the feed.
    const bucket = "reels-media";

    // List recent objects from storage.
    const storageRes = await supabase
      .from("storage.objects")
      .select("name,bucket_id,created_at,metadata")
      .eq("bucket_id", bucket)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (storageRes.error) {
      console.warn("[reels-feed] storage.objects list failed:", storageRes.error);
      return;
    }

    const objects = (storageRes.data ?? []) as StorageObjectRow[];
    const videoObjects = objects.filter(isProbablyVideoObject);
    if (videoObjects.length === 0) return;

    const publicUrls = videoObjects.map((o) => buildPublicStorageUrl(supabaseUrl, bucket, o.name));

    const existing = await supabase
      .from("reels")
      .select("id,video_url")
      .in("video_url", publicUrls);

    if (existing.error) {
      console.warn("[reels-feed] reels existence check failed:", existing.error);
      return;
    }

    const existingUrls = new Set(((existing.data ?? []) as any[]).map((r) => String(r?.video_url || "")));
    const missing = videoObjects
      .map((o) => {
        const video_url = buildPublicStorageUrl(supabaseUrl, bucket, o.name);
        const author_id = extractAuthorIdFromObjectName(o.name);
        return {
          author_id,
          video_url,
          created_at: o.created_at,
        };
      })
      .filter((r) => !!r.author_id && !!r.video_url && !existingUrls.has(r.video_url));

    if (missing.length === 0) return;

    // Insert as best-effort. Keep schema compatibility by inserting only core columns.
    // If created_at is not writable in some deployments, retry without it.
    let insertRes = await supabase.from("reels").insert(missing);
    if (insertRes.error) {
      const msg = String((insertRes.error as any)?.message ?? "").toLowerCase();
      if (msg.includes("created_at") || String((insertRes.error as any)?.code ?? "") === "42703") {
        insertRes = await supabase
          .from("reels")
          .insert(missing.map(({ author_id, video_url }) => ({ author_id, video_url })));
      }
    }

    if (insertRes.error) {
      console.warn("[reels-feed] reels insert missing storage videos failed:", insertRes.error);
    }
  };

  try {
    // Best-effort sync: ensure storage-only uploads show up in the feed.
    // This runs before the feed query so newly inserted rows can be returned.
    await syncStorageObjectsToReels();

    // Best-effort moderation filter: if column exists, exclude blocked.
    // We use SELECT * to stay compatible with evolving schema.
    let query: any = supabase
      .from("reels")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (authorIds && authorIds.length > 0) {
      query = query.in("author_id", authorIds);
    }

    // Try with moderation_status filter first; if column doesn't exist, retry without it.
    const withModeration = query.neq("moderation_status", "blocked");
    let res = await withModeration;

    if (res.error && String(res.error.code ?? "") === "42703") {
      res = await query;
    }

    if (res.error) {
      console.error("[reels-feed] query error:", res.error);
      return json({ ok: false, error: "DB query failed" }, 500);
    }

    const rows = (res.data ?? []) as Record<string, Json>[];
    return json({ ok: true, data: rows });
  } catch (e) {
    console.error("[reels-feed] exception:", e);
    return json({ ok: false, error: "Internal error" }, 500);
  }
});
