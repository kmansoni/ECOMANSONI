function normalizeUrlish(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .trim();
}

function normalizeSupabaseBaseUrl(): string {
  const raw = normalizeUrlish((import.meta as any)?.env?.VITE_SUPABASE_URL);
  return raw.replace(/\/+$/, "");
}

function buildPublicStorageUrl(bucket: string, objectPath: string): string {
  const base = normalizeSupabaseBaseUrl();
  const cleanPath = normalizeUrlish(objectPath).replace(/^\/+/, "");
  if (!base || !cleanPath) return "";
  const encoded = cleanPath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encoded}`;
}

export function normalizeReelMediaUrl(urlOrPath: unknown, bucket = "reels-media"): string {
  const v = normalizeUrlish(urlOrPath);
  if (!v) return "";

  if (/^https?:\/\//i.test(v)) return v;

  if (v.startsWith("/storage/")) {
    const base = normalizeSupabaseBaseUrl();
    return base ? `${base}${v}` : v;
  }
  if (v.startsWith("storage/")) {
    const base = normalizeSupabaseBaseUrl();
    return base ? `${base}/${v}` : v;
  }

  return buildPublicStorageUrl(bucket, v);
}