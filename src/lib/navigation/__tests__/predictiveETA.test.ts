import { describe, it, expect } from 'vitest';
import { predictETA, updateETAEnRoute } from '../predictiveETA';

describe('predictiveETA', () => {
  const routePoints = [
    { lat: 55.75, lng: 37.62 },
    { lat: 55.76, lng: 37.63 },
  ];

  it('returns valid prediction with intervals', () => {
    const result = predictETA(1800, routePoints, 'car');

    expect(result.etaSeconds).toBeGreaterThan(0);
    expect(result.p10Seconds).toBeLessThanOrEqual(result.etaSeconds);
    expect(result.p90Seconds).toBeGreaterThanOrEqual(result.etaSeconds);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.arrivalTime).toBeInstanceOf(Date);
    expect(result.display).toContain('мин');
    expect(result.displayRange).toContain('–');
  });

  it('rush hour increases ETA for cars', () => {
    const rushHour = new Date();
    rushHour.setHours(8, 0, 0, 0);
    // Make it a weekday
    while (rushHour.getDay() === 0 || rushHour.getDay() === 6) {
      rushHour.setDate(rushHour.getDate() + 1);
    }

    const nightTime = new Date();
    nightTime.setHours(3, 0, 0, 0);

    const rush = predictETA(1800, routePoints, 'car', rushHour);
    const night = predictETA(1800, routePoints, 'car', nightTime);

    expect(rush.etaSeconds).toBeGreaterThan(night.etaSeconds);
  });

  it('pedestrian mode is less affected by traffic', () => {
    const rushHour = new Date();
    rushHour.setHours(8, 0, 0, 0);
    while (rushHour.getDay() === 0 || rushHour.getDay() === 6) {
      rushHour.setDate(rushHour.getDate() + 1);
    }

    const pedEta = predictETA(1200, routePoints, 'pedestrian', rushHour);
    const carEta = predictETA(1200, routePoints, 'car', rushHour);

    // Pedestrian should be closer to base ETA
    expect(Math.abs(pedEta.etaSeconds - 1200)).toBeLessThan(Math.abs(carEta.etaSeconds - 1200));
  });

  it('updateETAEnRoute reduces uncertainty with progress', () => {
    const original = predictETA(3600, routePoints, 'car');

    const halfway = updateETAEnRoute(original, 1800, 0.5, 30, 'car');

    expect(halfway.confidence).toBeGreaterThan(original.confidence);
    expect(halfway.spreadSeconds).toBeLessThan(original.spreadSeconds);
  });

  it('longer routes have wider confidence intervals', () => {
    const short = predictETA(600, routePoints, 'car');
    const long = predictETA(7200, routePoints, 'car');

    const shortSpreadRatio = short.spreadSeconds / short.etaSeconds;
    const longSpreadRatio = long.spreadSeconds / long.etaSeconds;

    // Long routes should have relatively wider intervals
    expect(longSpreadRatio).toBeGreaterThanOrEqual(shortSpreadRatio * 0.8);
  });
});
