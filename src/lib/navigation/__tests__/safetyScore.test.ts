import { describe, it, expect } from 'vitest';
import { evaluateRouteSafety, quickSafetyEstimate } from '../safetyScore';

describe('safetyScore', () => {
  const routePoints = [
    { lat: 55.75, lng: 37.62 },
    { lat: 55.751, lng: 37.621 },
    { lat: 55.752, lng: 37.622 },
  ];

  it('returns score 0..1 with all factors', () => {
    const edges = routePoints.map(() => ({
      highway: 'residential' as const,
      lit: true,
      surface: 'asphalt',
      sidewalk: true,
      crossing: false,
      maxspeed: 40,
    }));

    const result = evaluateRouteSafety(routePoints, edges, 12);

    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(1);
    expect(result.factors.length).toBeGreaterThanOrEqual(5);
    expect(result.label).toBeDefined();
    expect(result.color).toBeDefined();
  });

  it('night + no lighting = low score', () => {
    const edges = routePoints.map(() => ({
      highway: 'path' as const,
      lit: false,
      surface: null,
      sidewalk: false,
      crossing: false,
      maxspeed: null,
    }));

    const night = evaluateRouteSafety(routePoints, edges, 2);
    const day = evaluateRouteSafety(routePoints, edges, 12);

    expect(night.overallScore).toBeLessThan(day.overallScore);
    expect(night.darkSegments.length).toBeGreaterThan(0);
    expect(night.recommendations.length).toBeGreaterThan(0);
  });

  it('pedestrian zones are safer', () => {
    const pedEdges = routePoints.map(() => ({
      highway: 'pedestrian' as const,
      lit: true,
      surface: 'paving_stones',
      sidewalk: true,
      crossing: true,
      maxspeed: null,
    }));

    const carEdges = routePoints.map(() => ({
      highway: 'primary' as const,
      lit: true,
      surface: 'asphalt',
      sidewalk: false,
      crossing: false,
      maxspeed: 60,
    }));

    const ped = evaluateRouteSafety(routePoints, pedEdges, 12);
    const car = evaluateRouteSafety(routePoints, carEdges, 12);

    expect(ped.overallScore).toBeGreaterThan(car.overallScore);
  });

  it('quickSafetyEstimate works without OSM data', () => {
    const result = quickSafetyEstimate(routePoints, 14);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.factors.length).toBeGreaterThanOrEqual(5);
  });

  it('labels match score ranges', () => {
    const highEdges = routePoints.map(() => ({
      highway: 'pedestrian' as const,
      lit: true,
      surface: 'asphalt',
      sidewalk: true,
      crossing: true,
      maxspeed: null,
    }));

    const result = evaluateRouteSafety(routePoints, highEdges, 10);
    if (result.overallScore >= 0.75) expect(result.label).toBe('safe');
    else if (result.overallScore >= 0.5) expect(result.label).toBe('moderate');
    else if (result.overallScore >= 0.3) expect(result.label).toBe('caution');
    else expect(result.label).toBe('unsafe');
  });
});
