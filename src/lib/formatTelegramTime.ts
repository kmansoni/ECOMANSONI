import { format, isToday, isYesterday, isThisWeek, isThisYear } from "date-fns";
import { ru } from "date-fns/locale";

/**
 * Telegram-style time formatting:
 * - Today: "10:35"
 * - Yesterday: "Вчера"
 * - This week: "Пн", "Вт", "Ср"...
 * - This year: "15 янв"
 * - Older: "15.01.24"
 */
export function formatTelegramTime(dateStr: string | Date): string {
  try {
    const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
    if (isNaN(date.getTime())) return "";

    if (isToday(date)) {
      return format(date, "HH:mm");
    }
    if (isYesterday(date)) {
      return "Вчера";
    }
    if (isThisWeek(date, { weekStartsOn: 1 })) {
      return format(date, "EEEEEE", { locale: ru }); // "Пн", "Вт"...
    }
    if (isThisYear(date)) {
      return format(date, "d MMM", { locale: ru }); // "15 янв"
    }
    return format(date, "dd.MM.yy");
  } catch {
    return "";
  }
}

/**
 * Full message timestamp: always "HH:mm"
 */
export function formatMessageTime(dateStr: string | Date): string {
  try {
    const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
    if (isNaN(date.getTime())) return "";
    return format(date, "HH:mm");
  } catch {
    return "";
  }
}
