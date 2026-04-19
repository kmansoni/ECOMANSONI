/**
 * Offline search engine — fully autonomous, no external APIs.
 * Searches local POI + address database downloaded from OSM.
 * Uses trigram-based fuzzy matching for typo tolerance.
 */

import type { LatLng } from '@/types/taxi';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SearchEntry {
  id: string;
  type: 'poi' | 'address' | 'city';
  name: string;
  display: string;
  tokens: string[];
  lat: number;
  lon: number;
  category: string;
  countryCode?: string;
  population?: number;
}

export interface LocalSettlement {
  geonameId: string;
  name: string;
  asciiName: string | null;
  alternateNames: string[];
  latitude: number;
  longitude: number;
  featureClass: string;
  featureCode: string;
  countryCode: string;
  admin1Code: string | null;
  admin2Code: string | null;
  population: number;
  timezone: string | null;
}

export interface LocalPOI {
  id: string;
  name: string;
  category: string;
  lat: number;
  lon: number;
  address: string | null;
  phone: string | null;
  website: string | null;
  opening_hours: string | null;
  cuisine: string | null;
  brand: string | null;
  tags: Record<string, string | undefined>;
}

export interface LocalAddress {
  id: string;
  full: string;
  street: string;
  house: string;
  city: string;
  postcode: string;
  lat: number;
  lon: number;
}

export interface LocalSpeedCamera {
  id: string;
  lat: number;
  lon: number;
  speedLimit: number;
  direction: number;
  type: 'fixed' | 'average' | 'mobile';
}

export interface SearchResult {
  id: string;
  type: 'poi' | 'address' | 'city';
  name: string;
  display: string;
  position: LatLng;
  category: string;
  score: number;
  distance?: number;
  population?: number;
}

// ─── In-memory data stores ──────────────────────────────────────────────────

let _searchIndex: SearchEntry[] | null = null;
let _pois: LocalPOI[] | null = null;
let _addresses: LocalAddress[] | null = null;
let _cameras: LocalSpeedCamera[] | null = null;
let _settlements: LocalSettlement[] | null = null;
let _loadPromise: Promise<void> | null = null;
let _loadedRegions: Set<string> = new Set();
let _allRegionsLoaded = false;
let _allRegionsPromise: Promise<void> | null = null;

interface SettlementManifestEntry {
  countryCode: string;
  countryName: string;
  count: number;
  target: string;
  topPlace: string | null;
  topPopulation: number;
}

// ─── Data loading ───────────────────────────────────────────────────────────

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function loadOfflineData(): Promise<boolean> {
  if (_searchIndex) return true;

  if (_loadPromise) {
    await _loadPromise;
    return _searchIndex != null;
  }

  _loadPromise = (async () => {
    console.log('[OfflineSearch] Загрузка локальных данных...');

    const [index, pois, addresses, cameras] = await Promise.all([
      fetchJSON<SearchEntry[]>('/data/osm/processed/search_index.json'),
      fetchJSON<LocalPOI[]>('/data/osm/processed/pois.json'),
      fetchJSON<LocalAddress[]>('/data/osm/processed/addresses.json'),
      fetchJSON<LocalSpeedCamera[]>('/data/osm/processed/speed_cameras.json'),
    ]);

    _searchIndex = index ?? [];
    _pois = pois;
    _addresses = addresses;
    _cameras = cameras;

    console.log(`[OfflineSearch] Загружено: ${_searchIndex.length} записей, ${pois?.length ?? 0} POI, ${addresses?.length ?? 0} адресов, ${cameras?.length ?? 0} камер`);

    // Preload common regions — AWAIT so cities are available immediately
    await preloadCommonRegions().catch(() => {});
  })();

  await _loadPromise;
  return _searchIndex != null;
}

export function isOfflineDataLoaded(): boolean {
  return _searchIndex != null;
}

// ─── Settlement/Region loading ────────────────────────────────────────────────

/**
 * Load settlements for a specific country/region
 * This enables on-demand loading of country data
 */
