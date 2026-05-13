import { motion } from "framer-motion";
import type { ThemeTokens } from "../types";

export function TermsCheckbox({
  checked,
  onChange,
  tokens,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  tokens: ThemeTokens;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className={`flex items-start gap-3 p-3 rounded-xl border backdrop-blur-xl transition-all ${tokens.glassCardSoft} ${
        !checked ? "border-rose-400/30" : ""
      }`}
      onClick={() => onChange(!checked)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onChange(!checked); }}
      aria-label="Я согласен с условиями использования"
    >
      <div
        className={`mt-0.5 w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
          checked
            ? "bg-gradient-to-br from-cyan-400 to-emerald-400 border-cyan-400"
            : tokens.isDark
            ? "border-white/30 bg-white/[0.04]"
            : "border-slate-300 bg-white/50"
        }`}
      >
        {checked && (
          <motion.svg
            className="w-3.5 h-3.5 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
          >
            <polyline points="20 6 9 17 4 12" />
          </motion.svg>
        )}
      </div>
      <p className={`text-[11px] leading-relaxed ${tokens.textSecondary}`}>
        Я согласен с{" "}
        <button
          type="button"
          className={`underline underline-offset-2 hover:opacity-80 ${tokens.textPrimary} font-medium`}
          onClick={(e) => { e.stopPropagation(); }}
        >
          Условиями использования
        </button>
        {" "}и{" "}
        <button
          type="button"
          className={`underline underline-offset-2 hover:opacity-80 ${tokens.textPrimary} font-medium`}
          onClick={(e) => { e.stopPropagation(); }}
        >
          Политикой конфиденциальности
        </button>
      </p>
    </motion.div>
  );
}