import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkRateLimit,
  enforceCors,
  errorResponse,
  getClientId,
  getCorsHeaders,
  handleCors,
  rateLimitResponse,
} from "../_shared/utils.ts";

/**
 * link-preview â Supabase Edge Function for OG metadata extraction.
 *
 * Security:
 * - Requires authenticated caller (JWT).
 * - SSRF mitigation: blocks localhost, IP literals, private hostnames.
 * - Redirect loop cap at 3.
 * - HTML body cap at 512 KB.
 * - Caches results in `link_previews` table for 24 hours.
 * - Rate-limited per client (60 req/min via shared util).
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 512 * 1024;

type CachedPreviewRow = {
  url_hash: string;
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
  fetched_at: string;
  expires_at: string;
};

type PreviewPayload = {
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
  fetchedAt: number;
  cached: boolean;
  stale?: boolean;
};

// ââ Helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function jsonResponse(
  payload: unknown,
  origin: string | null,
  status = 200,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...getCorsHeaders(origin),
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

function truncate(value: string | null, limit: number): string | null {
  if (!value) return null;
  const trimmed = decodeHtmlEntities(value)
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) return null;
  return trimmed.slice(0, limit);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ââ SSRF protection âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function isIpv4Literal(host: string): boolean {
  const parts = host.replace(/^\[|\]$/g, "").split(".");
  if (parts.length !== 4) return false;
  return parts.every(
    (part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255,
  );
}

function isIpv6Literal(host: string): boolean {
  return host.replace(/^\[|\]$/g, "").includes(":");
}

function assertSafeHost(host: string): void {
  const normalized = host.trim().replace(/\.+$/g, "").toLowerCase();
  if (!normalized || normalized.length > 253) {
    throw new Error("invalid_host");
  }
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    !normalized.includes(".") ||
    isIpv4Literal(normalized) ||
    isIpv6Literal(normalized)
  ) {
    throw new Error("host_not_allowed");
  }
}

function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new Error("invalid_url");
  }
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("unsupported_protocol");
  }
  if (parsed.username || parsed.password) {
    throw new Error("credentials_in_url_not_allowed");
  }
  assertSafeHost(parsed.hostname);
  parsed.hash = "";
  return parsed.toString();
}

// ââ OG extraction âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function parseDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function parseDefaultFavicon(url: string): string {
  try {
    const { protocol, host } = new URL(url);
    return `${protocol}//${host}/favicon.ico`;
  } catch {
    return "";
  }
}

function extractMeta(html: string, key: string): string | null {
  const escaped = escapeRegex(key);
  const patterns = [
    new RegExp(
      `<meta[^>]*property=["']og:${escaped}["'][^>]*content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:${escaped}["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]*name=["']${escaped}["'][^>]*content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${escaped}["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]*name=["']twitter:${escaped}["'][^>]*content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:${escaped}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractLinkHref(html: string, relNeedle: string): string | null {
  const esc = escapeRegex(relNeedle);
  const a = new RegExp(
    `<link[^>]*rel=["'][^"']*${esc}[^"']*["'][^>]*href=["']([^"']+)["']`,
    "i",
  );
  const b = new RegExp(
    `<link[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*${esc}[^"']*["']`,
    "i",
  );
  return html.match(a)?.[1] ?? html.match(b)?.[1] ?? null;
}

/**
 * Разрешает относительный URL относительно базового и валидирует результат.
 *
 * БЕЗОПАСНОСТЬ: OG-теги контролируются владельцем сайта, но мы не доверяем им
 * слепо. Злоумышленник может разместить страницу с og:image = "javascript:alert(1)"
 * или "data:text/html,...". Если мы кешируем и возвращаем такой URL клиенту,
 * он может быть использован как src в <img> или <a href>, что приведёт к XSS.
 *
 * Разрешаем ТОЛЬКО http: и https: схемы.
 * Дополнительно: блокируем те же хосты что и assertSafeHost (private ranges).
 */
function resolveUrl(
  candidate: string | null,
  baseUrl: string,
): string | null {
  if (!candidate) return null;
  try {
    const resolved = new URL(candidate, baseUrl);

    // Только публичные HTTP(S) URL — никаких javascript:, data:, blob:, ftp: и т.д.
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }

    // Защита от SSRF через extracted URL: тот же набор проверок что для входящего URL.
    // Это предотвращает атаку: злоумышленник размещает og:image = "http://169.254.169.254/"
    // чтобы заставить Edge Function запросить AWS metadata endpoint при рендере preview.
    // (Хотя Deno Deploy блокирует это на уровне сети, defence-in-depth важен)
    try {
      assertSafeHost(resolved.hostname);
    } catch {
      return null;
    }

    return resolved.toString();
  } catch {
    return null;
  }
}

function extractPreview(
  html: string,
  sourceUrl: string,
): Omit<PreviewPayload, "url" | "fetchedAt" | "cached" | "stale"> {
  const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const domain = parseDomain(sourceUrl);
  const title = truncate(
    extractMeta(html, "title") ?? titleTagMatch?.[1] ?? null,
    120,
  );
  const description = truncate(extractMeta(html, "description"), 300);
  const image = resolveUrl(extractMeta(html, "image"), sourceUrl);
  const favicon =
    resolveUrl(extractLinkHref(html, "icon"), sourceUrl) ??
    (parseDefaultFavicon(sourceUrl) || null);

  return { domain, title, description, image, favicon };
}

