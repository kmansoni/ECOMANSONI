/**
 * E2EE Recovery Policy — централизованные константы и pure evaluator.
 *
 * Архитектура:
 *   Crypto layer (insertableStreams.ts) → emit typed CryptoEvent
 *   → CallRuntime (callMediaEncryption.ts) → evaluateE2EERecovery()
 *   → RecoveryDecision → исполнение в CallRuntime
 *
 * ВАЖНО: evaluateE2EERecovery — PURE synchronous function.
 * Никаких async, побочных эффектов, I/O. Только константы + состояние → решение.
 * Это гарантирует детерминированность на hot path.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const E2EE_RECOVERY_POLICY = {
  // MissingKeyPolicy — когда ключ дешифрования не установлен
  missingKeyGraceMs: 500,       // silent drop
  missingKeyWarningMs: 2000,    // emit degraded media event
  missingKeyAbortMs: 5000,      // fail peer media

  // Transient vs Persistent failure discrimination
  transientFailureThreshold: 3,       // кол-во ошибок за window → transient
  transientFailureWindowMs: 2000,    // временное окно для подсчёта
  persistentFailureAbortMs: 5000,      // persistent failure → abort after

  // PipeBreakRateLimiter
  pipeBreakCooldownMs: 1000,          // минимальный интервал между pipe break
  pipeBreakQuarantineThreshold: 3,   // N срабатываний → quarantine peer
  pipeBreakQuarantineMs: 30_000,       // время изоляции

  // RekeyCooldown — защита от recovery storm при быстром rekey
  rekeyCooldownMs: 30_000,
  rekeyGraceWindowMs: 2000,           // эпохи в этом окне считаются валидными

  // AbuseLimiter
  authTagFailureThreshold: 2,          // AUTH_TAG_FAILED N раз → terminate
  authTagFailureWindowMs: 5000,       // окно для подсчёта
  malformedFrameThreshold: 5,          // MALFORMED_FRAME N раз → abort peer
  malformedFrameWindowMs: 10_000,
} as const;

export type E2EERecoveryPolicy = typeof E2EE_RECOVERY_POLICY;

// ─── Typed CryptoEvent ───────────────────────────────────────────────────────

export type CryptoErrorKind =
  | 'AUTH_TAG_FAILED'
  | 'MISSING_KEY'
  | 'STALE_KEY_EPOCH'
  | 'MALFORMED_FRAME'
  | 'UNSUPPORTED_CODEC_FRAME'
  | 'ENCRYPT_TRANSIENT_FAILURE'
  | 'ENCRYPT_PERSISTENT_FAILURE'
  | 'DECRYPT_TRANSIENT_FAILURE'
  | 'DECRYPT_PERSISTENT_FAILURE';

export interface CryptoEvent {
  kind: CryptoErrorKind;
  trackId: string;
  direction: 'encrypt' | 'decrypt';
  peerId?: string;
  timestamp: number; // Date.now()
  epoch?: number;     // текущая эпоха (для STALE_KEY_EPOCH)
  frameCounter?: number; // счётчик кадров в момент ошибки
}

// ─── State accumulators ───────────────────────────────────────────────────────

/**
 * Накапливает состояние для evaluateE2EERecovery.
 * Не содержит логики принятия решений — только аккумуляция.
 */
export interface RecoveryState {
  // MissingKey tracking
  missingKeySinceMs: number | null;
  missingKeyDropCount: number;

  // Transient failure tracking
  recentErrors: CryptoEvent[];

  // Pipe break tracking
  pipeBreakCount: number;
  lastPipeBreakAtMs: number | null;
  quarantineUntilMs: number | null;

  // Auth tag failure tracking
  authTagFailures: CryptoEvent[];
  malformedFrameCount: number;
  malformedFrameErrors: CryptoEvent[];

  // Rekey tracking
  lastRekeyAtMs: number | null;
  rekeyInProgress: boolean;
  acceptedPreviousEpochs: number[];

  // Peer quarantine
  peerQuarantinedUntilMs: number | null;
}

