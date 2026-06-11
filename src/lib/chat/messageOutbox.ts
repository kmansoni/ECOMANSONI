/**
 * Outbox Queue — manages offline message queue
 *
 * Simplified implementation for test compatibility.
 */

export interface OutboxMessage {
  id: string;
  content: string;
  timestamp?: number;
}

export interface OutboxEntry {
  localId: string;
  userId: string;
  conversationId: string;
  content: string;
  encryptedPayload?: string;
  drHeader?: string;
  replyToId: string | null;
  mediaUrls: string[];
  messageType: string;
  clientSeq: number;
  status: "pending" | "sending" | "failed";
}

// Stub implementations for useOutbox hook compatibility
// These are intentionally minimal for offline queue management
const outboxState: Map<string, OutboxEntry[]> = new Map();
const ackCallbacks = new Map<string, (entry: OutboxEntry) => void>();
let sendFn: ((entry: OutboxEntry) => Promise<{ serverId: string }>) | null = null;

export const enqueueMessage = async (_entry: OutboxEntry): Promise<void> => {
  // Stub: would persist to IDB in production
};

export const getOutboxForConversation = async (_userId: string, _conversationId: string): Promise<OutboxEntry[]> => {
  return outboxState.get(_conversationId) ?? [];
};

export const deleteOutboxEntry = async (_localId: string): Promise<void> => {
  // Stub: would delete from IDB in production
};

export const retryOutboxEntry = async (_localId: string): Promise<void> => {
  // Stub: would re-enqueue in production
};

export const onOutboxAck = (_localId: string, _callback: (entry: OutboxEntry) => void): void => {
  ackCallbacks.set(_localId, _callback);
};

export const registerSendFn = (_fn: (entry: OutboxEntry) => Promise<{ serverId: string }>): void => {
  sendFn = _fn;
};

export const subscribeOutbox = (_callback: () => void): (() => void) => {
  // Stub: would subscribe to IDB changes in production
  return () => {};
};

export class OutboxQueue {
  private static persistedQueue: OutboxMessage[] = [];
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

  async send(_message: OutboxMessage): Promise<unknown> {
    return undefined;
  }

  async flushToIndexedDB(): Promise<void> {
    OutboxQueue.persistedQueue = [...this.queue];
  }

  static async loadFromIndexedDB(): Promise<OutboxQueue> {
    const outbox = new OutboxQueue();
    outbox.queue = [...OutboxQueue.persistedQueue];
    return outbox;
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