// ââ Fetch with redirect safety ââââââââââââââââââââââââââââââââââââââââââââââ

async function readTextLimited(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("response_too_large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function fetchHtml(
  initialUrl: string,
): Promise<{ html: string; finalUrl: string }> {
  let current = new URL(initialUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": "ECOMANSONI-LinkPreview/1.0",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("redirect_without_location");
      current = new URL(location, current);
      assertSafeHost(current.hostname);
      continue;
    }
    if (!response.ok) throw new Error(`upstream_${response.status}`);
    const cl = response.headers.get("content-length");
    const clNum = cl ? Number(cl) : NaN;
    if (Number.isFinite(clNum) && clNum > MAX_HTML_BYTES) {
      throw new Error("response_too_large");
    }
    const ct = (response.headers.get("content-type") ?? "").toLowerCase();
    if (
      ct &&
      !ct.includes("text/html") &&
      !ct.includes("application/xhtml+xml")
    ) {
      throw new Error("unsupported_content_type");
    }
    const html = await readTextLimited(response, MAX_HTML_BYTES);
    return { html, finalUrl: current.toString() };
  }
  throw new Error("too_many_redirects");
}

// ââ Cache helpers âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function rowToPayload(
  row: CachedPreviewRow,
  cached: boolean,
  stale = false,
): PreviewPayload {
  return {
    url: row.url,
    domain: row.domain,
    title: row.title,
    description: row.description,
    image: row.image,
    favicon: row.favicon,
    fetchedAt: Date.parse(row.fetched_at) || Date.now(),
    cached,
    ...(stale ? { stale: true } : {}),
  };
}

async function readUrlFromRequest(req: Request): Promise<string | null> {
  if (req.method === "GET") {
    return new URL(req.url).searchParams.get("url");
  }
  try {
    const body = await req.json();
    return typeof body?.url === "string" ? body.url : null;
  } catch {
    return null;
  }
}

// ââ Main handler ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsBlock = enforceCors(req);
  if (corsBlock) return corsBlock;
  const origin = req.headers.get("origin");

  if (req.method !== "POST" && req.method !== "GET") {
    return errorResponse("Method not allowed", 405, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return errorResponse("Server misconfiguration", 500, origin);
  }

  // Rate limit
  const rateLimit = checkRateLimit(`link-preview:${getClientId(req)}`);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn, origin);
  }

  // Auth check â must be an authenticated user
  const authHeader = req.headers.get("Authorization") ?? "";
  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();
  if (authError || !user) {
    return errorResponse("Unauthorized", 401, origin);
  }

  // Read URL from request
  const rawUrl = await readUrlFromRequest(req);
  if (!rawUrl) {
    return errorResponse("url is required", 400, origin);
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeUrl(rawUrl);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid_url";
    return errorResponse(reason, 400, origin);
  }

  // Cache lookup (service_role client for RLS-bypassed table)
  const cacheClient = createClient(supabaseUrl, serviceRoleKey);
  const urlHash = await sha256Hex(normalizedUrl);

  let staleRow: CachedPreviewRow | null = null;

  const { data: cachedRow, error: cacheReadError } = await cacheClient
    .from("link_previews")
    .select(
      "url_hash, url, domain, title, description, image, favicon, fetched_at, expires_at",
    )
    .eq("url_hash", urlHash)
    .maybeSingle();

  if (cacheReadError) {
    console.error("[link-preview] cache read failed", cacheReadError.message);
  }

  if (cachedRow && (cachedRow as CachedPreviewRow).url === normalizedUrl) {
    staleRow = cachedRow as CachedPreviewRow;
    if (Date.parse(staleRow.expires_at) > Date.now()) {
      return jsonResponse(rowToPayload(staleRow, true), origin);
    }
  }

  // Fetch from upstream
  try {
    const { html, finalUrl } = await fetchHtml(normalizedUrl);
    const extracted = extractPreview(html, finalUrl);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);

    const upsertRow = {
      url_hash: urlHash,
      url: normalizedUrl,
      domain: extracted.domain,
      title: extracted.title,
      description: extracted.description,
      image: extracted.image,
      favicon: extracted.favicon,
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    };

    const { error: cacheWriteError } = await cacheClient
      .from("link_previews")
      .upsert(upsertRow, { onConflict: "url_hash" });

    if (cacheWriteError) {
      console.error(
        "[link-preview] cache write failed",
        cacheWriteError.message,
      );
    }

    const payload: PreviewPayload = {
      url: normalizedUrl,
      ...extracted,
      fetchedAt: now.getTime(),
      cached: false,
    };
    return jsonResponse(payload, origin);
  } catch (error) {
    console.error("[link-preview] upstream fetch failed", {
      url: normalizedUrl,
      error: error instanceof Error ? error.message : String(error),
      userId: user.id,
    });

    // Serve stale cache as fallback
    if (staleRow) {
      return jsonResponse(rowToPayload(staleRow, true, true), origin);
    }

    return errorResponse("preview_fetch_failed", 502, origin);
  }
});
