/**
 * Address search — multi-provider geocoding system.
 *
 * Priority:
 *   1. Offline local data (OSM) — instant, no network
 *   2. Photon (Komoot) — free, no key, all world, fast autocomplete
 *   3. DaData — Russian FIAS addresses (needs API key)
 *   4. Nominatim — free, all world, fallback
 *
 * All providers run in parallel for best results.
 */

import type {
  DaDataSuggestion,
  DaDataAddressData,
  DaDataOrgSuggestion,
  FiasAddress,
} from '@/types/fias';
import { searchOffline, reverseGeocode as offlineReverseGeocode } from './offlineSearch';
import { getRequestLanguageHeader } from '@/lib/localization/appLocale';

const DADATA_SUGGEST_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
const DADATA_FIND_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/address';
const DADATA_ORG_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const PHOTON_URL = 'https://photon.komoot.io/api';

type AddressProvider = 'offline' | 'photon' | 'dadata' | 'nominatim';

interface RankedAddressCandidate {
  address: FiasAddress;
  provider: AddressProvider;
  rankScore: number;
}

function getToken(): string | null {
  return (import.meta as unknown as Record<string, Record<string, string>>).env?.VITE_DADATA_API_KEY ?? null;
}

function headers(): Record<string, string> {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Token ${token}` } : {}),
  };
}

function hasExplicitGeoIntent(query: string): boolean {
  return /,|\b(казан|санкт|питер|спб|дуба|берлин|ростов|екатер|новосиб|нижн|самар|уф[аеы]|краснояр|воронеж|перм|волгоград|омск|тюм|челяб|сочи|дубай|berlin|dubai|saint petersburg|st petersburg|rostov|kazan|moscow|london|paris|rome|madrid|istanbul|tokyo|seoul|beijing)\b/i.test(query);
}

function isStreetLevelQuery(query: string): boolean {
  return /\b(ул\.?|улица|проспект|пр-т|переулок|пер\.?|бульвар|бул\.?|шоссе|ш\.?|площадь|пл\.?|набережная|наб\.?|дом|д\.?|корпус|корп\.?|строение|стр\.?|avenue|street|st\.?|road|rd\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?)\b/i.test(query);
}

function isRussianQuery(query: string): boolean {
  return /[а-яё]/i.test(query);
}

function normalizeAddressSearchText(value: string | null | undefined): string {
  if (!value) return '';

  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\bплощадь\b/g, 'пл')
    .replace(/\bпл\.\b/g, 'пл')
    .replace(/\bулица\b/g, 'ул')
    .replace(/\bул\.\b/g, 'ул')
    .replace(/\bнабережная\b/g, 'наб')
    .replace(/\bнаб\.\b/g, 'наб')
    .replace(/\bпроспект\b/g, 'просп')
    .replace(/\bпр-т\b/g, 'просп')
    .replace(/[^\wа-яё]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHouseToken(query: string): string | null {
  const match = normalizeAddressSearchText(query).match(/\b\d+[а-яёa-z]?\b/i);
  return match?.[0] ?? null;
}

function isStrictRussianAddressQuery(query: string): boolean {
  return isRussianQuery(query) && isStreetLevelQuery(query) && extractHouseToken(query) != null;
}

function matchesWholeToken(text: string, token: string): boolean {
  if (!text || !token) return false;
  return new RegExp(`(^|\\s)${escapeRegExp(token)}(\\s|$)`, 'i').test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getExplicitGeoTerms(query: string): string[] {
  const normalized = normalizeAddressSearchText(query);
  const terms = [
    'санкт петербург',
    'спб',
    'питер',
    'москва',
    'казань',
    'сочи',
    'берлин',
    'дубай',
  ];

  return terms.filter((term) => normalized.includes(normalizeAddressSearchText(term)));
}

function getProviderWeight(provider: AddressProvider, query: string): number {
  if (provider === 'dadata') return 1.3;
  if (provider === 'nominatim') return isStrictRussianAddressQuery(query) ? 1.18 : 1.08;
  if (provider === 'offline') return isStrictRussianAddressQuery(query) ? 0.92 : 1.04;
  return isStrictRussianAddressQuery(query) ? 0.45 : 0.96;
}

function scoreAddressCandidate(address: FiasAddress, provider: AddressProvider, query: string, near?: { lat: number; lng: number }): number {
  const normalizedQuery = normalizeAddressSearchText(query);
  const haystacks = [
    normalizeAddressSearchText(address.value),
    normalizeAddressSearchText(address.unrestrictedValue),
    normalizeAddressSearchText([address.street, address.house, address.city, address.region].filter(Boolean).join(' ')),
  ].filter(Boolean);

  let score = getProviderWeight(provider, query);
  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const houseToken = extractHouseToken(query);
  const explicitGeoTerms = getExplicitGeoTerms(query);

  for (const token of queryTokens) {
    const tokenMatched = haystacks.some((text) => matchesWholeToken(text, token) || text.includes(token));
    if (tokenMatched) score += token.length <= 2 ? 0.2 : 0.6;
  }

  if (haystacks.some((text) => text.includes(normalizedQuery))) {
    score += 2.4;
  }

  const street = normalizeAddressSearchText(address.street ?? address.value);
  const city = normalizeAddressSearchText(address.city);
  const unrestricted = normalizeAddressSearchText(address.unrestrictedValue);

  if (street && normalizedQuery.includes(street)) score += 1.2;

  if (houseToken) {
    const candidateHouse = normalizeAddressSearchText(address.house);
    if (candidateHouse && matchesWholeToken(candidateHouse, houseToken)) {
      score += 1.6;
    } else if (haystacks.some((text) => matchesWholeToken(text, houseToken))) {
      score += 1.1;
    } else {
      score -= 2.8;
    }
  }

  if (explicitGeoTerms.length > 0) {
    const geoMatched = explicitGeoTerms.some((term) => city.includes(term) || unrestricted.includes(term));
    if (geoMatched) {
      score += 1.6;
    } else {
      score -= 2.2;
    }
  }

  if (near && address.geoLat != null && address.geoLon != null && !hasExplicitGeoIntent(query)) {
    const distanceKm = haversineKm(near.lat, near.lng, address.geoLat, address.geoLon);
    if (distanceKm < 2) score += 0.9;
    else if (distanceKm < 10) score += 0.45;
  }

  return score;
}

function rankMergedAddressResults(
  candidates: Array<{ address: FiasAddress; provider: AddressProvider }>,
  query: string,
  count: number,
  near?: { lat: number; lng: number },
): FiasAddress[] {
  const ranked = candidates
    .map((candidate) => ({
      ...candidate,
      rankScore: scoreAddressCandidate(candidate.address, candidate.provider, query, near),
    }))
    .sort((left, right) => right.rankScore - left.rankScore);

  const merged: FiasAddress[] = [];
  const seen = new Set<string>();

  for (const candidate of ranked) {
    const addr = candidate.address;
    const dedupeKey = addr.geoLat != null && addr.geoLon != null
      ? `${addr.geoLat.toFixed(5)},${addr.geoLon.toFixed(5)}`
      : `${normalizeAddressSearchText(addr.value)}|${normalizeAddressSearchText(addr.unrestrictedValue)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    merged.push(addr);
    if (merged.length >= count) break;
  }

  return merged;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function applyLocalBias(params: URLSearchParams, near?: { lat: number; lng: number }, query?: string): void {
  if (!near) return;
  if (query && hasExplicitGeoIntent(query)) return;
  if (query && !isStreetLevelQuery(query) && query.trim().length < 6) return;

  params.set('lat', String(near.lat));
  params.set('lon', String(near.lng));
  params.set('zoom', '12');
}

export interface AddressSuggestOptions {
  allowOnline?: boolean;
}

// ── Parse DaData → FiasAddress ───────────────────────────────────────────────

function parseAddress(raw: DaDataAddressData, value: string, unrestricted: string): FiasAddress {
  return {
    value,
    unrestrictedValue: unrestricted,
    fiasId: raw.fias_id,
    fiasLevel: raw.fias_level,
    kladrId: raw.kladr_id,
    postalCode: raw.postal_code,
    country: raw.country ?? 'Россия',
    regionFiasId: raw.region_fias_id,
    region: raw.region,
    regionType: raw.region_type,
    cityFiasId: raw.city_fias_id,
    city: raw.city,
    cityType: raw.city_type,
    streetFiasId: raw.street_fias_id,
    street: raw.street,
    streetType: raw.street_type,
    house: raw.house,
    houseType: raw.house_type,
    block: raw.block,
    blockType: raw.block_type,
    flat: raw.flat,
    flatType: raw.flat_type,
    geoLat: raw.geo_lat ? parseFloat(raw.geo_lat) : null,
    geoLon: raw.geo_lon ? parseFloat(raw.geo_lon) : null,
    okato: raw.okato,
    oktmo: raw.oktmo,
    timezone: raw.timezone,
    qcGeo: raw.qc_geo != null ? parseInt(raw.qc_geo, 10) : null,
    qcComplete: raw.qc_complete != null ? parseInt(raw.qc_complete, 10) : null,
    qcHouse: raw.qc_house != null ? parseInt(raw.qc_house, 10) : null,
  };
}

// ── Address suggestions ──────────────────────────────────────────────────────

export async function suggestAddress(
  query: string,
  count = 8,
  near?: { lat: number; lng: number },
  options: AddressSuggestOptions = {},
): Promise<FiasAddress[]> {
  if (!query.trim()) return [];

  const { allowOnline = true } = options;

  const explicitGeoIntent = hasExplicitGeoIntent(query);

  // Запускаем offline-first; online провайдеры только если явно разрешены.
  const offlinePromise = searchOffline(query, near, count * 2)
    .then((rows) => rows.filter((row) => row.type === 'city' || row.type === 'address').slice(0, count))
    .catch(() => [] as Awaited<ReturnType<typeof searchOffline>>);
  const onlinePromise = allowOnline
    ? suggestAddressOnline(query, count, near).catch(() => [] as Array<{ address: FiasAddress; provider: AddressProvider }>)
    : Promise.resolve([] as Array<{ address: FiasAddress; provider: AddressProvider }>);

  const [offlineResults, onlineResults] = await Promise.all([offlinePromise, onlinePromise]);

  const orderedOfflineResults = explicitGeoIntent
    ? [...offlineResults].sort((a, b) => Number(b.type === 'city') - Number(a.type === 'city'))
    : offlineResults;

  const candidates: Array<{ address: FiasAddress; provider: AddressProvider }> = [];

  for (const item of orderedOfflineResults) {
    candidates.push({
      provider: 'offline',
      address: {
        value: item.name,
        unrestrictedValue: item.display,
        fiasId: null,
        fiasLevel: null,
        kladrId: null,
        postalCode: null,
        country: 'Offline',
        regionFiasId: null,
        region: null,
        regionType: null,
        cityFiasId: null,
        city: item.type === 'city' ? item.name : null,
        cityType: item.type === 'city' ? 'city' : null,
        streetFiasId: null,
        street: item.type === 'address' ? item.name : null,
        streetType: null,
        house: null,
        houseType: null,
        block: null,
        blockType: null,
        flat: null,
        flatType: null,
        geoLat: item.position.lat,
        geoLon: item.position.lng,
        okato: null,
        oktmo: null,
        timezone: null,
        qcGeo: null,
        qcComplete: null,
        qcHouse: null,
      },
    });
  }

  candidates.push(...onlineResults);

  return rankMergedAddressResults(candidates, query, count, near);
}

/** Онлайн поиск: Photon + DaData + Nominatim параллельно */
async function suggestAddressOnline(
  query: string,
  count: number,
  near?: { lat: number; lng: number },
): Promise<Array<{ address: FiasAddress; provider: AddressProvider }>> {
  const strictRussianAddress = isStrictRussianAddressQuery(query);
  const promises: Promise<Array<{ address: FiasAddress; provider: AddressProvider }>>[] = [];

  if (!strictRussianAddress) {
    promises.push(
      suggestAddressPhoton(query, count, near)
        .then((items) => items.map((address) => ({ address, provider: 'photon' as const })))
        .catch(() => []),
    );
  }

  // DaData (если есть ключ — лучшие результаты для России)
  const token = getToken();
  if (token) {
    promises.push(
      fetch(DADATA_SUGGEST_URL, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ query, count }),
      })
        .then(async (resp) => {
          if (!resp.ok) return [];
          const data: { suggestions: DaDataSuggestion[] } = await resp.json();
          return data.suggestions.map((s) => ({
            address: parseAddress(s.data, s.value, s.unrestricted_value),
            provider: 'dadata' as const,
          }));
        })
        .catch(() => [])
    );
  }

  promises.push(
    suggestAddressNominatim(query, Math.min(count, strictRussianAddress ? count : 3), near)
      .then((items) => items.map((address) => ({ address, provider: 'nominatim' as const })))
      .catch(() => []),
  );

  const results = await Promise.all(promises);
  return results.flat();
}

