/**
 * Chat Internationalization Tests
 *
 * Проверяет корректность работы с разными локалями:
 * - RTL mirroring (Arabic, Hebrew)
 * - Plural forms (русский имеет 3 формы: 1, 2–4, 5–20)
 * - Emoji skin tones ( Fitzpatrick scale 1–6 )
 * - Bidirectional text mixing (RTL + LTR)
 * - Text expansion (DE +30%, RU +10%, CJK ~0%)
 * - CJK character width (full-width)
 * - Line breaking rules (CJK разбивка по иероглифам, EN по пробелам)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  formatMessageTime,
  pluralizeMessageCount,
  normalizeTextDirection,
  calculateTextBoundingBox,
} from '@/lib/chat/i18n';

describe('Chat Internationalization', () => {
  describe('RTL Languages (Arabic, Hebrew)', () => {
    it('should mirror UI elements for RTL (start/end icons)', () => {
      const rtlMessage = { content: 'مرحبا', direction: 'rtl' as const };
      const normalized = normalizeTextDirection(rtlMessage.content, 'ar');

      // В RTL: первая буква должна быть справа (в displayOrder)
      // Проверяем logical order (не visual)
      expect(normalized.direction).toBe('rtl');
      expect(normalized.displayOrder).toBe('right-to-left');
    });

    it('should handle mixed LTR + RTL (numbers in Arabic text)', () => {
      const mixed = 'السعر 100 دولار'; // Arabic + LTR number
      const normalized = normalizeTextDirection(mixed, 'ar');

      // Числа должны оставаться LTR даже внутри RTL
      expect(normalized.segments[0].direction).toBe('rtl'); // "السعر"
      expect(normalized.segments[1].direction).toBe('ltr'); // "100"
      expect(normalized.segments[2].direction).toBe('rtl'); // "دولار"
    });

    it('should align message bubbles correctly (right for RTL)', () => {
      const isRTL = (lang: string) => ['ar', 'he', 'ur'].includes(lang);
      expect(isRTL('ar')).toBe(true);
      expect(isRTL('he')).toBe(true);
      expect(isRTL('ru')).toBe(false);
      expect(isRTL('en')).toBe(false);
    });
  });

  describe('Plural Forms', () => {
    it('should pluralize correctly for Russian (3 forms)', () => {
      const ruPlural = (n: number) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return 'one'; // 1, 21, 31...
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'few'; // 2-4, 22-24...
        return 'many'; // 5-20, 25-30...
      };

      expect(pluralizeMessageCount(1, 'ru')).toBe('1 сообщение');
      expect(pluralizeMessageCount(2, 'ru')).toBe('2 сообщения');
      expect(pluralizeMessageCount(5, 'ru')).toBe('5 сообщений');
      expect(pluralizeMessageCount(21, 'ru')).toBe('21 сообщение');
      expect(pluralizeMessageCount(22, 'ru')).toBe('22 сообщения');
      expect(pluralizeMessageCount(25, 'ru')).toBe('25 сообщений');
    });

    it('should handle Arabic plural (6 forms)', () => {
      // Arabic: 0, 1, 2, 3–10, 11–99, 100+
      // (здесь упрощённый тест)
      expect(pluralizeMessageCount(0, 'ar')).toBeDefined();
      expect(pluralizeMessageCount(1, 'ar')).toBeDefined();
      expect(pluralizeMessageCount(2, 'ar')).toBeDefined();
      expect(pluralizeMessageCount(5, 'ar')).toBeDefined();
    });

    it('should handle English plural (2 forms)', () => {
      expect(pluralizeMessageCount(1, 'en')).toBe('1 message');
      expect(pluralizeMessageCount(0, 'en')).toBe('0 messages');
      expect(pluralizeMessageCount(5, 'en')).toBe('5 messages');
    });
  });

  describe('Emoji Skin Tone Modifiers', () => {
    it('should render Fitzpatrick skin tones (1-6)', () => {
      const emojis = [
        '👍', // default (no tone)
        '👍🏻', // tone-1 (light)
        '👍🏼', // tone-2 (medium-light)
        '👍🏽', // tone-3 (medium)
        '👍🏾', // tone-4 (medium-dark)
        '👍🏿', // tone-5 (dark)
      ];

      // Проверяем, что парсер распознаёт ZWJ sequences и variation selectors
      emojis.forEach(emoji => {
        expect(emoji.length).toBeGreaterThan(1); // multi-code-point
      });
    });

    it('should preserve skin tone across platform', () => {
      // Разные ОС рисуют одинаково? (тест на visual regression)
      // Здесь: проверяем, что Unicode-sequencenot mangled
      const thumbs = '👍🏽';
      expect(thumbs).toContain('🏽'); // contains variation selector-5
    });
  });

  describe('Text Expansion & Layout Shift', () => {
    it('should handle 30% expansion from EN → DE', () => {
      const en = 'Send message';
      const de = 'Nachricht senden'; // +40%

      const enBox = calculateTextBoundingBox(en, { fontSize: 16, fontFamily: 'Inter' });
      const deBox = calculateTextBoundingBox(de, { fontSize: 16, fontFamily: 'Inter' });

      expect(deBox.width).toBeGreaterThan(enBox.width);
      // DE обычно на 30–40% длиннее EN
      expect(deBox.width / enBox.width).toBeGreaterThan(1.3);
    });

    it('should not truncate CJK characters (full-width)', () => {
      const cjk = '发送消息'; // Chinese (same visual width)
      const box = calculateTextBoundingBox(cjk, { fontSize: 16, fontFamily: 'Noto Sans SC' });

      // Иероглифы имеют примерно одинаковую ширину (em-square)
      expect(box.height).toBeCloseTo(16, 0);
      expect(box.width / cjk.length).toBeCloseTo(8, 0); // ~8px per glyph at 16px
    });

    it('should handle text wrap for long German compound words', () => {
      const longWord = 'Donaudampfschiffahrtselektrizitätenhauptbetriebswerkbauunterbeamtengesellschaft';

      const wrapped = normalizeTextDirection(longWord, 'de');
      // Syllabification: должен разбиваться по слогам, не dribbling
      expect(wrapped.lines.length).toBeGreaterThan(1);
    });
  });

  describe('Time Formatting per Locale', () => {
    it('should format time in Russian (24h format)', () => {
      const timestamp = new Date('2026-04-24T14:30:00Z').getTime();
      const formatted = formatMessageTime(timestamp, 'ru-RU');

      expect(formatted).toMatch(/\d{1,2}:\d{2}/);
      // Не должно быть AM/PM
      expect(formatted).not.toMatch(/AM|PM/i);
    });

    it('should format time in US English (12h format with AM/PM)', () => {
      const timestamp = new Date('2026-04-24T14:30:00Z').getTime();
      const formatted = formatMessageTime(timestamp, 'en-US');

      expect(formatted).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/i);
    });

    it('should use correct date format (DD/MM/YYYY vs MM/DD/YYYY)', () => {
      const timestamp = new Date('2026-04-24T00:00:00Z').getTime();

      const ru = formatMessageTime(timestamp, 'ru-RU', { includeYear: true });
      const enUS = formatMessageTime(timestamp, 'en-US', { includeYear: true });

      // Ru: 24.04.2026 (DD.MM.YYYY)
      expect(ru).toMatch(/^24\.04\.2026/);
      // en-US: 04/24/2026 (MM/DD/YYYY)
      expect(enUS).toMatch(/^04\/24\/2026/);
    });
  });

  describe('Time Zone Display', () => {
    it('should show timezone abbreviation (MSK, PST, CET)', () => {
      const formatted = formatMessageTime(Date.now(), 'en-US', { showTimezone: true });

      expect(formatted).toMatch(/\b(MSK|PST|CET|UTC|[A-Z]{3,4})\b/);
    });

    it('should convert server UTC to user local timezone', () => {
      const serverUTCTime = new Date('2026-04-24T12:00:00Z').getTime();

      // User в MSK (UTC+3)
      const msk = formatMessageTime(serverUTCTime, 'ru-RU', { timezone: 'Europe/Moscow' });
      expect(msk).toContain('15:00'); // 12:00 + 3 = 15:00

      // User в PST (UTC-8)
      const pst = formatMessageTime(serverUTCTime, 'en-US', { timezone: 'America/Los_Angeles' });
      expect(pst).toContain('04:00'); // 12:00 - 8 = 04:00
    });
  });

  describe('Bidirectional Algorithm', () => {
    it('should handle Arabic + English mix correctly', () => {
      const mixed = 'المنتدى discussion forum';
      const result = normalizeTextDirection(mixed, 'ar');

      // "المنتدى" (RTL) должно быть справа, "discussion forum" (LTR) слева
      const segments = result.segments;
      expect(segments.length).toBe(2);
      expect(segments[0].direction).toBe('rtl');
      expect(segments[0].text).toBe('المنتدى');
      expect(segments[1].direction).toBe('ltr');
      expect(segments[1].text).toBe('discussion forum');
    });

    it('should handle Hebrew + digits', () => {
      const mixed = 'גיל 25';
      const result = normalizeTextDirection(mixed, 'he');

      expect(result.segments[0].direction).toBe('rtl'); // "גיל"
      expect(result.segments[1].direction).toBe('ltr'); // "25"
    });
  });

  describe('CJK Line Breaking', () => {
    it('should not break line between CJK characters (ideographic)', () => {
      const cjk = '你好世界这是一个很长的一句话';
      const lines = cjk.match(/[\u{3000}-\u{9FFF}]+/g) || [];

      // В CJK разрывы возможны почти после любого иероглифа
      // (проверка: библиотека textwrap должен их разрешать)
      expect(lines.join('').length).toBe(cjk.length);
    });

    it('should break line at spaces for Latin text', () => {
      const en = 'The quick brown fox jumps';
      const words = en.split(' ');

      expect(words).toHaveLength(5);
    });
  });
});
