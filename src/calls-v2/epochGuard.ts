/**
 * Epoch Guard — fail-closed enforcement для E2EE call media.
 *
 * Инварианты:
 * 1. NO_MEDIA_WITHOUT_E2EE: медиа produce/consume блокируются без валидного epoch
 * 2. NO_ROOM_WITHOUT_AUTH: WS не отправляет call messages без AUTH_OK
 * 3. MONOTONIC_EPOCH: epoch только растёт, rollback невозможен
 * 4. E2EE_READY_REQUIRED: PRODUCE блокируется до E2EE_READY подтверждения
 */

export interface EpochGuardState {
  authenticated: boolean;
  roomJoined: boolean;
  e2eeReady: boolean;
  currentEpoch: number;
  mediaAllowed: boolean;
  lastViolation: string | null;
  violationCount: number;
}

export type ViolationHandler = (
  violation: string,
  state: EpochGuardState
) => void;

export class EpochGuard {
  private state: EpochGuardState = {
    authenticated: false,
    roomJoined: false,
    e2eeReady: false,
    currentEpoch: 0,
    mediaAllowed: false,
    lastViolation: null,
    violationCount: 0,
  };

  private violationHandler: ViolationHandler | null = null;
  private readonly strict: boolean;

  /**
   * @param strict — if true, guard assertions throw; if false, log warnings only.
   *                 Always use strict=true in production call paths.
   */
  constructor(strict: boolean = true) {
    this.strict = strict;
  }

  onViolation(handler: ViolationHandler): void {
    this.violationHandler = handler;
  }

  // ─── State transitions ────────────────────────────────────────────────────

  markAuthenticated(): void {
    this.state.authenticated = true;
    this.recomputeMediaAllowed();
  }

  markRoomJoined(epoch: number): void {
    if (epoch < this.state.currentEpoch) {
      this.recordViolation(
        `markRoomJoined: epoch ${epoch} < current ${this.state.currentEpoch} (monotonicity)`
      );
      // Do not advance epoch backward; still mark joined
    } else {
      this.state.currentEpoch = epoch;
    }
    this.state.roomJoined = true;
    this.recomputeMediaAllowed();
  }

  markE2eeReady(epoch: number): void {
    if (epoch < this.state.currentEpoch) {
      this.recordViolation(
        `markE2eeReady: epoch ${epoch} < current ${this.state.currentEpoch} — rollback attempt rejected`
      );
      return;
    }
    this.state.currentEpoch = epoch;
    this.state.e2eeReady = true;
    this.recomputeMediaAllowed();
  }

  /**
   * Advance to a new epoch during rekey.
   * Temporarily disables media until markE2eeReady() confirms new epoch.
   */
  markEpochAdvanced(newEpoch: number): void {
    if (newEpoch <= this.state.currentEpoch) {
      this.recordViolation(
        `markEpochAdvanced: epoch regression — ${newEpoch} <= ${this.state.currentEpoch}`
      );
      return;
    }
    this.state.currentEpoch = newEpoch;
    // Disable media during key transition (fail-closed)
    this.state.e2eeReady = false;
    this.state.mediaAllowed = false;
  }

  markDisconnected(): void {
    this.state.authenticated = false;
    this.state.roomJoined = false;
    this.state.e2eeReady = false;
    this.state.mediaAllowed = false;
  }

  markRoomLeft(): void {
    this.state.roomJoined = false;
    this.state.e2eeReady = false;
    this.state.mediaAllowed = false;
    // M-2: DO NOT reset currentEpoch — epoch monotonicity must hold across sessions.
    // Resetting to 0 would allow epoch rollback attacks on reconnect.
  }

  // ─── Guards ───────────────────────────────────────────────────────────────

  /**
   * Assert media is allowed.
   * In strict mode throws; in non-strict mode only warns.
   */
  assertMediaAllowed(operation: string): void {
    if (!this.state.mediaAllowed) {
      const reason = this.getMediaBlockReason();
      const msg = `[EpochGuard] BLOCKED ${operation}: ${reason}`;
      this.recordViolation(msg);
      if (this.strict) throw new Error(msg);
      else console.warn(msg);
    }
  }

  /**
   * Assert epoch is not stale.
   */
  assertEpochValid(epoch: number, operation: string): void {
    if (epoch < this.state.currentEpoch) {
      const msg = `[EpochGuard] STALE epoch in ${operation}: got ${epoch}, current ${this.state.currentEpoch}`;
      this.recordViolation(msg);
      if (this.strict) throw new Error(msg);
      else console.warn(msg);
    }
  }

  assertAuthenticated(operation: string): void {
    if (!this.state.authenticated) {
      const msg = `[EpochGuard] NOT AUTHENTICATED for ${operation}`;
      this.recordViolation(msg);
      if (this.strict) throw new Error(msg);
      else console.warn(msg);
    }
  }

  assertInRoom(operation: string): void {
    if (!this.state.roomJoined) {
      const msg = `[EpochGuard] NOT IN ROOM for ${operation}`;
      this.recordViolation(msg);
      if (this.strict) throw new Error(msg);
      else console.warn(msg);
    }
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  isMediaAllowed(): boolean {
    return this.state.mediaAllowed;
  }

  isE2eeReady(): boolean {
    return this.state.e2eeReady;
  }

  getEpoch(): number {
    return this.state.currentEpoch;
  }

  getState(): Readonly<EpochGuardState> {
    return { ...this.state };
  }

  getMediaBlockReason(): string {
    if (!this.state.authenticated) return 'not authenticated';
    if (!this.state.roomJoined) return 'not in room';
    if (!this.state.e2eeReady) return 'E2EE not ready — no valid epoch key';
    return 'unknown';
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private recomputeMediaAllowed(): void {
    this.state.mediaAllowed =
      this.state.authenticated &&
      this.state.roomJoined &&
      this.state.e2eeReady;
  }

  private recordViolation(msg: string): void {
    this.state.lastViolation = msg;
    this.state.violationCount++;
    console.error(msg);
    try {
      this.violationHandler?.(msg, { ...this.state });
    } catch (err) {
      console.error('[EpochGuard] violationHandler threw:', err);
    }
  }
}
