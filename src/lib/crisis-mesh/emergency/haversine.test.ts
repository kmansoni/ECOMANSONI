import { describe, expect, it } from 'vitest';
import { haversineKm } from './haversine';

describe('haversineKm', () => {
  it('расстояние в одной точке = 0', () => {
    expect(haversineKm(55.75, 37.61, 55.75, 37.61)).toBeCloseTo(0, 5);
  });

  it('Москва ⇄ Санкт-Петербург ≈ 635 км', () => {
    // 55.7558, 37.6173 → 59.9343, 30.3351
    const d = haversineKm(55.7558, 37.6173, 59.9343, 30.3351);
    expect(d).toBeGreaterThan(620);
    expect(d).toBeLessThan(650);
  });

  it('экватор: 1° долготы ≈ 111 км', () => {
    const d = haversineKm(0, 0, 0, 1);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it('симметрично', () => {
    const ab = haversineKm(10, 20, 30, 40);
    const ba = haversineKm(30, 40, 10, 20);
    expect(ab).toBeCloseTo(ba, 6);
  });
});