// ── Find by FIAS ID ──────────────────────────────────────────────────────────

export async function findByFiasId(fiasId: string): Promise<FiasAddress | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const resp = await fetch(DADATA_FIND_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ query: fiasId }),
    });

    if (!resp.ok) return null;

    const data: { suggestions: DaDataSuggestion[] } = await resp.json();
    if (!data.suggestions.length) return null;

    const s = data.suggestions[0];
    return parseAddress(s.data, s.value, s.unrestricted_value);
  } catch {
    return null;
  }
}

// ── Organization search (ЕГРЮЛ/ЕГРИП) ───────────────────────────────────────

export interface OrganizationResult {
  name: string;
  fullName: string;
  inn: string | null;
  ogrn: string | null;
  address: string | null;
  addressData: FiasAddress | null;
  phone: string | null;
  email: string | null;
  type: string; // LEGAL | INDIVIDUAL
  status: string | null;
  okved: string | null;
}

export async function suggestOrganization(
  query: string,
  count = 8
): Promise<OrganizationResult[]> {
  if (!query.trim()) return [];

  const token = getToken();
  if (!token) return [];

  try {
    const resp = await fetch(DADATA_ORG_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        query,
        count,
        status: ['ACTIVE'],
      }),
    });

    if (!resp.ok) return [];

    const data: { suggestions: DaDataOrgSuggestion[] } = await resp.json();
    return data.suggestions.map((s) => ({
      name: s.data.name?.short_with_opf ?? s.value,
      fullName: s.data.name?.full_with_opf ?? s.value,
      inn: s.data.inn,
      ogrn: s.data.ogrn,
      address: s.data.address?.value ?? null,
      addressData: s.data.address
        ? parseAddress(s.data.address.data, s.data.address.value, s.data.address.unrestricted_value)
        : null,
      phone: s.data.phones?.[0]?.value ?? null,
      email: s.data.emails?.[0]?.value ?? null,
      type: s.data.type ?? 'LEGAL',
      status: s.data.state?.status ?? null,
      okved: s.data.okved ?? null,
    }));
  } catch {
    return [];
  }
}

