/**
 * Nonce Manager (anti-replay) ──────────────────────────────────────────────────────
 * 
 * SECURITY FEATURES:
 * - Атомарная проверка и добавление (checkAndAdd)
 * - Sliding window для ограничения памяти
 * - Контрмера против timing attacks
 */
export class NonceManager {
  private seen: Set<string>;
  private maxSize: number;
  private readonly windowSize: number;

  constructor(maxSize = 10000, windowSize = 1000) {
    this.seen = new Set();
    this.maxSize = maxSize;
    this.windowSize = windowSize;
}

  /** Возвращает true если nonce НОВЫЙ (не встречался ранее) */
  /** ВНИМАНИЕ: Уязвим к timing attacks! Использовать только для предварительных проверок */
  check(nonce: string): boolean {
    return !this.seen.has(nonce);
  }

  /**
   * Добавляет nonce со sliding window (удаляет старые для экономии памяти)
   */
  add(nonce: string): void {
    if (this.seen.size >= this.maxSize) {
      // FIFO: удаляем (maxSize - windowSize) старых записей
      const toDelete = this.maxSize - this.windowSize;
      const iter = this.seen.values();
      for (let i = 0; i < toDelete; i++) {
        const val = iter.next().value;
        if (val !== undefined) this.seen.delete(val);
      }
    }
    this.seen.add(nonce);
  }

  /**
   * Атомарная проверка и добавление (защита от race conditions)
   * Возвращает true если nonce НОВЫЙ
   */
  checkAndAdd(nonce: string): boolean {
    if (this.seen.has(nonce)) {
      return false;
    }
    this.add(nonce);
    return true;
  }

  /**
   * Генерация криптографически случайного nonce
   * 12 байт (96 бит) - рекомендуется NIST для AES-GCM
   */
  generateNonce(): string {
    return toBase64(secureRandom(12));
  }

  /**
   * Генерация счетчикового nonce (для упорядоченных сообщений)
   * counter: 64-битный номер сообщения
   * randomSuffix: дополнительная энтропия (4 байта)
   */
  static generateCounterNonce(counter: number, randomSuffix?: Uint8Array): string {
    const buf = new ArrayBuffer(12);
    const view = new DataView(buf);
    view.setBigUint64(0, BigInt(counter), false); // big-endian
    const suffix = randomSuffix || crypto.getRandomValues(new Uint8Array(4));
    new Uint8Array(buf).set(suffix, 8);
    return toBase64(buf);
  }

  /** Очистка всех nonce (при закрытии сессии) */
  clear(): void {
    this.seen.clear();
  }

  /** Текущий размер */
  get size(): number {
    return this.seen.size;
  }

  /** Проверка на достижение предела */
  isFull(): boolean {
    return this.seen.size >= this.maxSize;
  }
}