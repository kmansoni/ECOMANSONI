/**
 * TaxiCostComparer — compares taxi costs from multiple via-points
 * against a direct ride, enabling smart multimodal decisions.
 */

import type { LatLng, TariffEstimate, TaxiRouteEstimateResponse, Tariff } from '@/types/taxi';
import { calculateDistance, estimateDuration, calculateTripPrice } from '@/lib/taxi/calculations';

// Default economy tariff for estimation
const DEFAULT_TARIFF: Tariff = {
  id: 'economy',
  name: 'Эконом',
  description: 'Стандартный тариф',
  emoji: '🚗',
  capacity: 4,
  basePrice: 149,
  pricePerKm: 12,
  pricePerMin: 7,
  minPrice: 199,
  eta: 5,
  surgeMultiplier: 1.0,
  available: true,
  features: [],
};

function estimateForPair(from: LatLng, to: LatLng, tariff: Tariff = DEFAULT_TARIFF): TariffEstimate {
  const distKm = calculateDistance(from, to) * 1.3; // route factor
  const durMin = estimateDuration(distKm);
  const price = calculateTripPrice(tariff, distKm, durMin);

  return {
    ...tariff,
    estimatedPrice: price,
    estimatedDuration: durMin,
    estimatedDistance: distKm,
  };
}

/**
 * Compare taxi cost for a direct ride vs from each via-point to destination.
 * Returns savings for each via-point so user can decide if taking
 * transit to that point + taxi from there is worth it.
 */
export function compareTaxiFromViaPoints(
  pickup: LatLng,
  destination: LatLng,
  viaPoints: LatLng[],
  tariff: Tariff = DEFAULT_TARIFF
): TaxiRouteEstimateResponse {
  const direct = estimateForPair(pickup, destination, tariff);

  const fromViaPoints = viaPoints.map(vp => {
    const estimate = estimateForPair(vp, destination, tariff);
    return {
      from: vp,
      toDestination: estimate,
      savings: {
        timeSavedSeconds: (direct.estimatedDuration - estimate.estimatedDuration) * 60,
        moneySavedRub: direct.estimatedPrice - estimate.estimatedPrice,
        distanceSavedKm: direct.estimatedDistance - estimate.estimatedDistance,
      },
    };
  });

  // Sort by money saved (most savings first)
  fromViaPoints.sort((a, b) => b.savings.moneySavedRub - a.savings.moneySavedRub);

  return { direct, fromViaPoints };
}

/**
 * Async version that could later integrate with real taxi API.
 * For now, uses local calculation.
 */
export async function fetchTaxiEstimateMulti(
  pickup: LatLng,
  destination: LatLng,
  viaPoints: LatLng[],
  _provider: 'yandex' | 'citymobil' = 'yandex'
): Promise<TaxiRouteEstimateResponse> {
  // TODO: When real taxi API is available, replace with actual API calls
  // and cache results in taxi_estimates_cache table
  return compareTaxiFromViaPoints(pickup, destination, viaPoints);
}
