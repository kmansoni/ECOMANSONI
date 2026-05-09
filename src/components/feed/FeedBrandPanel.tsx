import { motion } from "framer-motion";
import type { ThemeTokens } from "@/pages/auth/types";

export function FeedBrandPanel({ tokens }: { tokens: ThemeTokens }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      className="hidden lg:flex flex-col justify-between w-[320px] xl:w-[380px] pr-8 xl:pr-12 py-8 sticky top-0 h-screen"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Brand section */}
      <div>
        <div className="flex items-center gap-3 mb-8">
          <img
            src="/brand/mansoni-logo.svg"
            alt=""
            className="w-10 h-10 sm:w-12 sm:h-12 shrink-0"
            aria-hidden="true"
          />
          <span
            className="text-[28px] sm:text-[34px] font-bold tracking-[0.1em] uppercase text-gradient-brand"
            style={{
              fontFeatureSettings: '"ss01"',
              textShadow: "0 0 30px rgba(6, 182, 212, 0.2)",
            }}
          >
            mansoni
          </span>
        </div>

        <h2 className={`text-[28px] xl:text-[34px] font-bold leading-[1.1] tracking-tight mb-3 ${tokens.textPrimary}`}>
          Ваша лента
        </h2>
        <p className={`text-base xl:text-lg leading-relaxed mb-6 max-w-[300px] ${tokens.textSecondary}`}>
          Актуальные публикации от ваших подписок и рекомендации
        </p>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2 mb-8">
          {[
            { label: "Подписки", value: "142" },
            { label: "Публикации", value: "2.4K" },
            { label: "Рекомендации", value: "38" },
          ].map((item) => (
            <div
              key={item.label}
              className={`rounded-xl border backdrop-blur-xl p-3 text-center ${tokens.glassCard}`}
            >
              <div className={`text-xl font-bold ${tokens.textPrimary}`}>{item.value}</div>
              <div className={`text-[10px] uppercase tracking-[0.1em] mt-0.5 ${tokens.textMuted}`}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom trust section */}
      <div className={`p-4 rounded-2xl border backdrop-blur-xl ${tokens.glassSoft}`}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className={`text-xs font-medium ${tokens.textPrimary}`}>Защита данных</span>
        </div>
        <p className={`text-[11px] leading-relaxed ${tokens.textMuted}`}>
          E2E-шифрование · RLS-безопасность · TLS 1.3
        </p>
      </div>
    </motion.div>
  );
}