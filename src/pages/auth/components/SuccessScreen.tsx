import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Sparkles, PartyPopper } from "lucide-react";
import type { ThemeTokens } from "../types";

export function SuccessScreen({
  tokens,
  displayName,
  onContinue,
}: {
  tokens: ThemeTokens;
  displayName?: string;
  onContinue: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center text-center py-8 px-4"
    >
      {/* Confetti burst animation */}
      <div className="relative mb-4">
        {/* Decorative particles */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: 0.6 + i * 0.08,
              duration: 0.5,
              type: "spring",
              stiffness: 300,
              damping: 12,
            }}
            className="absolute w-1.5 h-1.5 rounded-full"
            style={{
              background: ["#00b4d8", "#00c896", "#4fd080", "#60a5fa", "#a78bfa", "#f472b6"][i % 6],
              left: `${20 + Math.cos((i / 8) * Math.PI * 2) * 50}%`,
              top: `${20 + Math.sin((i / 8) * Math.PI * 2) * 50}%`,
            }}
          />
        ))}

        {/* Main icon */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
          className="relative w-24 h-24 rounded-full bg-gradient-to-br from-cyan-400/30 to-emerald-400/30 flex items-center justify-center mb-2"
        >
          <div className="absolute inset-0 rounded-full border border-cyan-400/20 animate-pulse" />
          <div className="absolute inset-3 rounded-full border border-emerald-400/20 animate-pulse delay-300" />
          <CheckCircle className="w-12 h-12 text-white" strokeWidth={2.5} />
        </motion.div>
      </div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.4 }}
        className={`text-[28px] sm:text-[32px] font-bold tracking-tight mb-3 ${tokens.textPrimary}`}
      >
        Добро пожаловать!
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.75, duration: 0.4 }}
        className={`text-sm sm:text-base ${tokens.textSecondary} max-w-[300px] leading-relaxed`}
      >
        {displayName
          ? `${displayName}, ваш аккаунт успешно создан!`
          : "Ваш аккаунт успешно создан!"}
        <br />
        Готовим ваше персональное пространство...
      </motion.p>

      {/* Progress dots */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.4 }}
        className="flex items-center gap-2 mt-8 mb-4"
      >
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.1 + i * 0.15 }}
            className={`w-2 h-2 rounded-full ${i === 0 ? "bg-cyan-400" : i === 1 ? "bg-teal-400" : "bg-emerald-400"}`}
            style={{ boxShadow: i === 0 ? "0 0 8px rgba(0,180,216,0.5)" : i === 1 ? "0 0 8px rgba(0,200,150,0.5)" : "0 0 8px rgba(79,208,128,0.5)" }}
          />
        ))}
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.3, duration: 0.4 }}
        className={`text-xs ${tokens.textFaint} mb-6`}
      >
        Это займёт всего несколько секунд
      </motion.p>

      {/* Continue button */}
      <motion.button
        onClick={onContinue}
        whileTap={{ scale: 0.96 }}
        type="button"
        className={`relative h-12 w-full max-w-[280px] rounded-2xl overflow-hidden font-semibold text-white transition-all duration-300 ${tokens.glowBrand}`}
        style={{ background: "linear-gradient(135deg,#0096c7 0%,#00b4d8 40%,#00c896 100%)" }}
      >
        <motion.span
          className="absolute inset-y-4 -left-1/3 w-1/3 rotate-12 bg-white/30 blur-md"
          animate={{ x: ["0%", "450%"] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
        />
        <span className="relative flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4" />
          Начать
        </span>
      </motion.button>
    </motion.div>
  );
}