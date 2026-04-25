/**
 * Network Condition Simulator — симулирует реалистичные сетевые условия
 *
 * Использование:
 *   const simulator = new NetworkSimulator();
 *   simulator.apply({ latency: 2000, packetLoss: 0.2, bandwidth: 128_000 });
 *   // все последующие HTTP/WebSocket запросы пройдут через эти условия
 *
 * Особенности:
 * - Bandwidth throttling в байтах/сек (не битах!)
 * - Packet loss в долях 0.0–1.0
 * - Latency в миллисекундах (односторонний, RTT = latency × 2)
 * - Duplicate probability (повтор пакетов)
 * - Out-of-order delivery (распространяющиеся пакеты)
 *
 * Интеграция: перехватывает fetch и WebSocket.send через monkey-patch
 */

export interface NetworkConditions {
  /** Задержкаone-way в мс (default: 0) */
  latency: number;
  /** Потеря пакетов: 0.0–1.0 (default: 0) */
  packetLoss: number;
  /** Ограничение пропускной способности в Bps (default: Infinity) */
  bandwidth: number;
  /** Вероятность дублирования пакета (default: 0) */
  duplicateProbability: number;
  /** Вероятность out-of-order (default: 0) */
  outOfOrderProbability: number;
  /** Максимальный размер окна для out-of-order (packets) */
  outOfOrderWindow: number;
}

const DEFAULT_CONDITIONS: NetworkConditions = {
  latency: 0,
  packetLoss: 0,
  bandwidth: Infinity,
  duplicateProbability: 0,
  outOfOrderProbability: 0,
  outOfOrderWindow: 10,
};

export class NetworkSimulator {
  private conditions: NetworkConditions = { ...DEFAULT_CONDITIONS };
  private originalFetch: typeof fetch;
  private originalWebSocketSend: typeof WebSocket.prototype.send;
  private tokenBucket: number = 0;
  private lastRefill: number = 0;

  constructor() {
    this.originalFetch = globalThis.fetch.bind(globalThis);
    this.originalWebSocketSend = WebSocket.prototype.send.bind(WebSocket.prototype);
  }

  /** Применить сетевые условия к последующим запросам */
  apply(conditions: Partial<NetworkConditions>): void {
    this.conditions = { ...this.conditions, ...conditions };
    this.tokenBucket = this.conditions.bandwidth;
    this.lastRefill = Date.now();
    this.patchFetch();
    this.patchWebSocket();
  }

  /** Сбросить к идеальным условиям */
  reset(): void {
    this.conditions = { ...DEFAULT_CONDITIONS };
    this.restoreFetch();
    this.restoreWebSocket();
  }

  /** Текущие условия (для assertions) */
  getConditions(): Readonly<NetworkConditions> {
    return { ...this.conditions };
  }

  /** === Private: Monkey-patching === */

