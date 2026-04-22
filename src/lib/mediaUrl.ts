function normalizeUrlish(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .trim();
}

function normalizeSupabaseBaseUrl(): string {
  const raw = normalizeUrlish(import.meta.env?.VITE_SUPABASE_URL);
  return raw.replace(/\/+$/, "");
}

export function buildPublicStorageUrl(bucket: string, objectPath: string): string {
  const base = normalizeSupabaseBaseUrl();
  const cleanBucket = normalizeUrlish(bucket);
  const cleanPath = normalizeUrlish(objectPath).replace(/^\/+/, "");
  if (!base || !cleanBucket || !cleanPath) return "";

  const encoded = cleanPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${base}/storage/v1/object/public/${encodeURIComponent(cleanBucket)}/${encoded}`;
}

function rewriteLegacyMediaHostUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== "media.mansoni.ru") {
      return url;
    }

    const relativePath = parsed.pathname.replace(/^\/+/, "");
    const firstSlash = relativePath.indexOf("/");
    if (firstSlash === -1) return url;

    const bucket = relativePath.slice(0, firstSlash);
    const objectPath = relativePath.slice(firstSlash + 1);
    return buildPublicStorageUrl(bucket, objectPath) || url;
  } catch {
    return url;
  }
}

export function normalizeMediaUrl(urlOrPath: unknown, bucket?: string): string {
  const value = normalizeUrlish(urlOrPath);
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    return rewriteLegacyMediaHostUrl(value);
  }

  if (value.startsWith("/storage/")) {
    const base = normalizeSupabaseBaseUrl();
    return base ? `${base}${value}` : value;
  }

  if (value.startsWith("storage/")) {
    const base = normalizeSupabaseBaseUrl();
    return base ? `${base}/${value}` : value;
  }

  if (!bucket) {
    return value;
  }

  return buildPublicStorageUrl(bucket, value) || value;
}

export function normalizeAvatarUrl(urlOrPath: unknown): string {
  return normalizeMediaUrl(urlOrPath, "avatars");
}