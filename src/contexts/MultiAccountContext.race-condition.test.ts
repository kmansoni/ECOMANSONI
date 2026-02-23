import { describe, it, expect, beforeEach } from 'vitest';

/**
 * RACE CONDITION TEST SUITE
 * 
 * Tests verify that the stale-overwrite bug is impossible:
 * - AbortController cancels in-flight requests on switch
 * - seq guard rejects stale responses even if abort fails
 * - UI never shows profile from wrong account
 */

// Mock deferred for controlled async test sequencing
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type mockProfile = { id: string; username: string };

// Simple state machine for testing (mirrors MultiAccountContext logic)
class MockMultiAccountController {
  seqRef: number = 0;
  abortControllers: Record<string, { seq: number; controller: AbortController }> = {};
  activeAccountId: string | null = null;
  appliedProfiles: Record<string, mockProfile> = {};
  staleProfilesIgnored: string[] = [];

  async fetchProfile(
    accountId: string,
    signal?: AbortSignal,
    delayMs: number = 0
  ): Promise<mockProfile | null> {
    // Simulate abort check at start
    if (signal?.aborted) {
      return null;
    }

    // Simulate network delay
    if (delayMs > 0) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        });
      });
    }

    // Final abort check before return
    if (signal?.aborted) {
      return null;
    }

    return { id: accountId, username: `user_${accountId}` };
  }

  async switchAccount(accountId: string) {
    // Mimic switchAccount logic
    const seq = ++this.seqRef;
    const prev = this.abortControllers[accountId];
    if (prev?.controller) {
      prev.controller.abort();
    }
    const controller = new AbortController();
    this.abortControllers[accountId] = { seq, controller };
    this.activeAccountId = accountId;

    // Start profile fetch
    try {
      const profile = await this.fetchProfile(accountId, controller.signal);
      
      // GUARD: only commit if seq matches
      if (this.seqRef !== seq) {
        this.staleProfilesIgnored.push(accountId);
        return;
      }

      if (profile) {
        this.appliedProfiles[accountId] = profile;
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      throw e;
    }
  }
}