  private patchFetch(): void {
    globalThis.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const [resource, options] = args;

      // 1. Latency — задержка перед отправкой
      await this.simulateLatency();

      // 2. Packet loss — случайно отбрасываем запрос
      if (Math.random() < this.conditions.packetLoss) {
        throw new Error('NetworkSimulator: simulated packet loss (fetch)');
      }

      // 3. Bandwidth throttling — ограничиваем скорость
      await this.throttle(options?.body as BodyInit | null);

      // 4. Duplicate — эмулируем дублирование ответа (только для GET)
      if (Math.random() < this.conditions.duplicateProbability && resource instanceof URL && resource.searchParams.get('_duplicate') === null) {
        const dupUrl = new URL(resource.toString());
        dupUrl.searchParams.set('_duplicate', 'true');
        // Отправляем дубликат асинхронно, но возвращаем оригинальный ответ
        this.originalFetch(dupUrl.toString(), options).catch(() => {});
      }

      // 5. Выполняем оригинальный fetch
      return this.originalFetch(resource, options);
    };
  }

  private patchWebSocket(): void {
    WebSocket.prototype.send = (data: string | ArrayBufferLike): void => {
      // WebSocket.send синхронный, поэтому имитируем latency через очередь
      setTimeout(() => {
        // Packet loss для WS
        if (Math.random() < this.conditions.packetLoss) {
          // Silently drop (как в реальной сети)
          return;
        }

        // Bandwidth throttling
        const size = this.getByteLength(data);
        this.throttleBytes(size);

        // Out-of-order: откладываем отправку
        if (Math.random() < this.conditions.outOfOrderProbability) {
          const delay = Math.random() * this.conditions.latency * 2;
          setTimeout(() => {
            this.originalWebSocketSend(data);
          }, delay);
          return;
        }

        this.originalWebSocketSend(data);
      }, this.conditions.latency);
    };
  }

  private async simulateLatency(): Promise<void> {
    if (this.conditions.latency > 0) {
      // Jitter: ±20% от latency
      const jitter = this.conditions.latency * 0.2;
      const actual = this.conditions.latency + (Math.random() * jitter * 2 - jitter);
      await new Promise(resolve => setTimeout(resolve, Math.max(0, actual)));
    }
  }

  private async throttle(body: BodyInit | null): Promise<void> {
    if (body instanceof Blob || body instanceof File) {
      const size = body.size;
      this.throttleBytes(size);
    } else if (typeof body === 'string') {
      const size = new Blob([body]).size;
      this.throttleBytes(size);
    } else if (body instanceof ArrayBuffer) {
      this.throttleBytes(body.byteLength);
    } else if (body instanceof URLSearchParams) {
      const size = new Blob([body.toString()]).size;
      this.throttleBytes(size);
    }
    // Если body === null (GET), throttling не нужен
  }

  private throttleBytes(bytes: number): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // секунды
    this.tokenBucket = Math.min(
      this.conditions.bandwidth,
      this.tokenBucket + elapsed * this.conditions.bandwidth
    );
    this.lastRefill = now;

    if (this.tokenBucket >= bytes) {
      this.tokenBucket -= bytes;
      return;
    }

    // Не хватает токенов — ждём
    const deficit = bytes - this.tokenBucket;
    const waitMs = (deficit / this.conditions.bandwidth) * 1000;
    this.tokenBucket = 0;
    // Block main thread (не идеально, но для тестов ок)
    const start = Date.now();
    while (Date.now() - start < waitMs) {
      // busy wait (blocking)
    }
  }

  private getByteLength(data: string | ArrayBufferLike): number {
    if (typeof data === 'string') {
      return new TextEncoder().encode(data).length;
    }
    return (data as ArrayBuffer).byteLength;
  }

  private restoreFetch(): void {
    globalThis.fetch = this.originalFetch;
  }

  private restoreWebSocket(): void {
    WebSocket.prototype.send = this.originalWebSocketSend;
  }
}

/** Convenience factory для тестов */
export function createNetworkSimulator(conditions: Partial<NetworkConditions> = {}): NetworkSimulator {
  const simulator = new NetworkSimulator();
  simulator.apply(conditions);
  return simulator;
}

/** Presets для распространённых сценариев */
export const NETWORK_PRESETS = {
  perfect: { latency: 0, packetLoss: 0, bandwidth: Infinity },
  wifi: { latency: 20, packetLoss: 0.001, bandwidth: 100_000_000 }, // 100 Mbps
  '4g': { latency: 50, packetLoss: 0.005, bandwidth: 50_000_000 }, // 50 Mbps
  '3g': { latency: 200, packetLoss: 0.02, bandwidth: 2_000_000 }, // 2 Mbps
  '2g': { latency: 1000, packetLoss: 0.05, bandwidth: 100_000 }, // 100 Kbps
  satellite: { latency: 800, packetLoss: 0.01, bandwidth: 50_000_000 },
  metro: { latency: 500, packetLoss: 0.03, bandwidth: 10_000_000, outOfOrderProbability: 0.1 },
  terrible: { latency: 3000, packetLoss: 0.15, bandwidth: 50_000, duplicateProbability: 0.05 },
} as const;
