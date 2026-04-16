import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('разрешает до limit событий в окне', () => {
    const rl = new RateLimiter({ limit: 3, windowMs: 1000 });
    expect(rl.tryAcquire('k', 1000)).toBe(true);
    expect(rl.tryAcquire('k', 1000)).toBe(true);
    expect(rl.tryAcquire('k', 1000)).toBe(true);
    expect(rl.tryAcquire('k', 1000)).toBe(false);
  });

  it('освобождает слот после сдвига окна', () => {
    const rl = new RateLimiter({ limit: 2, windowMs: 1000 });
    expect(rl.tryAcquire('k', 1000)).toBe(true);
    expect(rl.tryAcquire('k', 1500)).toBe(true);
    expect(rl.tryAcquire('k', 1900)).toBe(false);
    // Через 2000+: первое событие выпадет из окна
    expect(rl.tryAcquire('k', 2100)).toBe(true);
  });

  it('ключи независимы', () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000 });
    expect(rl.tryAcquire('a', 1000)).toBe(true);
    expect(rl.tryAcquire('b', 1000)).toBe(true);
    expect(rl.tryAcquire('a', 1000)).toBe(false);
    expect(rl.tryAcquire('b', 1000)).toBe(false);
  });

  it('remaining корректен', () => {
    const rl = new RateLimiter({ limit: 3, windowMs: 1000 });
    rl.tryAcquire('k', 1000);
    expect(rl.remaining('k', 1000)).toBe(2);
    rl.tryAcquire('k', 1000);
    expect(rl.remaining('k', 1000)).toBe(1);
  });

  it('кидает при невалидных параметрах', () => {
    expect(() => new RateLimiter({ limit: 0, windowMs: 1000 })).toThrow();
    expect(() => new RateLimiter({ limit: 1, windowMs: 0 })).toThrow();
  });
});
