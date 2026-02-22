export interface ChatV11RecoveryContext {
  clientWriteSeq: number;
  clientMsgId: string;
  deviceId: string;
  startedAt: number;
  attempt: number;
}

export interface ChatV11RecoveryStepResult {
  deferredMs?: number;
}

interface ChatV11RecoveryWatch extends ChatV11RecoveryContext {
  timeoutId: number;
}

export interface ChatV11RecoveryServiceDeps {
  onAckTimeout: (ctx: ChatV11RecoveryContext) => void;
  runStep: (ctx: ChatV11RecoveryContext) => Promise<ChatV11RecoveryStepResult | void>;
  onFailure?: (ctx: ChatV11RecoveryContext, error: unknown) => void;
  maxAttempts?: number;
  retryPolicy?: {
    minDelayMs?: number;
    maxDelayMs?: number;
    exponentialBaseMs?: number;
    jitterRatio?: number;
  };
}

export class ChatV11RecoveryService {
  private readonly deps: ChatV11RecoveryServiceDeps;
  private readonly pending = new Map<number, ChatV11RecoveryWatch>();

  constructor(deps: ChatV11RecoveryServiceDeps) {
    this.deps = deps;
  }

  private computeRetryDelayMs(ctx: ChatV11RecoveryContext, hintedMs: number): number {
    const policy = this.deps.retryPolicy;
    const minDelayMs = Math.max(1, policy?.minDelayMs ?? 1_000);
    const maxDelayMs = Math.max(minDelayMs, policy?.maxDelayMs ?? 60_000);
    const exponentialBaseMs = Math.max(minDelayMs, policy?.exponentialBaseMs ?? 1_000);
    const jitterRatio = Math.max(0, Math.min(1, policy?.jitterRatio ?? 0));

    const hinted = Number.isFinite(hintedMs) && hintedMs > 0 ? hintedMs : minDelayMs;
    const expFactor = Math.max(1, ctx.attempt);
    const expDelay = exponentialBaseMs * Math.pow(2, Math.max(0, expFactor - 1));
    const baseDelay = Math.max(hinted, expDelay, minDelayMs);
    const capped = Math.min(baseDelay, maxDelayMs);
    const jitterRange = capped * jitterRatio;
    const jitter = jitterRange > 0 ? (Math.random() * 2 - 1) * jitterRange : 0;
    const next = Math.round(capped + jitter);
    return Math.max(minDelayMs, Math.min(next, maxDelayMs));
  }

  arm(
    ctx: Omit<ChatV11RecoveryContext, "startedAt" | "attempt"> & { startedAt?: number },
    initialDelayMs = 10_000
  ): void {
    const startedAt = typeof ctx.startedAt === "number" ? ctx.startedAt : Date.now();
    const watch: ChatV11RecoveryWatch = {
      ...ctx,
      startedAt,
      attempt: 0,
      timeoutId: 0,
    };
    watch.timeoutId = window.setTimeout(() => {
      void this.tick(watch.clientWriteSeq);
    }, initialDelayMs);
    this.pending.set(watch.clientWriteSeq, watch);
  }

  acknowledgeReceipt(clientWriteSeq: number, deviceId: string): number | null {
    const watch = this.pending.get(clientWriteSeq);
    if (!watch) return null;
    if (watch.deviceId !== deviceId) return null;
    window.clearTimeout(watch.timeoutId);
    this.pending.delete(clientWriteSeq);
    return Date.now() - watch.startedAt;
  }

  clear(clientWriteSeq: number): void {
    const watch = this.pending.get(clientWriteSeq);
    if (!watch) return;
    window.clearTimeout(watch.timeoutId);
    this.pending.delete(clientWriteSeq);
  }

  clearAll(): void {
    for (const watch of this.pending.values()) {
      window.clearTimeout(watch.timeoutId);
    }
    this.pending.clear();
  }

  private async tick(clientWriteSeq: number): Promise<void> {
    const watch = this.pending.get(clientWriteSeq);
    if (!watch) return;

    const maxAttempts = Math.max(1, this.deps.maxAttempts ?? 5);
    watch.attempt += 1;
    this.pending.set(clientWriteSeq, watch);

    if (watch.attempt > maxAttempts) {
      this.clear(clientWriteSeq);
      this.deps.onFailure?.(watch, new Error("ERR_RECOVERY_MAX_ATTEMPTS"));
      return;
    }

    this.deps.onAckTimeout(watch);
    try {
      const stepResult = await this.deps.runStep(watch);
      const deferredMs = stepResult?.deferredMs;
      if (typeof deferredMs === "number" && deferredMs > 0) {
        const nextDelayMs = this.computeRetryDelayMs(watch, deferredMs);
        watch.timeoutId = window.setTimeout(() => {
          void this.tick(clientWriteSeq);
        }, nextDelayMs);
        this.pending.set(clientWriteSeq, watch);
        return;
      }
      this.clear(clientWriteSeq);
    } catch (error) {
      this.clear(clientWriteSeq);
      this.deps.onFailure?.(watch, error);
    }
  }
}
