/**
 * Chat Content Moderation Tests
 *
 * Проверяет безопасность контента:
 * - Spam detection (rate limiting)
 * - CSAM detection (PhotoDNA hash matching)
 * - Doxxing PII detection (email, phone, address)
 * - Toxic language filter
 * - Child safety age gates
 * - Ban evasion detection
 *
 * Интеграция: promptfoo для LLM-based moderation +本地 rule-based
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  moderateMessage,
  scanForPII,
  checkSpamRateLimit,
  PhotoDNA,
} from '@/lib/chat/moderation';

// Polyfill localStorage for Node test environment
const localStorageMock = {
  store: new Map<string, string>(),
  getItem(key: string) { return this.store.get(key) ?? null; },
  setItem(key: string, value: string) { this.store.set(key, value); },
  removeItem(key: string) { this.store.delete(key); },
  clear() { this.store.clear(); },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('Chat Content Moderation', () => {
  describe('Spam Detection', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should rate-limit new accounts: 100 msg/5min', async () => {
      const userId = 'new-user-123';

      // 101 сообщение за 5 минут → block
      for (let i = 0; i < 101; i++) {
        const result = await checkSpamRateLimit(userId);
        if (i < 100) {
          expect(result.allowed).toBe(true);
        } else {
          expect(result.allowed).toBe(false);
          expect(result.reason).toBe('RATE_LIMIT_EXCEEDED');
          expect(result.retryAfter).toBe(300); // 5 min = 300s
        }
      }
    });

    it('should allow trusted accounts unlimited', async () => {
      const trustedUser = 'trusted-456';
      // Trusted accounts bypass rate limit
      const result = await checkSpamRateLimit(trustedUser, { isTrusted: true });
      expect(result.allowed).toBe(true);
      expect(result.bypassed).toBe(true);
    });

    it('should detect repeated identical messages (copy-paste spam)', async () => {
      const messages = Array.from({ length: 10 }, (_, i) => ({
        content: 'BUY NOW!!! CLICK HERE >>>',
        userId: 'spammer',
      }));

      const identicalCount = messages.filter(m => m.content === messages[0].content).length;
      expect(identicalCount).toBe(10);

      // Moderation должен флагнуть как спам
      const result = await moderateMessage(messages[0]);
      expect(result.action).toBe('BLOCK');
      expect(result.category).toBe('SPAM_REPETITION');
    });
  });

  describe('CSAM Detection (PhotoDNA)', () => {
    it('should match known CSAM hashes', async () => {
      const photoDNA = new PhotoDNA();

      // Mock known hash (from NCMEC database)
      const knownCSAMHash = 'a1b2c3d4e5f67890...';

      const imageBlob = new Blob(['fake-image-data']);
      const hash = await photoDNA.computePerceptualHash(imageBlob);

      // Simulate database hit
      vi.spyOn(photoDNA, 'queryDatabase').mockResolvedValueOnce({
        match: true,
        knownHash: knownCSAMHash,
        severity: 'CRITICAL',
      });

      const result = await photoDNA.scan(imageBlob);

      expect(result.match).toBe(true);
      expect(result.severity).toBe('CRITICAL');
      expect(result.action).toBe('REPORT_TO_NCMEC_IMMEDIATELY');
    });

    it('should not flag false positives (benign images)', async () => {
      const photoDNA = new PhotoDNA();
      const benignImage = new Blob(['...']); // legit photo

      vi.spyOn(photoDNA, 'queryDatabase').mockResolvedValueOnce({
        match: false,
        severity: 'NONE',
      });

      const result = await photoDNA.scan(benignImage);
      expect(result.match).toBe(false);
    });
  });

  describe('PII Detection (Doxxing)', () => {
    it('should detect email addresses', () => {
      const text = 'Contact me at john.doe@example.com for details';
      const pii = scanForPII(text);

      expect(pii.emails).toContain('john.doe@example.com');
      expect(pii.hasEmail).toBe(true);
    });

    it('should detect phone numbers (international)', () => {
      const text = 'My number: +7 (999) 123-45-67';
      const pii = scanForPII(text);

      expect(pii.phones).toContain('+79991234567');
      expect(pii.hasPhone).toBe(true);
    });

    it('should detect physical addresses', () => {
      const text = 'I live at 123 Main St, Moscow, 125009, Russia';
      const pii = scanForPII(text);

      expect(pii.addresses).toBeDefined();
      expect(pii.addresses.length).toBeGreaterThan(0);
      expect(pii.hasAddress).toBe(true);
    });

    it('should detect Russian SNILS/INN', () => {
      const text = 'My INN: 7701234567, SNILS: 123-456-789-01';
      const pii = scanForPII(text);

      expect(pii.russianTaxId).toBeDefined(); // INN
      expect(pii.russianPensionId).toBeDefined(); // SNILS
    });

    it('should redact PII automatically', async () => {
      const message = 'My email is test@example.com and phone is +15551234567';
      const redacted = await moderateMessage({ content: message, userId: 'u1' });

      expect(redacted.sanitizedContent).not.toContain('test@example.com');
      expect(redacted.sanitizedContent).not.toContain('15551234567');
      expect(redacted.sanitizedContent).toContain('[EMAIL_REDACTED]');
      expect(redacted.sanitizedContent).toContain('[PHONE_REDACTED]');
    });
  });

  describe('Toxic Language Filter', () => {
    it('should block hate speech (slurs, discrimination)', async () => {
      const toxic = 'You [slur] should not be allowed here';
      const result = await moderateMessage({ content: toxic, userId: 'u1' });

      expect(result.action).toBe('HIDE');
      expect(result.category).toBe('HATE_SPEECH');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should allow mild profanity (context matters)', async () => {
      const mild = 'What the hell? That\'s crazy!';
      const result = await moderateMessage({ content: mild, userId: 'u1' });

      // Не блокируем, но помечаем как potentially sensitive
      expect(result.action).toBe('ALLOW');
      expect(result.flags).toContain('PROFANITY_LIGHT');
    });

    it('should detect harassment patterns', async () => {
      const harassment = 'You are stupid idiota werd und dumm';
      const result = await moderateMessage({ content: harassment, userId: 'u1' });

      expect(result.category).toBe('HARASSMENT');
    });
  });

  describe('Child Safety Age Gates', () => {
    it('should require age verification for 18+ content', async () => {
      const adultContent = 'This chat contains mature themes';

      // Пользователь без verified_age
      const result = await moderateMessage({
        content: adultContent,
        userId: 'unverified-user',
        isAgeVerified: false,
      });

      expect(result.action).toBe('REQUIRE_AGE_VERIFICATION');
      expect(result.requiredProof).toContain('GOVERNMENT_ID');
    });

    it('should allow age-verified adults', async () => {
      const adultContent = 'Mature discussion here';
      const result = await moderateMessage({
        content: adultContent,
        userId: 'verified-adult',
        isAgeVerified: true,
        verifiedAge: 25,
      });

      expect(result.action).toBe('ALLOW');
    });

    it('should block adults from contacting unverified minors', async () => {
      // Adult пытается написать пользователю без верификации возраста
      // (предполагаем, что unverified — несовершеннолетний)
      const adultSender = 'adult-123';
      const minorReceiver = 'unverified-minor';

      const result = await moderateMessage({
        content: 'Hi, want to chat?',
        userId: adultSender,
        isMessagingMinor: true, // detected via age verification status of recipient
      });

      expect(result.action).toBe('BLOCK');
      expect(result.category).toBe('CHILD_SAFETY_VIOLATION');
    });
  });

  describe('Ban Evasion Detection', () => {
    it('should detect IP + fingerprint reuse', async () => {
      const bannedUser = {
        userId: 'banned-user-1',
        ip: '192.168.1.100',
        fingerprint: 'abc123fingerprint',
      };

      const newUser = {
        userId: 'new-account-2',
        ip: '192.168.1.100', // тот же IP
        fingerprint: 'abc123fingerprint', // тот же fingerprint
      };

      const isEvasion = await checkBanEvasion(bannedUser, newUser);
      expect(isEvasion).toBe(true);
    });

    it('should allow legitimate shared IPs (NAT, corporate)', async () => {
      const bannedUser = { userId: 'b1', ip: '10.0.0.1', fingerprint: 'fp1' };
      const office colleague = { userId: 'c1', ip: '10.0.0.1', fingerprint: 'fp2' }; // другой fingerprint

      const isEvasion = await checkBanEvasion(bannedUser, office colleague);
      expect(isEvasion).toBe(false); // false negative OK (false positive плохо)
    });
  });

  describe('Cross-Platform Threat Detection', () => {
    it('should detect malicious URL shorteners', async () => {
      const malicious = 'Check out http://bit.ly/malware-xyz';
      const result = await moderateMessage({ content: malicious, userId: 'u1' });

      expect(result.flags).toContain('SUSPICIOUS_URL');
      expect(result.expandedUrls).toContain('http://malware-site.com');
    });

    it('should detect phishing domains (lookalike)', async () => {
      const phishing = 'Login here: goog1e.com/login (not Google!)';
      const result = await moderateMessage({ content: phishing, userId: 'u1' });

      expect(result.category).toBe('PHISHING');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });
});
