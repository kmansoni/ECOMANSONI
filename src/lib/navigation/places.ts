/**
 * Supabase CRUD for saved places, search history, and POIs.
 *
 * Таблицы nav_saved_places / nav_search_history / nav_pois отсутствуют
 * в сгенерированных типах, поэтому используем dbLoose.
 */

import { dbLoose } from '@/lib/supabase';
import type { LatLng } from '@/types/taxi';
import type { SavedPlace } from '@/types/navigation';
import type { POICategory } from '@/types/fias';

// ── Типы строк (таблицы вне сгенерированной схемы) ──────────────────────────

interface SavedPlaceRow {
  id: string;
  label: string;
  custom_name: string | null;
  address: string | null;
  location: unknown;
  fias_id: string | null;
  postal_code: string | null;
  category: string | null;
}

interface SearchHistoryRow {
  id: string;
  query: string;
  result_label: string | null;
  result_location: unknown;
}

interface POIRow {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: string | null;
  review_count: number | null;
  location: unknown;
  is_verified: boolean | null;
  owner_id: string | null;
}

// ── Saved Places (nav_saved_places) ──────────────────────────────────────────

export async function getSavedPlaces(userId: string): Promise<SavedPlace[]> {
  const { data, error } = await dbLoose
    .from('nav_saved_places')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return (data as unknown as SavedPlaceRow[]).map((row) => ({
    id: row.id,
    name: row.custom_name || row.label,
    address: row.address || '',
    coordinates: parsePoint(row.location),
    icon: row.label === 'home' ? 'home' as const
      : row.label === 'work' ? 'work' as const
      : 'star' as const,
    fiasId: row.fias_id ?? undefined,
    postalCode: row.postal_code ?? undefined,
    category: row.category ?? undefined,
  }));
}

export async function savePlace(
  userId: string,
  place: {
    label: 'home' | 'work' | 'custom';
    customName?: string;
    address: string;
    coordinates: LatLng;
    fiasId?: string;
    postalCode?: string;
    icon?: string;
    category?: string;
  }
): Promise<void> {
  const pointWKT = `POINT(${place.coordinates.lng} ${place.coordinates.lat})`;

  if (place.label === 'home' || place.label === 'work') {
    const { data: existing } = await dbLoose
      .from('nav_saved_places')
      .select('id')
      .eq('user_id', userId)
      .eq('label', place.label)
      .single();

    const row = existing as unknown as { id: string } | null;
    if (row) {
      await dbLoose
        .from('nav_saved_places')
        .update({
          custom_name: place.customName,
          address: place.address,
          location: pointWKT,
          fias_id: place.fiasId,
          postal_code: place.postalCode,
          icon: place.icon,
          category: place.category,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      return;
    }
  }

  await dbLoose.from('nav_saved_places').insert({
    user_id: userId,
    label: place.label,
    custom_name: place.customName,
    address: place.address,
    location: pointWKT,
    fias_id: place.fiasId,
    postal_code: place.postalCode,
    icon: place.icon,
    category: place.category,
  });
}

export async function deletePlace(placeId: string): Promise<void> {
  await dbLoose.from('nav_saved_places').delete().eq('id', placeId);
}

// ── Search History (nav_search_history) ──────────────────────────────────────

export async function getSearchHistory(userId: string, limit = 10): Promise<SavedPlace[]> {
  const { data, error } = await dbLoose
    .from('nav_search_history')
    .select('*')
    .eq('user_id', userId)
    .eq('selected', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as unknown as SearchHistoryRow[]).map((row) => ({
    id: row.id,
    name: row.result_label || row.query,
    address: row.result_label || row.query,
    coordinates: row.result_location ? parsePoint(row.result_location) : { lat: 0, lng: 0 },
    icon: 'recent' as const,
  }));
}

export async function saveSearchEntry(
  userId: string,
  query: string,
  result: {
    type: 'address' | 'poi' | 'coordinate';
    id?: string;
    label: string;
    coordinates: LatLng;
  }
): Promise<void> {
  const pointWKT = `POINT(${result.coordinates.lng} ${result.coordinates.lat})`;

  await dbLoose.from('nav_search_history').insert({
    user_id: userId,
    query,
    result_type: result.type,
    result_id: result.id,
    result_location: pointWKT,
    result_label: result.label,
    selected: true,
  });
}

// ── POIs (nav_pois) ──────────────────────────────────────────────────────────

export interface POIInput {
  name: string;
  category: POICategory;
  subcategory?: string;
  coordinates: LatLng;
  address?: string;
  phone?: string;
  website?: string;
  openingHours?: Record<string, string>;
  fiasAddressId?: string;
  inn?: string;
  ogrn?: string;
  ownerId: string;
}

export interface POIResult {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number;
  coordinates: LatLng;
  isVerified: boolean;
  ownerId: string | null;
}

export async function addPOI(poi: POIInput): Promise<string | null> {
  const pointWKT = `POINT(${poi.coordinates.lng} ${poi.coordinates.lat})`;

  const { data, error } = await dbLoose
    .from('nav_pois')
    .insert({
      name: poi.name,
      category: poi.category,
      subcategory: poi.subcategory,
      location: pointWKT,
      address: poi.address,
      phone: poi.phone,
      website: poi.website,
      opening_hours: poi.openingHours ? poi.openingHours : undefined,
      fias_address_id: poi.fiasAddressId,
      inn: poi.inn,
      ogrn: poi.ogrn,
      owner_id: poi.ownerId,
      source: 'manual',
      is_verified: false,
    })
    .select('id')
    .single();

  if (error || !data) return null;
  return (data as unknown as { id: string }).id;
}

function mapPOIRow(row: POIRow): POIResult {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    address: row.address,
    phone: row.phone,
    website: row.website,
    rating: row.rating ? parseFloat(row.rating) : null,
    reviewCount: row.review_count ?? 0,
    coordinates: parsePoint(row.location),
    isVerified: row.is_verified ?? false,
    ownerId: row.owner_id,
  };
}

export async function searchPOIs(
  query: string,
  limit = 20
): Promise<POIResult[]> {
  if (!query.trim()) return [];

  const { data, error } = await dbLoose
    .from('nav_pois')
    .select('*')
    .ilike('name', `%${query}%`)
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as unknown as POIRow[]).map(mapPOIRow);
}

export async function getMyPOIs(userId: string): Promise<POIResult[]> {
  const { data, error } = await dbLoose
    .from('nav_pois')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return (data as unknown as POIRow[]).map(mapPOIRow);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse PostGIS point format to LatLng.
 * Supports WKT "POINT(lng lat)" and GeoJSON { type: 'Point', coordinates: [lng, lat] }
 */
function parsePoint(location: unknown): LatLng {
  if (!location) return { lat: 0, lng: 0 };

  // GeoJSON format
  if (typeof location === 'object' && location !== null) {
    const geo = location as Record<string, unknown>;
    if (geo.type === 'Point' && Array.isArray(geo.coordinates)) {
      const [lng, lat] = geo.coordinates as number[];
      return { lat, lng };
    }
  }

  // WKT format "POINT(lng lat)"
  if (typeof location === 'string') {
    const match = location.match(/POINT\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/);
    if (match) {
      return { lat: parseFloat(match[2]), lng: parseFloat(match[1]) };
    }
  }

  return { lat: 0, lng: 0 };
}