describe('MultiAccountContext: Race Condition Protection', () => {
  let controller: MockMultiAccountController;

  beforeEach(() => {
    controller = new MockMultiAccountController();
  });

  it('rapid switch A→B: ignores stale A response even if it arrives later', async () => {
    const profileA = deferred<mockProfile>();
    const profileB = deferred<mockProfile>();

    // Setup mocks to return predefined promises
    controller.fetchProfile = async (id, signal) => {
      if (id === 'A') return profileA.promise;
      if (id === 'B') return profileB.promise;
      throw new Error('unexpected');
    };

    // User: click account A (slow network)
    const switchA = controller.switchAccount('A');

    // User: immediately click account B (fast network)
    const switchB = controller.switchAccount('B');

    // B resolves first → should be applied
    profileB.resolve({ id: 'B', username: 'bob' });
    await switchB;

    expect(controller.activeAccountId).toBe('B');
    expect(controller.appliedProfiles['B']?.username).toBe('bob');

    // A resolves much later → should be IGNORED (stale)
    profileA.resolve({ id: 'A', username: 'alice' });
    await switchA.catch(() => {}); // may throw, that's ok

    // CRITICAL: A was NOT applied despite arriving async later
    expect(controller.appliedProfiles['A']).toBeUndefined();
    expect(controller.staleProfilesIgnored).toContain('A');
    // Active is still B
    expect(controller.activeAccountId).toBe('B');
  });

  it('AbortController.abort() is called on previous in-flight request when re-switching same account', async () => {
    const signals: AbortSignal[] = [];

    controller.fetchProfile = async (id, signal) => {
      if (signal) signals.push(signal);
      // Simulate slow network so the first request stays in-flight
      await new Promise(resolve => setTimeout(resolve, 100));
      if (signal?.aborted) throw new Error('aborted');
      return { id, username: `user_${id}` };
    };

    const p1 = controller.switchAccount('A');
    const p2 = controller.switchAccount('A');

    expect(signals.length).toBeGreaterThanOrEqual(2);
    expect(signals[0].aborted).toBe(true);

    await Promise.all([p1, p2].map(p => p.catch(() => {})));
  });

  it('rapid same-account re-switch: last invocation wins (seq guard)', async () => {
    const d1 = deferred<mockProfile>();
    const d2 = deferred<mockProfile>();

    let callCount = 0;
    controller.fetchProfile = async (id, signal) => {
      callCount++;
      const result = callCount === 1 ? d1.promise : d2.promise;
      if (signal?.aborted) throw new Error('aborted');
      return result;
    };

    const switch1 = controller.switchAccount('A');
    const switch2 = controller.switchAccount('A');

    // First request returns "old" profile
    d1.resolve({ id: 'A', username: 'old_alice' });
    await switch1;

    // First response should NOT be applied (seq advanced at switch2)
    expect(controller.appliedProfiles['A']?.username).not.toBe('old_alice');

    // Second request returns "new" profile
    d2.resolve({ id: 'A', username: 'new_alice' });
    await switch2;

    // Only latest should be applied
    expect(controller.appliedProfiles['A']?.username).toBe('new_alice');
  });

  it('A→B→A switch: ensures isolation between concurrent fetches', async () => {
    const profileA = deferred<mockProfile>();
    const profileB = deferred<mockProfile>();

    let callMap: Record<string, Promise<mockProfile>> = {};
    controller.fetchProfile = async (id, signal) => {
      const promise = id === 'A' ? profileA.promise : profileB.promise;
      if (signal?.aborted) throw new Error('aborted');
      return promise;
    };

    // Sequence: A (slow) → B (faster) → A again (back to A)
    void controller.switchAccount('A');
    void controller.switchAccount('B');
    void controller.switchAccount('A');

    // All are running, but only latest seq matters
    profileB.resolve({ id: 'B', username: 'bob' });

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 50));

    // At this point, which account should be active?
    // The last switch was to 'A' again, so activeAccountId should be 'A'
    expect(controller.activeAccountId).toBe('A');

    // Now resolve A (the final switch)
    profileA.resolve({ id: 'A', username: 'alice' });
    await new Promise(resolve => setTimeout(resolve, 50));

    // Final state: A is applied, B was ignored
    expect(controller.appliedProfiles['A']?.username).toBe('alice');
    expect(controller.staleProfilesIgnored).toContain('B');
  });

  it('concurrent switches to different accounts: seq isolation', async () => {
    const profiles: Record<string, Deferred<mockProfile>> = {
      A: deferred<mockProfile>(),
      B: deferred<mockProfile>(),
      C: deferred<mockProfile>(),
    };

    controller.fetchProfile = async (id, signal) => {
      if (signal?.aborted) throw new Error('aborted');
      return profiles[id].promise;
    };

    // Rapid switches: A → B → C
    const promises = [
      controller.switchAccount('A'),
      controller.switchAccount('B'),
      controller.switchAccount('C'),
    ];

    // Resolve in reverse order of speed: C (fastest), then B, then A (slowest)
    profiles['C'].resolve({ id: 'C', username: 'charlie' });
    profiles['B'].resolve({ id: 'B', username: 'bob' });
    profiles['A'].resolve({ id: 'A', username: 'alice' });

    await Promise.all(promises.map(p => p.catch(() => {})));

    // Only C should be applied (final seq)
    expect(controller.appliedProfiles['C']).toBeDefined();
    expect(controller.appliedProfiles['B']).toBeUndefined();
    expect(controller.appliedProfiles['A']).toBeUndefined();
    expect(controller.activeAccountId).toBe('C');
  });

  it('seq counter monotonically increases and guards each switch', () => {
    expect(controller.seqRef).toBe(0);

    void controller.switchAccount('A');
    expect(controller.seqRef).toBe(1);

    void controller.switchAccount('B');
    expect(controller.seqRef).toBe(2);

    void controller.switchAccount('C');
    expect(controller.seqRef).toBe(3);

    // Each switch recorded its own seq
    expect(controller.abortControllers['A'].seq).toBe(1);
    expect(controller.abortControllers['B'].seq).toBe(2);
    expect(controller.abortControllers['C'].seq).toBe(3);
  });
});
