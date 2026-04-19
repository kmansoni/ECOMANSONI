/**
 * Weather-Aware Routing — маршрутизация с учётом погодных условий.
 * Получает прогноз погоды, корректирует скорости и штрафы на сегментах маршрута.
 */

import type { TravelMode } from '@/types/navigation';
import type { LatLng } from '@/types/taxi';

// ── Типы ──

export interface WeatherCondition {
  code: WeatherCode;
  temperature: number;       // °C
  feelsLike: number;
  humidity: number;          // 0..100
  windSpeed: number;         // m/s
  visibility: number;        // km
  precipitationMm: number;
  description: string;
  icon: string;
}

export type WeatherCode =
  | 'clear' | 'partly_cloudy' | 'cloudy' | 'overcast'
  | 'light_rain' | 'rain' | 'heavy_rain' | 'thunderstorm'
  | 'light_snow' | 'snow' | 'heavy_snow' | 'blizzard'
  | 'fog' | 'ice' | 'hail';

export interface WeatherRoutingAdjustment {
  speedMultiplier: number;       // applied to base speed (0.3 = 30% of normal)
  penaltyMultiplier: number;     // applied to edge weight (2.0 = double cost)
  safetyPenalty: number;         // 0..1 — reduce safety score
  warnings: WeatherWarning[];
  alternativeModesSuggested: TravelMode[];
  walkabilityScore: number;      // 0..1 (1 = great for walking)
}

export interface WeatherWarning {
  severity: 'info' | 'warning' | 'danger';
  message: string;
  icon: string;
}

export interface WeatherForecastPoint {
  time: Date;
  condition: WeatherCondition;
}

// ── Кэш погоды ──

interface CachedForecast {
  point: LatLng;
  forecast: WeatherForecastPoint[];
  fetchedAt: number;
}

const forecastCache = new Map<string, CachedForecast>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

function cacheKey(lat: number, lng: number): string {
  return `${(lat * 10) | 0},${(lng * 10) | 0}`; // ~10km grid
}

// ── Получение погоды ──

/**
 * Получить текущую погоду и прогноз для точки.
 * Использует Open-Meteo API (бесплатный, без ключа).
 */
