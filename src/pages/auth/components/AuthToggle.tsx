import { motion } from "framer-motion";
import type { ThemeTokens } from "../types";

export function AuthToggle({
  mode,
  onToggle,
  tokens,
}: {
  mode: "login" | "register";
  onToggle: () => void;
  tokens: ThemeTokens;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center justify-center gap-4 mb-6"
    >
      {/* Toggle pills */}
      <div className="flex rounded-2xl p-1 border backdrop-blur-xl" style={{ background: tokens.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}>
        <motion.button
          onClick={() => onToggle()}
          disabled={mode === "login"}
          className={`relative px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
            mode === "login"
              ? "text-white"
              : tokens.isDark
                ? "text-white/60 hover:text-white/90"
                : "text-slate-500 hover:text-slate-700"
          }`}
          style={
            mode === "login"
              ? { background: tokens.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)", boxShadow: tokens.isDark ? "0 2px 8px rgba(0,0,0,0.3)" : "0 2px 8px rgba(0,0,0,0.1)" }
              : {}
          }
        >
          Вход
        </motion.button>
        <motion.button
          onClick={() => onToggle()}
          disabled={mode === "register"}
          className={`relative px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
            mode === "register"
              ? "text-white"
              : tokens.isDark
                ? "text-white/60 hover:text-white/90"
                : "text-slate-500 hover:text-slate-700"
          }`}
          style={
            mode === "register"
              ? { background: tokens.isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)", boxShadow: tokens.isDark ? "0 2px 8px rgba(0,0,0,0.3)" : "0 2px 8px rgba(0,0,0,0.1)" }
              : {}
          }
        >
          Регистрация
        </motion.button>
      </div>
    </motion.div>
  );
}