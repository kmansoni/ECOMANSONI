import { motion } from "framer-motion";
import type { ThemeTokens } from "../types";

export function FormDivider({ tokens, label = "или" }: { tokens: ThemeTokens; label?: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px" style={{ background: tokens.isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }} />
      <span className={`text-xs uppercase tracking-[0.15em] select-none ${tokens.textMuted}`}>{label}</span>
      <div className="flex-1 h-px" style={{ background: tokens.isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }} />
    </div>
  );
}