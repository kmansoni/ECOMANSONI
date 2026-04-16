import { describe, expect, it } from 'vitest';
import { LruCache } from './lru-cache';

describe('LruCache', () => {
  it('сохраняет до maxSize и возвращает значения', () => {
    const c = new LruCache<string, number>(3);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
    expect(c.size).toBe(3);
  });

  it('вытесняет самый старый при переполнении', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.has('a')).toBe(false);
    expect(c.has('b')).toBe(true);
    expect(c.has('c')).toBe(true);
  });

  it('get() промоутит запись в most-recently-used', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a'); // промоут 'a'
    c.set('c', 3); // должно вытеснить 'b', не 'a'
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(false);
  });

  it('prune удаляет по predicate', () => {
    const c = new LruCache<string, number>(5);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    const removed = c.prune((v) => v < 3);
    expect(removed).toBe(2);
    expect(c.size).toBe(1);
    expect(c.has('c')).toBe(true);
  });

  it('кидает при maxSize <= 0', () => {
    expect(() => new LruCache<string, number>(0)).toThrow();
  });
});
