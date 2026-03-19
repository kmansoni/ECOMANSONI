/**
 * SFrame Codec для E2EE медиа-фреймов
 * Упрощённая реализация SFrame (draft-ietf-sframe-enc) поверх Web Crypto API.
 *
 * Формат фрейма:
 *   [SFrame Header][Encrypted Payload][Auth Tag (16 bytes)]
 *
 * Short header (X=0): 1 byte KID (7 bits) + N bytes counter
 * Long  header (X=1): 2+ bytes KID       + N bytes counter
 */

// ─── Типы ────────────────────────────────────────────────────────────────────

export interface SFrameHeader {
  keyId: number;
  counter: number;
  headerLength: number; // байт занимает заголовок
}

export interface SFrameConfig {
  cipherSuite: 'AES_128_GCM' | 'AES_256_GCM';
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────

import { toBase64 } from './utils';

/** Кодирует число как variable-length integer (big-endian, старший бит = "ещё байты") */
function encodeVarInt(value: number): Uint8Array {
  if (value < 0) throw new Error('VarInt must be non-negative');
  if (value === 0) return new Uint8Array([0]);

  const bytes: number[] = [];
  let v = value;
  while (v > 0) {
    bytes.unshift(v & 0x7f);
    v = v >>> 7;
  }
  // Устанавливаем старший бит для всех байтов кроме последнего
  for (let i = 0; i < bytes.length - 1; i++) {
    bytes[i] |= 0x80;
  }
  return new Uint8Array(bytes);
}

/** Декодирует variable-length integer. Возвращает [value, bytesConsumed] */
function decodeVarInt(data: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let consumed = 0;
  let i = offset;
  while (i < data.length) {
    const byte = data[i++];
    // Use multiplication instead of bitwise shift to stay within Number.MAX_SAFE_INTEGER (2^53-1)
    value = value * 128 + (byte & 0x7f);
    consumed++;
    if (!(byte & 0x80)) break; // last byte
    if (consumed > 7) throw new Error('VarInt overflow'); // 7 * 7 = 49 bits, safe for JS number
  }
  return [value, i - offset];
}

/** Строит IV для AES-GCM из counter (zero-padded до 12 байт) */
function buildIV(counter: number): ArrayBuffer {
  const iv = new ArrayBuffer(12);
  const view = new DataView(iv);
  // counter как 32-bit big-endian в последних 4 байтах
  view.setUint32(8, counter >>> 0, false);
  if (counter > 0xffffffff) {
    view.setUint32(4, Math.floor(counter / 0x100000000) >>> 0, false);
  }
  return iv;
}

// ─── SFrameContext ────────────────────────────────────────────────────────────

/** Max seen counters to track for replay protection (FIFO eviction) */
const MAX_REPLAY_WINDOW = 8192;

export class SFrameContext {
  private key: CryptoKey | null = null;
  private counter: number = 0;
  private keyId: number = 0;
  private config: SFrameConfig;
  /** Replay protection: track highest seen counter + small window for out-of-order */
  private highestSeenCounter: number = -1;
  private seenCounters: Set<number> = new Set();

  constructor(config: Partial<SFrameConfig> = {}) {
    this.config = {
      cipherSuite: config.cipherSuite ?? 'AES_256_GCM',
    };
  }

  /**
   * Установка ключа шифрования. Resets replay protection state.
   */
  async setEncryptionKey(key: CryptoKey, keyId: number): Promise<void> {
    this.key = key;
    this.keyId = keyId & 0x7fffffff; // max 31 бит
    // Reset replay state on key change
    this.highestSeenCounter = -1;
    this.seenCounters.clear();
  }

  /**
   * Шифрование медиафрейма
   *
   * Результат: [SFrame Header][Encrypted Payload][Auth Tag (16 bytes)]
   */
  async encryptFrame(frame: ArrayBuffer): Promise<ArrayBuffer> {
    if (!this.key) throw new Error('No encryption key set');

    const counter = this.counter++;
    const header = this._buildHeader(this.keyId, counter);
    const iv = buildIV(counter);

    // AAD = header bytes
    const frameBytes = new Uint8Array(frame.slice(0));
    const aad = new Uint8Array(header.slice(0));
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: aad,
        tagLength: 128,
      },
      this.key,
      frameBytes
    );

    // Собираем: header + encrypted (ciphertext + tag уже вместе)
    const result = new ArrayBuffer(header.byteLength + encrypted.byteLength);
    const resultView = new Uint8Array(result);
    resultView.set(new Uint8Array(header), 0);
    resultView.set(new Uint8Array(encrypted), header.byteLength);

