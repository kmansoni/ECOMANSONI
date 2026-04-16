/**
 * LRU-кэш для дедупликации messageId.
 * Простая реализация через Map (преимущество: insertion order сохраняется).
 */

export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly maxSize: number) {
    if (maxSize <= 0) throw new Error('LruCache: maxSize must be > 0');
  }

  get size(): number {
    return this.map.size;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  /**
   * Read + promote to most-recently-used.
   */
  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    // Re-insert для продвижения в конец
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict oldest (first)
      const oldestKey = this.map.keys().next().value as K | undefined;
      if (oldestKey !== undefined) this.map.delete(oldestKey);
    }
    this.map.set(key, value);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  /**
   * Удалить записи где predicate вернул true.
   */
  prune(predicate: (value: V, key: K) => boolean): number {
    let removed = 0;
    for (const [k, v] of this.map.entries()) {
      if (predicate(v, k)) {
        this.map.delete(k);
        removed++;
      }
    }
    return removed;
  }
}
