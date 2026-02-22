import { supabase } from "@/lib/supabase";
import { extractNormalizedHashtags, formatHashtag, type HashtagStatus } from "@/lib/hashtags";

type HashtagRow = {
  normalized_tag?: string | null;
  tag?: string | null;
  status?: HashtagStatus | null;
};

function getErrorMessage(err: unknown): string {
  if (!err) return "";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const anyErr = err as any;
    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.details === "string") return anyErr.details;
    if (typeof anyErr.error_description === "string") return anyErr.error_description;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isSchemaMissingError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase();
  const code = String((err as any)?.code ?? "");
  return (
    code === "42P01" ||
    code === "42883" ||
    msg.includes("does not exist") ||
    msg.includes("relation") ||
    msg.includes("function")
  );
}

export function parseHashtagBlockedError(err: unknown): { blockedTags: string[] } | null {
  const msg = getErrorMessage(err);
  const m = msg.match(/HASHTAG_BLOCKED\s*:\s*(.+)$/i);
  if (!m) return null;

  const raw = String(m[1] || "").trim();
  const parts = raw
    ? raw
        .split(/\s*,\s*/g)
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

  return { blockedTags: parts };
}

export function getHashtagBlockedToastPayload(err: unknown): { title: string; description?: string } | null {
  const parsed = parseHashtagBlockedError(err);
  if (!parsed) return null;
  return {
    title: "Некоторые хештеги недоступны",
    description: parsed.blockedTags.length ? parsed.blockedTags.join(", ") : undefined,
  };
}

export async function checkHashtagsAllowedForText(text: string): Promise<
  | { ok: true; normalizedTags: string[] }
  | { ok: false; normalizedTags: string[]; blockedTags: string[] }
> {
  const normalizedTags = extractNormalizedHashtags(String(text ?? "").trim());
  if (normalizedTags.length === 0) return { ok: true, normalizedTags };

  const uniqueLimited = normalizedTags.slice(0, 50);

  try {
    // Note: Supabase generated types may lag behind migrations; use `as any`.
    const { data: rows, error } = await (supabase as any)
      .from("hashtags")
      .select("normalized_tag,status,tag")
      .in("normalized_tag", uniqueLimited);

    if (error) {
      if (isSchemaMissingError(error)) return { ok: true, normalizedTags };
      console.warn("[HashtagModeration] status check failed:", error);
      return { ok: true, normalizedTags };
    }

    const blocked = (Array.isArray(rows) ? (rows as HashtagRow[]) : [])
      .filter((r) => String(r?.status ?? "normal") !== "normal")
      .slice(0, 20);

    if (blocked.length === 0) return { ok: true, normalizedTags };

    const blockedTags = blocked
      .map((r) => {
        const tag = String(r?.tag ?? "").trim();
        if (tag) return tag.startsWith("#") ? tag : `#${tag}`;
        const n = String(r?.normalized_tag ?? "").trim();
        return n ? formatHashtag(n) : "";
      })
      .filter(Boolean);

    return { ok: false, normalizedTags, blockedTags };
  } catch (e) {
    console.warn("[HashtagModeration] status check crashed:", e);
    return { ok: true, normalizedTags };
  }
}