    return result;
  }

  /**
   * Расшифровка медиафрейма (with replay protection)
   */
  async decryptFrame(frame: ArrayBuffer): Promise<ArrayBuffer> {
    if (!this.key) throw new Error('No decryption key set');

    const parsed = SFrameContext.parseHeader(frame);
    if (!parsed) throw new Error('Invalid SFrame header');

    const { counter, headerLength } = parsed;

    // ── Replay protection (sliding window + exact duplicate check) ──
    // SECURITY FIX: range-based eviction replaces FIFO eviction.
    // FIFO eviction allowed replay: a counter within the window (c > highest-MAX_WINDOW)
    // could be evicted from seenCounters by newer entries, making seenCounters.has(c)
    // return false while the sliding-window check also passed. An attacker could replay
    // any packet that had been evicted. Now we reject anything at or below the floor
    // outright, and only track counters above the floor.
    const floor = this.highestSeenCounter >= 0
      ? this.highestSeenCounter - MAX_REPLAY_WINDOW
      : -1;
    if (this.highestSeenCounter >= 0 && counter <= floor) {
      throw new Error(`Stale SFrame counter ${counter} (highest: ${this.highestSeenCounter}) — possible replay attack`);
    }
    if (this.seenCounters.has(counter)) {
      throw new Error(`Duplicate SFrame counter ${counter} — possible replay attack`);
    }

    const iv = buildIV(counter);

    // Header bytes (для AAD)
    const headerBuf = new Uint8Array(frame.slice(0, headerLength));

    // Encrypted payload (ciphertext + tag)
    const payloadBuf = new Uint8Array(frame.slice(headerLength));

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: headerBuf,
        tagLength: 128,
      },
      this.key,
      payloadBuf
    );

    // Track counter after successful decryption
    this.seenCounters.add(counter);
    if (counter > this.highestSeenCounter) {
      this.highestSeenCounter = counter;
      // Range-based eviction: drop all counters that fall below the new floor.
      // This guarantees seenCounters only holds counters in [highestSeenCounter-MAX_REPLAY_WINDOW+1 .. highestSeenCounter].
      // Any replay of an evicted counter will be caught by the floor check above.
      const newFloor = this.highestSeenCounter - MAX_REPLAY_WINDOW;
      for (const c of this.seenCounters) {
        if (c <= newFloor) this.seenCounters.delete(c);
      }
    }

    return decrypted;
  }

  /**
   * Парсинг SFrame header без расшифровки
   */
  static parseHeader(data: ArrayBuffer): SFrameHeader | null {
    try {
      const bytes = new Uint8Array(data);
      if (bytes.length < 2) return null;

      const firstByte = bytes[0];
      const xBit = (firstByte & 0x80) !== 0;

      let offset = 0;
      let keyId: number;

      if (!xBit) {
        // Short header: KID = 7 младших бит первого байта
        keyId = firstByte & 0x7f;
        offset = 1;
      } else {
        // Long header: первый байт = 1LLLKKKK, LLL = длина KID поля, KKKK = верхние биты KID
        const lenField = (firstByte >> 4) & 0x07;
        const kidHigh = firstByte & 0x0f;
        offset = 1;

        // Считываем lenField дополнительных байтов KID
        keyId = kidHigh;
        for (let i = 0; i < lenField && offset < bytes.length; i++, offset++) {
          keyId = (keyId << 8) | bytes[offset];
        }
      }

      // Counter как variable-length integer
      const [counter, consumed] = decodeVarInt(bytes, offset);
      offset += consumed;

      return { keyId, counter, headerLength: offset };
    } catch {
      return null;
    }
  }

  /**
   * Проверяет, является ли фрейм SFrame-шифрованным (эвристика по заголовку)
   */
  static isSFrameEncrypted(data: ArrayBuffer): boolean {
    const parsed = SFrameContext.parseHeader(data);
    if (!parsed) return false;
    // Если после заголовка есть хотя бы 16 байт (auth tag), считаем валидным
    return data.byteLength > parsed.headerLength + 16;
  }

  /** Текущее значение счётчика */
  getCounter(): number {
    return this.counter;
  }

  /** Сброс состояния */
  reset(): void {
    this.counter = 0;
    this.key = null;
    this.keyId = 0;
    this.highestSeenCounter = -1;
    this.seenCounters.clear();
  }

  // ─── Приватные методы ───────────────────────────────────────────────────────

  private _buildHeader(keyId: number, counter: number): ArrayBuffer {
    const counterBytes = encodeVarInt(counter);

    if (keyId <= 0x7f) {
      // Short header: 1 byte (X=0, KID=7 bits) + counter
      const buf = new ArrayBuffer(1 + counterBytes.length);
      const view = new Uint8Array(buf);
      view[0] = keyId & 0x7f; // X=0
      view.set(counterBytes, 1);
      return buf;
    } else {
      // Long header
      // Определяем сколько дополнительных байт нужно для KID
      let kidBytes = 0;
      let tmp = keyId >> 4;
      while (tmp > 0) { kidBytes++; tmp >>= 8; }
      kidBytes = Math.min(kidBytes, 7);

      const firstByte = 0x80 | ((kidBytes & 0x07) << 4) | ((keyId >> (kidBytes * 8)) & 0x0f);
      const buf = new ArrayBuffer(1 + kidBytes + counterBytes.length);
      const view = new Uint8Array(buf);
      view[0] = firstByte;
      for (let i = 0; i < kidBytes; i++) {
        view[1 + i] = (keyId >> ((kidBytes - 1 - i) * 8)) & 0xff;
      }
      view.set(counterBytes, 1 + kidBytes);
      return buf;
    }
  }
}
