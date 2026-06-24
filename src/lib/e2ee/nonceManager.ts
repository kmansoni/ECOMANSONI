/**
 * AsyncNonceManager
 *
 * Thread-safe (async-safe) anti-replay manager for concurrent code paths.
 * Uses a tiny promise mutex to serialize check-and-add operations.
 */

import { toBase64 } from './utils';

class AsyncMutex {
  private queue: Promise<void> = Promise.resolve();

  async runExclusive<T>(task: () => Promise<T> | T): Promise<T> {
    const prev = this.queue;
    let release: () => void = () => {};
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await prev;
    try {
      return await task();
    } finally {
      release();
    }
  }
}

export class AsyncNonceManager {
  // FIX CRYPTO-6: Map instead of Set for LRU eviction.
  // Set insertion order: FIFO (oldest first) → replay after 10000.
  // Map insertion order: move-to-end on access → LRU (oldest first) → no replay.
  private readonly seen = new Map<string, true>();
  private readonly mutex = new AsyncMutex();
  private readonly maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  async checkAndAdd(nonce: string): Promise<boolean> {
    return this.mutex.runExclusive(() => {
      if (this.seen.has(nonce)) {
        // FIX CRYPTO-6: move to end → most recently used (LRU eviction)
        this.seen.delete(nonce);
        this.seen.set(nonce, true);
        return false;
      }
      if (this.seen.size >= this.maxSize) {
        // Delete the oldest entry (first in insertion order)
        const oldest = this.seen.keys().next().value;
        if (oldest !== undefined) this.seen.delete(oldest);
      }
      this.seen.set(nonce, true);
      return true;
    });
  }

  async has(nonce: string): Promise<boolean> {
    return this.mutex.runExclusive(() => {
      return this.seen.has(nonce);
    });
  }

  async clear(): Promise<void> {
    await this.mutex.runExclusive(() => {
      this.seen.clear();
    });
  }

  generateNonce(): string {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return toBase64(bytes.buffer as ArrayBuffer);
  }
}
