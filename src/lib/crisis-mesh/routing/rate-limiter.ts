/**
 * Rate limiter с sliding window.
 * Используется для:
 *   - Обычные сообщения: 10/мин на peer
 *   - SOS сигналы: 1/5мин на peer
 *   - First-contact handshakes: 5/мин на peer (anti-Sybil)
 */

export interface RateLimitWindow {
  limit: number;
  windowMs: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, number[]>();

  constructor(private readonly window: RateLimitWindow) {
    if (window.limit <= 0 || window.windowMs <= 0) {
      throw new Error('RateLimiter: limit and windowMs must be > 0');
    }
  }

  /**
   * Попытаться записать событие. Возвращает true если разрешено, false если лимит.
   */
  tryAcquire(key: string, now: number = Date.now()): boolean {
    const cutoff = now - this.window.windowMs;
    const bucket = this.buckets.get(key) ?? [];

    // Убрать устаревшие события
    let i = 0;
    while (i < bucket.length && bucket[i] < cutoff) i++;
    const fresh = i > 0 ? bucket.slice(i) : bucket;

    if (fresh.length >= this.window.limit) {
      this.buckets.set(key, fresh);
      return false;
    }

    fresh.push(now);
    this.buckets.set(key, fresh);
    return true;
  }

  /**
   * Сколько осталось в окне.
   */
  remaining(key: string, now: number = Date.now()): number {
    const cutoff = now - this.window.windowMs;
    const bucket = this.buckets.get(key) ?? [];
    const fresh = bucket.filter((t) => t >= cutoff);
    return Math.max(0, this.window.limit - fresh.length);
  }

  /**
   * Когда следующее событие станет разрешено.
   */
  resetAt(key: string, now: number = Date.now()): number {
    const cutoff = now - this.window.windowMs;
    const bucket = (this.buckets.get(key) ?? []).filter((t) => t >= cutoff);
    if (bucket.length < this.window.limit) return now;
    return bucket[0] + this.window.windowMs;
  }

  /**
   * GC устаревших ключей.
   */
  prune(now: number = Date.now()): number {
    const cutoff = now - this.window.windowMs;
    let removed = 0;
    for (const [key, bucket] of this.buckets.entries()) {
      const fresh = bucket.filter((t) => t >= cutoff);
      if (fresh.length === 0) {
        this.buckets.delete(key);
        removed++;
      } else if (fresh.length !== bucket.length) {
        this.buckets.set(key, fresh);
      }
    }
    return removed;
  }

  clear(): void {
    this.buckets.clear();
  }
}
