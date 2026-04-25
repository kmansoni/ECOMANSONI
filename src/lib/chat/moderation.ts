/**
 * Chat Content Moderation Service
 *
 * Provides content safety checks: spam, PII, toxic language, CSAM.
 * Used by both frontend (pre-send validation) and backend (RPC enforcement).
 */

export interface ModerationResult {
  action: 'ALLOW' | 'BLOCK' | 'HIDE' | 'REQUIRE_AGE_VERIFICATION';
  category: 'SPAM' | 'CSAM' | 'PII' | 'TOXIC' | 'HARASSMENT' | 'PHISHING' | 'CHILD_SAFETY' | 'NONE';
  confidence: number; // 0..1
  flags: string[];
  sanitizedContent?: string; // PII redacted
  reason?: string;
}

export async function moderateMessage(params: {
  content: string;
  userId: string;
  isAgeVerified?: boolean;
  isMessagingMinor?: boolean;
}): Promise<ModerationResult> {
  const { content, userId, isAgeVerified = false, isMessagingMinor = false } = params;

  // 1. Spam check
  const spamResult = await checkSpamRateLimit(userId);
  if (!spamResult.allowed) {
    return {
      action: 'BLOCK',
      category: 'SPAM',
      confidence: 0.95,
      flags: ['RATE_LIMIT_EXCEEDED'],
      reason: spamResult.reason,
    };
  }

  // 2. PII detection & redaction
  const pii = scanForPII(content);
  let sanitized = content;
  if (pii.hasEmail) {
    sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');
  }
  if (pii.hasPhone) {
    sanitized = sanitized.replace(/(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE_REDACTED]');
  }
  if (pii.hasAddress) {
    sanitized = sanitized.replace(/\d{1,5}\s+[\w\s]+,?\s+\w{2,}\s+\d{5}/g, '[ADDRESS_REDACTED]');
  }

  if (pii.hasEmail || pii.hasPhone || pii.hasAddress) {
    return {
      action: 'ALLOW', // allow but redact
      category: 'PII',
      confidence: 0.9,
      flags: ['PII_REDACTED'],
      sanitizedContent: sanitized,
    };
  }

  // 3. Toxic language (simple keyword-based for now)
  const toxicWords = ['idiot', 'stupid', 'hate', 'moron'];
  const lower = content.toLowerCase();
  const toxicFound = toxicWords.some(w => lower.includes(w));
  if (toxicFound) {
    return {
      action: 'HIDE',
      category: 'TOXIC',
      confidence: 0.7,
      flags: ['PROFANITY'],
      reason: 'Message contains inappropriate language',
    };
  }

  // 4. Child safety: adult messaging minor
  if (isMessagingMinor && !isAgeVerified) {
    return {
      action: 'REQUIRE_AGE_VERIFICATION',
      category: 'CHILD_SAFETY',
      confidence: 0.8,
      flags: ['UNDER_13_NO_CONSENT'],
      reason: 'Adult messaging minor without verified age',
    };
  }

  // Everything OK
  return {
    action: 'ALLOW',
    category: 'NONE',
    confidence: 1.0,
    flags: [],
  };
}

export function scanForPII(text: string): {
  hasEmail: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  emails: string[];
  phones: string[];
  addresses: string[];
} {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi;
  const phoneRegex = /(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const addressRegex = /\d{1,5}\s+[\w\s]+,?\s+\w{2,}\s+\d{5}/gi;

  const emails = text.match(emailRegex) || [];
  const phones = text.match(phoneRegex) || [];
  const addresses = text.match(addressRegex) || [];

  return {
    hasEmail: emails.length > 0,
    hasPhone: phones.length > 0,
    hasAddress: addresses.length > 0,
    emails,
    phones,
    addresses,
  };
}

export async function checkSpamRateLimit(userId: string, options?: { isTrusted?: boolean }) {
  const isTrusted = options?.isTrusted ?? false;
  if (isTrusted) {
    return { allowed: true, reason: 'TRUSTED_USER' };
  }

  // Simulate rate limiter (should be Redis-backed in prod)
  const key = `spam:${userId}`;
  const count = Number(localStorage.getItem(key) || '0') + 1;
  localStorage.setItem(key, String(count));

  if (count > 100) {
    return { allowed: false, reason: 'RATE_LIMIT_EXCEEDED', retryAfter: 300 };
  }
  return { allowed: true, reason: 'WITHIN_LIMIT' };
}

// PhotoDNA-like perceptual hash (stub)
export class PhotoDNA {
  async computePerceptualHash(blob: Blob): Promise<string> {
    // In reality: use pdqhash library
    return 'hash-stub-' + blob.size;
  }

  async queryDatabase(hash: string): Promise<{ match: boolean; knownHash?: string; severity?: 'CRITICAL' | 'NONE' }> {
    // Mock: known bad hash
    const knownBad = 'hash-stub-csam';
    if (hash === knownBad) {
      return { match: true, knownHash, severity: 'CRITICAL' };
    }
    return { match: false, severity: 'NONE' };
  }

  async scan(blob: Blob) {
    const hash = await this.computePerceptualHash(blob);
    return await this.queryDatabase(hash);
  }
}
