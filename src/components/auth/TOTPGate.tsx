/**
 * TOTPGate — full-screen 2FA verification overlay (liquid-glass).
 *
 * Renders after login if user has TOTP enabled. On success calls onSuccess();
 * on failure shows inline error and resets input. Visual style matches AuthPage.
 */

import { useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, KeyRound, Lock, LogOut, Moon, Sun } from "lucide-react";

import {
  AuroraBackground,
  useGlassTheme,
  useGlassTokens,
  BRAND_GRADIENT,
  type GlassTokens,
} from "@/components/ui/glass";
import { GlassPrimaryButton } from "@/components/ui/glass/GlassPrimaryButton";
import { GlassSecondaryButton } from "@/components/ui/glass/GlassSecondaryButton";
import { cn } from "@/lib/utils";
import { useTOTP } from "@/hooks/useTOTP";

interface TOTPGateProps {
  onSuccess: () => void;
  onSignOut?: () => void;
}

function OTPInput({
  value,
  onChange,
  onComplete,
  disabled,
  tokens,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  tokens: GlassTokens;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 6);
    onChange(raw);
    if (raw.length === 6) onComplete?.(raw);
  };

  return (
    <div className="relative flex gap-2 sm:gap-3 justify-center select-none">
      {Array.from({ length: 6 }, (_, i) => {
        const isActive = i === value.length;
        const filled = !!value[i];
        return (
          <div
            key={i}
            onClick={() => inputRef.current?.focus()}
            className={cn(
              "w-11 h-14 sm:w-12 sm:h-14 flex items-center justify-center rounded-2xl border text-xl font-bold cursor-text transition-all backdrop-blur-xl",
              isActive
                ? tokens.inputFocusRing
                : tokens.glassInput,
              filled ? tokens.textPrimary : tokens.textFaint,
            )}
          >
            {value[i] ?? ""}
          </div>
        );
      })}
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        autoFocus
        className="absolute inset-0 opacity-0 cursor-text"
        autoComplete="one-time-code"
        aria-label="Код двухфакторной аутентификации"
      />
    </div>
  );
}

