/**
 * voiceAddressResolver — Умный резолвер голосового ввода адреса.
 *
 * Решает проблему: Web Speech API часто возвращает нечёткий или искажённый текст,
 * особенно для русских названий улиц. Этот модуль выполняет:
 *
 * 1. Нормализация — числительные, аббревиатуры, типичные паттерны
 * 2. Фонетическое ядро — русский Metaphone (глухие/звонкие, редукция гласных)
 * 3. Индекс улиц — фонетический + триграммный из реальной базы адресов
 * 4. Мультивариантный поиск — генерация нескольких вариантов запроса
 * 5. Обучение — запоминание исправлений пользователя (localStorage)
 *
 * Поток:
 *   голос → [alternatives] → resolveVoiceAddress() → нормализация
 *     → проверка learned corrections → фонетический поиск по улицам
 *     → генерация variant queries → ранжирование → результаты
 */

import { searchOffline, loadOfflineData, type LocalAddress, type SearchResult } from './offlineSearch';
import type { LatLng } from '@/types/taxi';

// ═══════════════════════════════════════════════════════════════════════════
// 1. НОРМАЛИЗАЦИЯ ГОЛОСОВОГО ТЕКСТА
// ═══════════════════════════════════════════════════════════════════════════

/** Числительные → цифры */
const NUMBER_WORDS: Record<string, number> = {
  'ноль': 0, 'нуль': 0,
  'один': 1, 'одна': 1, 'одно': 1, 'первый': 1, 'первая': 1, 'первое': 1,
  'два': 2, 'две': 2, 'второй': 2, 'вторая': 2, 'второе': 2,
  'три': 3, 'третий': 3, 'третья': 3,
  'четыре': 4, 'четвёртый': 4, 'четвертый': 4,
  'пять': 5, 'пятый': 5,
  'шесть': 6, 'шестой': 6,
  'семь': 7, 'седьмой': 7,
  'восемь': 8, 'восьмой': 8,
  'девять': 9, 'девятый': 9,
  'десять': 10, 'десятый': 10,
  'одиннадцать': 11, 'двенадцать': 12, 'тринадцать': 13,
  'четырнадцать': 14, 'пятнадцать': 15, 'шестнадцать': 16,
  'семнадцать': 17, 'восемнадцать': 18, 'девятнадцать': 19,
  'двадцать': 20, 'тридцать': 30, 'сорок': 40, 'пятьдесят': 50,
  'шестьдесят': 60, 'семьдесят': 70, 'восемьдесят': 80, 'девяносто': 90,
  'сто': 100, 'двести': 200, 'триста': 300, 'четыреста': 400,
  'пятьсот': 500, 'шестьсот': 600, 'семьсот': 700, 'восемьсот': 800,
  'девятьсот': 900, 'тысяча': 1000,
};

/** Конвертирует последовательность числительных в число: "двадцать пять" → 25 */
function parseNumberWords(words: string[]): { value: number; consumed: number } | null {
  let total = 0;
  let current = 0;
  let consumed = 0;
  let found = false;

  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase();
    const num = NUMBER_WORDS[w];
    if (num === undefined) break;

    found = true;
    consumed = i + 1;

    if (num === 1000) {
      current = current === 0 ? 1000 : current * 1000;
      total += current;
      current = 0;
    } else if (num >= 100) {
      current += num;
    } else if (num >= 20) {
      current += num;
    } else {
      current += num;
    }
  }

  if (!found) return null;
  total += current;
  return { value: total, consumed };
}

