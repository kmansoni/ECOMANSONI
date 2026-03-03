export interface TextCheckResult {
  safe: boolean;
  reasons: string[];
  sanitized: string;
}

// Базовый список запрещённых слов (русский + английский)
const FORBIDDEN_WORDS_RU = [
  "хуй", "пизда", "ебать", "еблан", "пиздец", "сука", "блядь", "ублюдок",
  "мудак", "пидор", "урод", "шлюха", "падла", "курва", "уёбок", "залупа",
  "мразь", "ёбаный", "чмо", "гандон",
];

const FORBIDDEN_WORDS_EN = [
  "fuck", "shit", "bitch", "asshole", "cunt", "dick", "cock", "pussy",
  "nigger", "faggot", "retard", "whore", "slut",
];

const ALL_FORBIDDEN = [...FORBIDDEN_WORDS_RU, ...FORBIDDEN_WORDS_EN];

// Regex для телефонов и email (антиспам)
const PHONE_REGEX = /(\+7|8|7)?[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Проверка на повторяющиеся символы (ааааа — 4+ подряд)
const REPEATED_CHARS_REGEX = /(.)\1{4,}/g;

export function checkText(text: string): TextCheckResult {
  const reasons: string[] = [];
  let sanitized = text;

  if (!text || text.trim().length === 0) {
    return { safe: true, reasons: [], sanitized: text };
  }

  // 1. Запрещённые слова
  const lowerText = text.toLowerCase();
  const foundWords = ALL_FORBIDDEN.filter((word) => lowerText.includes(word));
  if (foundWords.length > 0) {
    reasons.push("содержит нецензурную лексику");
    // Censorship: replace each forbidden word with asterisks
    for (const word of foundWords) {
      const regex = new RegExp(word, "gi");
      sanitized = sanitized.replace(regex, "*".repeat(word.length));
    }
  }

  // 2. Email-адреса (антиспам)
  if (EMAIL_REGEX.test(text)) {
    reasons.push("содержит email-адрес");
    sanitized = sanitized.replace(EMAIL_REGEX, "[email]");
  }
  EMAIL_REGEX.lastIndex = 0;

  // 3. Телефонные номера (антиспам)
  if (PHONE_REGEX.test(text)) {
    reasons.push("содержит номер телефона");
    sanitized = sanitized.replace(PHONE_REGEX, "[телефон]");
  }
  PHONE_REGEX.lastIndex = 0;

  // 4. Проверка на CAPS LOCK (>80% заглавных букв)
  const letters = text.match(/[a-zA-Zа-яА-ЯёЁ]/g) || [];
  if (letters.length >= 5) {
    const upperCount = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
    if (upperCount / letters.length > 0.8) {
      reasons.push("текст написан заглавными буквами (CAPS LOCK)");
    }
  }

  // 5. Повторяющиеся символы
  if (REPEATED_CHARS_REGEX.test(text)) {
    reasons.push("содержит многократно повторяющиеся символы");
  }
  REPEATED_CHARS_REGEX.lastIndex = 0;

  return {
    safe: reasons.length === 0,
    reasons,
    sanitized,
  };
}

export function containsForbiddenWords(text: string): boolean {
  const lower = text.toLowerCase();
  return ALL_FORBIDDEN.some((w) => lower.includes(w));
}

export function sanitizeText(text: string): string {
  return checkText(text).sanitized;
}
