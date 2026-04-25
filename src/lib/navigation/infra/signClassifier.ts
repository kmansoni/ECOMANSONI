/**
 * Классификатор дорожных знаков.
 *
 * Парсит OSM `traffic_sign=*` теги в категории по ГОСТ Р 52290-2004 / Vienna Convention.
 *
 * Формат тегов:
 *   - "RU:3.24" → запрещающий, ограничение скорости
 *   - "RU:3.24[60]" → ограничение 60
 *   - "RU:5.15.1[2]" → знак относится к полосе индекс 2
 *   - "RU:3.24,RU:8.2.1" → комбинированный (основной + доп.)
 */

import type { SignCategory } from '@/types/roadInfra';

interface ClassifiedSign {
  baseTag: string;
  category: SignCategory;
  value?: string | number | null;
}

const CATEGORY_BY_PREFIX: Array<[RegExp, SignCategory]> = [
  [/^(RU|DE|FR|UA|BY|IT|ES|NL|PL):1\./, 'warning'],
  [/^(RU|DE|FR|UA|BY|IT|ES|NL|PL):2\./, 'priority'],
  [/^(RU|DE|FR|UA|BY|IT|ES|NL|PL):3\./, 'prohibitory'],
  [/^(RU|DE|FR|UA|BY|IT|ES|NL|PL):4\./, 'mandatory'],
  [/^(RU|DE|FR|UA|BY|IT|ES|NL|PL):5\./, 'special'],
  [/^(RU|DE|FR|UA|BY|IT|ES|NL|PL):6\./, 'information'],
  [/^(RU|DE|FR|UA|BY|IT|ES|NL|PL):7\./, 'service'],
  [/^(RU|DE|FR|UA|BY|IT|ES|NL|PL):8\./, 'additional'],
  // Обобщённые имена
  [/^(maxspeed|speed_limit)/i, 'prohibitory'],
  [/^stop$/i, 'priority'],
  [/^give_way|yield/i, 'priority'],
  [/^city_limit/i, 'information'],
];

/**
 * Парсит OSM тег знака. Возвращает первый (основной) знак и его категорию.
 */
export function classifySign(tag: string): ClassifiedSign | null {
  if (!tag || typeof tag !== 'string') return null;

  // Берём первый знак из списка
  const first = tag.split(',')[0]?.trim();
  if (!first) return null;

  // Извлечь значение в скобках
  const match = first.match(/^([A-Za-z:_0-9.]+)(?:\[([^\]]+)\])?$/);
  if (!match) return null;

  const [, baseTag, valueRaw] = match;
  if (!baseTag) return null;

  let category: SignCategory | null = null;
  for (const [re, cat] of CATEGORY_BY_PREFIX) {
    if (re.test(baseTag)) {
      category = cat;
      break;
    }
  }
  if (!category) return null;

  let value: string | number | null = null;
  if (valueRaw) {
    const num = parseFloat(valueRaw);
    value = Number.isFinite(num) && /^\d+(\.\d+)?$/.test(valueRaw) ? num : valueRaw;
  }

  return { baseTag, category, value };
}

/**
 * Извлекает индексы полос из traffic_sign тега.
 *   "RU:5.15.1[2]" → [2]
 *   "RU:5.15.1[1,3]" → [1, 3]
 *   "RU:3.24" → null (применимо ко всей дороге)
 */
export function parseLaneRefs(tag: string): number[] | null {
  if (!tag) return null;
  const first = tag.split(',')[0]?.trim();
  if (!first) return null;

  const match = first.match(/\[([^\]]+)\]/);
  if (!match || !match[1]) return null;

  const inner = match[1];
  // Если число — это значение (скорость), не индекс полосы
  // Индексы полос обычно для знаков 5.15.x (направления по полосам)
  if (!/^(RU|DE|FR|UA|BY):5\.15/.test(first)) return null;

  const refs = inner
    .split(/[,;]/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0);

  return refs.length > 0 ? refs : null;
}

/**
 * Маппинг тега → имя 3D-модели в `src/assets/signs/atlas.json`.
 * Возвращает ключ для UV-координат в текстурном атласе.
 */
export function getSignAtlasKey(tag: string): string {
  const cls = classifySign(tag);
  if (!cls) return 'unknown';

  // Базовый ключ для атласа: например "RU_3_24"
  const safe = cls.baseTag.replace(/[:.\\-]/g, '_');
  return safe;
}

/**
 * Человекочитаемое имя знака на русском (для попапов).
 */
export function getSignTitle(tag: string): string {
  const cls = classifySign(tag);
  if (!cls) return tag;

  const TITLES: Record<string, string> = {
    'RU:3.24': 'Ограничение максимальной скорости',
    'RU:3.27': 'Остановка запрещена',
    'RU:3.28': 'Стоянка запрещена',
    'RU:5.15.1': 'Направления движения по полосам',
    'RU:5.15.2': 'Направления движения по полосе',
    'RU:1.20.1': 'Сужение дороги',
    'RU:1.20.2': 'Сужение справа',
    'RU:1.20.3': 'Сужение слева',
    'RU:2.1': 'Главная дорога',
    'RU:2.2': 'Конец главной дороги',
    'RU:2.4': 'Уступите дорогу',
    'RU:2.5': 'Движение без остановки запрещено',
    'RU:1.22': 'Пешеходный переход',
    'RU:1.23': 'Дети',
    'RU:5.19.1': 'Пешеходный переход',
    'RU:6.4': 'Парковка',
  };

  const title = TITLES[cls.baseTag];
  if (title) return cls.value ? `${title} (${cls.value})` : title;
  return cls.baseTag + (cls.value ? ` [${cls.value}]` : '');
}
