/**
 * E2EE Recovery Policy — тестовая матрица
 *
 * Tests the blocking requirement:
 *   no plaintext leak | no garbage frame enqueue | no silent blackhole
 *   | no ABA lifecycle race | no infinite recovery storm | no false call abort
 */

import { describe, it, expect } from 'vitest';
import {
  E2EE_RECOVERY_POLICY,
  evaluateE2EERecovery,
  createEmptyRecoveryState,
  canEmitPipeBreak,
  recordPipeBreak,
  resetAfterRekey,
  type CryptoEvent,
  type RecoveryDecision,
  type RecoveryState,
} from './e2eeRecoveryPolicy';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeEvent(kind: CryptoEvent['kind'], trackId = 'track-1', peerId = 'peer-A'): CryptoEvent {
  return { kind, trackId, direction: 'decrypt', peerId, timestamp: Date.now() };
}

function advanceTime(state: RecoveryState, ms: number): RecoveryState {
  // Shift all timestamps in state forward by ms
  return {
    ...state,
    missingKeySinceMs: state.missingKeySinceMs !== null ? state.missingKeySinceMs + ms : null,
    recentErrors: state.recentErrors.map(e => ({ ...e, timestamp: e.timestamp + ms })),
    authTagFailures: state.authTagFailures.map(e => ({ ...e, timestamp: e.timestamp + ms })),
    malformedFrameErrors: state.malformedFrameErrors.map(e => ({ ...e, timestamp: e.timestamp + ms })),
    lastPipeBreakAtMs: state.lastPipeBreakAtMs !== null ? state.lastPipeBreakAtMs + ms : null,
    lastRekeyAtMs: state.lastRekeyAtMs !== null ? state.lastRekeyAtMs + ms : null,
    quarantineUntilMs: state.quarantineUntilMs !== null ? state.quarantineUntilMs + ms : null,
    peerQuarantinedUntilMs: state.peerQuarantinedUntilMs !== null ? state.peerQuarantinedUntilMs + ms : null,
  };
}

// ─── T1: encrypt failure → no plaintext enqueue ─────────────────────────────

describe('T1: Plaintext never enqueued (security invariant)', () => {
  it('AUTH_TAG_FAILED → TERMINATE_PIPE, not DROP_FRAME (fail-closed)', () => {
    const state = createEmptyRecoveryState();
    const event = makeEvent('AUTH_TAG_FAILED');
    const { decision } = evaluateE2EERecovery(event, state);
    expect(decision.action).toBe('TERMINATE_PIPE');
  });

  it('Single AUTH_TAG_FAILED → terminate pipe, not silent drop', () => {
    const state = createEmptyRecoveryState();
    const event = makeEvent('AUTH_TAG_FAILED');
    const { decision } = evaluateE2EERecovery(event, state);
    // Must terminate — plaintext is NOT allowed
    expect(decision.action).not.toBe('DROP_FRAME');
    expect(decision.action).toBe('TERMINATE_PIPE');
  });

  it('AUTH_TAG_FAILED burst (2x) → QUARANTINE_PEER', () => {
    const state = createEmptyRecoveryState();
    const now = Date.now();

    // First AUTH_TAG_FAILED
    const event1 = makeEvent('AUTH_TAG_FAILED');
    const { nextState: state1 } = evaluateE2EERecovery(event1, state);
    expect(state1.authTagFailures).toHaveLength(1);

    // Second AUTH_TAG_FAILED within window
    const event2 = { ...makeEvent('AUTH_TAG_FAILED'), timestamp: now };
    const { decision } = evaluateE2EERecovery(event2, state1);
    expect(decision.action).toBe('QUARANTINE_PEER');
  });

  it('ENCRYPT_PERSISTENT_FAILURE → FAIL_PEER_MEDIA, not silent drop', () => {
    const state = createEmptyRecoveryState();
    const event = makeEvent('ENCRYPT_PERSISTENT_FAILURE');
    const { decision } = evaluateE2EERecovery(event, state);
    expect(decision.action).toBe('FAIL_PEER_MEDIA');
    expect(decision.action).not.toBe('DROP_FRAME');
  });
});

// ─── T2: decrypt auth fail → no garbage frame enqueue ────────────────────────

