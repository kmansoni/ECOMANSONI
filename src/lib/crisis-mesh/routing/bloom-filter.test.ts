import { describe, expect, it } from 'vitest';
import { BloomFilter } from './bloom-filter';

describe('BloomFilter', () => {
  it('add + mayContain для добавленных всегда true', () => {
    const bf = new BloomFilter();
    const keys = ['alice', 'bob', 'charlie', 'diana', 'eve'];
    for (const k of keys) bf.add(k);
    for (const k of keys) expect(bf.mayContain(k)).toBe(true);
  });

  it('для неизвестных FP ниже 2% при n=100', () => {
    const bf = new BloomFilter();
    for (let i = 0; i < 100; i++) bf.add(`item-$${i}`);
    let fp = 0;
    const trials = 1000;
    for (let i = 100; i < 100 + trials; i++) {
      if (bf.mayContain(`item-$${i}`)) fp++;
    }
    expect(fp).toBeLessThan(trials * 0.02);
  });

  it('bitCount обязан быть кратен 8', () => {
    expect(() => new BloomFilter(100)).toThrow();
  });

  it('merge объединяет два фильтра через OR', () => {
    const a = new BloomFilter();
    const b = new BloomFilter();
    a.add('x');
    b.add('y');
    a.merge(b);
    expect(a.mayContain('x')).toBe(true);
    expect(a.mayContain('y')).toBe(true);
  });

  it('toBase64 / fromBase64 round-trip сохраняет состояние', () => {
    const a = new BloomFilter();
    a.add('foo');
    a.add('bar');
    const b = BloomFilter.fromBase64(a.toBase64());
    expect(b.mayContain('foo')).toBe(true);
    expect(b.mayContain('bar')).toBe(true);
  });
});