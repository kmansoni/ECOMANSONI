/**
 * AuthShowcasePage — showcase существующих auth-компонентов
 * Маршрут: /auth/showcase
 *
 * Поведение:
 * - Переключает демо-вкладки (overview, components, themes, animations)
 * - Рендерит только доступные компоненты из src/pages/auth/components/
 * - Кнопка «Try the Live Demo» ведёт на /auth
 */

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import type { ThemeTokens } from "@/pages/auth/types";
import { useTheme, useThemeTokens } from "@/pages/auth/theme";

import { PremiumAuthLayout, PremiumGlassCard } from "@/pages/auth/components/PremiumAuthLayout";
import { GlassInput } from "@/pages/auth/components/GlassInput";
import { PrimaryButton } from "@/pages/auth/components/PrimaryButton";

const DEMOS = [
  { id: "overview", label: "Overview", description: "Auth design overview" },
  { id: "components", label: "Components", description: "Available auth components" },
  { id: "themes", label: "Themes", description: "Theme variations" },
  { id: "animations", label: "Animations", description: "Motion demonstrations" },
] as const;

export function AuthShowcasePage() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme("dark");
  const tokens = useThemeTokens(theme);
  const [currentDemo, setCurrentDemo] = useState<string>("overview");

  return (
    <PremiumAuthLayout tokens={tokens}>
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        {/* Demo Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {DEMOS.map((demo) => (
            <button
              key={demo.id}
              type="button"
              onClick={() => setCurrentDemo(demo.id)}
              className={[
                "rounded-full px-4 py-2 text-xs font-medium transition",
                currentDemo === demo.id
                  ? "bg-white/15 text-white border border-white/25"
                  : "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white/80",
              ].join(" ")}
            >
              {demo.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {currentDemo === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              <PremiumGlassCard tokens={tokens} className="p-6">
                <h2 className="text-xl font-bold text-white/90 mb-4">Complete Auth Flow</h2>
                <p className="text-white/60 text-sm mb-4">
                  Полный путь аутентификации: от ввода контактов до успешного входа в платформу.
                </p>
                <div className="grid gap-3">
                  {[
                    { step: "1", title: "Phone / Email", desc: "Безопасный ввод с валидацией" },
                    { step: "2", title: "OTP Verification", desc: "Подтверждение по коду с таймером" },
                    { step: "3", title: "Profile Setup", desc: "Заполнение личных данных" },
                    { step: "4", title: "Onboarding", desc: "Персонализированные рекомендации" },
                  ].map((item) => (
                    <div key={item.step} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="w-7 h-7 rounded-md bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
                        {item.step}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white/90">{item.title}</h3>
                        <p className="text-xs text-white/50">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5">
                  <PrimaryButton onClick={() => navigate("/auth")} className="w-full">
                    Try the Live Demo
                  </PrimaryButton>
                </div>
              </PremiumGlassCard>
            </motion.div>
          )}

          {currentDemo === "components" && (
            <motion.div
              key="components"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="grid gap-6"
            >
              <PremiumGlassCard tokens={tokens} className="p-6">
                <h3 className="font-semibold text-white/90 mb-4">GlassInput</h3>
                <div className="space-y-4">
                  <GlassInput id="demo-email" label="Email" value="" onChange={() => {}} tokens={tokens} />
                  <GlassInput id="demo-password" label="Password" type="password" value="" onChange={() => {}} tokens={tokens} />
                </div>
              </PremiumGlassCard>

              <PremiumGlassCard tokens={tokens} className="p-6">
                <h3 className="font-semibold text-white/90 mb-4">PrimaryButton</h3>
                <div className="space-y-3">
                  <PrimaryButton onClick={() => {}} className="w-full">Primary Action</PrimaryButton>
                  <PrimaryButton disabled className="w-full">Disabled</PrimaryButton>
                </div>
              </PremiumGlassCard>
            </motion.div>
          )}

          {currentDemo === "themes" && (
            <motion.div
              key="themes"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="grid gap-6"
            >
              <PremiumGlassCard tokens={tokens} className="p-6">
                <h3 className="font-semibold text-white/90 mb-2">Dark Theme (Current)</h3>
                <p className="text-sm text-white/60">Низкое напряжение глаз, энергосбережение на OLED, усиленный фокус на контенте.</p>
                <button
                  type="button"
                  onClick={toggle}
                  className="mt-4 w-full px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-sm text-white/80 hover:bg-white/10"
                >
                  Switch to Light Theme
                </button>
              </PremiumGlassCard>

              <PremiumGlassCard tokens={tokens} className="p-6">
                <h3 className="font-semibold text-white/90 mb-2">Light Theme</h3>
                <p className="text-sm text-white/60">Чистый и контрастный стиль для дневного использования.</p>
              </PremiumGlassCard>
            </motion.div>
          )}

          {currentDemo === "animations" && (
            <motion.div
              key="animations"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="grid gap-6"
            >
              <PremiumGlassCard tokens={tokens} className="p-6">
                <h3 className="font-semibold text-white/90 mb-4">Micro-interactions</h3>
                <div className="flex items-center gap-4">
                  <PrimaryButton onClick={() => {}} className="w-10 h-10 rounded-full border-none bg-gradient-to-br from-cyan-400 to-blue-500">
                    <span className="text-white text-sm">⚡</span>
                  </PrimaryButton>
                  <p className="text-sm text-white/60">Масштабирование и цвет на нажатии.</p>
                </div>
              </PremiumGlassCard>

              <PremiumGlassCard tokens={tokens} className="p-6">
                <h3 className="font-semibold text-white/90 mb-4">Input Focus Animation</h3>
                <GlassInput id="demo-anim" label="Animated" value="" onChange={() => {}} tokens={tokens} />
              </PremiumGlassCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PremiumAuthLayout>
  );
}