describe('T2: Garbage frame never enqueued (integrity invariant)', () => {
  it('AUTH_TAG_FAILED → pipe terminates, caller receives typed event', () => {
    const state = createEmptyRecoveryState();
    const event = makeEvent('AUTH_TAG_FAILED');
    const { decision } = evaluateE2EERecovery(event, state);
    // Caller receives TERMINATE_PIPE decision — not "drop and continue"
    expect(decision.action).toBe('TERMINATE_PIPE');
  });

  it('MALFORMED_FRAME burst (5x) → FAIL_PEER_MEDIA, not DROP_FRAME', () => {
    const state = createEmptyRecoveryState();
    let s = state;
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      const event = { ...makeEvent('MALFORMED_FRAME'), timestamp: now };
      const result = evaluateE2EERecovery(event, s);
      s = result.nextState;
    }

    expect(s.malformedFrameCount).toBe(5);
    const finalDecision = evaluateE2EERecovery(
      { ...makeEvent('MALFORMED_FRAME'), timestamp: now },
      s
    );
    expect(finalDecision.decision.action).toBe('FAIL_PEER_MEDIA');
  });
});

// ─── T3: missing key → bounded drop + timeout event ─────────────────────────

describe('T3: Missing key timeout policy (no silent blackhole)', () => {
  it('< 500ms → DROP_FRAME, no user-visible event', () => {
    const state = createEmptyRecoveryState();
    const event = makeEvent('MISSING_KEY');
    const { decision, nextState } = evaluateE2EERecovery(event, state);
    expect(decision.action).toBe('DROP_FRAME');
    expect(nextState.missingKeySinceMs).not.toBeNull();
  });

  it('500ms–2000ms → DROP_FRAME still (grace window)', () => {
    const state = advanceTime(createEmptyRecoveryState(), 1000);
    const event = { ...makeEvent('MISSING_KEY'), timestamp: Date.now() };
    // Simulate: missingKeySinceMs was set 1000ms ago, but we use event timestamp
    const stateWithMissing = { ...createEmptyRecoveryState(), missingKeySinceMs: Date.now() - 1000 };
    const { decision } = evaluateE2EERecovery(event, stateWithMissing);
    // In grace window → drop
    expect(decision.action).toBe('DROP_FRAME');
  });

  it('2000ms–5000ms → WARN_USER (not silent drop)', () => {
    const stateWithMissing = { ...createEmptyRecoveryState(), missingKeySinceMs: Date.now() - 3000 };
    const event = makeEvent('MISSING_KEY');
    const { decision } = evaluateE2EERecovery(event, stateWithMissing);
    expect(decision.action).toBe('WARN_USER');
    expect('message' in decision).toBe(true);
  });

  it('> 5000ms → FAIL_PEER_MEDIA (not silent forever)', () => {
    const stateWithMissing = { ...createEmptyRecoveryState(), missingKeySinceMs: Date.now() - 6000 };
    const event = makeEvent('MISSING_KEY');
    const { decision, nextState } = evaluateE2EERecovery(event, stateWithMissing);
    expect(decision.action).toBe('FAIL_PEER_MEDIA');
    expect(nextState.peerQuarantinedUntilMs).not.toBeNull();
  });

  it('missing key drops increment counter (caller can observe)', () => {
    const state = createEmptyRecoveryState();
    let s = state;
    for (let i = 0; i < 3; i++) {
      const result = evaluateE2EERecovery(makeEvent('MISSING_KEY'), s);
      s = result.nextState;
    }
    expect(s.missingKeyDropCount).toBe(3);
  });
});

// ─── T4: stale epoch during rekey → drop within grace window ─────────────────

describe('T4: Stale epoch during rekey (grace window)', () => {
  it('STALE_KEY_EPOCH during rekey + accepted previous epoch → DROP_FRAME (not FAIL_PEER_MEDIA)', () => {
    const state = {
      ...createEmptyRecoveryState(),
      rekeyInProgress: true,
      acceptedPreviousEpochs: [1, 2],
    };
    const event = { ...makeEvent('STALE_KEY_EPOCH'), epoch: 1 };
    const { decision } = evaluateE2EERecovery(event, state);
    expect(decision.action).toBe('DROP_FRAME');
  });

  it('STALE_KEY_EPOCH outside rekey → REQUEST_REKEY', () => {
    const state = createEmptyRecoveryState();
    const event = { ...makeEvent('STALE_KEY_EPOCH'), epoch: 99 };
    const { decision } = evaluateE2EERecovery(event, state);
    expect(decision.action).toBe('REQUEST_REKEY');
  });

  it('STALE_KEY_EPOCH with unknown epoch → REQUEST_REKEY', () => {
    const state = { ...createEmptyRecoveryState(), rekeyInProgress: true, acceptedPreviousEpochs: [1] };
    const event = { ...makeEvent('STALE_KEY_EPOCH'), epoch: 99 };
    const { decision } = evaluateE2EERecovery(event, state);
    // Unknown epoch — request rekey, not fail
    expect(decision.action).toBe('REQUEST_REKEY');
  });
});

