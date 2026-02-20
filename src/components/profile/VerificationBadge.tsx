import { Badge } from "@/components/ui/badge";

interface VerificationBadgeProps {
  type: "owner" | "verified" | "professional" | "business";
  size?: "sm" | "md" | "lg";
}

export function VerificationBadge({ type, size = "md" }: VerificationBadgeProps) {
  const badgeConfig = {
    owner: {
      icon: "👑",
      label: "Владелец",
      className: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-300/50",
    },
    verified: {
      icon: "✓",
      label: "Проверено",
      className: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-300/50",
    },
    professional: {
      icon: "⭐",
      label: "Профессионал",
      className: "bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-300/50",
    },
    business: {
      icon: "🏢",
      label: "Бизнес",
      className: "bg-green-500/20 text-green-600 dark:text-green-400 border-green-300/50",
    },
  };

  const config = badgeConfig[type];

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <Badge className={`${config.className} ${sizeClasses[size]} rounded-full border`}>
      <span className="mr-1">{config.icon}</span>
      {config.label}
    </Badge>
  );
}

interface VerificationBadgesProps {
  verifications?: Array<{ type: string; is_active?: boolean }>;
  size?: "sm" | "md" | "lg";
}

export function VerificationBadges({ verifications, size = "md" }: VerificationBadgesProps) {
  if (!verifications || verifications.length === 0) return null;

  const activeVerifications = verifications.filter((v) => v.is_active !== false);
  if (activeVerifications.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {activeVerifications.map((v) => (
        <VerificationBadge key={v.type} type={v.type as any} size={size} />
      ))}
    </div>
  );
}
