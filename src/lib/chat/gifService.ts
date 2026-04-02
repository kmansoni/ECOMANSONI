/**
 * GIF Service — интеграция с Tenor API v2
 */

const TENOR_API_KEY = import.meta.env.VITE_TENOR_API_KEY || "";
const TENOR_BASE = "https://tenor.googleapis.com/v2";
const CLIENT_KEY = "your_ai_companion";

function isTenorConfigured(): boolean {
  return TENOR_API_KEY.length > 0;
}

export interface GifItem {
  id: string;
  url: string;         // mp4 или gif url
  previewUrl: string;  // уменьшенное превью
  width: number;
  height: number;
  title?: string;
}

export interface GifResult {
  results: GifItem[];
  next?: string; // pagination pos
}

export interface GifCategory {
  searchterm: string;
  path: string;
  image: string;
  name: string;
}

function parseTenorResult(item: any): GifItem {
  const mp4 = item.media_formats?.mp4;
  const gif = item.media_formats?.gif;
  const tinygif = item.media_formats?.tinygif;
  const nanogif = item.media_formats?.nanogif;

  const url = mp4?.url || gif?.url || "";
  const previewUrl = nanogif?.url || tinygif?.url || gif?.url || url;
  const dims = mp4?.dims || gif?.dims || [200, 200];

  return {
    id: item.id,
    url,
    previewUrl,
    width: dims[0] ?? 200,
    height: dims[1] ?? 200,
    title: item.title || "",
  };
}

export async function searchGifs(
  query: string,
  limit = 20,
  pos?: string
): Promise<GifResult> {
  if (!isTenorConfigured()) return { results: [] };
  const params = new URLSearchParams({
    q: query,
    key: TENOR_API_KEY,
    client_key: CLIENT_KEY,
    limit: String(limit),
    media_filter: "mp4,gif,tinygif,nanogif",
    contentfilter: "medium",
    locale: "ru_RU",
  });
  if (pos) params.set("pos", pos);

  const res = await fetch(`${TENOR_BASE}/search?${params}`);
  if (!res.ok) throw new Error(`Tenor API error: ${res.status}`);

  const data = await res.json();
  return {
    results: (data.results || []).map(parseTenorResult),
    next: data.next,
  };
}

export async function getTrendingGifs(limit = 20): Promise<GifResult> {
  if (!isTenorConfigured()) return { results: [] };
  const params = new URLSearchParams({
    key: TENOR_API_KEY,
    client_key: CLIENT_KEY,
    limit: String(limit),
    media_filter: "mp4,gif,tinygif,nanogif",
    contentfilter: "medium",
    locale: "ru_RU",
  });

  const res = await fetch(`${TENOR_BASE}/featured?${params}`);
  if (!res.ok) throw new Error(`Tenor API error: ${res.status}`);

  const data = await res.json();
  return {
    results: (data.results || []).map(parseTenorResult),
    next: data.next,
  };
}

export async function getGifCategories(): Promise<GifCategory[]> {
  if (!isTenorConfigured()) return [];
  const params = new URLSearchParams({
    key: TENOR_API_KEY,
    client_key: CLIENT_KEY,
    locale: "ru_RU",
    contentfilter: "medium",
  });

  const res = await fetch(`${TENOR_BASE}/categories?${params}`);
  if (!res.ok) throw new Error(`Tenor API error: ${res.status}`);

  const data = await res.json();
  return data.tags || [];
}