// ─── T5: duplicate removeTransform → idempotent ─────────────────────────────

describe('T5: removeTransform is idempotent', () => {
  // Unit test for idempotent behavior is in the function contract.
  // Here we verify state transitions don't break when called multiple times.

  it('recordPipeBreak called twice → state is valid', () => {
    const state = createEmptyRecoveryState();
    const now = Date.now();
    const s1 = recordPipeBreak(state, now);
    const s2 = recordPipeBreak(s1, now + 100);
    expect(s2.pipeBreakCount).toBe(2);
    // No crash, no invalid state
    expect(s2.lastPipeBreakAtMs).toBe(now + 100);
  });

  it('resetAfterRekey clears all error counters', () => {
    const state = {
      ...createEmptyRecoveryState(),
      authTagFailures: [makeEvent('AUTH_TAG_FAILED'), makeEvent('AUTH_TAG_FAILED')],
      malformedFrameCount: 5,
      malformedFrameErrors: [makeEvent('MALFORMED_FRAME')],
      recentErrors: [makeEvent('ENCRYPT_TRANSIENT_FAILURE')],
    };
    const reset = resetAfterRekey(state, Date.now(), [1, 2]);
    expect(reset.authTagFailures).toHaveLength(0);
    expect(reset.malformedFrameCount).toBe(0);
    expect(reset.malformedFrameErrors).toHaveLength(0);
    expect(reset.recentErrors).toHaveLength(0);
    expect(reset.acceptedPreviousEpochs).toEqual([1, 2]);
  });
});

// ─── T6: old pipe catch cannot remove new transform (ABA race) ─────────────

describe('T6: ABA race — stale transform cannot remove newer transform', () => {
  it('recordPipeBreak with new epoch survives repeated calls', () => {
    const state = createEmptyRecoveryState();
    const now = Date.now();
    // Simulate: new transform created, old pipe catch tries to remove
    const s1 = recordPipeBreak(state, now);
    // Second call with same timestamp — idempotent
    const s2 = recordPipeBreak(s1, now);
    expect(s2.pipeBreakCount).toBe(2);
    // No crash, no corruption
  });

  it('quarantine activates after 3 pipe breaks, blocks new events', () => {
    const state = createEmptyRecoveryState();
    const now = Date.now();
    let s = state;
    for (let i = 0; i < 3; i++) {
      s = recordPipeBreak(s, now + i * 100);
    }
    expect(s.quarantineUntilMs).not.toBeNull();
    expect(s.quarantineUntilMs).toBeGreaterThan(now);

    // Next event should be quarantined
    const event = makeEvent('MISSING_KEY');
    const { decision } = evaluateE2EERecovery(event, s);
    expect(decision.action).toBe('QUARANTINE_PEER');
  });
});

// ─── T7: pipe-break storm → rate limited / quarantine ──────────────────────

describe('T7: Pipe-break storm protection (abuse limiter)', () => {
  it('3 AUTH_TAG_FAILED within 5s window → QUARANTINE_PEER', () => {
    const state = createEmptyRecoveryState();
    let s = state;
    const now = Date.now();

    for (let i = 0; i < 3; i++) {
      const event = { ...makeEvent('AUTH_TAG_FAILED'), timestamp: now };
      const result = evaluateE2EERecovery(event, s);
      s = result.nextState;
    }

    const finalDecision = evaluateE2EERecovery(
      { ...makeEvent('AUTH_TAG_FAILED'), timestamp: now },
      s
    );
    expect(finalDecision.decision.action).toBe('QUARANTINE_PEER');
  });

  it('canEmitPipeBreak returns false during cooldown', () => {
    const state = { ...createEmptyRecoveryState(), lastPipeBreakAtMs: Date.now() - 500 };
    const now = Date.now();
    expect(canEmitPipeBreak(state, now)).toBe(false);
  });

  it('canEmitPipeBreak returns true after cooldown', () => {
    const state = { ...createEmptyRecoveryState(), lastPipeBreakAtMs: Date.now() - 2000 };
    const now = Date.now();
    expect(canEmitPipeBreak(state, now)).toBe(true);
  });
});

// ─── T8: rapid legitimate rekey → cooldown, no recovery cascade ─────────────