// ── Photon geocoder (Komoot) — бесплатный, весь мир ─────────────────────────

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    osm_id?: number;
    osm_type?: string;
    type?: string;
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

async function suggestAddressPhoton(
  query: string,
  count: number,
  near?: { lat: number; lng: number },
): Promise<FiasAddress[]> {
  try {
    const requestLanguage = getRequestLanguageHeader();
    const params = new URLSearchParams({
      q: query,
      limit: String(Math.min(count, 10)),
      lang: requestLanguage,
    });

    applyLocalBias(params, near, query);

    const resp = await fetch(`${PHOTON_URL}?${params}`, {
      headers: { 'User-Agent': 'MansoniNav/1.0' },
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) return [];

    const data: PhotonResponse = await resp.json();

    return data.features
      .filter(f => f.geometry?.coordinates)
      .map(f => {
        const p = f.properties;
        const [lon, lat] = f.geometry.coordinates;

        // Формируем читаемый адрес
        const parts: string[] = [];
        if (p.street) {
          parts.push(p.street);
          if (p.housenumber) parts.push(p.housenumber);
        } else if (p.name) {
          parts.push(p.name);
        }

        const displayParts: string[] = [];
        if (p.city && p.city !== p.name) displayParts.push(p.city);
        if (p.district) displayParts.push(p.district);
        if (p.street) displayParts.push(p.street);
        if (p.housenumber) displayParts.push(p.housenumber);
        if (!p.street && p.name) displayParts.push(p.name);

        return {
          value: parts.join(', ') || p.name || '',
          unrestrictedValue: displayParts.join(', ') || p.name || '',
          fiasId: null,
          fiasLevel: null,
          kladrId: null,
          postalCode: p.postcode || null,
          country: p.country || 'Unknown',
          regionFiasId: null,
          region: p.state || null,
          regionType: null,
          cityFiasId: null,
          city: p.city || null,
          cityType: null,
          streetFiasId: null,
          street: p.street || null,
          streetType: null,
          house: p.housenumber || null,
          houseType: null,
          block: null,
          blockType: null,
          flat: null,
          flatType: null,
          geoLat: lat,
          geoLon: lon,
          okato: null,
          oktmo: null,
          timezone: null,
          qcGeo: null,
          qcComplete: null,
          qcHouse: null,
        };
      })
      .filter(a => a.value.length > 0);
  } catch {
    return [];
  }
}

// ── Nominatim fallback ───────────────────────────────────────────────────────

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

async function suggestAddressNominatim(
  query: string,
  count: number,
  near?: { lat: number; lng: number },
): Promise<FiasAddress[]> {
  try {
    const requestLanguage = getRequestLanguageHeader();
    const searchQuery = query;

    // Пробуем несколько вариантов запроса
    const queries = [searchQuery];
    // Вариант без "улица/ул." — Nominatim лучше ищет без типа
    const withoutType = searchQuery.replace(/\b(ул\.|улица|пр-т|проспект|пер\.|переулок)\s*/gi, '');
    if (withoutType !== searchQuery) queries.push(withoutType);
    // Вариант: улица [name] (если типа нет, добавляем)
    if (!/\b(ул\.|улица|пр-т|проспект|пер\.|переулок|бул\.|бульвар|ш\.|шоссе|пл\.|площадь|наб\.|набережная)\b/i.test(query)) {
      const parts = query.trim().split(/\s+/);
      if (parts.length >= 2) {
        queries.push(`${parts[0]} street ${parts.slice(1).join(' ')}`);
      }
    }

    const allResults: FiasAddress[] = [];
    const seen = new Set<string>();

    for (const q of queries) {
      const params = new URLSearchParams({
        format: 'jsonv2',
        q,
        limit: String(count),
        'accept-language': requestLanguage,
        addressdetails: '1',
      });
      if (near && !hasExplicitGeoIntent(query) && isStreetLevelQuery(query)) {
        params.set('lat', String(near.lat));
        params.set('lon', String(near.lng));
      }

      const url = `${NOMINATIM_URL}?${params.toString()}`;
      const resp = await fetch(url);
      if (!resp.ok) continue;

      const data: NominatimResult[] = await resp.json();
      for (const r of data) {
        const key = `${parseFloat(r.lat).toFixed(5)},${parseFloat(r.lon).toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allResults.push({
          value: r.display_name.split(',').slice(0, 3).join(',').trim(),
          unrestrictedValue: r.display_name,
          fiasId: null,
          fiasLevel: null,
          kladrId: null,
          postalCode: null,
          country: 'Unknown',
          regionFiasId: null,
          region: null,
          regionType: null,
          cityFiasId: null,
          city: null,
          cityType: null,
          streetFiasId: null,
          street: null,
          streetType: null,
          house: null,
          houseType: null,
          block: null,
          blockType: null,
          flat: null,
          flatType: null,
          geoLat: parseFloat(r.lat),
          geoLon: parseFloat(r.lon),
          okato: null,
          oktmo: null,
          timezone: null,
          qcGeo: null,
          qcComplete: null,
          qcHouse: null,
        });
      }
      if (allResults.length >= count) break;
    }

    return allResults.slice(0, count);
  } catch {
    return [];
  }
}
