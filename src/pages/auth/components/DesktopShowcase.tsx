import { motion } from "framer-motion";
import type { ThemeTokens } from "../types";
import { KIND_TIPS } from "./KindTipsTicker";

export function DesktopShowcase({ tokens }: { tokens: ThemeTokens }) {
  return (
    <div className="hidden lg:flex flex-col justify-center max-w-[420px] xl:max-w-[480px] mr-10 xl:mr-16 py-8">
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      >
        <h2 className={`text-[38px] xl:text-[44px] font-bold leading-[1.1] tracking-tight mb-4 ${tokens.textPrimary}`}>
          Всё в одном
          <br />
          <span className="text-gradient-brand">приложении</span>
        </h2>
        <p className={`text-base xl:text-lg leading-relaxed mb-8 ${tokens.textSecondary}`}>
          Мессенджер, соцсеть, маркетплейс, такси, страхование — единый аккаунт с E2E-шифрованием.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.5 }}
        className="space-y-3"
      >
        {[
          { icon: "💬", label: "Мессенджер", desc: "E2E-шифрование, без рекламы" },
          { icon: "📱", label: "Соцсеть и Reels", desc: "Лента, сторис, видео" },
          { icon: "🛒", label: "Маркетплейс", desc: "Покупки без лишних приложений" },
          { icon: "🚕", label: "Такси и доставка", desc: "Поездки прямо из чата" },
          { icon: "🛡️", label: "Страхование", desc: "Полис за 2 минуты" },
        ].map((item) => (
          <div key={item.label} className={`flex items-center gap-3 rounded-xl px-4 py-3 border backdrop-blur-xl ${tokens.glassCard}`}>
            <span className="text-xl shrink-0">{item.icon}</span>
            <div>
              <span className={`text-sm font-semibold ${tokens.textPrimary}`}>{item.label}</span>
              <span className={`text-xs ml-2 ${tokens.textMuted}`}>{item.desc}</span>
            </div>
          </div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className={`mt-8 p-4 rounded-xl border backdrop-blur-xl ${tokens.glassCard}`}
      >
        <p className={`text-xs italic leading-relaxed ${tokens.textSecondary}`}>
          «{KIND_TIPS[Math.floor(Date.now() / 86400000) % KIND_TIPS.length].body}»
        </p>
        <p className={`text-[11px] mt-1.5 font-medium ${tokens.textMuted}`}>
          — {KIND_TIPS[Math.floor(Date.now() / 86400000) % KIND_TIPS.length].title}
        </p>
      </motion.div>
    </div>
  );
}
