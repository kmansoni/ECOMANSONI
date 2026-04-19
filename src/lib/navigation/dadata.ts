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

const DADATA_SUGGEST_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
const DADATA_FIND_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/address';
const DADATA_ORG_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const PHOTON_URL = 'https://photon.komoot.io/api';

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
  count = 8
): Promise<FiasAddress[]> {
  if (!query.trim()) return [];

  // Запускаем offline + online ПАРАЛЛЕЛЬНО (не блокируем на offline)
  const offlinePromise = searchOffline(query, undefined, count).catch(() => [] as Awaited<ReturnType<typeof searchOffline>>);
  const onlinePromise = suggestAddressOnline(query, count).catch(() => [] as FiasAddress[]);

  const [offlineResults, onlineResults] = await Promise.all([offlinePromise, onlinePromise]);

  // Объединяем: offline первые, затем online (без дублей)
  const merged: FiasAddress[] = [];
  const seen = new Set<string>();

  // Offline → FiasAddress
  for (const r of offlineResults) {
    const key = `${r.position.lat.toFixed(5)},${r.position.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      value: r.name,
      unrestrictedValue: r.display,
      fiasId: null,
      fiasLevel: null,
      kladrId: null,
      postalCode: null,
      country: null,
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
      geoLat: r.position.lat,
      geoLon: r.position.lng,
      okato: null,
      oktmo: null,
      timezone: null,
      qcGeo: null,
      qcComplete: null,
      qcHouse: null,
    });
  }

  // Online results
  for (const addr of onlineResults) {
    if (addr.geoLat && addr.geoLon) {
      const key = `${addr.geoLat.toFixed(5)},${addr.geoLon.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    merged.push(addr);
  }

  return merged.slice(0, count);
}

/** Онлайн поиск: Photon + DaData + Nominatim параллельно */
async function suggestAddressOnline(
  query: string,
  count: number,
): Promise<FiasAddress[]> {
  const promises: Promise<FiasAddress[]>[] = [];

  // 1) Photon (бесплатный, весь мир, быстрый)
  promises.push(suggestAddressPhoton(query, count).catch(() => []));

  // 2) DaData (если есть ключ — лучшие результаты для России)
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
          return data.suggestions.map((s) =>
            parseAddress(s.data, s.value, s.unrestricted_value)
          );
        })
        .catch(() => [])
    );
  }

  // 3) Nominatim (fallback, весь мир)
  promises.push(suggestAddressNominatim(query, Math.min(count, 3)).catch(() => []));

  const results = await Promise.all(promises);

  // Объединяем без дублей (по координатам)
  const merged: FiasAddress[] = [];
  const seen = new Set<string>();

  for (const batch of results) {
    for (const addr of batch) {
      if (addr.geoLat && addr.geoLon) {
        const key = `${addr.geoLat.toFixed(4)},${addr.geoLon.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      merged.push(addr);
    }
  }

  return merged.slice(0, count);
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

async function suggestAddressPhoton(query: string, count: number): Promise<FiasAddress[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      limit: String(Math.min(count, 10)),
      lang: 'ru',
    });

    // Если нет явного указания города, добавляем bias к Москве
    const hasCity = /москв|питер|санкт|спб|екатер|новосиб|казан/i.test(query);
    if (!hasCity) {
      params.set('lat', '55.75');
      params.set('lon', '37.62');
      params.set('zoom', '12');
    }

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
          country: p.country || 'Россия',
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

async function suggestAddressNominatim(query: string, count: number): Promise<FiasAddress[]> {
  try {
    // Добавляем "Москва" если нет явного города в запросе
    const hasCity = /москв|питер|санкт|спб|мск|екатер|новосиб|казан|нижн|самар|ростов|уф[аеы]|красноярск|ворон|перм|волгоград/i.test(query);
    const searchQuery = hasCity ? query : `Москва, ${query}`;

    // Пробуем несколько вариантов запроса
    const queries = [searchQuery];
    // Вариант без "улица/ул." — Nominatim лучше ищет без типа
    const withoutType = searchQuery.replace(/\b(ул\.|улица|пр-т|проспект|пер\.|переулок)\s*/gi, '');
    if (withoutType !== searchQuery) queries.push(withoutType);
    // Вариант: улица [name] (если типа нет, добавляем)
    if (!/\b(ул\.|улица|пр-т|проспект|пер\.|переулок|бул\.|бульвар|ш\.|шоссе|пл\.|площадь|наб\.|набережная)\b/i.test(query)) {
      const parts = query.trim().split(/\s+/);
      if (parts.length >= 2) {
        queries.push(hasCity ? query : `Москва, ${parts[0]} улица ${parts.slice(1).join(' ')}`);
      }
    }

    const allResults: FiasAddress[] = [];
    const seen = new Set<string>();

    for (const q of queries) {
      const url = `${NOMINATIM_URL}?format=json&q=${encodeURIComponent(q)}&limit=${count}&accept-language=ru&countrycodes=ru`;
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
          country: 'Россия',
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
