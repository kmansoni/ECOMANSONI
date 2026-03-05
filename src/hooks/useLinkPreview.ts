/**
 * useLinkPreview — extracts URLs from text and fetches OG metadata.
 *
 * Security contract:
 * - URL extraction uses a strict regex; no eval, no innerHTML.
 * - External fetch is proxied through own VITE_LINK_PREVIEW_API_URL endpoint (CORS-safe, read-only).
 *   Response format: { contents: string } (HTML body of the target URL).
 * - Cache key is URL + TTL epoch; stale entries are evicted on read.
 * - No credentials/cookies forwarded; SSRF surface is browser-constrained.
 */

const CACHE_KEY_PREFIX = "lp_v1:";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

export interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
  domain: string;
  fetchedAt: number;
}

// Strict URL regex — matches http(s) URLs only, no javascript:/data: attack surface.
const URL_REGEX = /https?:\/\/[^\s"'<>()[\]{}]+/gi;

export function extractUrls(text: string): string[] {
  const raw = text.match(URL_REGEX);
  if (!raw) return [];
  // Deduplicate while preserving first-occurrence order.
  const seen = new Set<string>();
  const result: string[] = [];
  for (const u of raw) {
    // Strip trailing punctuation that is commonly attached to URLs in prose.
    const cleaned = u.replace(/[.,!?;:]+$/, "");
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      result.push(cleaned);
    }
  }
  return result;
}

function cacheKey(url: string): string {
  return CACHE_KEY_PREFIX + encodeURIComponent(url);
}

function readCache(url: string): LinkPreviewData | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(url));
    if (!raw) return null;
    const data = JSON.parse(raw) as LinkPreviewData;
    if (Date.now() - data.fetchedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(cacheKey(url));
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function writeCache(data: LinkPreviewData): void {
  try {
    sessionStorage.setItem(cacheKey(data.url), JSON.stringify(data));
  } catch {
    // sessionStorage may be full or disabled; best-effort.
  }
}

function parseDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function parseFavicon(url: string): string {
  try {
    const { protocol, host } = new URL(url);
    return `${protocol}//${host}/favicon.ico`;
  } catch {
    return "";
  }
}

/**
 * Parses OG/meta tags from raw HTML string without using DOMParser in workers
 * (safe for all environments). Uses regex — content is never rendered.
 */
function parseOGFromHTML(
  html: string,
  url: string
): Omit<LinkPreviewData, "fetchedAt"> {
  const domain = parseDomain(url);
  const favicon = parseFavicon(url);

  const getMeta = (property: string): string | null => {
    // og:property or name=property patterns
    const ogMatch = html.match(
      new RegExp(
        `<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']+)["']`,
        "i"
      )
    );
    if (ogMatch?.[1]) return ogMatch[1];
    const ogMatch2 = html.match(
      new RegExp(
        `<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:${property}["']`,
        "i"
      )
    );
    if (ogMatch2?.[1]) return ogMatch2[1];
    const nameMatch = html.match(
      new RegExp(
        `<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']+)["']`,
        "i"
      )
    );
    if (nameMatch?.[1]) return nameMatch[1];
    return null;
  };

  const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title =
    getMeta("title") || (titleTagMatch ? titleTagMatch[1].trim() : null);
  const description = getMeta("description");
  const image = getMeta("image");

  // Resolve relative images
  let resolvedImage = image;
  if (image && !image.startsWith("http")) {
    try {
      resolvedImage = new URL(image, url).href;
    } catch {
      resolvedImage = null;
    }
  }

  return {
    url,
    title: title ? title.slice(0, 120) : null,
    description: description ? description.slice(0, 300) : null,
    image: resolvedImage,
    favicon,
    domain,
  };
}

// In-flight deduplication: prevents N concurrent fetches for the same URL.
const inFlight = new Map<string, Promise<LinkPreviewData>>();

export async function fetchPreview(url: string): Promise<LinkPreviewData> {
  const cached = readCache(url);
  if (cached) return cached;

  const existing = inFlight.get(url);
  if (existing) return existing;

  const p = (async (): Promise<LinkPreviewData> => {
    try {
      // Use own CORS proxy — endpoint must return { contents: string }.
      const linkPreviewApi = (import.meta.env as Record<string, string>).VITE_LINK_PREVIEW_API_URL ?? "";
      if (!linkPreviewApi) {
        throw new Error("link-preview:api-url-missing — set VITE_LINK_PREVIEW_API_URL");
      }
      const proxyUrl = `${linkPreviewApi}?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`proxy ${res.status}`);
      const json = await res.json();
      const html: string =
        typeof json?.contents === "string" ? json.contents : "";
      const parsed = parseOGFromHTML(html, url);
      const data: LinkPreviewData = { ...parsed, fetchedAt: Date.now() };
      writeCache(data);
      return data;
    } catch {
      // Fallback: domain + favicon only — never throw, graceful degradation.
      const fallback: LinkPreviewData = {
        url,
        title: null,
        description: null,
        image: null,
        favicon: parseFavicon(url),
        domain: parseDomain(url),
        fetchedAt: Date.now(),
      };
      // Do NOT cache failures — allow retry on next render.
      return fallback;
    }
  })();

  inFlight.set(url, p);
  try {
    return await p;
  } finally {
    inFlight.delete(url);
  }
}

// Debounce helper — prevents spamming the proxy on every keystroke.
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function fetchPreviewDebounced(
  url: string,
  callback: (data: LinkPreviewData) => void,
  delayMs = 400
): () => void {
  const existing = debounceTimers.get(url);
  if (existing) clearTimeout(existing);
  const t = setTimeout(async () => {
    debounceTimers.delete(url);
    const data = await fetchPreview(url);
    callback(data);
  }, delayMs);
  debounceTimers.set(url, t);

  // Return cleanup function
  return () => {
    clearTimeout(t);
    debounceTimers.delete(url);
  };
}
