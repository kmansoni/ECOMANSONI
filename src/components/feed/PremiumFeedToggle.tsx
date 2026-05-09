import { motion } from "framer-motion";
import { Sparkles, Users, Clock } from "lucide-react";
import type { ThemeTokens } from "../auth/types";
import type { FeedMode } from "@/hooks/useSmartFeed";

const TABS: { id: FeedMode; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "smart", label: "Для вас", Icon: Sparkles },
  { id: "following", label: "Подписки", Icon: Users },
  { id: "chronological", label: "Новое", Icon: Clock },
];

export function PremiumFeedToggle({ mode, onChange, tokens }: { mode: FeedMode; onChange: (mode: FeedMode) => void; tokens: ThemeTokens }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-1 rounded-2xl backdrop-blur-xl transition-all duration-300"
      style={{ background: tokens.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", border: `1px solid ${tokens.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)"}` }}
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = mode === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200"
            style={{
              color: isActive
                ? "#fff"
                : tokens.isDark
                ? "rgba(255,255,255,0.6)"
                : "rgba(0,0,0,0.55)",
            }}
          >
            {isActive && (
              <motion.div
                layoutId="feed-toggle-pill"
                className="absolute inset-0 rounded-xl"
                initial={false}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                style={{
                  background: "linear-gradient(135deg, #0096c7, #00c896)",
                  boxShadow: "0 4px 16px rgba(0,180,216,0.3)",
                }}
              />
            )}
            <Icon className={`relative z-10 h-4 w-4 transition-colors ${isActive ? "text-white" : tokens.isDark ? "text-white/60" : "text-slate-500"}`} />
            <span className={`relative z-10 font-medium transition-colors ${isActive ? "text-white" : tokens.isDark ? "text-white/60" : "text-slate-500"}`}>
              {label}
            </span>
          </button>
        );
      })}
    </motion.div>
  );
}