/**
 * Security Logger for E2EE module
 *
 * Structured, scrubbed event log for cryptographic operations.
 * Key material (private keys, raw bytes, passwords) is NEVER logged.
 * All fields are sanitized before recording.
 *
 * Severity levels:
 *   DEBUG  — verbose crypto lifecycle (dev only)
 *   INFO   — normal operations (key generation, exchange)
 *   WARN   — degraded security posture (OPK low, WebAuthn unavailable)
 *   ERROR  — failed crypto operations (decryption failure, sig verify fail)
 *   AUDIT  — security-relevant decisions (escrow created, key rotated, ceremony OTP used)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SecurityLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'AUDIT';

export interface SecurityLogEvent {
  level: SecurityLogLevel;
  module: string;        // e.g. 'senderKeys', 'sfuKeyExchange'
  event: string;         // e.g. 'SESSION_KEY_DERIVED'
  userId?: string;       // scrubbed to prefix: 'usr_abc123...'
  sessionId?: string;    // UUID or truncated token
  extra?: Record<string, unknown>; // no secrets allowed
  ts: number;            // Date.now()
  traceId?: string;      // optional correlation id
}

// ─── Scrubbing helpers ────────────────────────────────────────────────────────

/** Redacts well-known secret field names from an object. */
function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const SECRET_KEYS = new Set([
    'password', 'privateKey', 'secret', 'token', 'key', 'seed',
    'rawKey', 'ciphertext', 'shardBytes', 'pkcs8', 'privateKeyBytes',
    'prf', 'prfSeed', 'recoveryPassword', 'passphrase',
  ]);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.has(k.toLowerCase())) {
      result[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !ArrayBuffer.isView(v) && !(v instanceof ArrayBuffer)) {
      result[k] = scrubObject(v as Record<string, unknown>);
    } else if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
      result[k] = '[BYTES]';
    } else {
      result[k] = v;
    }
  }
  return result;
}

/** Truncates a userId to a safe prefix for logging. */
function scrubUserId(uid: string): string {
  if (!uid) return '[none]';
  return `usr_${uid.slice(0, 8)}...`;
}

/** Truncates a fingerprint to first 16 hex chars for logging. */
export function scrubFingerprint(fp: string): string {
  return `${fp.slice(0, 16)}...`;
}

// ─── Log transport ────────────────────────────────────────────────────────────

type LogTransport = (event: SecurityLogEvent) => void;

const _transports: LogTransport[] = [];

/**
 * Register a log transport (e.g. PostHog, Sentry, custom API).
 * Never send raw events to untrusted third-parties.
 */
export function registerLogTransport(fn: LogTransport): void {
  _transports.push(fn);
}

// ─── Core logger ──────────────────────────────────────────────────────────────

let _minLevel: SecurityLogLevel = import.meta.env.DEV ? 'DEBUG' : 'INFO';

export function setMinLogLevel(level: SecurityLogLevel): void {
  _minLevel = level;
}

const LEVEL_ORDER: Record<SecurityLogLevel, number> = {
  DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, AUDIT: 4,
};

export function logSecurityEvent(
  level: SecurityLogLevel,
  module: string,
  event: string,
  opts: {
    userId?: string;
    sessionId?: string;
    extra?: Record<string, unknown>;
    traceId?: string;
  } = {},
): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[_minLevel]) return;

  const e: SecurityLogEvent = {
    level,
    module,
    event,
    userId:    opts.userId    ? scrubUserId(opts.userId) : undefined,
    sessionId: opts.sessionId ? opts.sessionId.slice(0, 16) + '...' : undefined,
    extra:     opts.extra     ? scrubObject(opts.extra) : undefined,
    ts:        Date.now(),
    traceId:   opts.traceId,
  };

  // Console output
  const prefix = `[E2EE:${level}][${module}] ${event}`;
  if (level === 'ERROR') {
    console.error(prefix, e.extra ?? '');
  } else if (level === 'WARN') {
    console.warn(prefix, e.extra ?? '');
  } else if (level === 'DEBUG') {
    console.debug(prefix, e.extra ?? '');
  } else {
    console.info(prefix, e.extra ?? '');
  }

  // External transports
  for (const transport of _transports) {
    try { transport(e); } catch { /* never crash on logger failure */ }
  }
}

