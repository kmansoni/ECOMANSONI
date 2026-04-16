/**
 * useLinkPreview — извлекает URL из текста и тянет OG-метаданные
 * через Edge Function `link-preview` (SSRF-защита + серверный кэш на 24h).
 */

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

const CACHE_KEY_PREFIX = "lp_v2:";
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
  domain: string;
  fetchedAt: number;
}

const URL_REGEX = /https?:\/\/[^\s"'<>()[\]{}]+/gi;

export function extractUrls(text: string): string[] {
  const raw = text.match(URL_REGEX);
  if (!raw) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const u of raw) {
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
  } catch (error) {
    logger.warn("[useLinkPreview] Failed to read cache", { url, error });
    return null;
  }
}

function writeCache(data: LinkPreviewData): void {
  try {
    sessionStorage.setItem(cacheKey(data.url), JSON.stringify(data));
  } catch (error) {
    logger.warn("[useLinkPreview] Failed to write cache", { url: data.url, error });
  }
}

function parseDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_error) {
    return url;
  }
}

function parseFavicon(url: string): string {
  try {
    const { protocol, host } = new URL(url);
    return `${protocol}//${host}/favicon.ico`;
  } catch (_error) {
    return "";
  }
}

const inFlight = new Map<string, Promise<LinkPreviewData>>();

interface EdgeResponse {
  url?: string;
  domain?: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  favicon?: string | null;
  fetchedAt?: number;
}

export async function fetchPreview(url: string): Promise<LinkPreviewData> {
  const cached = readCache(url);
  if (cached) return cached;

  const existing = inFlight.get(url);
  if (existing) return existing;

  const p = (async (): Promise<LinkPreviewData> => {
    try {
      const { data, error } = await supabase.functions.invoke<EdgeResponse>(
        "link-preview",
        { body: { url } },
      );
      if (error) throw error;
      if (!data || typeof data !== "object") {
        throw new Error("link-preview:empty-response");
      }

      const result: LinkPreviewData = {
        url: data.url ?? url,
        title: data.title ?? null,
        description: data.description ?? null,
        image: data.image ?? null,
        favicon: data.favicon ?? parseFavicon(url),
        domain: data.domain ?? parseDomain(url),
        fetchedAt: typeof data.fetchedAt === "number" ? data.fetchedAt : Date.now(),
      };
      writeCache(result);
      return result;
    } catch (error) {
      logger.warn("[useLinkPreview] fetchPreview fallback activated", { url, error });
      return {
        url,
        title: null,
        description: null,
        image: null,
        favicon: parseFavicon(url),
        domain: parseDomain(url),
        fetchedAt: Date.now(),
      };
    }
  })();

  inFlight.set(url, p);
  try {
    return await p;
  } finally {
    inFlight.delete(url);
  }
}

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function fetchPreviewDebounced(
  url: string,
  callback: (data: LinkPreviewData) => void,
  delayMs = 400,
): () => void {
  const existing = debounceTimers.get(url);
  if (existing) clearTimeout(existing);
  const t = setTimeout(async () => {
    debounceTimers.delete(url);
    const data = await fetchPreview(url);
    callback(data);
  }, delayMs);
  debounceTimers.set(url, t);

  return () => {
    clearTimeout(t);
    debounceTimers.delete(url);
  };
}