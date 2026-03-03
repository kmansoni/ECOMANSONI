import type { InsuranceCategory, PolicyStatus, ApplicationStatus, ClaimStatus } from "@/types/insurance";
import {
  CATEGORY_CONFIG,
  POLICY_STATUS_LABELS,
  POLICY_STATUS_BADGE_COLORS,
  APPLICATION_STATUS_LABELS,
  CLAIM_STATUS_LABELS,
  CLAIM_STATUS_COLORS,
  KBM_TABLE,
} from "./constants";

/**
 * Форматирует страховую премию в читаемый вид
 * @example formatPremium(12500) => "12 500 ₽"
 */
export function formatPremium(amount: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Форматирует страховую сумму (покрытие)
 * @example formatCoverage(1000000) => "1 000 000 ₽"
 */
export function formatCoverage(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    if (Number.isInteger(millions)) {
      return `${millions} млн ₽`;
    }
    return `${millions.toFixed(1)} млн ₽`;
  }
  return formatPremium(amount);
}

/**
 * Форматирует дату полиса в краткий вид
 * @example formatPolicyDate("2026-03-15") => "15 мар 2026"
 */
export function formatPolicyDate(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Форматирует период действия полиса
 * @example formatPolicyPeriod("2026-03-15", "2027-03-14") => "15.03.2026 — 14.03.2027"
 */
export function formatPolicyPeriod(start: string, end: string): string {
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  };

  return `${formatDate(start)} — ${formatDate(end)}`;
}

/**
 * Форматирует класс КБМ с коэффициентом
 * @example formatKbmClass(3) => "КБМ 3 (1.0)"
 */
export function formatKbmClass(kbmClass: number): string {
  const coefficient = KBM_TABLE[Math.max(0, Math.min(13, kbmClass))];
  if (coefficient === undefined) return `КБМ ${kbmClass}`;
  return `КБМ ${kbmClass} (${coefficient})`;
}

/**
 * Возвращает русскоязычное название категории страхования
 */
export function getCategoryLabel(category: InsuranceCategory): string {
  return CATEGORY_CONFIG[category]?.label ?? category;
}

/**
 * Возвращает название иконки (lucide-react) для категории страхования
 */
export function getCategoryIcon(category: InsuranceCategory): string {
  return CATEGORY_CONFIG[category]?.icon ?? "Shield";
}

/**
 * Возвращает tailwind CSS цвет для категории страхования
 */
export function getCategoryColor(category: InsuranceCategory): string {
  return CATEGORY_CONFIG[category]?.color ?? "text-violet-400";
}

/**
 * Возвращает tailwind CSS цвет фона для категории страхования
 */
export function getCategoryBgColor(category: InsuranceCategory): string {
  return CATEGORY_CONFIG[category]?.bgColor ?? "bg-violet-500/10";
}

/**
 * Возвращает русскоязычную метку для статуса
 */
export function getStatusLabel(
  status: PolicyStatus | ApplicationStatus | ClaimStatus,
): string {
  if (status in POLICY_STATUS_LABELS) {
    return POLICY_STATUS_LABELS[status as PolicyStatus];
  }
  if (status in APPLICATION_STATUS_LABELS) {
    return APPLICATION_STATUS_LABELS[status as ApplicationStatus];
  }
  if (status in CLAIM_STATUS_LABELS) {
    return CLAIM_STATUS_LABELS[status as ClaimStatus];
  }
  return status;
}

/**
 * Возвращает tailwind CSS классы для отображения статуса в виде badge
 */
export function getStatusColor(status: string): string {
  if (status in POLICY_STATUS_BADGE_COLORS) {
    return POLICY_STATUS_BADGE_COLORS[status as PolicyStatus];
  }
  if (status in CLAIM_STATUS_COLORS) {
    return CLAIM_STATUS_COLORS[status as ClaimStatus];
  }

  // Общие цвета для статусов заявок
  const applicationColors: Record<string, string> = {
    draft: "bg-gray-500/20 text-gray-400",
    calculating: "bg-blue-500/20 text-blue-400",
    quoted: "bg-cyan-500/20 text-cyan-400",
    applying: "bg-violet-500/20 text-violet-400",
    documents_required: "bg-yellow-500/20 text-yellow-400",
    under_review: "bg-orange-500/20 text-orange-400",
    approved: "bg-emerald-500/20 text-emerald-400",
    payment_pending: "bg-yellow-500/20 text-yellow-400",
    paid: "bg-blue-500/20 text-blue-400",
    issued: "bg-emerald-500/20 text-emerald-400",
    rejected: "bg-red-500/20 text-red-400",
    cancelled: "bg-gray-500/20 text-gray-400",
  };

  return applicationColors[status] ?? "bg-gray-500/20 text-gray-400";
}

/**
 * Возвращает количество дней до истечения полиса
 */
export function getDaysUntilExpiry(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Вычисляет процент прохождения срока действия полиса
 * @returns число от 0 до 100
 */
export function getPolicyProgressPercent(startDate: string, endDate: string): number {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = Date.now();

  if (now <= start) return 0;
  if (now >= end) return 100;

  return Math.round(((now - start) / (end - start)) * 100);
}

/**
 * Форматирует рейтинг компании
 * @example formatRating(4.7) => "4.7"
 */
export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

/**
 * Форматирует число отзывов
 * @example formatReviewsCount(1250) => "1 250 отзывов"
 */
export function formatReviewsCount(count: number): string {
  const formatted = new Intl.NumberFormat("ru-RU").format(count);
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return `${formatted} отзывов`;
  }
  if (lastDigit === 1) return `${formatted} отзыв`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${formatted} отзыва`;
  return `${formatted} отзывов`;
}
