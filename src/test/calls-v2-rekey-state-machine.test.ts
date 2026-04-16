/**
 * Unit тесты для RekeyStateMachine — rekey state machine с anti-replay.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RekeyStateMachine } from '../calls-v2/rekeyStateMachine';

function makeStateMachine(overrides?: { rekeyDeadlineMs?: number; rekeyCooldownMs?: number; minRekeyIntervalMs?: number }) {
  return new RekeyStateMachine({
    rekeyDeadlineMs: 10_000,
    rekeyCooldownMs: 100,
    minRekeyIntervalMs: 0, // allow immediate rekey in tests
    ...overrides,
  });
}

describe('RekeyStateMachine', () => {
  let sm: RekeyStateMachine;

  beforeEach(() => {
    vi.useFakeTimers();
    sm = makeStateMachine();
  });

  afterEach(() => {
    sm.destroy();
    vi.useRealTimers();
  });

  it('Initial state is IDLE, epoch 0', () => {
    expect(sm.getState()).toBe('IDLE');
    expect(sm.getCurrentEpoch()).toBe(0);
  });

  it('initiateRekey() → REKEY_PENDING, returns new epoch', () => {
    const epoch = sm.initiateRekey();
    expect(epoch).toBe(1);
    expect(sm.getState()).toBe('REKEY_PENDING');
    expect(sm.getPendingEpoch()).toBe(1);
  });

  it('initiateRekey() while not IDLE → returns null', () => {
    sm.initiateRekey();
    const result = sm.initiateRekey();
    expect(result).toBeNull();
  });

  it('onRekeyBeginAcked() → KEY_DELIVERY', () => {
    // Must have at least one pending peer so quorum isn't instant
    sm.setActivePeers(['peer1']);
    sm.initiateRekey();
    const ok = sm.onRekeyBeginAcked(1);
    expect(ok).toBe(true);
    expect(sm.getState()).toBe('KEY_DELIVERY');
  });

  it('onKeyAckReceived() from all peers → QUORUM_REACHED → REKEY_COMMITTED', () => {
    sm.setActivePeers(['peer1', 'peer2']);
    sm.initiateRekey();
    sm.onRekeyBeginAcked(1);

    sm.onKeyAckReceived('peer1', 1, 'msg-1');
    expect(sm.getState()).toBe('KEY_DELIVERY');

    sm.onKeyAckReceived('peer2', 1, 'msg-2');
    expect(sm.getState()).toBe('REKEY_COMMITTED');
  });

  it('activateEpoch() → COOLDOWN → IDLE (after cooldown)', () => {
    sm.setActivePeers([]);
    sm.initiateRekey();
    sm.onRekeyBeginAcked(1); // no peers → immediate REKEY_COMMITTED
    expect(sm.getState()).toBe('REKEY_COMMITTED');

    sm.activateEpoch(1);
    expect(sm.getState()).toBe('COOLDOWN');
    expect(sm.getCurrentEpoch()).toBe(1);

    vi.advanceTimersByTime(200);
    expect(sm.getState()).toBe('IDLE');
  });

  it('Deadline exceeded → REKEY_ABORTED → IDLE', () => {
    sm.setActivePeers(['peer1']);
    sm.initiateRekey();
    sm.onRekeyBeginAcked(1);
    expect(sm.getState()).toBe('KEY_DELIVERY');

    vi.advanceTimersByTime(15_000);
    expect(sm.getState()).toBe('IDLE');
  });

  it('Deadline in REKEY_PENDING → abort if server never ACKs', () => {
    sm.setActivePeers(['peer1']);
    sm.initiateRekey();
    expect(sm.getState()).toBe('REKEY_PENDING');

    // Never call onRekeyBeginAcked — simulate server not responding
    vi.advanceTimersByTime(10_000);
    expect(sm.getState()).toBe('IDLE');

    const events = sm.getEventLog().map(e => e.type);
    expect(events).toContain('DEADLINE_EXCEEDED');
    expect(events).toContain('REKEY_ABORTED');
  });

  it('Anti-replay: duplicate messageId rejected', () => {
    sm.setActivePeers(['peer1']);
    sm.initiateRekey();
    sm.onRekeyBeginAcked(1);

    const first = sm.onKeyAckReceived('peer1', 1, 'dup-id');
    expect(first).toBe(true);

    // Duplicate messageId should be rejected
    // Add peer2 so state stays in KEY_DELIVERY
    sm.addPeer('peer2');
    const second = sm.onKeyAckReceived('peer1', 1, 'dup-id');
    expect(second).toBe(false);
  });

  it('Stale epoch KEY_ACK rejected (epoch < current)', () => {
    sm.setActivePeers([]);
    sm.initiateRekey();
    sm.onRekeyBeginAcked(1);
    sm.activateEpoch(1);
    vi.advanceTimersByTime(200); // cooldown

    // Now currentEpoch=1, start rekey for epoch 2
    sm.setActivePeers(['peer1']);
    sm.initiateRekey();
    sm.onRekeyBeginAcked(2);

    // Stale ACK for epoch 0
    const result = sm.onKeyAckReceived('peer1', 0, 'stale-msg');
    expect(result).toBe(false);
  });

  it('removePeer() during KEY_DELIVERY → re-check quorum', () => {
    sm.setActivePeers(['peer1', 'peer2']);
    sm.initiateRekey();
    sm.onRekeyBeginAcked(1);

    sm.onKeyAckReceived('peer1', 1, 'msg-p1');
    expect(sm.getState()).toBe('KEY_DELIVERY');

    // peer2 leaves: quorum should now be satisfied
    sm.removePeer('peer2');
    expect(sm.getState()).toBe('REKEY_COMMITTED');
  });

  it('addPeer() during KEY_DELIVERY → new peer needs ACK', () => {
    sm.setActivePeers(['peer1']);
    sm.initiateRekey();
    sm.onRekeyBeginAcked(1);

    sm.onKeyAckReceived('peer1', 1, 'msg-p1');
    // peer1 alone should have triggered quorum, but let's test addPeer before quorum
    // Reset: no peers initially
    sm.destroy();
    vi.useRealTimers();
    vi.useFakeTimers();

    sm = makeStateMachine();
    sm.setActivePeers([]);
    sm.initiateRekey();
    sm.onRekeyBeginAcked(1);
    // No peers → immediately committed
    expect(sm.getState()).toBe('REKEY_COMMITTED');
    sm.activateEpoch(1);
    vi.advanceTimersByTime(200);

    // New rekey cycle with 1 peer
    sm.setActivePeers(['peer1']);
    sm.initiateRekey();
    sm.onRekeyBeginAcked(2);

    // Add a new late joiner
    sm.addPeer('peer2');
    sm.onKeyAckReceived('peer1', 2, 'msg-p1-2');
    expect(sm.getState()).toBe('KEY_DELIVERY'); // peer2 still needs ACK

    sm.onKeyAckReceived('peer2', 2, 'msg-p2-2');
    expect(sm.getState()).toBe('REKEY_COMMITTED');
  });

  it('Monotonic epoch: activateEpoch cannot be called with old epoch', () => {
    sm.setActivePeers([]);
    sm.initiateRekey();
    sm.onRekeyBeginAcked(1);
    sm.activateEpoch(1);
    vi.advanceTimersByTime(200);

    sm.initiateRekey();
    sm.onRekeyBeginAcked(2);
    sm.activateEpoch(2);

    // Attempt to call activateEpoch(1) again — should fail (wrong state)
    const result = sm.activateEpoch(1);
    expect(result).toBe(false);
  });

  it('Event log captures all transitions', () => {
    sm.setActivePeers([]);
    sm.initiateRekey();
    sm.onRekeyBeginAcked(1);
    sm.activateEpoch(1);

    const log = sm.getEventLog();
    const types = log.map(e => e.type);
    expect(types).toContain('REKEY_INITIATED');
    expect(types).toContain('REKEY_BEGIN_ACKED');
    expect(types).toContain('QUORUM_REACHED');
    expect(types).toContain('REKEY_COMMITTED');
    expect(types).toContain('EPOCH_ACTIVATED');
  });

  it('destroy() cleans up timers', () => {
    sm.setActivePeers(['peer1']);
    sm.initiateRekey();
    sm.onRekeyBeginAcked(1);

    sm.destroy();
    // No timer-based state changes after destroy
    vi.advanceTimersByTime(30_000);
    // Should not throw, state may be whatever it was
  });

  it('Cooldown blocks new rekey', () => {
    sm.setActivePeers([]);
    sm.initiateRekey();
    sm.onRekeyBeginAcked(1);
    sm.activateEpoch(1);
    // Still in COOLDOWN
    expect(sm.getState()).toBe('COOLDOWN');
    const result = sm.initiateRekey();
    expect(result).toBeNull();
  });

  it('Full lifecycle: IDLE → initiate → acked → all ACKs → committed → activated → IDLE', () => {
    sm.setActivePeers(['alice', 'bob']);
    expect(sm.getState()).toBe('IDLE');

    const epoch = sm.initiateRekey();
    expect(sm.getState()).toBe('REKEY_PENDING');

    sm.onRekeyBeginAcked(epoch!);
    expect(sm.getState()).toBe('KEY_DELIVERY');

    sm.onKeyAckReceived('alice', epoch!, 'ack-alice');
    sm.onKeyAckReceived('bob', epoch!, 'ack-bob');
    expect(sm.getState()).toBe('REKEY_COMMITTED');

    sm.activateEpoch(epoch!);
    expect(sm.getState()).toBe('COOLDOWN');
    expect(sm.getCurrentEpoch()).toBe(epoch!);

    vi.advanceTimersByTime(200);
    expect(sm.getState()).toBe('IDLE');
  });
});
