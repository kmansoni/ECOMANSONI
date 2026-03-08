import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";

export function formatDateLabel(date: Date): string {
  if (isToday(date)) return "Сегодня";
  if (isYesterday(date)) return "Вчера";
  return format(date, "d MMMM yyyy", { locale: ru });
}
