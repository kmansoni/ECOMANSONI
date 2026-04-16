/**
 * Unit тесты для EpochGuard — fail-closed epoch enforcement.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EpochGuard } from '../calls-v2/epochGuard';

describe('EpochGuard', () => {
  let guard: EpochGuard;

  beforeEach(() => {
    guard = new EpochGuard(true); // strict mode
  });

  it('Initial state: mediaAllowed = false', () => {
    expect(guard.isMediaAllowed()).toBe(false);
    expect(guard.getState().mediaAllowed).toBe(false);
  });

  it('markAuthenticated() alone → mediaAllowed = false', () => {
    guard.markAuthenticated();
    expect(guard.isMediaAllowed()).toBe(false);
  });

  it('markAuthenticated() + markRoomJoined() → mediaAllowed = false (no E2EE)', () => {
    guard.markAuthenticated();
    guard.markRoomJoined(1);
    expect(guard.isMediaAllowed()).toBe(false);
  });

  it('markAuthenticated() + markRoomJoined() + markE2eeReady() → mediaAllowed = true', () => {
    guard.markAuthenticated();
    guard.markRoomJoined(1);
    guard.markE2eeReady(1);
    expect(guard.isMediaAllowed()).toBe(true);
  });

  it('assertMediaAllowed() throws in strict mode when not allowed', () => {
    expect(() => guard.assertMediaAllowed('produce')).toThrow('[EpochGuard] BLOCKED');
  });

  it('assertMediaAllowed() warns in non-strict mode', () => {
    const nonStrictGuard = new EpochGuard(false);
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => nonStrictGuard.assertMediaAllowed('produce')).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('markEpochAdvanced() → mediaAllowed = false (until new E2EE_READY)', () => {
    guard.markAuthenticated();
    guard.markRoomJoined(1);
    guard.markE2eeReady(1);
    expect(guard.isMediaAllowed()).toBe(true);

    guard.markEpochAdvanced(2);
    expect(guard.isMediaAllowed()).toBe(false);
    expect(guard.isE2eeReady()).toBe(false);

    guard.markE2eeReady(2);
    expect(guard.isMediaAllowed()).toBe(true);
  });

  it('Epoch rollback rejected: markE2eeReady(5) then markE2eeReady(3) → violation', () => {
    guard.markAuthenticated();
    guard.markRoomJoined(1);
    guard.markE2eeReady(5);

    const violations: string[] = [];
    guard.onViolation((v) => violations.push(v));

    guard.markE2eeReady(3); // rollback

    expect(violations.length).toBeGreaterThan(0);
    expect(guard.getEpoch()).toBe(5); // epoch did not roll back
  });

  it('markDisconnected() → all false', () => {
    guard.markAuthenticated();
    guard.markRoomJoined(1);
    guard.markE2eeReady(1);
    expect(guard.isMediaAllowed()).toBe(true);

    guard.markDisconnected();
    const state = guard.getState();
    expect(state.authenticated).toBe(false);
    expect(state.roomJoined).toBe(false);
    expect(state.e2eeReady).toBe(false);
    expect(state.mediaAllowed).toBe(false);
  });

  it('markRoomLeft() → roomJoined/e2eeReady/mediaAllowed = false', () => {
    guard.markAuthenticated();
    guard.markRoomJoined(1);
    guard.markE2eeReady(1);

    guard.markRoomLeft();
    const state = guard.getState();
    expect(state.roomJoined).toBe(false);
    expect(state.e2eeReady).toBe(false);
    expect(state.mediaAllowed).toBe(false);
    expect(state.authenticated).toBe(true); // auth persists
  });

  it('violationHandler called on violations', () => {
    const handler = vi.fn();
    guard.onViolation(handler);

    // Trigger a violation: epoch rollback
    guard.markAuthenticated();
    guard.markRoomJoined(1);
    guard.markE2eeReady(5);
    guard.markE2eeReady(3); // rollback → violation

    expect(handler).toHaveBeenCalled();
    const [violationMsg] = handler.mock.calls[0];
    expect(violationMsg).toContain('rollback');
  });

  it('getMediaBlockReason() returns correct reason', () => {
    expect(guard.getMediaBlockReason()).toBe('not authenticated');

    guard.markAuthenticated();
    expect(guard.getMediaBlockReason()).toBe('not in room');

    guard.markRoomJoined(1);
    expect(guard.getMediaBlockReason()).toBe('E2EE not ready — no valid epoch key');

    guard.markE2eeReady(1);
    expect(guard.getMediaBlockReason()).toBe('unknown');
  });

  it('getState() returns snapshot', () => {
    guard.markAuthenticated();
    guard.markRoomJoined(2);
    guard.markE2eeReady(2);

    const state = guard.getState();
    expect(state.authenticated).toBe(true);
    expect(state.roomJoined).toBe(true);
    expect(state.e2eeReady).toBe(true);
    expect(state.currentEpoch).toBe(2);
    expect(state.mediaAllowed).toBe(true);
  });

  // ─── Regression: rollbackFailedEpoch observability (BUG #3) ─────────────
  it('rollbackFailedEpoch() успешно откатывает epoch после неудачной эскалации', () => {
    guard.markAuthenticated();
    guard.markRoomJoined(1);
    guard.markE2eeReady(1);
    expect(guard.getEpoch()).toBe(1);
    expect(guard.isMediaAllowed()).toBe(true);

    // Imitate начало rekey: epoch advanced → media blocked
    guard.markEpochAdvanced(2);
    expect(guard.isMediaAllowed()).toBe(false);

    // Rekey не удался → откат на 1
    guard.rollbackFailedEpoch(1);
    expect(guard.getEpoch()).toBe(1);
    expect(guard.isE2eeReady()).toBe(true);
    expect(guard.isMediaAllowed()).toBe(true);
  });

  it('rollbackFailedEpoch() с target > current → violation, не делает rollback вперёд', () => {
    guard.markAuthenticated();
    guard.markRoomJoined(1);
    guard.markE2eeReady(1);

    const violations: string[] = [];
    guard.onViolation((v) => violations.push(v));

    // Попытка "откатиться" на 5 при current=1 — невалидно
    guard.rollbackFailedEpoch(5);

    expect(guard.getEpoch()).toBe(1); // не изменился
    expect(violations.some((v) => v.includes('rollbackFailedEpoch'))).toBe(true);
  });

  it('rollbackFailedEpoch() идемпотентен при повторном вызове с той же целью', () => {
    // BUG #3: safety-таймер и abortRekey могут оба дёрнуть rollbackFailedEpoch;
    // повторный вызов должен быть безопасен (не ломать состояние, не давать violation).
    guard.markAuthenticated();
    guard.markRoomJoined(1);
    guard.markE2eeReady(1);
    guard.markEpochAdvanced(2);

    const violations: string[] = [];
    guard.onViolation((v) => violations.push(v));

    guard.rollbackFailedEpoch(1);
    const firstEpoch = guard.getEpoch();
    const firstAllowed = guard.isMediaAllowed();

    // Повторный вызов — должен быть silent no-op
    guard.rollbackFailedEpoch(1);
    expect(guard.getEpoch()).toBe(firstEpoch);
    expect(guard.isMediaAllowed()).toBe(firstAllowed);
    expect(violations.length).toBe(0); // повторный вызов не должен генерировать violation
  });
});
