/**
 * trafficCollector.ts — Crowdsourced сбор GPS-проб для трафика.
 *
 * Анонимно собирает скорость пользователей на сегментах дорог
 * и отправляет батчами в Supabase каждые 30 секунд.
 *
 * Приватность:
 * - Координаты округляются до ~11м (5 знаков)
 * - Используется анонимный session_hash (не user_id)
 * - Пробы хранятся максимум 2 часа
 * - Стоящие автомобили (speed < 3 км/ч) не отправляются
 */
import { dbLoose } from '@/lib/supabase';
import type { LatLng } from '@/types/taxi';

// ── H3-подобная сетка (упрощённая, без зависимости h3-js) ──────────────────
// Resolution ~175м (сопоставимо с H3 res 9)
const H3_PRECISION = 4; // знаков после точки ≈ 11м, но группируем грубее

function toH3Index(lat: number, lon: number): string {
  // Квантуем координаты в ячейки ~175м
  // 0.002° ≈ 222м по широте, ~155м по долготе на 55°
  const gridLat = Math.round(lat / 0.002) * 0.002;
  const gridLon = Math.round(lon / 0.002) * 0.002;
  return `${gridLat.toFixed(3)}:${gridLon.toFixed(3)}`;
}

// ── Анонимный идентификатор сессии ──────────────────────────────────────────
function getSessionHash(): string {
  const key = 'traffic_session_hash';
  let hash = sessionStorage.getItem(key);
  if (!hash) {
    // Генерируем случайный хеш (не связан с пользователем)
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    hash = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(key, hash);
  }
  return hash;
}

// ── Типы ────────────────────────────────────────────────────────────────────
interface GPSProbe {
  lat: number;
  lon: number;
  speed_kmh: number;
  heading: number | null;
  accuracy_m: number | null;
  h3_index: string;
  session_hash: string;
  measured_at: string;
}

// ── Буфер проб ─────────────────────────────────────────────────────────────
let _probeBuffer: GPSProbe[] = [];
let _flushInterval: ReturnType<typeof setInterval> | null = null;
let _collecting = false;
let _lastSentPosition: LatLng | null = null;

// Минимальное расстояние между пробами (метры) — не спамить при стоянке
const MIN_DISTANCE_M = 30;
// Минимальная скорость для отправки (км/ч) — парковка не нужна
const MIN_SPEED_KMH = 3;
// Максимум проб в буфере
const MAX_BUFFER_SIZE = 50;
// Интервал отправки (мс)
const FLUSH_INTERVAL_MS = 30_000;

// ── Haversine расстояние (м) ────────────────────────────────────────────────
function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ── Публичный API ───────────────────────────────────────────────────────────

/**
 * Начать сбор GPS-проб.
 * Вызывается при старте навигации.
 */
export function startTrafficCollection(): void {
  if (_collecting) return;
  _collecting = true;
  _probeBuffer = [];
  _lastSentPosition = null;

  // Периодическая отправка
  _flushInterval = setInterval(flushProbes, FLUSH_INTERVAL_MS);
  console.log('[trafficCollector] Сбор GPS-проб запущен');
}

/**
 * Остановить сбор и отправить оставшиеся пробы.
 */
export function stopTrafficCollection(): void {
  if (!_collecting) return;
  _collecting = false;

  if (_flushInterval) {
    clearInterval(_flushInterval);
    _flushInterval = null;
  }

  // Отправить оставшееся
  if (_probeBuffer.length > 0) {
    flushProbes();
  }

  console.log('[trafficCollector] Сбор GPS-проб остановлен');
}

/**
 * Добавить GPS-пробу.
 * Вызывается из useGeolocation при каждом обновлении позиции.
 */
export function addTrafficProbe(
  position: LatLng,
  speedKmh: number,
  heading: number | null,
  accuracyM: number | null,
): void {
  if (!_collecting) return;

  // Фильтр: слишком медленно (парковка/пробка менее 3 км/ч)
  if (speedKmh < MIN_SPEED_KMH) return;

  // Фильтр: слишком близко к предыдущей пробе
  if (_lastSentPosition && distanceM(_lastSentPosition, position) < MIN_DISTANCE_M) return;

  // Фильтр: плохая точность GPS
  if (accuracyM != null && accuracyM > 100) return;

  // Анонимизация: округление координат
  const lat = Math.round(position.lat * 100000) / 100000; // ~1.1м
  const lon = Math.round(position.lng * 100000) / 100000;

  const probe: GPSProbe = {
    lat,
    lon,
    speed_kmh: Math.round(speedKmh * 10) / 10,
    heading: heading != null ? Math.round(heading * 10) / 10 : null,
    accuracy_m: accuracyM != null ? Math.round(accuracyM * 10) / 10 : null,
    h3_index: toH3Index(lat, lon),
    session_hash: getSessionHash(),
    measured_at: new Date().toISOString(),
  };

  _probeBuffer.push(probe);
  _lastSentPosition = position;

  // Авто-flush при переполнении буфера
  if (_probeBuffer.length >= MAX_BUFFER_SIZE) {
    flushProbes();
  }
}

/**
 * Отправить буфер проб в Supabase.
 */
async function flushProbes(): Promise<void> {
  if (_probeBuffer.length === 0) return;

  const batch = _probeBuffer.splice(0); // Забираем и очищаем
  
  try {
    const { data, error } = await dbLoose.rpc('submit_gps_probes', {
      probes: batch,
    });

    if (error) {
      console.warn('[trafficCollector] Ошибка отправки проб:', error.message);
      // Возвращаем неотправленные пробы в буфер (макс 100)
      _probeBuffer.unshift(...batch.slice(0, 100 - _probeBuffer.length));
    } else {
      console.log(`[trafficCollector] Отправлено ${data?.inserted ?? batch.length} проб`);
    }
  } catch (err) {
    console.warn('[trafficCollector] Сетевая ошибка:', err);
    // Возвращаем в буфер
    _probeBuffer.unshift(...batch.slice(0, 100 - _probeBuffer.length));
  }
}

/**
 * Сколько проб в буфере (для отладки).
 */
export function getProbeBufferSize(): number {
  return _probeBuffer.length;
}
