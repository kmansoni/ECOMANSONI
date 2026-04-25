import { Shield, ShieldCheck, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "e2ee" | "encrypted" | "verified" | "secure";

interface Props {
  variant?: Variant;
  label?: string;
  className?: string;
  compact?: boolean;
}

const config: Record<Variant, { icon: typeof Shield; text: string }> = {
  e2ee: { icon: Lock, text: "E2E зашифровано" },
  encrypted: { icon: Lock, text: "Зашифровано" },
  verified: { icon: ShieldCheck, text: "Подтверждено" },
  secure: { icon: Shield, text: "Защищено" },
};

export function SecurityBadge({ variant = "secure", label, className, compact }: Props) {
  const { icon: Icon, text } = config[variant];
  const displayText = label ?? text;

  return (
    <span className={cn("security-badge", className)} role="status" aria-label={displayText}>
      <Icon strokeWidth={2.2} />
      {!compact && <span>{displayText}</span>}
    </span>
  );
}
