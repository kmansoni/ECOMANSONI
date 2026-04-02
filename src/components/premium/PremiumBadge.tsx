/**
 * PremiumBadge — значок Premium рядом с именем пользователя.
 * Градиент: basic=синий, pro=золотой, business=фиолетовый.
 */

import type { PlanType } from "@/hooks/usePremium";

interface PremiumBadgeProps {
  plan: PlanType;
  size?: "sm" | "md";
}

const PLAN_STYLES: Record<PlanType, { gradient: string; label: string }> = {
  basic: { gradient: "from-blue-400 to-blue-600", label: "Basic" },
  pro: { gradient: "from-amber-400 to-yellow-500", label: "Pro" },
  business: { gradient: "from-purple-400 to-violet-600", label: "Business" },
};

export function PremiumBadge({ plan, size = "sm" }: PremiumBadgeProps) {
  const style = PLAN_STYLES[plan];
  const sizeClasses = size === "sm"
    ? "px-1.5 py-0.5 text-[10px]"
    : "px-2 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r ${style.gradient} text-white font-semibold leading-tight ${sizeClasses}`}
      title={`Premium ${style.label}`}
      aria-label={`Premium ${style.label}`}
    >
      ★ {style.label}
    </span>
  );
}
