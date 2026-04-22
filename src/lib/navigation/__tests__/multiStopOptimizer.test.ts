import { describe, it, expect } from 'vitest';
import { optimizeStopOrder, addStopAndReoptimize, removeStopAndReoptimize } from '../multiStopOptimizer';

describe('multiStopOptimizer', () => {
  // Points in Moscow forming a rough square
  const stops = [
    { lat: 55.75, lng: 37.62, label: 'A' },   // Center
    { lat: 55.80, lng: 37.62, label: 'B' },   // North
    { lat: 55.80, lng: 37.70, label: 'C' },   // NE
    { lat: 55.75, lng: 37.70, label: 'D' },   // East
    { lat: 55.70, lng: 37.62, label: 'E' },   // South
  ];

  it('returns valid itinerary for multiple stops', () => {
    const result = optimizeStopOrder(stops);

    expect(result.order.length).toBe(stops.length);
    expect(result.totalDistanceKm).toBeGreaterThan(0);
    expect(result.totalTimeSeconds).toBeGreaterThan(0);
    expect(result.orderedStops.length).toBe(stops.length);
    expect(result.legDistances.length).toBe(stops.length - 1);
  });

  it('visits all stops exactly once', () => {
    const result = optimizeStopOrder(stops);
    const sortedOrder = [...result.order].sort();
    expect(sortedOrder).toEqual([0, 1, 2, 3, 4]);
  });

  it('optimized route is not longer than naive', () => {
    const result = optimizeStopOrder(stops);
    expect(result.savingsPercent).toBeGreaterThanOrEqual(0);
  });

  it('handles single stop', () => {
    const result = optimizeStopOrder([stops[0]]);
    expect(result.order).toEqual([0]);
    expect(result.totalDistanceKm).toBe(0);
  });

  it('handles empty array', () => {
    const result = optimizeStopOrder([]);
    expect(result.order).toEqual([]);
    expect(result.totalDistanceKm).toBe(0);
  });

  it('respects fixed start', () => {
    const result = optimizeStopOrder(stops, 2); // Start from C
    expect(result.order[0]).toBe(2);
  });

  it('respects fixed end', () => {
    const stopsWithEnd = [...stops];
    const result = optimizeStopOrder(stopsWithEnd, 0, true);
    expect(result.order[0]).toBe(0);
    expect(result.order[result.order.length - 1]).toBe(stopsWithEnd.length - 1);
  });

  it('addStopAndReoptimize produces valid result', () => {
    const initial = optimizeStopOrder(stops.slice(0, 3));
    const expanded = addStopAndReoptimize(initial, { lat: 55.77, lng: 37.65, label: 'New' });

    expect(expanded.orderedStops.length).toBe(4);
    expect(expanded.totalDistanceKm).toBeGreaterThan(0);
  });

  it('removeStopAndReoptimize produces valid result', () => {
    const initial = optimizeStopOrder(stops);
    const reduced = removeStopAndReoptimize(initial, 2);

    expect(reduced.orderedStops.length).toBe(stops.length - 1);
  });

  it('handles 10+ stops (uses heuristic)', () => {
    const manyStops = Array.from({ length: 18 }, (_, i) => ({
      lat: 55.7 + (i * 0.01),
      lng: 37.6 + ((i % 5) * 0.02),
      label: `P${i}`,
    }));

    const result = optimizeStopOrder(manyStops);

    expect(result.order.length).toBe(18);
    expect(new Set(result.order).size).toBe(18); // All unique
    expect(result.totalDistanceKm).toBeGreaterThan(0);
  });
});
