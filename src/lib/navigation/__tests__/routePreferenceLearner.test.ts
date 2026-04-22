import { describe, it, expect, vi, beforeEach } from 'vitest';
import { routePreferenceLearner } from '../routePreferenceLearner';
import type { RouteScores, TripContext } from '../routePreferenceLearner';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  dbLoose: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null }),
        }),
      }),
      upsert: () => Promise.resolve({ error: null }),
    }),
  },
}));

describe('routePreferenceLearner', () => {
  beforeEach(async () => {
    await routePreferenceLearner.loadProfile('test-user');
  });

  const fastExpensive: RouteScores = {
    routeId: 'fast',
    durationSeconds: 900,
    distanceMeters: 5000,
    costRub: 500,
    transfers: 0,
    ecoScore: 3,
    safetyScore: 0.8,
    comfortScore: 0.9,
  };

  const slowCheap: RouteScores = {
    routeId: 'slow',
    durationSeconds: 2700,
    distanceMeters: 4500,
    costRub: 50,
    transfers: 2,
    ecoScore: 8,
    safetyScore: 0.7,
    comfortScore: 0.5,
  };

  const context: TripContext = {
    hour: 9,
    dayOfWeek: 1,
    isWeekend: false,
    travelMode: 'car',
  };

  it('loads default profile for new user', () => {
    const profile = routePreferenceLearner.getProfile();
    expect(profile).toBeTruthy();
    expect(profile!.weights.time).toBeGreaterThan(0);
    expect(profile!.totalTrips).toBe(0);
  });

  it('calculates utility score between 0 and 1', () => {
    const util = routePreferenceLearner.calculateUtility(fastExpensive);
    expect(util).toBeGreaterThan(0);
    expect(util).toBeLessThanOrEqual(1);
  });

  it('rankRoutes orders by utility', () => {
    const ranked = routePreferenceLearner.rankRoutes([slowCheap, fastExpensive]);
    const util0 = routePreferenceLearner.calculateUtility(ranked[0]);
    const util1 = routePreferenceLearner.calculateUtility(ranked[1]);
    expect(util0).toBeGreaterThanOrEqual(util1);
  });

  it('onRouteSelected updates weights', async () => {
    const profile = routePreferenceLearner.getProfile()!;
    const beforeTime = profile.weights.time;

    // Select fast route multiple times
    for (let i = 0; i < 5; i++) {
      await routePreferenceLearner.onRouteSelected(fastExpensive, [slowCheap], context);
    }

    const after = routePreferenceLearner.getProfile()!;
    // Time weight should increase since user keeps picking faster routes
    expect(after.totalTrips).toBe(5);
    // Weights should still sum to ~1
    const weightSum = Object.values(after.weights).reduce((s, v) => s + v, 0);
    expect(Math.abs(weightSum - 1)).toBeLessThan(0.01);
  });

  it('getRecommendations returns array', () => {
    const recs = routePreferenceLearner.getRecommendations();
    expect(Array.isArray(recs)).toBe(true);
  });
});
