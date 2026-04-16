/**
 * Bloom Filter для gossip routing.
 * Позволяет компактно передавать "кому уже отправлено" без перечисления всех peerId.
 *
 * Параметры по умолчанию:
 *   m = 2048 бит (256 байт) — компактно для BLE payload
 *   k = 8 хэш-функций
 *   → при n=100 элементов false positive ≈ 0.5%
 */

import { toBase64, fromBase64 } from '@/lib/e2ee/utils';

const DEFAULT_BITS = 2048;
const DEFAULT_HASHES = 8;

export class BloomFilter {
  private readonly bits: Uint8Array;

  constructor(
    public readonly bitCount: number = DEFAULT_BITS,
    public readonly hashCount: number = DEFAULT_HASHES,
    initial?: Uint8Array,
  ) {
    if (bitCount % 8 !== 0) throw new Error('bitCount must be multiple of 8');
    const byteCount = bitCount / 8;
    if (initial) {
      if (initial.length !== byteCount) {
        throw new Error(`initial must be ${byteCount} bytes, got ${initial.length}`);
      }
      this.bits = new Uint8Array(initial);
    } else {
      this.bits = new Uint8Array(byteCount);
    }
  }

  /**
   * FNV-1a 32-bit хэш → два индекса через double hashing.
   * k индексов = h1 + i * h2 (mod bitCount), как в Kirsch-Mitzenmacher.
   */
  private hashIndices(key: string): number[] {
    const bytes = new TextEncoder().encode(key);
    let h1 = 2166136261 >>> 0;
    let h2 = 2654435761 >>> 0;
    for (const b of bytes) {
      h1 = Math.imul(h1 ^ b, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ b, 40503) >>> 0;
    }
    const indices: number[] = [];
    for (let i = 0; i < this.hashCount; i++) {
      const combined = (h1 + i * h2) >>> 0;
      indices.push(combined % this.bitCount);
    }
    return indices;
  }

  add(key: string): void {
    for (const idx of this.hashIndices(key)) {
      const byteIdx = idx >>> 3;
      const bitIdx = idx & 7;
      this.bits[byteIdx] |= 1 << bitIdx;
    }
  }

  mayContain(key: string): boolean {
    for (const idx of this.hashIndices(key)) {
      const byteIdx = idx >>> 3;
      const bitIdx = idx & 7;
      if ((this.bits[byteIdx] & (1 << bitIdx)) === 0) return false;
    }
    return true;
  }

  /**
   * Объединить с другим фильтром (OR).
   * Используется для merging при relay.
   */
  merge(other: BloomFilter): void {
    if (other.bitCount !== this.bitCount || other.hashCount !== this.hashCount) {
      throw new Error('bloom filters incompatible');
    }
    for (let i = 0; i < this.bits.length; i++) {
      this.bits[i] |= other.bits[i];
    }
  }

  toBase64(): string {
    return toBase64(this.bits);
  }

  static fromBase64(b64: string, bitCount = DEFAULT_BITS, hashCount = DEFAULT_HASHES): BloomFilter {
    const bytes = new Uint8Array(fromBase64(b64));
    return new BloomFilter(bitCount, hashCount, bytes);
  }

  clone(): BloomFilter {
    return new BloomFilter(this.bitCount, this.hashCount, this.bits);
  }

  /**
   * Оценка количества установленных бит (для диагностики заполненности).
   */
  popcount(): number {
    let count = 0;
    for (const byte of this.bits) {
      let b = byte;
      while (b) {
        count += b & 1;
        b >>>= 1;
      }
    }
    return count;
  }
}
