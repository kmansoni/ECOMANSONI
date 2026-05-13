import { motion } from "framer-motion";
import { BookOpen, GraduationCap, Sparkles, Map, ChevronRight, QrCode } from "lucide-react";
import mansoniLogo from "/brand/mansoni-logo.svg";
import type { ThemeTokens } from "../types";

export function BrandPanel({ tokens }: { tokens: ThemeTokens }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      className="hidden lg:flex flex-col justify-center w-[420px] xl:w-[480px] pr-8 xl:pr-12 py-8"
    >
      {/* Brand logo + tagline */}
      <div className="flex items-center gap-3 mb-2">
        <img
          src={mansoniLogo}
          alt=""
          className="w-11 h-11 sm:w-12 sm:h-12 shrink-0"
          aria-hidden="true"
        />
        <div className="flex flex-col">
          <span
            className="text-[28px] sm:text-[34px] font-bold tracking-[0.1em] uppercase text-gradient-brand"
            style={{
              fontFeatureSettings: '"ss01"',
              textShadow: "0 0 30px rgba(6, 182, 212, 0.2)",
            }}
          >
            mansoni
          </span>
          <span className={`text-[11px] tracking-wide ${tokens.textMuted}`}>
            Всё в одном приложении
          </span>
        </div>
      </div>

      {/* Feature cards */}
      <div className="space-y-3 mt-8">
        {[
          { icon: <BookOpen className="w-5 h-5" />, label: "Мессенджер", desc: "E2E-шифрование, групповые чаты" },
          { icon: <Sparkles className="w-5 h-5" />, label: "Лента и Reels", desc: "Контент от друзей и по интересам" },
          { icon: <Map className="w-5 h-5" />, label: "Навигация", desc: "Маршруты, трафик, офлайн-карты" },
          { icon: <GraduationCap className="w-5 h-5" />, label: "Маркетплейс", desc: "Покупки без лишних приложений" },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.5 + i * 0.1 }}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 border backdrop-blur-xl ${tokens.glassCard}`}
          >
            <span className={`shrink-0 ${tokens.textPrimary}`}>{item.icon}</span>
            <div className="flex-1 min-w-0">
              <span className={`text-sm font-semibold ${tokens.textPrimary}`}>{item.label}</span>
              <span className={`text-xs block mt-0.5 ${tokens.textMuted}`}>{item.desc}</span>
            </div>
            <ChevronRight className={`w-4 h-4 shrink-0 ${tokens.textFaint}`} />
          </motion.div>
        ))}
      </div>

      {/* QR Login Card */}
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.7 }}
        type="button"
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          const el = document.getElementById("qr-section");
          el?.scrollIntoView({ behavior: "smooth" });
        }}
        className={`flex items-center gap-3 rounded-2xl px-4 py-3 border backdrop-blur-xl transition-all duration-200 hover:border-white/[0.12] ${tokens.glassCard}`}
      >
        <QrCode className={`w-5 h-5 ${tokens.textPrimary}`} />
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-semibold ${tokens.textPrimary}`}>Войти по QR-коду</span>
          <span className={`text-xs block mt-0.5 ${tokens.textMuted}`}>Быстрый вход с телефона</span>
        </div>
        <ChevronRight className={`w-4 h-4 shrink-0 ${tokens.textFaint}`} />
      </motion.button>

      {/* Trust badge */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className={`p-4 rounded-2xl border backdrop-blur-xl ${tokens.glassCardSoft}`}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className={`text-xs font-medium ${tokens.textPrimary}`}>Защита данных</span>
        </div>
        <p className={`text-[11px] leading-relaxed ${tokens.textMuted}`}>
          E2E-шифрование · RLS-безопасность · TLS 1.3 · AES-256 на устройстве
        </p>
      </motion.div>
    </motion.div>
  );
}