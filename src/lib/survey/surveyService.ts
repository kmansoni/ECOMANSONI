/**
 * surveyService — CRUD операции для nav_survey_scans
 * Использует Supabase client с RLS политиками
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type {
  SurveyScan,
  SurveyScanInsert,
  SurveyScanUpdate,
  SurveyScanStatus,
  SurveyScanType,
  SurveySessionMetadata,
  ComputedDimensions
} from '@/types/survey';

export interface SurveyScanUploadPayload {
  scan_type: SurveyScanType;
  images: string[];  // URLs from media-server
  metadata: SurveySessionMetadata;
  track_linestring?: string | null;  // WKT: "LINESTRING(lng lat, lng lat, ...)"
  computed_dimensions?: ComputedDimensions;
  footprint_geometry?: string;  // WKT: "POLYGON((lng lat, ...))"
  elevated_geometry?: string;   // WKT в EPSG:3857
  quality_score?: number;
  completeness_pct?: number;
  status?: SurveyScanStatus;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Создать новую запись сканирования (сразу после upload фото)
 */
export async function createSurveyScan(payload: SurveyScanUploadPayload): Promise<SurveyScan | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const insertData: SurveyScanInsert = {
    user_id: user.id,
    scan_type: payload.scan_type,
    images: payload.images,
    metadata: payload.metadata,
    track_linestring: payload.track_linestring ?? null,
    computed_dimensions: payload.computed_dimensions,
    footprint_geometry: payload.footprint_geometry,
    elevated_geometry: payload.elevated_geometry,
    quality_score: payload.quality_score ?? 0,
    completeness_pct: payload.completeness_pct ?? 0,
    status: payload.status ?? 'processing'
  };

  const { data, error } = await supabase
    .from('nav_survey_scans')
    .insert(insertData)
    .select('*')
    .single();

  if (error) {
    logger.error('[surveyService] create failed', { error: error.message });
    return null;
  }

  logger.info('[surveyService] scan created', { id: data.id, type: data.scan_type });
  return data as SurveyScan;
}

/**
 * Получить все сканы пользователя (с пагинацией)
 */
export async function getUserScans(
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<SurveyScan[]> {
  const { data, error } = await supabase
    .from('nav_survey_scans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error('[surveyService] getUserScans failed', { error: error.message });
    return [];
  }

  return (data || []) as SurveyScan[];
}

/**
 * Получить один скан по ID (с проверкой доступа)
 */
export async function getSurveyScan(scanId: string): Promise<SurveyScan | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('nav_survey_scans')
    .select('*')
    .eq('id', scanId)
    .single();

  if (error) {
    // Если сканы публичные (ready/approved), можно читать без автора
    if (error.code === 'PGRST116') {
      const { data: publicData } = await supabase
        .from('nav_survey_scans')
        .select('*')
        .eq('id', scanId)
        .in('status', ['ready', 'approved', 'merged'])
        .single();
      return publicData as SurveyScan || null;
    }
    logger.error('[surveyService] getSurveyScan failed', { error: error.message });
    return null;
  }

  return data as SurveyScan;
}

/**
 * Обновить статус скана (только свои processing/ready)
 */
export async function updateSurveyScanStatus(
  scanId: string,
  status: SurveyScanStatus
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('nav_survey_scans')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', scanId)
    .eq('user_id', user.id);  // Только своё

  if (error) {
    logger.error('[surveyService] updateStatus failed', { error: error.message });
    return false;
  }

  return true;
}

/**
 * Удалить скан (только свой, только если status в ['processing', 'rejected'])
 */
export async function deleteSurveyScan(scanId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('nav_survey_scans')
    .delete()
    .eq('id', scanId)
    .eq('user_id', user.id)
    .in('status', ['processing', 'rejected']);  // Только необработанные/отклонённые

  if (error) {
    logger.error('[surveyService] delete failed', { error: error.message });
    return false;
  }

  return true;
}

type GeoJsonPolygonGeometry = {
  type: 'Polygon';
  coordinates: number[][][];
};

export function parseWktPolygonToGeoJSON(wkt: string | null | undefined): GeoJsonPolygonGeometry | null {
  if (!wkt) {
    return null;
  }

  const normalized = wkt.trim();
  const match = /^POLYGON\s*\(\((.+)\)\)$/i.exec(normalized);
  if (!match) {
    return null;
  }

  const ring = match[1]
    .split(',')
    .map((point) => point.trim())
    .filter(Boolean)
    .map((point) => {
      const [lngRaw, latRaw] = point.split(/\s+/);
      const lng = Number(lngRaw);
      const lat = Number(latRaw);
      return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
    })
    .filter((point): point is number[] => point !== null);

  if (ring.length < 4) {
    return null;
  }

  return {
    type: 'Polygon',
    coordinates: [ring],
  };
}