function BackupInput({
  onSubmit,
  onCancel,
  isLoading,
  error,
  tokens,
}: {
  onSubmit: (code: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
  tokens: GlassTokens;
}) {
  const [code, setCode] = useState("");

  return (
    <div className="flex flex-col gap-4 w-full">
      <p className={cn("text-sm text-center", tokens.textMuted)}>
        Введите один из резервных кодов в формате <span className="font-mono">XXXXXX-XXXXXX</span>
      </p>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABCDEF-123456"
        disabled={isLoading}
        className={cn(
          "w-full h-14 rounded-2xl border backdrop-blur-xl px-4 text-center font-mono tracking-widest outline-none transition",
          tokens.glassInput,
          tokens.textPrimary,
        )}
        autoFocus
        autoComplete="off"
      />
      {error && <p className="text-rose-400 text-sm text-center">{error}</p>}
      <GlassPrimaryButton
        variant="brand"
        icon={<KeyRound className="h-5 w-5" />}
        onClick={() => onSubmit(code)}
        disabled={code.length < 13 || isLoading}
        loading={isLoading}
      >
        Продолжить
      </GlassPrimaryButton>
      <GlassSecondaryButton
        size="md"
        icon={<ChevronLeft className="h-5 w-5" />}
        onClick={onCancel}
      >
        Вернуться к коду TOTP
      </GlassSecondaryButton>
    </div>
  );
}

export default function TOTPGate({ onSuccess, onSignOut }: TOTPGateProps) {
  const { validate, useBackupCode: submitBackupCode, isLoading, error } = useTOTP();
  const { theme, toggle } = useGlassTheme("dark");
  const tokens = useGlassTokens(theme);

  const [token, setToken] = useState("");
  const [showBackup, setShowBackup] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleTOTP(code: string) {
    setLocalError(null);
    const ok = await validate(code);
    if (ok) {
      onSuccess();
    } else {
      setToken("");
      setLocalError(error ?? "Неверный код. Попробуйте ещё раз.");
    }
  }

  async function handleBackup(code: string) {
    setLocalError(null);
    const ok = await submitBackupCode(code);
    if (ok) onSuccess();
    else setLocalError(error ?? "Неверный или уже использованный код.");
  }

  return (
    <div
      className={cn(
        theme === "dark" ? "dark" : "",
        "fixed inset-0 z-[9999] overflow-hidden font-[Manrope,system-ui,sans-serif]",
        tokens.textPrimary,
      )}
      style={{ colorScheme: theme }}
      role="dialog"
      aria-modal="true"
      aria-label="Двухфакторная аутентификация"
    >
      <AuroraBackground theme={theme} />

      <div className="relative z-10 flex min-h-full items-center justify-center px-4 py-6">
        <div className="relative w-full max-w-[420px]">
          <div
            className={cn(
              "pointer-events-none absolute -inset-4 sm:-inset-6 rounded-[2.2rem] blur-2xl opacity-70",
              tokens.isDark
                ? "bg-gradient-to-br from-cyan-500/20 via-teal-500/15 to-emerald-400/20"
                : "bg-gradient-to-br from-cyan-300/35 via-teal-300/30 to-emerald-300/35",
            )}
          />

          <div
            className={cn(
              "relative rounded-[1.5rem] sm:rounded-[2rem] p-6 sm:p-8 border backdrop-blur-2xl overflow-hidden",
              tokens.glassCard,
              tokens.glassCardShadow,
            )}
          >
            <motion.button
              onClick={toggle}
              whileTap={{ scale: 0.9, rotate: 180 }}
              className={cn(
                "absolute top-4 right-4 h-10 w-10 rounded-full border backdrop-blur-xl flex items-center justify-center transition z-20",
                tokens.iconBtn,
              )}
              aria-label="Переключить тему"
            >
              <AnimatePresence mode="wait" initial={false}>
                {theme === "dark" ? (
                  <motion.span key="moon" initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 90 }}>
                    <Moon className="h-5 w-5" />
                  </motion.span>
                ) : (
                  <motion.span key="sun" initial={{ opacity: 0, rotate: 90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: -90 }}>
                    <Sun className="h-5 w-5" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            <div className="flex flex-col items-center text-center mb-6">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 16 }}
                className="relative h-16 w-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: BRAND_GRADIENT, boxShadow: "0 20px 60px -15px rgba(0,180,216,0.55)" }}
              >
                <Lock className="h-7 w-7 text-white" strokeWidth={2.4} />
              </motion.div>
              <h1 className={cn("text-2xl font-bold tracking-tight", tokens.textPrimary)}>
                Двухфакторная аутентификация
              </h1>
              <p className={cn("mt-2 text-sm max-w-xs", tokens.textMuted)}>
                {showBackup
                  ? "Используйте резервный код для входа."
                  : "Введите 6-значный код из приложения-аутентификатора."}
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {showBackup ? (
                <BackupInput
                  onSubmit={handleBackup}
                  onCancel={() => {
                    setShowBackup(false);
                    setLocalError(null);
                  }}
                  isLoading={isLoading}
                  error={localError}
                  tokens={tokens}
                />
              ) : (
                <>
                  <OTPInput
                    value={token}
                    onChange={setToken}
                    onComplete={handleTOTP}
                    disabled={isLoading}
                    tokens={tokens}
                  />
                  {localError && <p className="text-rose-400 text-sm text-center">{localError}</p>}
                  <GlassPrimaryButton
                    variant="brand"
                    icon={<KeyRound className="h-5 w-5" />}
                    onClick={() => handleTOTP(token)}
                    disabled={token.length < 6 || isLoading}
                    loading={isLoading}
                  >
                    Войти
                  </GlassPrimaryButton>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBackup(true);
                      setLocalError(null);
                      setToken("");
                    }}
                    className={cn("text-sm text-center underline-offset-2 hover:underline transition", tokens.textSecondary)}
                  >
                    Использовать резервный код
                  </button>
                </>
              )}
            </div>

            {onSignOut && (
              <button
                onClick={onSignOut}
                className={cn(
                  "mt-8 mx-auto flex items-center gap-2 text-xs transition hover:opacity-80",
                  tokens.textFaint,
                )}
              >
                <LogOut className="h-3.5 w-3.5" />
                Выйти из аккаунта
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
