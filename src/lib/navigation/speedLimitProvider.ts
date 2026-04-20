/**
 * Speed Limit Provider — extracts and displays current speed limit.
 *
 * Data sources (cascading):
 * 1. Map-matched edge → OSM maxspeed tag
 * 2. Road type defaults (e.g., motorway=110, residential=60)
 * 3. Country/region defaults
 *
 * Also provides speed overage warnings and grace thresholds.
 */

import type { MatchedPosition } from './mapMatcher';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SpeedLimitInfo {
  /** Current speed limit (km/h) */
  limit: number;
  /** Source of the limit */
  source: 'osm' | 'road_type_default' | 'country_default';
  /** Whether this is a zone (urban/rural) default */
  isZoneDefault: boolean;
  /** Road type */
  roadType: string;
  /** Country code (for defaults) */
  country: string;
}

export interface SpeedWarning {
  level: 'ok' | 'approaching' | 'over' | 'critical';
  /** Current speed */
  currentSpeed: number;
  /** Speed limit */
  speedLimit: number;
  /** Overage in km/h (negative = under limit) */
  overage: number;
  /** Percentage over limit */
  overagePercent: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Default speed limits by road type (Russia) */
const ROAD_TYPE_DEFAULTS_RU: Record<string, number> = {
  motorway: 110,
  motorway_link: 60,
  trunk: 90,
  trunk_link: 60,
  primary: 60,
  primary_link: 50,
  secondary: 60,
  secondary_link: 50,
  tertiary: 60,
  tertiary_link: 40,
  residential: 60,
  living_street: 20,
  service: 20,
  unclassified: 60,
  track: 40,
};

/** Default speed limits by road type (China — for Amap context) */
const ROAD_TYPE_DEFAULTS_CN: Record<string, number> = {
  motorway: 120,
  motorway_link: 60,
  trunk: 100,
  trunk_link: 60,
  primary: 80,
  primary_link: 50,
  secondary: 60,
  secondary_link: 40,
  tertiary: 40,
  residential: 30,
  living_street: 20,
  service: 20,
};

/** Country → urban default speed limit (km/h) */
const COUNTRY_URBAN_DEFAULTS: Record<string, number> = {
  RU: 60,
  CN: 50,
  DE: 50,
  US: 40,
  GB: 48, // 30 mph
};

const GRACE_KMH = 3; // grace before warning (GPS noise)
const APPROACHING_THRESHOLD = 0.9; // 90% of limit

// ── Speed limit extraction ───────────────────────────────────────────────────

/**
 * Get speed limit for the current matched position.
 */
export function getSpeedLimit(
  matched: MatchedPosition | null,
  country: string = 'RU',
): SpeedLimitInfo {
  // 1. From map-matched edge (OSM maxspeed)
  if (matched?.speedLimit && matched.speedLimit > 0) {
    return {
      limit: matched.speedLimit,
      source: 'osm',
      isZoneDefault: false,
      roadType: matched.roadType,
      country,
    };
  }

  // 2. Road type default
  const defaults = country === 'CN' ? ROAD_TYPE_DEFAULTS_CN : ROAD_TYPE_DEFAULTS_RU;
  const roadType = matched?.roadType || 'residential';
  const roadDefault = defaults[roadType];

  if (roadDefault) {
    return {
      limit: roadDefault,
      source: 'road_type_default',
      isZoneDefault: false,
      roadType,
      country,
    };
  }

  // 3. Country urban default
  return {
    limit: COUNTRY_URBAN_DEFAULTS[country] ?? 50,
    source: 'country_default',
    isZoneDefault: true,
    roadType,
    country,
  };
}

/**
 * Check current speed against limit and return warning level.
 */
export function checkSpeedWarning(
  currentSpeedKmh: number,
  speedLimit: number,
): SpeedWarning {
  const overage = currentSpeedKmh - speedLimit;
  const overagePercent = speedLimit > 0 ? (overage / speedLimit) * 100 : 0;

  let level: SpeedWarning['level'] = 'ok';

  if (overage > GRACE_KMH + 20) {
    level = 'critical'; // >20 km/h over
  } else if (overage > GRACE_KMH) {
    level = 'over';
  } else if (currentSpeedKmh > speedLimit * APPROACHING_THRESHOLD) {
    level = 'approaching';
  }

  return {
    level,
    currentSpeed: Math.round(currentSpeedKmh),
    speedLimit,
    overage: Math.round(overage),
    overagePercent: Math.round(overagePercent),
  };
}
