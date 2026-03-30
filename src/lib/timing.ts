/**
 * Именованные интервалы/таймауты, используемые в production-коде.
 * Центральное место для настройки всех polling-частот и задержек.
 */

/** KPI-дашборд: частота автообновления (мс) */
export const DASHBOARD_REFRESH_MS = 60_000;

/** JIT-запросы: частота polling (мс) */
export const JIT_POLL_MS = 10_000;

/** Онлайн-статус: интервал проверки (мс) */
export const PRESENCE_POLL_MS = 30_000;

/** Vanish-mode: задержка удаления прочитанных сообщений (мс) */
export const VANISH_DELETE_DELAY_MS = 3_000;