/** Нормализация голосового текста */
export function normalizeVoiceText(text: string): string {
  let result = text.toLowerCase().trim();

  // Убираем мусорные слова, которые Speech API любит добавлять
  const fillers = [
    'пожалуйста', 'будьте добры', 'подскажите', 'мне нужно',
    'мне нужен', 'хочу', 'поехали', 'давай', 'едем',
    'отвези', 'навигация', 'маршрут', 'построй маршрут',
    'как проехать', 'как добраться', 'покажи', 'найди',
    'ну', 'это', 'вот', 'значит', 'типа', 'короче',
    'так', 'ладно', 'окей', 'ок',
  ];
  for (const f of fillers) {
    result = result.replace(new RegExp(`\\b${f}\\b`, 'gi'), ' ');
  }

  // Нормализация типов объектов (речевые варианты → стандарт)
  const typeNorm: [RegExp, string][] = [
    // Улицы
    [/\bулица\b/gi, 'ул.'],
    [/\bулицу\b/gi, 'ул.'],
    [/\bулицы\b/gi, 'ул.'],
    // Проспекты
    [/\bпроспект\b/gi, 'пр-т'],
    [/\bпроспекта\b/gi, 'пр-т'],
    // Переулки
    [/\bпереулок\b/gi, 'пер.'],
    [/\bпереулка\b/gi, 'пер.'],
    // Бульвары
    [/\bбульвар\b/gi, 'бул.'],
    [/\bбульвара\b/gi, 'бул.'],
    // Шоссе
    [/\bшоссе\b/gi, 'ш.'],
    // Площади
    [/\bплощадь\b/gi, 'пл.'],
    [/\bплощади\b/gi, 'пл.'],
    // Набережные
    [/\bнабережная\b/gi, 'наб.'],
    [/\bнабережной\b/gi, 'наб.'],
    // Тупики, проезды
    [/\bтупик\b/gi, 'туп.'],
    [/\bпроезд\b/gi, 'пр.'],
    // Дом
    [/\bдом\s+номер\b/gi, 'д.'],
    [/\bдом\b/gi, 'д.'],
    // Корпус, строение
    [/\bкорпус\b/gi, 'к.'],
    [/\bстроение\b/gi, 'стр.'],
    // Квартира
    [/\bквартира\b/gi, 'кв.'],
    // "к4" / "к 4" → "к.4" (корпус)
    [/\bк\s*(\d+)/gi, 'к.$1'],
    // "стр4" / "стр 4" → "стр.4"
    [/\bстр\s*(\d+)/gi, 'стр.$1'],
  ];

  for (const [re, rep] of typeNorm) {
    result = result.replace(re, rep);
  }

  // Числительные → цифры
  const words = result.split(/\s+/);
  const processed: string[] = [];
  let i = 0;
  while (i < words.length) {
    const numResult = parseNumberWords(words.slice(i));
    if (numResult && numResult.value > 0) {
      processed.push(String(numResult.value));
      i += numResult.consumed;
    } else {
      processed.push(words[i]);
      i++;
    }
  }
  result = processed.join(' ');

  // Убираем лишние пробелы
  result = result.replace(/\s{2,}/g, ' ').trim();

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. РУССКИЙ ФОНЕТИЧЕСКИЙ КЛЮЧ (Metaphone-RU)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Генерирует фонетический ключ для русского слова.
 * Основан на принципах:
 * - Оглушение звонких (б→п, в→ф, г→к, д→т, з→с, ж→ш)
 * - Редукция безударных гласных (о→а, е→и)
 * - Удаление мягкого/твёрдого знаков
 * - Упрощение двойных согласных
 * - Йотированные гласные (я→а, ю→у, ё→о)
 */
export function russianPhoneticKey(word: string): string {
  if (!word) return '';

  let s = word.toLowerCase().trim();

  // Убираем ь и ъ
  s = s.replace(/[ьъ]/g, '');

  // Йотированные → базовые
  s = s.replace(/я/g, 'а');
  s = s.replace(/ю/g, 'у');
  s = s.replace(/ё/g, 'о');
  s = s.replace(/э/g, 'е');

  // Оглушение звонких
  s = s.replace(/б/g, 'п');
  s = s.replace(/в/g, 'ф');
  s = s.replace(/г/g, 'к');
  s = s.replace(/д/g, 'т');
  s = s.replace(/з/g, 'с');
  s = s.replace(/ж/g, 'ш');

  // Редукция гласных (О→А в безударной позиции — приближение: все)
  s = s.replace(/о/g, 'а');
  s = s.replace(/е/g, 'и');

  // Щ → Ш, Ц → ТС, Ч → Ш
  s = s.replace(/щ/g, 'ш');
  s = s.replace(/ц/g, 'тс');
  s = s.replace(/ч/g, 'ш');

  // Удаляем двойные буквы
  s = s.replace(/(.)\1+/g, '$1');

  // Удаляем гласные кроме начальной
  if (s.length > 1) {
    s = s[0] + s.slice(1).replace(/[аиуе]/g, '');
  }

  return s;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. ИНДЕКС УЛИЦ — построение фонетического + триграммного индекса
// ═══════════════════════════════════════════════════════════════════════════

interface StreetEntry {
  /** Оригинальное название улицы (как в базе) */
  name: string;
  /** Фонетический ключ */
  phoneticKey: string;
  /** Триграммы для fuzzy-matching */
  trigrams: Set<string>;
  /** Нормализованное (нижний регистр) */
  normalized: string;
  /** Сколько раз встречается в адресах */
  frequency: number;
}

/** Фонетический индекс: key → StreetEntry[] */
let _phoneticIndex: Map<string, StreetEntry[]> | null = null;
/** Все уникальные улицы */
let _allStreets: StreetEntry[] | null = null;
/** Индекс построен */
let _indexReady = false;
let _indexPromise: Promise<void> | null = null;

function makeTrigrams(s: string): Set<string> {
  const padded = `  ${s.toLowerCase()}  `;
  const result = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    result.add(padded.slice(i, i + 3));
  }
  return result;
}

function trigramSimilarity(setA: Set<string>, setB: Set<string>): number {
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Расстояние Дамерау-Левенштейна (с транспозициями) */
function damerauLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (la > 50 || lb > 50) return Math.abs(la - lb); // защита от длинных строк

  const d: number[][] = [];
  for (let i = 0; i <= la; i++) {
    d[i] = [];
    d[i][0] = i;
  }
  for (let j = 0; j <= lb; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // удаление
        d[i][j - 1] + 1,      // вставка
        d[i - 1][j - 1] + cost // замена
      );
      // Транспозиция
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }

  return d[la][lb];
}

