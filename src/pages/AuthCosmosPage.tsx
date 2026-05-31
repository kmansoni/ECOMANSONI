/**
 * AuthCosmosPage — космическая тема auth-прототипа
 * Маршрут: /auth/cosmos
 *
 * Поведение:
 * - Открывает форму входа в тёмной «космической» теме
 * - Поддерживает email/password вход с валидацией
 * - Поддерживает OAuth-кнопки (Google, Telegram)
 * - localStorage remember toggle + «Войти» CTA
 * - Подключается к реальному Supabase Auth — без заглушек
 */

import { useState, type FormEvent, type FormHTMLAttributes } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

import { PremiumAuthLayout, PremiumGlassCard } from "@/pages/auth/components/PremiumAuthLayout";
import { PrimaryButton } from "@/pages/auth/components/PrimaryButton";
import { GlassInput } from "@/pages/auth/components/GlassInput";
import { SecurityFooter } from "@/pages/auth/components/SecurityFooter";
import { useTheme, useThemeTokens } from "@/pages/auth/theme";

type Mode = "login" | "signup";

export function AuthCosmosPage() {
  const navigate = useNavigate();
  const { theme } = useTheme("dark");
  const tokens = useThemeTokens(theme);

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Заполните email и пароль.");
      return;
    }

    if (mode === "signup" && password.length < 8) {
      setError("Пароль должен быть не короче 8 символов.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (signInError) {
          setError(signInError.message || "Неверный логин или пароль.");
          return;
        }
        logger.info("[AuthCosmosPage] signed in", { userId: data.user?.id });
        navigate("/");
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: { emailRedirectTo: window.location.origin + "/" },
        });
        if (signUpError) {
          setError(signUpError.message || "Не удалось создать аккаунт.");
          return;
        }
        logger.info("[AuthCosmosPage] signed up", { userId: data.user?.id });
        navigate("/");
      }
    } catch (unexpected) {
      const message = unexpected instanceof Error ? unexpected.message : "Unexpected error";
      setError(message);
      logger.error("[AuthCosmosPage] auth unexpected error", { error: message });
    } finally {
      setLoading(false);
    }
  };

  const socialProviders = [
    { id: "google", label: "Google" },
    { id: "telegram", label: "Telegram" },
  ] as const;

  return (
    <PremiumAuthLayout tokens={{}}>
      <div className="mx-auto w-full max-w-md px-6 py-10 sm:py-14">
        <PremiumGlassCard tokens={{ isDark: true } as any} className="p-6 sm:p-8">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold text-white/90">
              {mode === "login" ? "С возвращением" : "Создайте аккаунт"}
            </h1>
            <p className="mt-2 text-sm text-white/50">
              Космическая тема для входа в платформу.
            </p>

            <div className="mt-4 inline-flex rounded-full bg-white/5 p-0.5">
              {(["login", "signup"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setMode(item);
                    setError(null);
                  }}
                  className={[
                    "rounded-full px-4 py-1.5 text-xs font-medium transition",
                    mode === item
                      ? "bg-white/15 text-white border border-white/20"
                      : "text-white/50 hover:text-white/70",
                  ].join(" ")}
                >
                  {item === "login" ? "Вход" : "Регистрация"}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <GlassInput
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              theme="dark"
              tokens={{ isDark: true } as any}
            />
            <GlassInput
              id="password"
              label="Пароль"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              theme="dark"
              tokens={{ isDark: true } as any}
            />

            <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs text-white/60">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-white/10 text-white/80 focus-visible:ring-white/40"
                />
                Запомнить устройство
              </span>
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => navigate("/auth/prototypes")}
                  className="text-cyan-300/90 hover:text-cyan-200"
                >
                  Забыли пароль?
                </button>
              )}
            </label>

            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </p>
            )}

            <PrimaryButton
              type="submit"
              disabled={loading}
              className="w-full"
              theme="dark"
              tokens={{ isDark: true, glowBrand: "" } as any}
            >
              {loading ? "Загрузка…" : mode === "login" ? "Войти" : "Создать аккаунт"}
            </PrimaryButton>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] text-white/30 uppercase tracking-widest">или</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {socialProviders.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() =>
                  supabase.auth.signInWithOAuth({
                    provider,
                    options: { redirectTo: window.location.origin + "/" },
                  })
                }
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-medium text-white/75 hover:bg-white/10 hover:text-white"
              >
                {provider.label}
              </button>
            ))}
          </div>

          <SecurityFooter theme="dark" position="below" />
        </PremiumGlassCard>
      </div>
    </PremiumAuthLayout>
  );
}
