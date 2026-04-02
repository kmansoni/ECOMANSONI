/**
 * DaData API client — ФИАС address suggestions + organization search.
 *
 * API key is read from VITE_DADATA_API_KEY env variable.
 * Falls back to Nominatim when key is missing or requests fail.
 */

import type {
  DaDataSuggestion,
  DaDataAddressData,
  DaDataOrgSuggestion,
  FiasAddress,
} from '@/types/fias';

const DADATA_SUGGEST_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
const DADATA_FIND_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/address';
const DADATA_ORG_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

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

  const token = getToken();

  // If no DaData token, fallback to Nominatim
  if (!token) {
    return suggestAddressNominatim(query, count);
  }

  try {
    const resp = await fetch(DADATA_SUGGEST_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ query, count }),
    });

    if (!resp.ok) throw new Error(`DaData ${resp.status}`);

    const data: { suggestions: DaDataSuggestion[] } = await resp.json();
    return data.suggestions.map((s) =>
      parseAddress(s.data, s.value, s.unrestricted_value)
    );
  } catch {
    // Fallback to Nominatim
    return suggestAddressNominatim(query, count);
  }
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

// ── Nominatim fallback ───────────────────────────────────────────────────────

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

async function suggestAddressNominatim(query: string, count: number): Promise<FiasAddress[]> {
  try {
    const url = `${NOMINATIM_URL}?format=json&q=${encodeURIComponent(query)}&limit=${count}&accept-language=ru&countrycodes=ru`;
    const resp = await fetch(url);
    if (!resp.ok) return [];

    const data: NominatimResult[] = await resp.json();
    return data.map((r) => ({
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
    }));
  } catch {
    return [];
  }
}