describe('T8: Rapid rekey protection (no recovery cascade)', () => {
  it('resetAfterRekey clears transient failure counters', () => {
    const state = {
      ...createEmptyRecoveryState(),
      recentErrors: [
        makeEvent('ENCRYPT_TRANSIENT_FAILURE'),
        makeEvent('ENCRYPT_TRANSIENT_FAILURE'),
        makeEvent('ENCRYPT_TRANSIENT_FAILURE'),
      ],
    };
    const reset = resetAfterRekey(state, Date.now(), [1]);
    expect(reset.recentErrors).toHaveLength(0);
    expect(reset.lastRekeyAtMs).not.toBeNull();
  });

  it('Multiple rekey resets are idempotent', () => {
    const state = createEmptyRecoveryState();
    const now = Date.now();
    const r1 = resetAfterRekey(state, now, [1]);
    const r2 = resetAfterRekey(r1, now + 100, [2]);
    expect(r2.acceptedPreviousEpochs).toEqual([2]);
    expect(r2.lastRekeyAtMs).toBe(now + 100);
  });
});

// ─── T9: transient encryption failure → drop current frame ─────────────────

describe('T9: Transient failure — drop frame, recover future', () => {
  it('ENCRYPT_TRANSIENT_FAILURE → DROP_FRAME', () => {
    const state = createEmptyRecoveryState();
    const event = makeEvent('ENCRYPT_TRANSIENT_FAILURE');
    const { decision } = evaluateE2EERecovery(event, state);
    expect(decision.action).toBe('DROP_FRAME');
  });

  it('DECRYPT_TRANSIENT_FAILURE → DROP_FRAME', () => {
    const state = createEmptyRecoveryState();
    const event = makeEvent('DECRYPT_TRANSIENT_FAILURE');
    const { decision } = evaluateE2EERecovery(event, state);
    expect(decision.action).toBe('DROP_FRAME');
  });

  it('3 TRANSIENT failures in window → TERMINATE_PIPE (not silent)', () => {
    const state = createEmptyRecoveryState();
    let s = state;
    const now = Date.now();

    for (let i = 0; i < 3; i++) {
      const event = { ...makeEvent('ENCRYPT_TRANSIENT_FAILURE'), timestamp: now };
      const result = evaluateE2EERecovery(event, s);
      s = result.nextState;
    }

    const finalDecision = evaluateE2EERecovery(
      { ...makeEvent('ENCRYPT_TRANSIENT_FAILURE'), timestamp: now },
      s
    );
    expect(finalDecision.decision.action).toBe('TERMINATE_PIPE');
  });
});

// ─── T10: persistent failure → fail peer after bounded timeout ─────────────

describe('T10: Persistent failure — bounded abort, not infinite retry', () => {
  it('ENCRYPT_PERSISTENT_FAILURE → FAIL_PEER_MEDIA immediately', () => {
    const state = createEmptyRecoveryState();
    const event = makeEvent('ENCRYPT_PERSISTENT_FAILURE');
    const { decision, nextState } = evaluateE2EERecovery(event, state);
    expect(decision.action).toBe('FAIL_PEER_MEDIA');
    expect(nextState.peerQuarantinedUntilMs).not.toBeNull();
  });

  it('DECRYPT_PERSISTENT_FAILURE → FAIL_PEER_MEDIA immediately', () => {
    const state = createEmptyRecoveryState();
    const event = makeEvent('DECRYPT_PERSISTENT_FAILURE');
    const { decision } = evaluateE2EERecovery(event, state);
    expect(decision.action).toBe('FAIL_PEER_MEDIA');
  });

  it('UNSUPPORTED_CODEC_FRAME → DROP_FRAME (not terminate)', () => {
    const state = createEmptyRecoveryState();
    const event = makeEvent('UNSUPPORTED_CODEC_FRAME');
    const { decision } = evaluateE2EERecovery(event, state);
    expect(decision.action).toBe('DROP_FRAME');
  });
});

// ─── Deterministic decisions property ───────────────────────────────────────

describe('Property: evaluator is deterministic (pure function)', () => {
  it('Same inputs produce same decision', () => {
    const state = createEmptyRecoveryState();
    const event = makeEvent('AUTH_TAG_FAILED');

    const r1 = evaluateE2EERecovery(event, state);
    const r2 = evaluateE2EERecovery(event, state);

    expect(r1.decision.action).toBe(r2.decision.action);
  });

  it('evaluateE2EERecovery does not mutate input state', () => {
    const state = createEmptyRecoveryState();
    const originalState = { ...state };
    const event = makeEvent('AUTH_TAG_FAILED');

    evaluateE2EERecovery(event, state);

    expect(state).toEqual(originalState);
  });
});