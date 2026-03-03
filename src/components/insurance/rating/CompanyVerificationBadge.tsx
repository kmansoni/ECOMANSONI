import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type VerificationLevel = "registered" | "verified" | "partner" | "premium";

const LEVELS: Record<VerificationLevel, { icon: string; label: string; desc: string; className: string }> = {
  registered: {
    icon: "🔵",
    label: "Зарегистрирована",
    desc: "Компания создала профиль на платформе",
    className: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  },
  verified: {
    icon: "✅",
    label: "Верифицирована",
    desc: "Лицензия проверена Центральным банком РФ",
    className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
  partner: {
    icon: "⭐",
    label: "Партнёр",
    desc: "Прямая интеграция с платформой Mansoni",
    className: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  },
  premium: {
    icon: "👑",
    label: "Премиум партнёр",
    desc: "Расширенные возможности и приоритетная поддержка",
    className: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  },
};

interface CompanyVerificationBadgeProps {
  level: VerificationLevel;
  showLabel?: boolean;
}

export function CompanyVerificationBadge({ level, showLabel = true }: CompanyVerificationBadgeProps) {
  const config = LEVELS[level];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium cursor-help ${config.className}`}
          >
            <span>{config.icon}</span>
            {showLabel && <span>{config.label}</span>}
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="bg-zinc-900 border-white/10 text-white text-xs max-w-48">
          <p className="font-semibold mb-0.5">{config.label}</p>
          <p className="text-white/60">{config.desc}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