/** Пустое состояние для инициализации */
export function createEmptyRecoveryState(): RecoveryState {
  return {
    missingKeySinceMs: null,
    missingKeyDropCount: 0,
    recentErrors: [],
    pipeBreakCount: 0,
    lastPipeBreakAtMs: null,
    quarantineUntilMs: null,
    authTagFailures: [],
    malformedFrameCount: 0,
    malformedFrameErrors: [],
    lastRekeyAtMs: null,
    rekeyInProgress: false,
    acceptedPreviousEpochs: [],
    peerQuarantinedUntilMs: null,
  };
}

// ─── Recovery Decision ────────────────────────────────────────────────────────

export type RecoveryDecision =
  | { action: 'DROP_FRAME' }
  | { action: 'WARN_USER'; message: string }
  | { action: 'REQUEST_REKEY' }
  | { action: 'TERMINATE_PIPE' }
  | { action: 'FAIL_PEER_MEDIA'; reason: string }
  | { action: 'QUARANTINE_PEER'; reason: string; durationMs: number };

// ─── Pure Evaluator ───────────────────────────────────────────────────────────

/**
 * Pure synchronous function — принимает CryptoEvent + текущее состояние + политику,
 * возвращает RecoveryDecision и обновлённое состояние.
 *
 * Никаких побочных эффектов. Детерминирован.
 */
