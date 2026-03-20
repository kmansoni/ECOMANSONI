/**
 * Rekey State Machine для E2EE call sessions.
 *
 * States: IDLE → REKEY_PENDING → KEY_DELIVERY → REKEY_COMMITTED → COOLDOWN → IDLE
 *
 * Transitions:
 * - IDLE → REKEY_PENDING: initiateRekey() (leader only)
 * - REKEY_PENDING → KEY_DELIVERY: onRekeyBeginAcked() (server acknowledged REKEY_BEGIN)
 * - KEY_DELIVERY → REKEY_COMMITTED: onQuorumReached() (all peers KEY_ACK'd)
 * - KEY_DELIVERY → IDLE: onRekeyAbort() (deadline exceeded or peer left)
 * - REKEY_COMMITTED → COOLDOWN: activateEpoch()
 * - COOLDOWN → IDLE: cooldown elapsed
 *
 * Invariants:
 * - epoch is MONOTONIC — never decreases
 * - no REKEY_COMMIT without KEY_ACK from all active peers (quorum)
 * - deadline enforced: if quorum not reached in rekeyDeadlineMs → REKEY_ABORT
 * - no concurrent rekeys: new rekey blocked while previous in progress
 * - anti-replay: messageId deduplication with TTL-based cleanup
 */

export type RekeyState =
  | 'IDLE'
  | 'REKEY_PENDING'
  | 'KEY_DELIVERY'
  | 'REKEY_COMMITTED'
  | 'COOLDOWN';

export interface RekeyConfig {
  /** Max time to wait for all KEY_ACKs after REKEY_BEGIN (ms) */
  rekeyDeadlineMs: number;
  /** Cooldown between rekeys (ms) */
  rekeyCooldownMs: number;
  /** Minimum interval between rekeys (ms) */
  minRekeyIntervalMs: number;
}

export const DEFAULT_REKEY_CONFIG: RekeyConfig = {
  rekeyDeadlineMs: 15_000,
  rekeyCooldownMs: 5_000,
  minRekeyIntervalMs: 30_000,
};

export interface PeerAckStatus {
  peerId: string;
  acked: boolean;
  ackedAt?: number;
}

export interface RekeyEvent {
  type:
    | 'REKEY_INITIATED'
    | 'REKEY_BEGIN_ACKED'
    | 'KEY_ACK_RECEIVED'
    | 'QUORUM_REACHED'
    | 'REKEY_COMMITTED'
    | 'EPOCH_ACTIVATED'
    | 'REKEY_ABORTED'
    | 'DEADLINE_EXCEEDED'
    | 'PEER_LEFT';
  epoch: number;
  peerId?: string;
  timestamp: number;
  reason?: string;
}

export type RekeyEventHandler = (event: RekeyEvent) => void;

/**
 * Anti-replay entry: messageId + expiry timestamp.
 */
interface ReplayEntry {
  id: string;
  expiresAt: number;
}

export class RekeyStateMachine {
  private state: RekeyState = 'IDLE';
  private currentEpoch: number = 0;
  private pendingEpoch: number = 0;
  private peerAcks: Map<string, PeerAckStatus> = new Map();
  private activePeers: Set<string> = new Set();
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRekeyTime: number = 0;
  private config: RekeyConfig;
  private eventLog: RekeyEvent[] = [];
  private eventHandler: RekeyEventHandler | null = null;