// ---------------------------------------------------------------------------
// Queries for Map Display
// ---------------------------------------------------------------------------

/**
 * Получить все approved/ready сканы в bounding box (для отображения на карте)
 * Примечание: фильтрация по bbox выполняется client-side после загрузки.
 * Для production лучше использовать PostGIS RPC.
 */
export async function getScansInBounds(
  bbox: [number, number, number, number],  // [minLng, minLat, maxLng, maxLat]
  statuses: SurveyScanStatus[] = ['ready', 'approved'],
  limit: number = 100
): Promise<SurveyScan[]> {
  const { data, error } = await supabase
    .from('nav_survey_scans')
    .select('*')
    .in('status', statuses)
    .filter('footprint_geometry', 'not.is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('[surveyService] getScansInBounds failed', { error: error.message });
    return [];
  }

  const scans = (data || []) as SurveyScan[];

  // Client-side bbox filter (simple & works without RPC)
  return scans.filter(scan => {
    const geometry = parseWktPolygonToGeoJSON(scan.footprint_geometry);
    if (!geometry) {
      return false;
    }

    const coords = geometry.coordinates[0];
    const minLng = Math.min(...coords.map((c) => c[0]));
    const maxLng = Math.max(...coords.map((c) => c[0]));
    const minLat = Math.min(...coords.map((c) => c[1]));
    const maxLat = Math.max(...coords.map((c) => c[1]));

    // Check intersection with bbox
    return !(maxLng < bbox[0] || minLng > bbox[2] || maxLat < bbox[1] || minLat > bbox[3]);
  });
}

/**
 * Получить статистику покрытия пользователя (km²)
 */
export async function getUserCoverageStats(userId: string): Promise<{
  total_scans: number;
  approved_scans: number;
  total_area_m2: number;
  building_count: number;
  road_length_m: number;
}> {
  const { data, error } = await supabase.rpc(
    'get_user_survey_stats',
    { p_user_id: userId }
  );

  if (error) {
    logger.error('[surveyService] getUserCoverageStats failed', { error: error.message });
    return {
      total_scans: 0,
      approved_scans: 0,
      total_area_m2: 0,
      building_count: 0,
      road_length_m: 0
    };
  }

  return data[0] || {
    total_scans: 0,
    approved_scans: 0,
    total_area_m2: 0,
    building_count: 0,
    road_length_m: 0
  };
}

// ---------------------------------------------------------------------------
// Real-time подписка
// ---------------------------------------------------------------------------

/**
 * Подписаться на изменения сканов в области (Realtime)
 */
export function subscribeToScansInArea(
  bbox: [number, number, number, number],
  callback: (scans: SurveyScan[]) => void
): () => void {
  const channel = supabase
    .channel(`survey-scans-area:${bbox.join(',')}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'nav_survey_scans'
      },
      () => {
        // При любом изменении в области — запрашиваем свежие данные
        getScansInBounds(bbox).then(callback);
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

/**
 * Конвертировать WKT LINESTRING из массива LatLng
 */
export function latLngArrayToWKT(coords: { lat: number; lng: number }[]): string {
  if (coords.length < 2) return '';
  const points = coords.map(c => `${c.lng} ${c.lat}`).join(', ');
  return `LINESTRING(${points})`;
}

/**
 * Конвертировать WKT POLYGON из массива LatLng (замкнутый контур)
 */
export function latLngArrayToWKTPolygon(coords: { lat: number; lng: number }[]): string {
  if (coords.length < 3) return '';
  const first = coords[0];
  const points = [...coords, first].map(c => `${c.lng} ${c.lat}`).join(', ');
  return `POLYGON((${points}))`;
}

/**
 * Проверить, может ли пользователь редактировать скан (свой и не approved)
 */
export function canEditScan(scan: SurveyScan, userId: string): boolean {
  return scan.user_id === userId && ['processing', 'ready', 'rejected'].includes(scan.status);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const surveyService = {
  create: createSurveyScan,
  getUserScans,
  getById: getSurveyScan,
  updateStatus: updateSurveyScanStatus,
  delete: deleteSurveyScan,
  getInBounds: getScansInBounds,
  getScansInBounds,
  getUserStats: getUserCoverageStats,
  subscribeToScansInArea,
  subscribeToArea: subscribeToScansInArea,
  helpers: {
    latLngToWKT: latLngArrayToWKT,
    latLngToWKTPolygon: latLngArrayToWKTPolygon,
    parseWktPolygonToGeoJSON
  }
};