// ─── Convenience shorthands ───────────────────────────────────────────────────

export const secLog = {
  debug: (module: string, event: string, opts?: Parameters<typeof logSecurityEvent>[3]) =>
    logSecurityEvent('DEBUG', module, event, opts),
  info:  (module: string, event: string, opts?: Parameters<typeof logSecurityEvent>[3]) =>
    logSecurityEvent('INFO', module, event, opts),
  warn:  (module: string, event: string, opts?: Parameters<typeof logSecurityEvent>[3]) =>
    logSecurityEvent('WARN', module, event, opts),
  error: (module: string, event: string, opts?: Parameters<typeof logSecurityEvent>[3]) =>
    logSecurityEvent('ERROR', module, event, opts),
  audit: (module: string, event: string, opts?: Parameters<typeof logSecurityEvent>[3]) =>
    logSecurityEvent('AUDIT', module, event, opts),
};

// ─── Pre-defined event constants ──────────────────────────────────────────────

export const E2EE_EVENTS = {
  // Key generation
  IDENTITY_KEY_GENERATED:      'IDENTITY_KEY_GENERATED',
  OPK_BATCH_GENERATED:         'OPK_BATCH_GENERATED',
  OPK_REPLENISHED:             'OPK_REPLENISHED',
  OPK_REVOKED:                 'OPK_REVOKED',
  SENDER_KEY_INITIALIZED:      'SENDER_KEY_INITIALIZED',
  GROUP_TREE_BUILT:            'GROUP_TREE_BUILT',

  // Exchanges
  X3DH_INITIATED:              'X3DH_INITIATED',
  X3DH_COMPLETED:              'X3DH_COMPLETED',
  SFU_SESSION_KEY_DERIVED:     'SFU_SESSION_KEY_DERIVED',
  SFU_SESSION_KEY_ROTATED:     'SFU_SESSION_KEY_ROTATED',

  // WebAuthn
  WEBAUTHN_BINDING_REGISTERED: 'WEBAUTHN_BINDING_REGISTERED',
  WEBAUTHN_UNLOCK_SUCCESS:     'WEBAUTHN_UNLOCK_SUCCESS',
  WEBAUTHN_UNLOCK_FAILED:      'WEBAUTHN_UNLOCK_FAILED',

  // Key Ceremony
  CEREMONY_OTP_ISSUED:         'CEREMONY_OTP_ISSUED',
  CEREMONY_OTP_USED:           'CEREMONY_OTP_USED',
  CEREMONY_OTP_FAILED:         'CEREMONY_OTP_FAILED',
  CEREMONY_LOCKED_OUT:         'CEREMONY_LOCKED_OUT',

  // Escrow
  ESCROW_CREATED_PASSWORD:     'ESCROW_CREATED_PASSWORD',
  ESCROW_CREATED_SOCIAL:       'ESCROW_CREATED_SOCIAL',
  ESCROW_RESTORED:             'ESCROW_RESTORED',
  ESCROW_RESTORE_FAILED:       'ESCROW_RESTORE_FAILED',

  // Backup
  MEDIA_KEY_BACKUP_CREATED:    'MEDIA_KEY_BACKUP_CREATED',
  MEDIA_KEY_BACKUP_RESTORED:   'MEDIA_KEY_BACKUP_RESTORED',

  // Device Transfer
  DEVICE_TRANSFER_INITIATED:   'DEVICE_TRANSFER_INITIATED',
  DEVICE_TRANSFER_COMPLETED:   'DEVICE_TRANSFER_COMPLETED',
  DEVICE_TRANSFER_FAILED:      'DEVICE_TRANSFER_FAILED',

  // Validation failures
  SIGNATURE_VERIFY_FAILED:     'SIGNATURE_VERIFY_FAILED',
  DECRYPTION_FAILED:           'DECRYPTION_FAILED',
  FRESHNESS_CHECK_FAILED:      'FRESHNESS_CHECK_FAILED',
  SPKI_PARSE_FAILED:           'SPKI_PARSE_FAILED',
  OPK_EXHAUSTED:               'OPK_EXHAUSTED',
} as const;
