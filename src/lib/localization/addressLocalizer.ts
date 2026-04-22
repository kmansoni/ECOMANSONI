/**
 * Глубокая локализация адресов и названий мест.
 * 3-уровневая система: OSM name:XX → транслитерация → DaData/online fallback.
 * Работает offline-first, кэширует результаты в IndexedDB.
 */

import { dbLoose } from '@/lib/supabase';

// ── Типы ──

export type Locale = 'ru-RU' | 'en-US' | 'uk-UA' | 'kk-KZ' | 'uz-Latn-UZ' | 'de-DE' | 'fr-FR' | 'zh-CN' | 'ja-JP' | 'ar-SA' | 'tr-TR' | 'es-ES';

type LocaleLang = 'ru' | 'en' | 'uk' | 'kk' | 'uz' | 'de' | 'fr' | 'zh' | 'ja' | 'ar' | 'tr' | 'es';

export type AddressComponentType = 'street' | 'avenue' | 'square' | 'metro' | 'park' | 'building' | 'district' | 'city' | 'region';

export interface AddressComponent {
  type: AddressComponentType;
  name: string;
  originalName?: string;
  translationKey?: string;
}

export interface LocalizedAddress {
  full: string;
  components: AddressComponent[];
  confidence: number; // 0..1
  source: 'osm' | 'cache' | 'transliteration' | 'online';
}

export interface MultiLanguageName {
  primary: string;
  ru?: string;
  en?: string;
  uk?: string;
  kk?: string;
  uz?: string;
  de?: string;
  fr?: string;
  zh?: string;
  ja?: string;
  ar?: string;
  tr?: string;
  es?: string;
  [key: string]: string | undefined;
}

// ── Транслитерация кириллица ↔ латиница ──

const CYR_TO_LAT: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'ye', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
};

// Типы улиц: перевод на основные языки
const STREET_TYPE_TRANSLATIONS: Record<string, Record<LocaleLang, string>> = {
  'улица':     { ru: 'улица', en: 'Street', uk: 'вулиця', kk: 'көше', uz: "ko'cha", de: 'Straße', fr: 'Rue', zh: '街', ja: '通り', ar: 'شارع', tr: 'Sokak', es: 'Calle' },
  'проспект':  { ru: 'проспект', en: 'Avenue', uk: 'проспект', kk: 'даңғыл', uz: 'prospekt', de: 'Allee', fr: 'Avenue', zh: '大道', ja: '大通り', ar: 'شارع', tr: 'Bulvar', es: 'Avenida' },
  'переулок':  { ru: 'переулок', en: 'Lane', uk: 'провулок', kk: 'тұйық', uz: "tor ko'cha", de: 'Gasse', fr: 'Ruelle', zh: '巷', ja: '路地', ar: 'زقاق', tr: 'Geçit', es: 'Pasaje' },
  'бульвар':   { ru: 'бульвар', en: 'Boulevard', uk: 'бульвар', kk: 'бульвар', uz: 'bulvar', de: 'Boulevard', fr: 'Boulevard', zh: '大街', ja: 'ブルバード', ar: 'جادة', tr: 'Bulvar', es: 'Bulevar' },
  'площадь':   { ru: 'площадь', en: 'Square', uk: 'площа', kk: 'алаң', uz: 'maydon', de: 'Platz', fr: 'Place', zh: '广场', ja: '広場', ar: 'ميدان', tr: 'Meydan', es: 'Plaza' },
  'шоссе':     { ru: 'шоссе', en: 'Highway', uk: 'шосе', kk: 'тас жол', uz: "shosse", de: 'Chaussee', fr: 'Route', zh: '公路', ja: '高速道路', ar: 'طريق سريع', tr: 'Karayolu', es: 'Carretera' },
  'набережная': { ru: 'набережная', en: 'Embankment', uk: 'набережна', kk: 'жағалау', uz: 'sohibqiron', de: 'Ufer', fr: 'Quai', zh: '堤岸', ja: '河岸', ar: 'كورنيش', tr: 'Rıhtım', es: 'Malecón' },
  'тупик':     { ru: 'тупик', en: 'Cul-de-sac', uk: 'тупик', kk: 'тұйық', uz: "tupik", de: 'Sackgasse', fr: 'Impasse', zh: '死胡同', ja: '袋小路', ar: 'طريق مسدود', tr: 'Çıkmaz', es: 'Callejón sin salida' },
  'дом':       { ru: 'д.', en: '', uk: 'буд.', kk: 'үй', uz: 'uy', de: 'Nr.', fr: 'n°', zh: '号', ja: '番地', ar: 'رقم', tr: 'No', es: 'n.º' },
  'корпус':    { ru: 'к.', en: 'bldg.', uk: 'корп.', kk: 'корп.', uz: 'korpus', de: 'Geb.', fr: 'bât.', zh: '栋', ja: '棟', ar: 'مبنى', tr: 'Blok', es: 'bloque' },
};

