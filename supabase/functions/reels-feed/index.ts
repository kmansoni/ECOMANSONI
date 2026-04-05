import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/utils.ts";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

type RequestBody = {
  limit?: number;
  offset?: number;
  author_ids?: string[];
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

function json(body: unknown, status = 200, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);

  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405, cors);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, error: "Server not configured" }, 500, cors);
  }

  // JWT авторизация — мягкая: фид публичный, но sync требует авторизации
  const authHeader = req.headers.get("Authorization");
  let caller: { id: string } | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const authClient = createClient(supabaseUrl, supabaseAnonKey ?? serviceKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: { user }, error: authError } = await authClient.auth.getUser();
      if (!authError && user) caller = user;
    } catch {
      // мягкая проверка — не блокируем фид
    }
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
    // Синхронизируем видео из storage → public.reels.
    // Используем Storage API (list) вместо прямого запроса к storage.objects.
    const bucket = "reels-media";

    try {
      // Листаем корень бакета — получаем папки (UUID пользователей)
      const { data: folders, error: listErr } = await supabase.storage.from(bucket).list("", {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });
      if (listErr || !folders) {
        console.warn("[reels-feed] storage list root failed:", listErr);
        return;
      }

      const videoObjects: Array<{ name: string; authorId: string; createdAt: string }> = [];

      for (const folder of folders) {
        // Папки = UUID авторов
        const authorId = folder.name?.trim();
        if (!authorId || !/^[0-9a-f]{8}-/i.test(authorId)) continue;

        const { data: files } = await supabase.storage.from(bucket).list(authorId, {
          limit: 50,
          sortBy: { column: "created_at", order: "desc" },
        });
        if (!files) continue;

        for (const f of files) {
          const nameLower = (f.name || "").toLowerCase();
          if (/\.(mp4|webm|mov|m4v)$/.test(nameLower)) {
            videoObjects.push({
              name: `${authorId}/${f.name}`,
              authorId,
              createdAt: f.created_at || new Date().toISOString(),
            });
          }
          // Проверяем вложенные папки (e.g. /reels/{id}/original.mp4)
          if (!f.name?.includes(".")) {
            const { data: nested } = await supabase.storage.from(bucket).list(`${authorId}/${f.name}`, { limit: 20 });
            if (nested) {
              for (const nf of nested) {
                const nn = (nf.name || "").toLowerCase();
                if (/\.(mp4|webm|mov|m4v)$/.test(nn)) {
                  videoObjects.push({
                    name: `${authorId}/${f.name}/${nf.name}`,
                    authorId,
                    createdAt: nf.created_at || f.created_at || new Date().toISOString(),
                  });
                }
              }
            }
          }
        }
      }

      if (videoObjects.length === 0) return;

      const publicUrls = videoObjects.map((o) => buildPublicStorageUrl(supabaseUrl, bucket, o.name));
      const existing = await supabase.from("reels").select("video_url").in("video_url", publicUrls);
      const existingUrls = new Set(((existing.data ?? []) as any[]).map((r) => String(r?.video_url || "")));

      const missing = videoObjects
        .filter((o) => !existingUrls.has(buildPublicStorageUrl(supabaseUrl, bucket, o.name)))
        .map((o) => ({
          author_id: o.authorId,
          video_url: buildPublicStorageUrl(supabaseUrl, bucket, o.name),
          moderation_status: "clean",
          created_at: o.createdAt,
        }));

      if (missing.length === 0) return;

      const insertRes = await supabase.from("reels").insert(missing);
      if (insertRes.error) {
        console.warn("[reels-feed] reels insert failed:", insertRes.error);
      } else {
        console.log(`[reels-feed] synced ${missing.length} videos from storage`);
      }
    } catch (e) {
      console.warn("[reels-feed] storage sync exception:", e);
    }
  };

  try {
    // Best-effort sync: ensure storage-only uploads show up in the feed.
    // This runs before the feed query so newly inserted rows can be returned.
    await syncStorageObjectsToReels();

    // Moderation is mandatory on the server read path. If the moderation
    // columns are missing, fail closed instead of returning unfiltered reels.
    let query: any = supabase
      .from("reels")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (authorIds && authorIds.length > 0) {
      query = query.in("author_id", authorIds);
    }

    const res = await query
      .neq("moderation_status", "blocked")
      .eq("is_nsfw", false)
      .eq("is_graphic_violence", false)
      .eq("is_political_extremism", false);

    if (res.error) {
      console.error("[reels-feed] query error:", res.error);
      return json({ ok: false, error: "DB query failed" }, 500, cors);
    }

    const rows = (res.data ?? []) as Record<string, Json>[];
    return json({ ok: true, data: rows }, 200, cors);
  } catch (e) {
    console.error("[reels-feed] exception:", e);
    return json({ ok: false, error: "Internal error" }, 500, cors);
  }
});
