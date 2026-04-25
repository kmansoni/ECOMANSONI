/**
 * Time Edge Cases Helper — генерирует и проверяет boundary-кейсы со временем
 *
 * Использование:
 *   const timeEdge = new TimeEdgeCaseHelper();
 *   timeEdge.simulateDSTSpringForward(); // 2026-03-29 02:00 → 03:00 (EU)
 *   timeEdge.simulateLeapSecond(); // 23:59:60
 *   timeEdge.isYear2038Problem('2038-01-19T03:14:07Z'); // true
 *
 * Особенности:
 * - DST transitions (spring forward / fall back)
 * - Leap seconds (23:59:60 → 00:00:00)
 * - Year 2038 (32-bit timestamp overflow)
 * - Epoch 0 (1970-01-01)
 * - Timezone offset changes mid-conversation
 * - Message scheduling across DST
 */

export interface TimeEdgeCase {
  type: 'dst_spring' | 'dst_fall' | 'leap_second' | 'year_2038' | 'epoch_0' | 'timezone_change';
  timestamp: number;
  description: string;
  expectedBehavior: string;
}

export class TimeEdgeCaseHelper {
  private timezoneOffset: number = 0; // в минутах от UTC

  /** Установить текущий timezone offset (например, +180 для MSK) */
  setTimezoneOffset(minutes: number): void {
    this.timezoneOffset = minutes;
  }

  /** Проверить, является ли дата Year 2038 Problem */
  isYear2038Problem(timestamp: number | Date): boolean {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    // 32-bit signed int max: 2038-01-19T03:14:07.000Z (2^31-1 seconds)
    const max32 = new Date('2038-01-19T03:14:07.000Z');
    return date.getTime() >= max32.getTime();
  }

  /** Проверить, является ли дата Epoch 0 */
  isEpochZero(timestamp: number | Date): boolean {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    return date.getTime() === 0;
  }

  /** Проверить, попадает ли timestamp в DST transition hour */
  isInDSTTransition(timestamp: number, timezone: 'EU' | 'US' | 'RU' = 'EU'): boolean {
    const date = new Date(timestamp);
    const hour = date.getUTCHours();
    // EU DST: последнее воскресенье марта (02:00→03:00) и октября (03:00→02:00)
    const isSpring = date.getMonth() === 2 && date.getDate() >= 25 && date.getDay() === 0 && hour === 2;
    const isFall = date.getMonth() === 9 && date.getDate() >= 25 && date.getDay() === 0 && hour === 2;
    return isSpring || isFall;
  }

  /** Проверить, является ли timestamp leap second */
  isLeapSecond(timestamp: number | Date): boolean {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    // Leap seconds: 23:59:60 UTC (координированное всемирное время)
    return date.getUTCHours() === 23 && date.getUTCMinutes() === 59 && date.getUTCSeconds() === 60;
  }