export function evaluateE2EERecovery(
  event: CryptoEvent,
  state: RecoveryState,
  policy: E2EERecoveryPolicy = E2EE_RECOVERY_POLICY
): { decision: RecoveryDecision; nextState: RecoveryState } {
  const now = event.timestamp;
  const nextState = cloneRecoveryState(state);

  // ── Peer quarantine check ──────────────────────────────────────────────────
  if (nextState.peerQuarantinedUntilMs !== null && now < nextState.peerQuarantinedUntilMs) {
    return {
      decision: { action: 'QUARANTINE_PEER', reason: 'peer already quarantined', durationMs: nextState.peerQuarantinedUntilMs - now },
      nextState,
    };
  }

  // ── MissingKey policy ──────────────────────────────────────────────────────
  if (event.kind === 'MISSING_KEY') {
    if (nextState.missingKeySinceMs === null) {
      nextState.missingKeySinceMs = now;
    }

    const elapsed = now - (nextState.missingKeySinceMs ?? now);
    nextState.missingKeyDropCount += 1;

    if (elapsed < policy.missingKeyGraceMs) {
      return { decision: { action: 'DROP_FRAME' }, nextState };
    }

    if (elapsed < policy.missingKeyWarningMs) {
      return { decision: { action: 'DROP_FRAME' }, nextState };
    }

    if (elapsed < policy.missingKeyAbortMs) {
      return { decision: { action: 'WARN_USER', message: `Missing key for ${Math.round(elapsed / 1000)}s` }, nextState };
    }

    // >= abort threshold
    nextState.peerQuarantinedUntilMs = now + policy.pipeBreakQuarantineMs;
    return {
      decision: { action: 'FAIL_PEER_MEDIA', reason: `Missing key timeout: ${elapsed}ms` },
      nextState,
    };
  }

  // ── AuthTagFailed policy ───────────────────────────────────────────────────
  if (event.kind === 'AUTH_TAG_FAILED') {
    nextState.authTagFailures = nextState.authTagFailures.filter(
      (e) => now - e.timestamp < policy.authTagFailureWindowMs
    );
    nextState.authTagFailures.push(event);

    if (nextState.authTagFailures.length >= policy.authTagFailureThreshold) {
      nextState.peerQuarantinedUntilMs = now + policy.pipeBreakQuarantineMs;
      return {
        decision: { action: 'QUARANTINE_PEER', reason: `Auth tag failed ${nextState.authTagFailures.length} times`, durationMs: policy.pipeBreakQuarantineMs },
        nextState,
      };
    }

    return { decision: { action: 'TERMINATE_PIPE' }, nextState };
  }

  // ── MalformedFrame policy ──────────────────────────────────────────────────
  if (event.kind === 'MALFORMED_FRAME') {
    nextState.malformedFrameErrors = nextState.malformedFrameErrors.filter(
      (e) => now - e.timestamp < policy.malformedFrameWindowMs
    );
    nextState.malformedFrameErrors.push(event);
    nextState.malformedFrameCount = nextState.malformedFrameErrors.length;

    if (nextState.malformedFrameCount >= policy.malformedFrameThreshold) {
      return {
        decision: { action: 'FAIL_PEER_MEDIA', reason: `Malformed frames: ${nextState.malformedFrameCount}` },
        nextState,
      };
    }

    return { decision: { action: 'DROP_FRAME' }, nextState };
  }

  // ── StaleKeyEpoch policy ───────────────────────────────────────────────────
  if (event.kind === 'STALE_KEY_EPOCH') {
    // Если rekey в прогрессе и эпоха в grace window — drop, не fail
    if (nextState.rekeyInProgress && event.epoch !== undefined) {
      const accepted = nextState.acceptedPreviousEpochs;
      if (accepted.includes(event.epoch)) {
        return { decision: { action: 'DROP_FRAME' }, nextState };
      }
    }
    // Вне grace window — request rekey
    return { decision: { action: 'REQUEST_REKEY' }, nextState };
  }

  // ── Transient encryption failure ──────────────────────────────────────────
  if (event.kind === 'ENCRYPT_TRANSIENT_FAILURE' || event.kind === 'DECRYPT_TRANSIENT_FAILURE') {
    nextState.recentErrors = nextState.recentErrors.filter(
      (e) => now - e.timestamp < policy.transientFailureWindowMs
    );
    nextState.recentErrors.push(event);

    if (nextState.recentErrors.length >= policy.transientFailureThreshold) {
      // Too many transient failures in window — treat as persistent
      return { decision: { action: 'TERMINATE_PIPE' }, nextState };
    }

    return { decision: { action: 'DROP_FRAME' }, nextState };
  }

  // ── Persistent encryption failure ─────────────────────────────────────────
  if (event.kind === 'ENCRYPT_PERSISTENT_FAILURE' || event.kind === 'DECRYPT_PERSISTENT_FAILURE') {
    nextState.peerQuarantinedUntilMs = now + policy.pipeBreakQuarantineMs;
    return {
      decision: { action: 'FAIL_PEER_MEDIA', reason: `Persistent ${event.kind}` },
      nextState,
    };
  }

  // ── Unsupported codec frame ─────────────────────────────────────────────────
  if (event.kind === 'UNSUPPORTED_CODEC_FRAME') {
    return { decision: { action: 'DROP_FRAME' }, nextState };
  }

  // Fallback — drop and warn
  return { decision: { action: 'WARN_USER', message: `Unknown crypto error: ${event.kind}` }, nextState };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cloneRecoveryState(state: RecoveryState): RecoveryState {
  return {
    ...state,
    recentErrors: [...state.recentErrors],
    authTagFailures: [...state.authTagFailures],
    malformedFrameErrors: [...state.malformedFrameErrors],
    acceptedPreviousEpochs: [...state.acceptedPreviousEpochs],
  };
}

/**
 * Проверяет pipe break cooldown.
 * Returns true если pipe break допустим (cooldown прошёл).
 */
export function canEmitPipeBreak(state: RecoveryState, now: number, policy: E2EERecoveryPolicy = E2EE_RECOVERY_POLICY): boolean {
  if (state.lastPipeBreakAtMs === null) return true;
  return now - state.lastPipeBreakAtMs >= policy.pipeBreakCooldownMs;
}

/**
 * Обновляет состояние при pipe break.
 */
export function recordPipeBreak(state: RecoveryState, now: number, policy: E2EERecoveryPolicy = E2EE_RECOVERY_POLICY): RecoveryState {
  const next = cloneRecoveryState(state);
  next.lastPipeBreakAtMs = now;
  next.pipeBreakCount += 1;

  if (next.pipeBreakCount >= policy.pipeBreakQuarantineThreshold) {
    next.quarantineUntilMs = now + policy.pipeBreakQuarantineMs;
    next.pipeBreakCount = 0;
  }

  return next;
}

/**
 * Сбрасывает состояние при успешном rekey.
 */
export function resetAfterRekey(state: RecoveryState, now: number, acceptedPreviousEpoch: number[]): RecoveryState {
  const next = cloneRecoveryState(state);
  next.lastRekeyAtMs = now;
  next.rekeyInProgress = false;
  next.acceptedPreviousEpochs = acceptedPreviousEpoch;
  next.authTagFailures = [];
  next.malformedFrameErrors = [];
  next.malformedFrameCount = 0;
  next.recentErrors = [];
  return next;
}