export async function fetchWeatherForecast(
  point: LatLng,
  hours = 6
): Promise<WeatherForecastPoint[]> {
  const key = cacheKey(point.lat, point.lng);
  const cached = forecastCache.get(key);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.forecast;
  }

  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(point.lat));
    url.searchParams.set('longitude', String(point.lng));
    url.searchParams.set('hourly', 'temperature_2m,apparent_temperature,relative_humidity_2m,weathercode,windspeed_10m,visibility,precipitation');
    url.searchParams.set('forecast_hours', String(hours));
    url.searchParams.set('timezone', 'auto');

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Weather API ${res.status}`);

    const data = await res.json();
    const hourly = data.hourly;

    const forecast: WeatherForecastPoint[] = [];
    for (let i = 0; i < (hourly.time?.length ?? 0) && i < hours; i++) {
      forecast.push({
        time: new Date(hourly.time[i]),
        condition: {
          code: wmoToCode(hourly.weathercode[i]),
          temperature: hourly.temperature_2m[i],
          feelsLike: hourly.apparent_temperature[i],
          humidity: hourly.relative_humidity_2m[i],
          windSpeed: hourly.windspeed_10m[i] / 3.6, // km/h → m/s
          visibility: (hourly.visibility?.[i] ?? 10000) / 1000, // m → km
          precipitationMm: hourly.precipitation[i],
          description: wmoDescription(hourly.weathercode[i]),
          icon: wmoIcon(hourly.weathercode[i]),
        },
      });
    }

    forecastCache.set(key, { point, forecast, fetchedAt: Date.now() });
    return forecast;
  } catch {
    // Fallback — clear weather
    return [{
      time: new Date(),
      condition: {
        code: 'clear',
        temperature: 20,
        feelsLike: 20,
        humidity: 50,
        windSpeed: 3,
        visibility: 10,
        precipitationMm: 0,
        description: 'Данные о погоде недоступны',
        icon: '☀️',
      },
    }];
  }
}

/**
 * Рассчитать поправки маршрута для текущих погодных условий.
 */
export function calculateWeatherAdjustment(
  weather: WeatherCondition,
  mode: TravelMode
): WeatherRoutingAdjustment {
  const warnings: WeatherWarning[] = [];
  let speedMult = 1.0;
  let penaltyMult = 1.0;
  let safetyPenalty = 0;
  let walkability = 1.0;
  const altModes: TravelMode[] = [];

  // ── Precipitation ──
  if (weather.precipitationMm > 0) {
    if (weather.code === 'heavy_rain' || weather.code === 'thunderstorm') {
      speedMult *= 0.6;
      penaltyMult *= 1.8;
      safetyPenalty += 0.3;
      walkability *= 0.2;
      warnings.push({ severity: 'danger', message: 'Сильный дождь — плохая видимость', icon: '🌧️' });
      if (mode === 'pedestrian') altModes.push('transit', 'car');
    } else if (weather.code === 'rain' || weather.code === 'light_rain') {
      speedMult *= 0.85;
      penaltyMult *= 1.25;
      safetyPenalty += 0.1;
      walkability *= 0.6;
      warnings.push({ severity: 'warning', message: 'Дождь — будьте осторожнее', icon: '🌦️' });
    }

    if (weather.code.includes('snow')) {
      speedMult *= weather.code === 'heavy_snow' || weather.code === 'blizzard' ? 0.4 : 0.7;
      penaltyMult *= weather.code === 'heavy_snow' ? 2.5 : 1.5;
      safetyPenalty += weather.code === 'heavy_snow' ? 0.4 : 0.2;
      walkability *= 0.3;
      warnings.push({ severity: 'danger', message: 'Снегопад — скользко', icon: '❄️' });
      if (mode === 'pedestrian') altModes.push('transit');
    }
  }

  // ── Ice ──
  if (weather.code === 'ice') {
    speedMult *= 0.35;
    penaltyMult *= 3.0;
    safetyPenalty += 0.5;
    walkability *= 0.15;
    warnings.push({ severity: 'danger', message: 'Гололёд! Будьте крайне осторожны', icon: '🧊' });
    altModes.push('transit');
  }

  // ── Fog / Visibility ──
  if (weather.code === 'fog' || weather.visibility < 1) {
    speedMult *= 0.55;
    penaltyMult *= 1.6;
    safetyPenalty += 0.2;
    warnings.push({ severity: 'warning', message: `Видимость ${weather.visibility.toFixed(1)} км`, icon: '🌫️' });
  }

  // ── Wind ──
  if (weather.windSpeed > 15) {
    speedMult *= 0.85;
    walkability *= 0.5;
    warnings.push({ severity: 'warning', message: `Сильный ветер ${Math.round(weather.windSpeed)} м/с`, icon: '💨' });
    if (mode === 'pedestrian') safetyPenalty += 0.15;
  } else if (weather.windSpeed > 20) {
    speedMult *= 0.7;
    walkability *= 0.2;
    warnings.push({ severity: 'danger', message: `Штормовой ветер ${Math.round(weather.windSpeed)} м/с`, icon: '🌪️' });
    altModes.push('car', 'transit');
  }

  // ── Temperature extremes ──
  if (weather.feelsLike < -20) {
    walkability *= 0.2;
    warnings.push({ severity: 'danger', message: `Мороз ${Math.round(weather.feelsLike)}°C — опасно для пешеходов`, icon: '🥶' });
    if (mode === 'pedestrian') altModes.push('transit', 'car');
  } else if (weather.feelsLike < -10 && mode === 'pedestrian') {
    walkability *= 0.5;
    warnings.push({ severity: 'warning', message: `Холодно ${Math.round(weather.feelsLike)}°C`, icon: '❄️' });
  } else if (weather.feelsLike > 35) {
    walkability *= 0.4;
    warnings.push({ severity: 'warning', message: `Жара ${Math.round(weather.feelsLike)}°C`, icon: '🔥' });
    if (mode === 'pedestrian') altModes.push('transit');
  }

  // Pedestrian-specific adjustments
  if (mode === 'pedestrian') {
    speedMult = Math.max(speedMult, 0.5); // walking can't go below 50%
    penaltyMult *= walkability < 0.5 ? 1.5 : 1.0;
  }

  return {
    speedMultiplier: Math.max(speedMult, 0.2),
    penaltyMultiplier: Math.max(penaltyMult, 1.0),
    safetyPenalty: Math.min(safetyPenalty, 0.6),
    warnings,
    alternativeModesSuggested: [...new Set(altModes)],
    walkabilityScore: Math.max(walkability, 0),
  };
}

/**
 * Применить погодные поправки к ETA маршрута.
 */
export function applyWeatherToETA(
  baseEtaSeconds: number,
  adjustment: WeatherRoutingAdjustment
): number {
  return Math.round(baseEtaSeconds * adjustment.penaltyMultiplier);
}

// ── WMO Code mappers ──

function wmoToCode(wmo: number): WeatherCode {
  if (wmo === 0 || wmo === 1) return 'clear';
  if (wmo === 2) return 'partly_cloudy';
  if (wmo === 3) return 'overcast';
  if (wmo === 45 || wmo === 48) return 'fog';
  if (wmo >= 51 && wmo <= 55) return 'light_rain';
  if (wmo >= 56 && wmo <= 57) return 'ice';
  if (wmo >= 61 && wmo <= 63) return 'rain';
  if (wmo >= 65 && wmo <= 67) return 'heavy_rain';
  if (wmo >= 71 && wmo <= 73) return 'light_snow';
  if (wmo === 75 || wmo === 77) return 'heavy_snow';
  if (wmo >= 80 && wmo <= 82) return 'rain';
  if (wmo >= 85 && wmo <= 86) return 'snow';
  if (wmo >= 95 && wmo <= 99) return 'thunderstorm';
  return 'cloudy';
}

function wmoDescription(wmo: number): string {
  const map: Record<number, string> = {
    0: 'Ясно', 1: 'Малооблачно', 2: 'Переменная облачность', 3: 'Пасмурно',
    45: 'Туман', 48: 'Изморозь', 51: 'Лёгкая морось', 53: 'Морось',
    55: 'Сильная морось', 56: 'Ледяная морось', 57: 'Ледяная морось',
    61: 'Лёгкий дождь', 63: 'Дождь', 65: 'Сильный дождь',
    66: 'Ледяной дождь', 67: 'Ледяной дождь',
    71: 'Лёгкий снег', 73: 'Снег', 75: 'Сильный снег', 77: 'Снежные зёрна',
    80: 'Ливень', 81: 'Ливень', 82: 'Сильный ливень',
    85: 'Снегопад', 86: 'Сильный снегопад',
    95: 'Гроза', 96: 'Гроза с градом', 99: 'Гроза с крупным градом',
  };
  return map[wmo] ?? 'Без данных';
}

function wmoIcon(wmo: number): string {
  if (wmo <= 1) return '☀️';
  if (wmo <= 3) return '⛅';
  if (wmo <= 48) return '🌫️';
  if (wmo <= 57) return '🌧️';
  if (wmo <= 67) return '🌧️';
  if (wmo <= 77) return '❄️';
  if (wmo <= 82) return '🌧️';
  if (wmo <= 86) return '❄️';
  return '⛈️';
}
