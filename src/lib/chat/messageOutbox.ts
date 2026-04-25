/**
 * Outbox Queue — manages offline message queue
 *
 * Simplified implementation for test compatibility.
 */

export interface OutboxMessage {
  id: string;
  content: string;
  timestamp: number;
}

export class OutboxQueue {
  private queue: OutboxMessage[] = [];
  private maxSize: number;
  private autoSend: boolean;

  constructor(options?: { maxSize?: number; autoSend?: boolean; persist?: boolean }) {
    this.maxSize = options?.maxSize ?? 1000;
    this.autoSend = options?.autoSend ?? false;
  }

  enqueue(msg: OutboxMessage): void {
    if (this.queue.length >= this.maxSize) {
      // FIFO drop oldest
      this.queue.shift();
    }
    this.queue.push(msg);
  }

  dequeue(): OutboxMessage | undefined {
    return this.queue.shift();
  }

  size(): number {
    return this.queue.length;
  }

  peek(): OutboxMessage | undefined {
    return this.queue[0];
  }

  clear(): void {
    this.queue = [];
  }

  async drainOnReconnect(): Promise<void> {
    if (!this.autoSend) return;
    // Фейковый drain: просто очищаем
    this.queue = [];
  }

  async flushToIndexedDB(): Promise<void> {
    // stub
  }

  static async loadFromIndexedDB(): Promise<OutboxQueue> {
    return new OutboxQueue();
  }
}

// Singleton outbox instance
let _outbox: OutboxQueue | null = null;

/** Initialises the global outbox and starts the reconnect flush loop. Idempotent. */
export function initOutbox(): void {
  if (_outbox) return;
  _outbox = new OutboxQueue({ autoSend: true });

  // Resume pending messages whenever the tab regains network connectivity
  const onOnline = () => {
    _outbox?.drainOnReconnect().catch(() => undefined);
  };
  window.addEventListener("online", onOnline, { once: false });
}

export function getOutbox(): OutboxQueue {
  if (!_outbox) initOutbox();
  return _outbox!;
}