  // Anti-replay: timestamped entries for TTL-based eviction
  private replayMap: Map<string, number> = new Map(); // messageId → expiresAt
  private readonly messageIdTtlMs: number = 60_000;
  private messageIdCleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<RekeyConfig>) {
    this.config = { ...DEFAULT_REKEY_CONFIG, ...config };
    this.messageIdCleanupTimer = setInterval(
      () => this.cleanupMessageIds(),
      30_000
    );
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  onEvent(handler: RekeyEventHandler): void {
    this.eventHandler = handler;
  }

  getState(): RekeyState {
    return this.state;
  }

  getCurrentEpoch(): number {
    return this.currentEpoch;
  }

  getPendingEpoch(): number {
    return this.pendingEpoch;
  }

  /**
   * Register active peers.
   * In KEY_DELIVERY state, re-evaluates quorum.
   */
  /**
   * M-5: During KEY_DELIVERY, setActivePeers is blocked to prevent race conditions
   * where a full peer list replacement could bypass pending ACK requirements.
   * Use addPeer/removePeer during active key delivery instead.
   */
  setActivePeers(peerIds: string[]): void {
    if (this.state === 'KEY_DELIVERY') {
      // Blocked: full replace during KEY_DELIVERY could inadvertently achieve
      // fake quorum by removing peers that haven't acked yet.
      console.warn(
        '[RekeyStateMachine] setActivePeers blocked during KEY_DELIVERY — use addPeer/removePeer'
      );
      return;
    }
    this.activePeers = new Set(peerIds);
    // Re-check quorum if state transitions to KEY_DELIVERY afterward (REKEY_PENDING case)
  }

  addPeer(peerId: string): void {
    this.activePeers.add(peerId);
    // Late-joiner in KEY_DELIVERY: must ACK before quorum — add pending entry
    if (this.state === 'KEY_DELIVERY') {
      if (!this.peerAcks.has(peerId)) {
        this.peerAcks.set(peerId, { peerId, acked: false });
      }
    }
  }

  removePeer(peerId: string): void {
    this.activePeers.delete(peerId);
    this.peerAcks.delete(peerId);

    this.emitEvent({
      type: 'PEER_LEFT',
      epoch: this.pendingEpoch || this.currentEpoch,
      peerId,
      timestamp: Date.now(),
    });

    if (this.state === 'KEY_DELIVERY') {
      this.checkQuorum();
    }
  }

  /**
   * Initiate a rekey.
   * @returns new epoch number, or null if blocked (wrong state / cooldown).
   * Only call if you are the room leader.
   */
  initiateRekey(): number | null {
    if (this.state !== 'IDLE') {
      console.warn(
        `[RekeyStateMachine] Cannot rekey: state=${this.state}`
      );
      return null;
    }

    const now = Date.now();
    if (now - this.lastRekeyTime < this.config.minRekeyIntervalMs) {
      console.warn(
        `[RekeyStateMachine] Cannot rekey: min interval not elapsed`
      );
      return null;
    }

    const newEpoch = this.currentEpoch + 1;
    this.pendingEpoch = newEpoch;
    this.state = 'REKEY_PENDING';
    this.peerAcks.clear();

    for (const peerId of this.activePeers) {
      this.peerAcks.set(peerId, { peerId, acked: false });
    }

    this.emitEvent({
      type: 'REKEY_INITIATED',
      epoch: newEpoch,
      timestamp: now,
    });

    return newEpoch;
  }

  /**
   * Server acknowledged REKEY_BEGIN.
   * Transitions REKEY_PENDING → KEY_DELIVERY and starts deadline timer.
   */
  onRekeyBeginAcked(epoch: number): boolean {
    if (this.state !== 'REKEY_PENDING' || epoch !== this.pendingEpoch) {
      console.warn(
        `[RekeyStateMachine] Unexpected REKEY_BEGIN_ACK: state=${this.state}, epoch=${epoch}, pending=${this.pendingEpoch}`
      );
      return false;
    }

    this.state = 'KEY_DELIVERY';

    this.deadlineTimer = setTimeout(
      () => this.onDeadlineExceeded(),
      this.config.rekeyDeadlineMs
    );

    this.emitEvent({
      type: 'REKEY_BEGIN_ACKED',
      epoch,
      timestamp: Date.now(),
    });

    // Edge case: no peers in room → immediate quorum
    this.checkQuorum();

    return true;
  }

  /**
   * Process incoming KEY_ACK from a peer.
   * Performs anti-replay (messageId) and epoch monotonicity checks.
   */
  onKeyAckReceived(
    peerId: string,
    epoch: number,
    messageId?: string
  ): boolean {
    if (!this.checkAndRegisterMessageId(messageId, 'KEY_ACK')) return false;

    if (epoch < this.currentEpoch) {
      console.warn(
        `[RekeyStateMachine] Stale KEY_ACK: epoch=${epoch} < current=${this.currentEpoch}`
      );
      return false;
    }

    if (this.state !== 'KEY_DELIVERY' || epoch !== this.pendingEpoch) {
      console.warn(
        `[RekeyStateMachine] Unexpected KEY_ACK: state=${this.state}, epoch=${epoch}, pending=${this.pendingEpoch}`
      );
      return false;
    }

    const ack = this.peerAcks.get(peerId);
    if (!ack) {
      console.warn(
        `[RekeyStateMachine] KEY_ACK from unknown peer: ${peerId}`
      );
      return false;
    }

    if (ack.acked) {
      console.warn(
        `[RekeyStateMachine] Duplicate KEY_ACK from peer (already acked): ${peerId}`
      );
      return false;
    }

    ack.acked = true;
    ack.ackedAt = Date.now();

    this.emitEvent({
      type: 'KEY_ACK_RECEIVED',
      epoch,
      peerId,
      timestamp: Date.now(),
    });

    this.checkQuorum();
    return true;
  }

  /**
   * Validate an incoming KEY_PACKAGE for anti-replay and epoch staleness.
   */
  validateKeyPackage(epoch: number, messageId?: string): boolean {
    if (!this.checkAndRegisterMessageId(messageId, 'KEY_PACKAGE')) {
      return false;
    }

    if (epoch < this.currentEpoch) {
      console.warn(
        `[RekeyStateMachine] Stale KEY_PACKAGE: epoch=${epoch} < current=${this.currentEpoch}`
      );
      return false;
    }

    return true;
  }

  /**
   * Activate the pending epoch once REKEY_COMMITTED.
   * Transitions REKEY_COMMITTED → COOLDOWN → IDLE.
   */
  activateEpoch(epoch: number): boolean {
    if (
      this.state !== 'REKEY_COMMITTED' ||
      epoch !== this.pendingEpoch
    ) {
      console.warn(
        `[RekeyStateMachine] Cannot activate epoch ${epoch}: state=${this.state}, pending=${this.pendingEpoch}`
      );
      return false;
    }

    this.currentEpoch = epoch;
    this.pendingEpoch = 0;
    this.lastRekeyTime = Date.now();
    this.state = 'COOLDOWN';

    this.emitEvent({
      type: 'EPOCH_ACTIVATED',
      epoch,
      timestamp: Date.now(),
    });

    this.cooldownTimer = setTimeout(() => {
      this.state = 'IDLE';
    }, this.config.rekeyCooldownMs);

    return true;
  }

  /**
   * Force-abort current rekey. No-op if IDLE or COOLDOWN.
   */
  abortRekey(reason: string): void {
    if (this.state === 'IDLE' || this.state === 'COOLDOWN') return;

    this.clearDeadlineTimer();

    this.emitEvent({
      type: 'REKEY_ABORTED',
      epoch: this.pendingEpoch,
      timestamp: Date.now(),
      reason,
    });

    this.pendingEpoch = 0;
    this.peerAcks.clear();
    this.state = 'IDLE';
  }

  getAckStatus(): PeerAckStatus[] {
    return Array.from(this.peerAcks.values());
  }

  getEventLog(): RekeyEvent[] {
    return [...this.eventLog];
  }

  destroy(): void {
    console.log('[RekeyStateMachine] destroy() called', {
      state: this.state,
      currentEpoch: this.currentEpoch,
      pendingEpoch: this.pendingEpoch,
      activePeersCount: this.activePeers.size,
      peerAcksCount: this.peerAcks.size,
      hasDeadlineTimer: !!this.deadlineTimer,
      hasCooldownTimer: !!this.cooldownTimer,
      hasCleanupTimer: !!this.messageIdCleanupTimer,
      timestamp: Date.now(),
    });
    
    this.clearDeadlineTimer();
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    // BUG #12 FIX: Safe cleanup of messageIdCleanupTimer with null check
    if (this.messageIdCleanupTimer) {
      try {
        clearInterval(this.messageIdCleanupTimer);
      } catch (e) {
        console.error('[RekeyStateMachine] Failed to clear cleanup timer:', e);
      }
      this.messageIdCleanupTimer = null;
    }
    this.peerAcks.clear();
    this.activePeers.clear();
    this.replayMap.clear();
    this.eventLog = [];
    this.eventHandler = null;
    
    console.log('[RekeyStateMachine] destroy() completed', { timestamp: Date.now() });
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private checkAndRegisterMessageId(
    messageId: string | undefined,
    kind: string
  ): boolean {
    // H-3: Missing messageId is REJECTED — cannot do anti-replay without it.
    // An absent messageId is a security concern: replay attacks are undetectable.
    if (!messageId) {
      console.warn(`[RekeyStateMachine] REJECTED: missing messageId for ${kind} (required for anti-replay)`);
      return false;
    }

    const now = Date.now();
    const existing = this.replayMap.get(messageId);
    if (existing !== undefined && existing > now) {
      console.warn(
        `[RekeyStateMachine] Anti-replay: duplicate ${kind} messageId=${messageId}`
      );
      return false;
    }

    this.replayMap.set(messageId, now + this.messageIdTtlMs);
    return true;
  }

  private checkQuorum(): void {
    if (this.state !== 'KEY_DELIVERY') return;

    // Only count peers that are still active
    const activeAcks = Array.from(this.peerAcks.entries()).filter(
      ([peerId]) => this.activePeers.has(peerId)
    );

    // Require at least 0 active peers (solo call still valid)
    const allAcked =
      activeAcks.length === 0 || activeAcks.every(([, s]) => s.acked);

    if (!allAcked) return;

    this.clearDeadlineTimer();
    this.state = 'REKEY_COMMITTED';

    this.emitEvent({
      type: 'QUORUM_REACHED',
      epoch: this.pendingEpoch,
      timestamp: Date.now(),
    });

    this.emitEvent({
      type: 'REKEY_COMMITTED',
      epoch: this.pendingEpoch,
      timestamp: Date.now(),
    });
  }

  private onDeadlineExceeded(): void {
    if (this.state !== 'KEY_DELIVERY') return;

    const unacked = Array.from(this.peerAcks.entries())
      .filter(
        ([peerId, status]) => !status.acked && this.activePeers.has(peerId)
      )
      .map(([peerId]) => peerId);

    this.emitEvent({
      type: 'DEADLINE_EXCEEDED',
      epoch: this.pendingEpoch,
      timestamp: Date.now(),
      reason: `Unacked peers: ${unacked.join(', ')}`,
    });

    this.abortRekey(`Deadline exceeded. Unacked: ${unacked.join(', ')}`);
  }

  private clearDeadlineTimer(): void {
    if (this.deadlineTimer) {
      clearTimeout(this.deadlineTimer);
      this.deadlineTimer = null;
    }
  }

  private cleanupMessageIds(): void {
    const now = Date.now();
    for (const [id, expiresAt] of this.replayMap.entries()) {
      if (expiresAt <= now) {
        this.replayMap.delete(id);
      }
    }
  }

  private emitEvent(event: RekeyEvent): void {
    this.eventLog.push(event);
    if (this.eventLog.length > 100) {
      this.eventLog = this.eventLog.slice(-100);
    }
    try {
      this.eventHandler?.(event);
    } catch (err) {
      console.error('[RekeyStateMachine] eventHandler threw:', err);
    }
  }
}