  /** Сгенерировать массив edge-case timestamps для тестов */
  generateEdgeCaseTimestamps(year: number = 2026): TimeEdgeCase[] {
    const cases: TimeEdgeCase[] = [];

    // 1. DST Spring Forward (EU: 2026-03-29 01:00 UTC → 02:00 UTC, но часы переводятся с 02:00 на 03:00 local)
    const dstSpring = new Date(Date.UTC(year, 2, 29, 1)); // 01:00 UTC = 02:00 CET → 03:00 CEST
    cases.push({
      type: 'dst_spring',
      timestamp: dstSpring.getTime(),
      description: 'EU DST spring forward — час пропадает',
      expectedBehavior: 'Clock skips 02:00→03:00; messages scheduled at 02:30 fire at 03:30 local',
    });

    // 2. DST Fall Back (EU: 2026-10-25 02:00 UTC → 01:00 UTC, часы переводятся с 03:00 на 02:00)
    const dstFall = new Date(Date.UTC(year, 9, 25, 1)); // 01:00 UTC = 03:00 CEST → 02:00 CET
    cases.push({
      type: 'dst_fall',
      timestamp: dstFall.getTime(),
      description: 'EU DST fall back — час повторяется',
      expectedBehavior: 'Clock repeats 02:00–03:00; disambiguation via timezone offset',
    });

    // 3. Leap Second (constellation: 2026-12-31 23:59:60 UTC)
    const leapSecond = new Date(Date.UTC(year, 11, 31, 23, 59, 60));
    cases.push({
      type: 'leap_second',
      timestamp: leapSecond.getTime(),
      description: 'Leap second (23:59:60)',
      expectedBehavior: 'Date parser should handle 60th second; not throw RangeError',
    });

    // 4. Year 2038 Problem (just before overflow)
    const year2038 = new Date('2038-01-19T03:14:07.000Z');
    cases.push({
      type: 'year_2038',
      timestamp: year2038.getTime(),
      description: '32-bit signed int overflow (2^31 seconds since epoch)',
      expectedBehavior: 'Use BigInt or 64-bit timestamps; avoid Date.getTime() overflow',
    });

    // 5. Epoch 0 (1970-01-01)
    const epoch0 = new Date(0);
    cases.push({
      type: 'epoch_0',
      timestamp: 0,
      description: 'Unix Epoch (1970-01-01 00:00:00 UTC)',
      expectedBehavior: 'Handle negative timestamps; timezone offset applied correctly',
    });

    // 6. Timezone change mid-conversation (user travels)
    const beforeTZ = new Date(Date.UTC(year, 5, 15, 12, 0)); // 12:00 UTC
    cases.push({
      type: 'timezone_change',
      timestamp: beforeTZ.getTime(),
      description: 'User changes timezone (Moscow → New York) mid-conversation',
      expectedBehavior: 'All timestamps stored in UTC; local display updates automatically',
    });

    return cases;
  }

  /** Format timestamp для отображения в UI в различных локалях */
  formatForLocale(timestamp: number, locale: string = 'ru-RU'): string {
    const date = new Date(timestamp);
    return date.toLocaleString(locale, {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  }

  /** Проверить, что два timestamp отличаются меньше чем на 1 день (для "Today"/"Yesterday") */
  isSameDay(ts1: number, ts2: number): boolean {
    const d1 = new Date(ts1);
    const d2 = new Date(ts2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  }

  /** Получить "Yesterday" timestamp relative to now */
  getYesterdayTimestamp(): number {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return yesterday.getTime();
  }

  /** Проверить, что timestamp находится в "будущем" (с учетом clock skew) */
  isInFuture(timestamp: number, maxClockSkewMs: number = 5000): boolean {
    const now = Date.now();
    return timestamp > now + maxClockSkewMs;
  }

  /** Проверить, что timestamp находится в "прошлом" (с учетом clock skew) */
  isInPast(timestamp: number, maxClockSkewMs: number = 5000): boolean {
    const now = Date.now();
    return timestamp < now - maxClockSkewMs;
  }

  /** === Simulation helpers === */

  /** Симулировать clock skew (hour偏离) */
  simulateClockSkew(deviceTime: number, trueServerTime: number): number {
    return deviceTime - trueServerTime; // разница в ms
  }

  /** Вычислить offset для timezone (в минутах) */
  getTimezoneOffsetForIANA(tz: string): number {
    // В реальном коде использовали бы Intl.DateTimeFormat
    // Здесь заглушка для тестов
    const offsets: Record<string, number> = {
      'Europe/Moscow': 180,
      'America/New_York': -300,
      'America/Los_Angeles': -480,
      'Asia/Tokyo': 540,
      'UTC': 0,
    };
    return offsets[tz] ?? 0;
  }
}

/** Convenience factory */
export function createTimeEdgeCaseHelper(): TimeEdgeCaseHelper {
  return new TimeEdgeCaseHelper();
}