export async function loadRegionSettlements(countryCode: string): Promise<boolean> {
  if (_loadedRegions.has(countryCode.toUpperCase())) {
    return true;
  }

  const code = countryCode.toUpperCase();
  const settlements = await fetchJSON<LocalSettlement[]>(`/data/osm/world/processed/settlements/${code}.json`);

  if (!settlements || settlements.length === 0) {
    console.log(`[OfflineSearch] Нет данных для региона: ${code}`);
    return false;
  }

  // Initialize settlements array if needed
  if (!_settlements) {
    _settlements = [];
  }

  // Add settlements to the array
  _settlements.push(...settlements);
  _loadedRegions.add(code);

  // Build search entries from settlements for this region
  const newEntries: SearchEntry[] = settlements
    .filter(s => s.population && s.population >= 1000) // Only towns with 1000+ pop
    .map(s => ({
      id: `city-${s.geonameId}`,
      type: 'city' as const,
      name: s.name,
      display: s.name + (s.asciiName && s.asciiName !== s.name ? ` (${s.asciiName})` : ''),
      tokens: [
        s.name.toLowerCase(),
        ...s.alternateNames.map(n => n.toLowerCase()),
        s.asciiName?.toLowerCase() ?? ''
      ].filter(Boolean),
      lat: s.latitude,
      lon: s.longitude,
      category: 'city',
      countryCode: s.countryCode,
      population: s.population
    }));

  // Merge with existing search index
  if (_searchIndex) {
    _searchIndex = [..._searchIndex, ...newEntries];
  } else {
    _searchIndex = newEntries;
  }

  console.log(`[OfflineSearch] Загружено ${settlements.length} населённых пунктов для ${code}, из них ${newEntries.length} с населением 1000+`);
  return true;
}

/**
 * Preload common regions (Russia, CIS, popular destinations)
 */
export async function preloadCommonRegions(): Promise<void> {
  const commonRegions = [
    'RU', 'AE', 'US', 'DE', 'GB', 'FR', 'TR', 'UA', 'BY', 'KZ',
    'UZ', 'GE', 'AM', 'AZ', 'TJ', 'KG', 'MD', 'TM', // CIS
    'IT', 'ES', 'CN', 'JP', 'KR', 'TH', 'IN', 'BR',  // Popular
    'EG', 'IL', 'CY', 'GR', 'PL', 'CZ', 'AT', 'NL',  // Travel
  ];
  await Promise.all(commonRegions.map(code => loadRegionSettlements(code).catch(() => false)));
}

/**
 * Load ALL available regions from manifest.
 * Called on-demand when initial search returns too few city results.
 */
export async function loadAllRegions(): Promise<void> {
  if (_allRegionsLoaded) return;
  if (_allRegionsPromise) {
    await _allRegionsPromise;
    return;
  }

  _allRegionsPromise = (async () => {
    const manifest = await fetchJSON<SettlementManifestEntry[]>(
      '/data/osm/world/processed/settlements-manifest.json'
    );
    if (!manifest) return;

    const unloaded = manifest
      .filter(e => !_loadedRegions.has(e.countryCode))
      .map(e => e.countryCode);

    if (unloaded.length === 0) {
      _allRegionsLoaded = true;
      return;
    }

    console.log(`[OfflineSearch] Загружаем оставшиеся ${unloaded.length} регионов...`);

    // Load in batches of 20 to avoid overwhelming the browser
    for (let i = 0; i < unloaded.length; i += 20) {
      const batch = unloaded.slice(i, i + 20);
      await Promise.all(batch.map(code => loadRegionSettlements(code).catch(() => false)));
    }

    _allRegionsLoaded = true;
    console.log(`[OfflineSearch] Все регионы загружены. Итого ${_loadedRegions.size} стран, ${_searchIndex?.length ?? 0} записей в индексе`);
  })();

  await _allRegionsPromise;
}

/**
 * Get all loaded regions
 */
export function getLoadedRegions(): string[] {
  return Array.from(_loadedRegions);
}

// ─── Trigram fuzzy search ───────────────────────────────────────────────────

function trigrams(s: string): Set<string> {
  const padded = `  ${s.toLowerCase()}  `;
  const result = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    result.add(padded.slice(i, i + 3));
  }
  return result;
}

function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  let intersection = 0;
  for (const t of ta) {
    if (tb.has(t)) intersection++;
  }
  const union = ta.size + tb.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ─── Distance calculation ───────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Main search function ───────────────────────────────────────────────────