// ── Кэш ──

const translationCache = new Map<string, MultiLanguageName>();
const DB_NAME = 'mansoni_localization';
const STORE_NAME = 'address_translations';

async function openIDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function getFromIDB(key: string): Promise<MultiLanguageName | null> {
  const db = await openIDB();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => resolve(null);
  });
}

async function putToIDB(key: string, value: MultiLanguageName): Promise<void> {
  const db = await openIDB();
  if (!db) return;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put({ key, value, ts: Date.now() });
}

// ── Утилиты ──

function localeToLang(locale: Locale): LocaleLang {
  return locale.split('-')[0].toLowerCase() as LocaleLang;
}

function getSystemLocale(): Locale {
  if (typeof navigator === 'undefined') return 'ru-RU';
  const lang = navigator.language || 'ru-RU';
  // Map common browser locales
  if (lang.startsWith('ru')) return 'ru-RU';
  if (lang.startsWith('uk')) return 'uk-UA';
  if (lang.startsWith('kk')) return 'kk-KZ';
  if (lang.startsWith('uz')) return 'uz-Latn-UZ';
  if (lang.startsWith('de')) return 'de-DE';
  if (lang.startsWith('fr')) return 'fr-FR';
  if (lang.startsWith('zh')) return 'zh-CN';
  if (lang.startsWith('ja')) return 'ja-JP';
  if (lang.startsWith('ar')) return 'ar-SA';
  if (lang.startsWith('tr')) return 'tr-TR';
  if (lang.startsWith('es')) return 'es-ES';
  if (lang.startsWith('en')) return 'en-US';
  return 'ru-RU';
}

function transliterateCyrToLat(text: string): string {
  let result = '';
  const lower = text.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    const mapped = CYR_TO_LAT[ch];
    if (mapped !== undefined) {
      // Preserve case
      if (text[i] === text[i].toUpperCase() && text[i] !== text[i].toLowerCase()) {
        result += mapped.charAt(0).toUpperCase() + mapped.slice(1);
      } else {
        result += mapped;
      }
    } else {
      result += text[i];
    }
  }
  return result;
}

function translateStreetType(type: string, lang: LocaleLang): string {
  const lower = type.toLowerCase();
  for (const [ruType, translations] of Object.entries(STREET_TYPE_TRANSLATIONS)) {
    if (lower === ruType || lower.startsWith(ruType)) {
      return translations[lang] ?? translations.en ?? type;
    }
  }
  return type;
}

// ── Парсинг адресной строки ──

function parseRussianAddress(address: string): AddressComponent[] {
  const components: AddressComponent[] = [];
  // Pattern: "г. Москва, ул. Тверская, д. 15, к. 2"
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);

  for (const part of parts) {
    // City
    if (/^г\.\s*/i.test(part) || /^город\s+/i.test(part)) {
      components.push({ type: 'city', name: part.replace(/^(г\.|город)\s*/i, '').trim(), originalName: part });
      continue;
    }
    // Street types
    const streetMatch = part.match(/^(ул\.|улица|пр\.|проспект|пер\.|переулок|б-р\.|бульвар|пл\.|площадь|ш\.|шоссе|наб\.|набережная)\s+(.+)/i);
    if (streetMatch) {
      const typeFull = streetMatch[1].replace(/\.$/, '').toLowerCase();
      const typeMap: Record<string, AddressComponentType> = {
        'ул': 'street', 'улица': 'street',
        'пр': 'avenue', 'проспект': 'avenue',
        'пер': 'street', 'переулок': 'street',
        'б-р': 'street', 'бульвар': 'street',
        'пл': 'square', 'площадь': 'square',
        'ш': 'street', 'шоссе': 'street',
        'наб': 'street', 'набережная': 'street',
      };
      components.push({
        type: typeMap[typeFull] ?? 'street',
        name: streetMatch[2].trim(),
        originalName: part,
      });
      continue;
    }
    // Building number
    if (/^(д\.|дом)\s*\d/i.test(part)) {
      components.push({ type: 'building', name: part.replace(/^(д\.|дом)\s*/i, '').trim(), originalName: part });
      continue;
    }
    // Корпус
    if (/^(к\.|корп\.|корпус)\s*\d/i.test(part)) {
      components.push({ type: 'building', name: part, originalName: part });
      continue;
    }
    // Fallback — unknown component
    components.push({ type: 'street', name: part, originalName: part });
  }

  return components;
}

// ── Форматирование адреса по локали ──

