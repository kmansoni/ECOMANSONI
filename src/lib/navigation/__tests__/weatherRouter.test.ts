import { describe, it, expect } from 'vitest';
import { calculateWeatherAdjustment } from '../weatherRouter';
import type { WeatherCondition } from '../weatherRouter';

describe('weatherRouter', () => {
  const clear: WeatherCondition = {
    code: 'clear',
    temperature: 20,
    feelsLike: 20,
    humidity: 50,
    windSpeed: 3,
    visibility: 10,
    precipitationMm: 0,
    description: 'Ясно',
    icon: '☀️',
  };

  it('clear weather has no penalties', () => {
    const adj = calculateWeatherAdjustment(clear, 'car');

    expect(adj.speedMultiplier).toBe(1.0);
    expect(adj.penaltyMultiplier).toBe(1.0);
    expect(adj.safetyPenalty).toBe(0);
    expect(adj.warnings.length).toBe(0);
  });

  it('heavy rain slows cars significantly', () => {
    const heavyRain: WeatherCondition = {
      ...clear,
      code: 'heavy_rain',
      precipitationMm: 15,
    };

    const adj = calculateWeatherAdjustment(heavyRain, 'car');

    expect(adj.speedMultiplier).toBeLessThan(0.7);
    expect(adj.penaltyMultiplier).toBeGreaterThan(1.5);
    expect(adj.safetyPenalty).toBeGreaterThan(0);
    expect(adj.warnings.length).toBeGreaterThan(0);
  });

  it('ice is extremely dangerous', () => {
    const ice: WeatherCondition = {
      ...clear,
      code: 'ice',
      temperature: -5,
      feelsLike: -10,
    };

    const adj = calculateWeatherAdjustment(ice, 'car');

    expect(adj.speedMultiplier).toBeLessThan(0.4);
    expect(adj.penaltyMultiplier).toBeGreaterThan(2.5);
    expect(adj.safetyPenalty).toBeGreaterThan(0.4);
    expect(adj.warnings.some(w => w.severity === 'danger')).toBe(true);
  });

  it('suggests alternative modes for pedestrians in bad weather', () => {
    const storm: WeatherCondition = {
      ...clear,
      code: 'heavy_rain',
      precipitationMm: 20,
      windSpeed: 18,
    };

    const adj = calculateWeatherAdjustment(storm, 'pedestrian');

    expect(adj.alternativeModesSuggested.length).toBeGreaterThan(0);
    expect(adj.walkabilityScore).toBeLessThan(0.5);
  });

  it('extreme cold warns pedestrians', () => {
    const frozen: WeatherCondition = {
      ...clear,
      code: 'clear',
      temperature: -25,
      feelsLike: -30,
    };

    const adj = calculateWeatherAdjustment(frozen, 'pedestrian');

    expect(adj.warnings.length).toBeGreaterThan(0);
    expect(adj.walkabilityScore).toBeLessThan(0.5);
    expect(adj.alternativeModesSuggested).toContain('transit');
  });

  it('fog reduces visibility and speed', () => {
    const fog: WeatherCondition = {
      ...clear,
      code: 'fog',
      visibility: 0.3,
    };

    const adj = calculateWeatherAdjustment(fog, 'car');

    expect(adj.speedMultiplier).toBeLessThan(0.7);
    expect(adj.warnings.length).toBeGreaterThan(0);
  });
});