export async function searchOffline(
  query: string,
  near?: LatLng,
  limit = 20,
  categoryFilter?: string
): Promise<SearchResult[]> {
  await loadOfflineData();
  if (!_searchIndex) return [];

  const q = query.toLowerCase().trim();
  if (!q) return [];

  const queryTokens = q
    .replace(/[^\wа-яёА-ЯЁ\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 1);

  if (queryTokens.length === 0) return [];

  let results = _runSearch(_searchIndex, queryTokens, q, near, limit, categoryFilter);

  // If few city results and not all regions loaded — load remaining and retry
  const cityCount = results.filter(r => r.type === 'city').length;
  if (cityCount < 3 && !_allRegionsLoaded && q.length >= 3) {
    await loadAllRegions();
    if (_searchIndex) {
      results = _runSearch(_searchIndex, queryTokens, q, near, limit, categoryFilter);
    }
  }

  return results;
}

function _runSearch(
  index: SearchEntry[],
  queryTokens: string[],
  q: string,
  near: LatLng | undefined,
  limit: number,
  categoryFilter: string | undefined,
): SearchResult[] {
  const results: SearchResult[] = [];

  for (const entry of index) {
    if (categoryFilter && entry.category !== categoryFilter) continue;

    // Token match score
    let tokenScore = 0;
    for (const qt of queryTokens) {
      let bestMatch = 0;
      for (const et of entry.tokens) {
        // Exact substring match
        if (et.includes(qt) || qt.includes(et)) {
          bestMatch = Math.max(bestMatch, 1.0);
          break;
        }
        // Prefix match
        if (et.startsWith(qt.slice(0, 3)) || qt.startsWith(et.slice(0, 3))) {
          bestMatch = Math.max(bestMatch, 0.7);
        }
        // Trigram fuzzy
        const sim = trigramSimilarity(qt, et);
        if (sim > 0.3) {
          bestMatch = Math.max(bestMatch, sim);
        }
      }
      tokenScore += bestMatch;
    }

    // Name direct match bonus
    const nameLower = entry.name.toLowerCase();
    if (nameLower.includes(q)) {
      tokenScore += 2;
    } else if (nameLower.startsWith(q.slice(0, 4))) {
      tokenScore += 1;
    }

    // Normalize score
    const score = tokenScore / queryTokens.length;
    if (score < 0.3) continue;

    // Distance factor (closer = higher score)
    let distance: number | undefined;
    if (near) {
      distance = haversineKm(near.lat, near.lng, entry.lat, entry.lon);
    }

    // Combine text score with distance (if available)
    let finalScore = score;
    if (distance != null) {
      // Boost nearby results (within 5km gets 2x, within 20km gets 1.5x)
      if (distance < 1) finalScore *= 3;
      else if (distance < 5) finalScore *= 2;
      else if (distance < 20) finalScore *= 1.5;
    }

    // Population boost for cities (larger cities rank higher)
    if (entry.type === 'city' && entry.population) {
      if (entry.population >= 1000000) finalScore *= 2;       // 1M+ (Moscow, Dubai)
      else if (entry.population >= 100000) finalScore *= 1.5; // 100K+
      else if (entry.population >= 10000) finalScore *= 1.2;  // 10K+
    }

    results.push({
      id: entry.id,
      type: entry.type,
      name: entry.name,
      display: entry.display,
      position: { lat: entry.lat, lng: entry.lon },
      category: entry.category,
      score: finalScore,
      distance,
      population: entry.population,
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}

// ─── Reverse geocoding (offline) ────────────────────────────────────────────

export async function reverseGeocode(position: LatLng): Promise<string | null> {
  await loadOfflineData();
  if (!_addresses) return null;

  let closest: LocalAddress | null = null;
  let closestDist = Infinity;

  for (const addr of _addresses) {
    const dist = haversineKm(position.lat, position.lng, addr.lat, addr.lon);
    if (dist < closestDist) {
      closestDist = dist;
      closest = addr;
    }
  }

  if (closest && closestDist < 0.1) { // within 100m
    return closest.full;
  }

  return null;
}

// ─── POI by category (nearby) ───────────────────────────────────────────────

export async function findNearbyPOIs(
  position: LatLng,
  category?: string,
  radiusKm = 5,
  limit = 50
): Promise<SearchResult[]> {
  await loadOfflineData();
  if (!_pois) return [];

  const results: SearchResult[] = [];

  for (const poi of _pois) {
    if (category && poi.category !== category) continue;

    const distance = haversineKm(position.lat, position.lng, poi.lat, poi.lon);
    if (distance > radiusKm) continue;

    results.push({
      id: poi.id,
      type: 'poi',
      name: poi.name,
      display: poi.address ? `${poi.name}, ${poi.address}` : poi.name,
      position: { lat: poi.lat, lng: poi.lon },
      category: poi.category,
      score: 1 / (1 + distance), // closer = higher score
      distance,
    });
  }

  results.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  return results.slice(0, limit);
}

// ─── Get offline speed cameras ──────────────────────────────────────────────

export async function getOfflineSpeedCameras(): Promise<LocalSpeedCamera[]> {
  await loadOfflineData();
  return _cameras ?? [];
}

// ─── Get all POI categories ─────────────────────────────────────────────────

export async function getPOICategories(): Promise<{ category: string; count: number }[]> {
  await loadOfflineData();
  if (!_pois) return [];

  const counts = new Map<string, number>();
  for (const poi of _pois) {
    counts.set(poi.category, (counts.get(poi.category) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}
