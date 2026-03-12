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
  private readonly seen = new Set<string>();
  private readonly mutex = new AsyncMutex();
  private readonly maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  async checkAndAdd(nonce: string): Promise<boolean> {
    return this.mutex.runExclusive(() => {
      if (this.seen.has(nonce)) return false;
      if (this.seen.size >= this.maxSize) {
        const first = this.seen.values().next().value;
        if (first !== undefined) this.seen.delete(first);
      }
      this.seen.add(nonce);
      return true;
    });
  }

  async has(nonce: string): Promise<boolean> {
    return this.mutex.runExclusive(() => this.seen.has(nonce));
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