function formatAddress(components: AddressComponent[], lang: LocaleLang): string {
  // Порядок: для ru/uk/kk → "тип + имя", для en/de/fr → "имя + тип"
  const isPostfixLang = ['en', 'de', 'fr'].includes(lang);
  
  return components.map(c => {
    if (c.type === 'building') return c.name;
    if (c.type === 'city' || c.type === 'region' || c.type === 'district') return c.name;
    // Street-like: translate type and format
    const typeTranslation = c.originalName 
      ? translateStreetType(c.originalName.split(/\s+/)[0], lang) 
      : '';
    
    if (isPostfixLang && typeTranslation) {
      return `${c.name} ${typeTranslation}`;
    }
    if (typeTranslation) {
      return `${typeTranslation} ${c.name}`;
    }
    return c.name;
  }).join(', ');
}

// ── Главный класс ──

class AddressLocalizer {
  private userLocale: Locale = 'ru-RU';
  private systemLocale: Locale;

  constructor() {
    this.systemLocale = getSystemLocale();
    this.userLocale = this.systemLocale;
  }

  /** Установить пользовательскую локаль (или 'system') */
  setLocale(locale: Locale | 'system') {
    if (locale === 'system') {
      this.userLocale = this.systemLocale;
    } else {
      this.userLocale = locale;
    }
  }

  getLocale(): Locale {
    return this.userLocale;
  }

  getLang(): LocaleLang {
    return localeToLang(this.userLocale);
  }

  /** Загрузить переводы из OSM/Supabase для данного bbox (кэш в memory + IDB) */
  async loadOSMTranslations(bbox: { minLat: number; minLon: number; maxLat: number; maxLon: number }): Promise<number> {
    try {
      const { data } = await dbLoose.rpc('osm_get_translated_names', {
        p_min_lat: bbox.minLat,
        p_min_lon: bbox.minLon,
        p_max_lat: bbox.maxLat,
        p_max_lon: bbox.maxLon,
      });
      if (!data || !Array.isArray(data)) return 0;

      for (const row of data) {
        const names: MultiLanguageName = {
          primary: row.name ?? '',
          ru: row.name_ru ?? row.name,
          en: row.name_en,
          uk: row.name_uk,
          kk: row.name_kk,
          de: row.name_de,
        };
        translationCache.set(names.primary, names);
        await putToIDB(names.primary, names);
      }
      return data.length;
    } catch {
      return 0;
    }
  }

  /** Перевести адрес на текущую локаль */
  async localizeAddress(rawAddress: string, locale?: Locale): Promise<LocalizedAddress> {
    const targetLocale = locale ?? this.userLocale;
    const lang = localeToLang(targetLocale);

    // Если уже на целевом языке — вернуть как есть
    if (lang === 'ru' && /[а-яА-ЯёЁ]/.test(rawAddress)) {
      const components = parseRussianAddress(rawAddress);
      return {
        full: rawAddress,
        components,
        confidence: 1.0,
        source: 'cache',
      };
    }

    const components = parseRussianAddress(rawAddress);

    // Level 1: OSM кэш
    for (const comp of components) {
      const cached = translationCache.get(comp.originalName ?? comp.name);
      if (cached?.[lang]) {
        comp.name = cached[lang]!;
        continue;
      }
      // IDB fallback
      const idbCached = await getFromIDB(comp.originalName ?? comp.name);
      if (idbCached?.[lang]) {
        translationCache.set(comp.originalName ?? comp.name, idbCached);
        comp.name = idbCached[lang]!;
        continue;
      }
    }

    // Level 2: Транслитерация
    const translated = components.map(comp => {
      // If already translated via cache
      if (!/[а-яА-ЯёЁ]/.test(comp.name) && lang !== 'ru') return comp;
      // Transliterate Cyrillic to Latin for non-Cyrillic locales
      if (!['ru', 'uk', 'kk'].includes(lang)) {
        return { ...comp, name: transliterateCyrToLat(comp.name) };
      }
      return comp;
    });

    const full = formatAddress(translated, lang);

    return {
      full,
      components: translated,
      confidence: translated.every(c => !/[а-яА-ЯёЁ]/.test(c.name) || ['ru', 'uk', 'kk'].includes(lang)) ? 0.85 : 0.6,
      source: 'transliteration',
    };
  }

  /** Перевести название станции метро */
  localizeMetroStation(name: string, names?: MultiLanguageName): string {
    const lang = this.getLang();
    if (names?.[lang]) return names[lang]!;
    
    // Для кириллических языков — оставляем как есть
    if (['ru', 'uk', 'kk'].includes(lang)) return name;
    
    // Транслитерация для латиницы
    return transliterateCyrToLat(name);
  }

  /** Получить MapLibre text-field expression для текущей локали */
  getMapTextFieldExpression(): unknown[] {
    const lang = this.getLang();
    return [
      'coalesce',
      ['get', `name:${lang}`],
      ['get', 'name:en'],
      ['get', 'name'],
    ];
  }

  /** Очистить кэш */
  clearCache() {
    translationCache.clear();
  }
}

// Singleton
export const addressLocalizer = new AddressLocalizer();

// Re-export utilities
export { getSystemLocale, transliterateCyrToLat, parseRussianAddress, formatAddress };