/** Строит индекс улиц из локальной базы адресов */
export async function buildStreetIndex(): Promise<void> {
  if (_indexReady) return;
  if (_indexPromise) { await _indexPromise; return; }

  _indexPromise = (async () => {
    await loadOfflineData();

    // Загружаем адреса напрямую
    let addresses: LocalAddress[] | null = null;
    try {
      const resp = await fetch('/data/osm/processed/addresses.json');
      if (resp.ok) addresses = await resp.json();
    } catch { /* fallback */ }

    if (!addresses || addresses.length === 0) {
      console.warn('[VoiceResolver] Нет адресов для построения индекса');
      _allStreets = [];
      _phoneticIndex = new Map();
      _indexReady = true;
      return;
    }

    // Считаем частоту улиц
    const streetFreq = new Map<string, number>();
    for (const addr of addresses) {
      if (!addr.street) continue;
      const key = addr.street.toLowerCase().trim();
      streetFreq.set(key, (streetFreq.get(key) ?? 0) + 1);
    }

    // Строим уникальный список улиц
    const streets: StreetEntry[] = [];
    const seen = new Set<string>();

    for (const [name, freq] of streetFreq) {
      if (seen.has(name)) continue;
      seen.add(name);

      // Извлекаем «чистое» название без типа (для фонетики)
      const cleanName = name
        .replace(/\b(ул\.|улица|пр-т|проспект|пер\.|переулок|бул\.|бульвар|ш\.|шоссе|пл\.|площадь|наб\.|набережная|туп\.|тупик|пр\.|проезд)\b/gi, '')
        .trim();

      const phoneticKey = russianPhoneticKey(cleanName);

      streets.push({
        name: streetFreq.size > 0 ? Array.from(streetFreq.keys()).find(k => k === name)! : name,
        phoneticKey,
        trigrams: makeTrigrams(cleanName),
        normalized: name,
        frequency: freq,
      });
    }

    // Строим фонетический индекс
    const phonIdx = new Map<string, StreetEntry[]>();
    for (const st of streets) {
      if (!st.phoneticKey) continue;
      // Индексируем по полному ключу и по первым 3-4 символам
      for (const keyLen of [st.phoneticKey.length, Math.min(4, st.phoneticKey.length), Math.min(3, st.phoneticKey.length)]) {
        const prefix = st.phoneticKey.slice(0, keyLen);
        if (!phonIdx.has(prefix)) phonIdx.set(prefix, []);
        phonIdx.get(prefix)!.push(st);
      }
    }

    _allStreets = streets;
    _phoneticIndex = phonIdx;
    _indexReady = true;

    console.log(`[VoiceResolver] Индекс улиц: ${streets.length} уникальных названий`);
  })();

  await _indexPromise;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. ФОНЕТИЧЕСКИЙ ПОИСК УЛИЦ
// ═══════════════════════════════════════════════════════════════════════════

interface StreetMatch {
  /** Оригинальное название */
  street: string;
  /** Score 0..1 (выше = лучше) */
  score: number;
  /** Метод совпадения */
  method: 'exact' | 'phonetic' | 'trigram' | 'edit_distance';
}

/** Ищет наиболее похожие улицы для данного текста */
export function findMatchingStreets(query: string, limit = 5): StreetMatch[] {
  if (!_allStreets || _allStreets.length === 0) return [];

  const q = query.toLowerCase().trim();
  if (!q) return [];

  // Извлекаем «чистое» имя (без типа)
  const cleanQ = q
    .replace(/\b(ул\.|улица|пр-т|проспект|пер\.|переулок|бул\.|бульвар|ш\.|шоссе|пл\.|площадь|наб\.|набережная|д\.\s*\d+|дом\s*\d+|\d+)\b/gi, '')
    .trim();

  if (!cleanQ) return [];

  const qPhonetic = russianPhoneticKey(cleanQ);
  const qTrigrams = makeTrigrams(cleanQ);
  const results: StreetMatch[] = [];
  const seen = new Set<string>();

  // Фаза 1: Точное вхождение подстроки
  for (const st of _allStreets) {
    if (st.normalized.includes(q) || q.includes(st.normalized)) {
      if (!seen.has(st.normalized)) {
        seen.add(st.normalized);
        results.push({
          street: st.name,
          score: 1.0,
          method: 'exact',
        });
      }
    }
  }

  // Фаза 2: Фонетическое совпадение
  if (_phoneticIndex && qPhonetic.length >= 2) {
    // Ищем по префиксу фонетического ключа
    const candidates = _phoneticIndex.get(qPhonetic.slice(0, Math.min(3, qPhonetic.length))) ?? [];

    for (const st of candidates) {
      if (seen.has(st.normalized)) continue;

      // Фонетическое расстояние
      const phonDist = damerauLevenshtein(qPhonetic, st.phoneticKey);
      const maxLen = Math.max(qPhonetic.length, st.phoneticKey.length);
      const phonScore = maxLen > 0 ? 1 - phonDist / maxLen : 0;

      if (phonScore > 0.4) {
        seen.add(st.normalized);
        // Буст за частотность (популярные улицы = приоритет)
        const freqBoost = Math.min(st.frequency / 100, 0.2);
        results.push({
          street: st.name,
          score: Math.min(phonScore + freqBoost, 0.99),
          method: 'phonetic',
        });
      }
    }
  }

  // Фаза 3: Триграммная похожесть (для тех, кого пропустила фонетика)
  if (results.length < limit) {
    for (const st of _allStreets) {
      if (seen.has(st.normalized)) continue;

      const sim = trigramSimilarity(qTrigrams, st.trigrams);
      if (sim > 0.25) {
        seen.add(st.normalized);
        results.push({
          street: st.name,
          score: sim * 0.85, // немного ниже фонетики
          method: 'trigram',
        });
      }
    }
  }

  // Фаза 4: Edit distance для коротких запросов
  if (cleanQ.length <= 8 && results.length < limit) {
    for (const st of _allStreets) {
      if (seen.has(st.normalized)) continue;

      const cleanSt = st.normalized
        .replace(/\b(ул\.|улица|пр-т|проспект|пер\.|переулок)\b/gi, '')
        .trim();

      const dist = damerauLevenshtein(cleanQ, cleanSt);
      const maxLen = Math.max(cleanQ.length, cleanSt.length);
      const score = maxLen > 0 ? 1 - dist / maxLen : 0;

      if (score > 0.4) {
        seen.add(st.normalized);
        results.push({
          street: st.name,
          score: score * 0.8,
          method: 'edit_distance',
        });
      }
    }
  }

  // Сортировка: score desc, частотность desc
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. СИСТЕМА ОБУЧЕНИЯ (localStorage)
// ═══════════════════════════════════════════════════════════════════════════

const LEARN_STORAGE_KEY = 'voice_address_corrections';
const MAX_CORRECTIONS = 500;

interface LearnedCorrection {
  /** Что услышала Speech API */
  heard: string;
  /** Что пользователь реально выбрал */
  actual: string;
  /** Фонетический ключ heard */
  heardPhonetic: string;
  /** Сколько раз пользователь сделал эту коррекцию */
  count: number;
  /** Последнее использование (timestamp) */
  lastUsed: number;
}

function loadCorrections(): LearnedCorrection[] {
  try {
    const raw = localStorage.getItem(LEARN_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LearnedCorrection[];
  } catch {
    return [];
  }
}

function saveCorrections(corrections: LearnedCorrection[]): void {
  try {
    // Оставляем только MAX_CORRECTIONS, отсортированных по использованию
    corrections.sort((a, b) => b.count * 10 + b.lastUsed - (a.count * 10 + a.lastUsed));
    const trimmed = corrections.slice(0, MAX_CORRECTIONS);
    localStorage.setItem(LEARN_STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* quota exceeded — ок */ }
}

/** Запомнить коррекцию: пользователь сказал X, но выбрал адрес Y */
export function learnCorrection(heardText: string, selectedAddress: string): void {
  const heard = heardText.toLowerCase().trim();
  const actual = selectedAddress.toLowerCase().trim();
  if (!heard || !actual || heard === actual) return;

  const corrections = loadCorrections();
  const existing = corrections.find(c => c.heard === heard && c.actual === actual);

  if (existing) {
    existing.count++;
    existing.lastUsed = Date.now();
  } else {
    corrections.push({
      heard,
      actual,
      heardPhonetic: russianPhoneticKey(heard),
      count: 1,
      lastUsed: Date.now(),
    });
  }

  saveCorrections(corrections);
}

/** Найти ранее изученные коррекции для текста */
function findLearnedCorrections(text: string): string[] {
  const corrections = loadCorrections();
  if (corrections.length === 0) return [];

  const normalized = text.toLowerCase().trim();
  const phonKey = russianPhoneticKey(normalized);
  const results: { actual: string; score: number }[] = [];

  for (const c of corrections) {
    // Точное совпадение
    if (c.heard === normalized) {
      results.push({ actual: c.actual, score: 1.0 + c.count * 0.1 });
      continue;
    }

    // Фонетическое совпадение с heard
    if (phonKey && c.heardPhonetic) {
      const dist = damerauLevenshtein(phonKey, c.heardPhonetic);
      const maxLen = Math.max(phonKey.length, c.heardPhonetic.length);
      const sim = maxLen > 0 ? 1 - dist / maxLen : 0;

      if (sim > 0.6) {
        results.push({ actual: c.actual, score: sim * 0.8 + c.count * 0.05 });
      }
    }

    // Подстроковое совпадение
    if (normalized.includes(c.heard) || c.heard.includes(normalized)) {
      results.push({ actual: c.actual, score: 0.7 + c.count * 0.05 });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 3).map(r => r.actual);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. ГЕНЕРАТОР ВАРИАНТОВ ЗАПРОСА
// ═══════════════════════════════════════════════════════════════════════════

/** Общие ошибки распознавания русской речи (Speech API) */
const COMMON_MISRECOGNITIONS: [RegExp, string][] = [
  // Типичные ошибки Google Speech для русского
  [/\bулица\s+ленин а\b/gi, 'улица Ленина'],
  [/\bарбат ская\b/gi, 'Арбатская'],
  [/\bтверск ая\b/gi, 'Тверская'],
  [/\bкутузов ский\b/gi, 'Кутузовский'],
  // "Строй" вместо "строение"
  [/\bстрой\s+(\d+)/gi, 'стр. $1'],
  // "Каблук" → "Каблук" (оставляем), "Каблуков" → "Каблукова"
  // Пробелы в середине слов (частая ошибка)
  [/(\w{2,})\s{1}(\w{1,3})\b/gi, (_, a: string, b: string) => {
    // Если вторая часть похожа на окончание — склеиваем
    if (b.length <= 3 && /^[а-яё]+$/.test(b)) return a + b;
    return `${a} ${b}`;
  }],
];

/** Типичные замены букв при нечётком произношении */
const PHONETIC_ALTERNATES: [string, string[]][] = [
  ['а', ['о']],
  ['о', ['а']],
  ['е', ['и', 'э']],
  ['и', ['е', 'ы']],
  ['б', ['п']],
  ['п', ['б']],
  ['в', ['ф']],
  ['ф', ['в']],
  ['г', ['к', 'х']],
  ['к', ['г']],
  ['д', ['т']],
  ['т', ['д']],
  ['з', ['с']],
  ['с', ['з']],
  ['ж', ['ш', 'щ']],
  ['ш', ['ж', 'щ']],
];

/** Генерирует варианты запроса: нормализованный + фонетические замены + learned */
export function generateQueryVariants(rawText: string): string[] {
  const variants = new Set<string>();
  const normalized = normalizeVoiceText(rawText);

  // Оригинальный нормализованный
  variants.add(normalized);

  // Оригинальный raw (на случай если нормализация сломала)
  variants.add(rawText.toLowerCase().trim());

  // Вариант с "Москва" (для Nominatim)
  const withCity = `Москва, ${normalized}`;
  variants.add(withCity);

  // Вариант с развёрнутым "к.N" → "корпус N"
  const withCorpus = normalized.replace(/\bк\.?\s*(\d+)/gi, 'корпус $1');
  if (withCorpus !== normalized) variants.add(withCorpus);

  // Вариант с развёрнутым "стр.N" → "строение N"
  const withStr = normalized.replace(/\bстр\.?\s*(\d+)/gi, 'строение $1');
  if (withStr !== normalized) variants.add(withStr);

  // Вариант: улица [название] — добавляем "улица" если её нет
  const hasStreetType = /\b(ул\.|улица|пр-т|проспект|пер\.|переулок|бул\.|бульвар|ш\.|шоссе|пл\.|площадь|наб\.|набережная)\b/i.test(normalized);
  if (!hasStreetType) {
    // Ввод вида "чароитовая 1 к4" — добавляем "улица"
    const firstWord = normalized.split(/\s+/)[0];
    if (firstWord && firstWord.length > 3 && /[а-яё]$/i.test(firstWord)) {
      variants.add(`улица ${normalized}`);
      variants.add(`ул. ${normalized}`);
    }
  }

  // Применяем common misrecognitions
  let corrected = normalized;
  for (const [re, rep] of COMMON_MISRECOGNITIONS) {
    if (typeof rep === 'string') {
      corrected = corrected.replace(re, rep);
    } else {
      corrected = corrected.replace(re, rep as unknown as string);
    }
  }
  if (corrected !== normalized) variants.add(corrected);

  // Из learned corrections
  const learned = findLearnedCorrections(rawText);
  for (const l of learned) variants.add(l);

  // Фонетические подстановки улиц
  const streetMatches = findMatchingStreets(normalized, 3);
  for (const m of streetMatches) {
    if (m.score > 0.4) {
      // Заменяем в запросе
      const withStreet = replaceStreetInQuery(normalized, m.street);
      if (withStreet) variants.add(withStreet);
    }
  }

  // Без типа улицы (иногда Speech API вообще не слышит "улица")
  const withoutType = normalized
    .replace(/\b(ул\.|пр-т|пер\.|бул\.|ш\.|пл\.|наб\.)\s*/gi, '')
    .trim();
  if (withoutType !== normalized && withoutType.length > 2) {
    variants.add(withoutType);
  }

  return Array.from(variants).filter(v => v.length >= 2);
}

/** Заменяет название улицы в запросе на найденное */
function replaceStreetInQuery(query: string, streetName: string): string | null {
  // Извлекаем номер дома из запроса
  const houseMatch = query.match(/(?:д\.?\s*)?(\d+\s*[а-яА-Яa-zA-Z]?)(?:\s*(?:к|корп|стр)\.?\s*\d+)?/);
  const house = houseMatch ? houseMatch[0] : '';

  if (house) {
    return `${streetName} ${house}`;
  }

  return streetName;
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. ГЛАВНАЯ ФУНКЦИЯ — RESOLVE VOICE ADDRESS
// ═══════════════════════════════════════════════════════════════════════════

export interface VoiceResolveResult {
  /** Все найденные результаты, отсортированные по релевантности */
  results: SearchResult[];
  /** Варианты запросов, которые были использованы */
  queryVariants: string[];
  /** Нормализованный текст (для отображения) */
  normalizedText: string;
  /** Были ли использованы learned corrections */
  usedLearning: boolean;
}

/**
 * Главная точка входа: разрешает голосовой ввод в адреса.
 *
 * @param voiceText - Текст от Speech API (может быть нечётким)
 * @param alternatives - Альтернативные распознавания (от maxAlternatives)
 * @param near - Текущая позиция (для ранжирования)
 */
export async function resolveVoiceAddress(
  voiceText: string,
  alternatives: string[] = [],
  near?: LatLng,
): Promise<VoiceResolveResult> {
  // Строим индекс если ещё не построен
  await buildStreetIndex();

  const normalizedText = normalizeVoiceText(voiceText);

  // Генерируем варианты из основного текста + альтернатив
  const allVariants = new Set<string>();
  for (const variant of generateQueryVariants(voiceText)) {
    allVariants.add(variant);
  }
  for (const alt of alternatives) {
    for (const variant of generateQueryVariants(alt)) {
      allVariants.add(variant);
    }
  }

  const queryVariants = Array.from(allVariants);
  const usedLearning = findLearnedCorrections(voiceText).length > 0;

  // Ищем по каждому варианту
  const allResults = new Map<string, SearchResult & { _boostCount: number }>();

  for (const q of queryVariants) {
    const found = await searchOffline(q, near, 10);
    for (const r of found) {
      const key = `${r.id}-${r.type}`;
      if (allResults.has(key)) {
        const existing = allResults.get(key)!;
        existing.score = Math.max(existing.score, r.score);
        existing._boostCount++;
      } else {
        allResults.set(key, { ...r, _boostCount: 1 });
      }
    }
  }

  // Буст результатам, найденным по нескольким вариантам
  const results: SearchResult[] = [];
  for (const [, r] of allResults) {
    const multiMatchBoost = r._boostCount > 1 ? 1 + (r._boostCount - 1) * 0.3 : 1;
    results.push({
      id: r.id,
      type: r.type,
      name: r.name,
      display: r.display,
      position: r.position,
      category: r.category,
      score: r.score * multiMatchBoost,
      distance: r.distance,
    });
  }

  // Финальная сортировка
  results.sort((a, b) => b.score - a.score);

  return {
    results: results.slice(0, 15),
    queryVariants,
    normalizedText,
    usedLearning,
  };
}
