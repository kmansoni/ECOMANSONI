/**
 * PasscodeLockScreen — Full-screen PIN lock overlay (liquid-glass).
 *
 * Features:
 *  - 4-6 digit PIN with glowing dots
 *  - Aurora background + glass card matching AuthPage
 *  - Biometric unlock button (when enabled)
 *  - Brute-force lockout countdown
 *  - Shake animation on wrong PIN
 *  - Theme switcher (dark/light) via useGlassTokens
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Fingerprint, Delete, Lock, Moon, Sun } from "lucide-react";

import {
  AuroraBackground,
  useGlassTheme,
  useGlassTokens,
  BRAND_GRADIENT,
} from "@/components/ui/glass";
import { GlassPrimaryButton } from "@/components/ui/glass/GlassPrimaryButton";
import { cn } from "@/lib/utils";
import { type PasscodeLockState } from "@/hooks/usePasscodeLock";

const PIN_LENGTH = 4;

const NUMPAD_KEYS: Array<Array<string>> = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "⌫"],
];

interface PasscodeLockScreenProps {
  state: PasscodeLockState;
}

export function PasscodeLockScreen({ state }: PasscodeLockScreenProps) {
  const { unlockApp, unlockWithBiometric, biometricEnabled, lockoutRemainingMs } = state;

  const { theme, toggle } = useGlassTheme("dark");
  const tokens = useGlassTokens(theme);

  const [pin, setPin] = useState("");
  const [shaking, setShaking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const lockoutSeconds = Math.ceil(lockoutRemainingMs / 1000);
  const isLockedOut = lockoutRemainingMs > 0;

  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(null), 2000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  useEffect(() => () => clearTimeout(shakeTimerRef.current), []);

  const handleSubmit = useCallback(
    async (currentPin: string) => {
      if (isLockedOut) {
        setErrorMsg(`Заблокировано. Повтор через ${lockoutSeconds} сек.`);
        return;
      }
      setChecking(true);
      const ok = await unlockApp(currentPin);
      setChecking(false);
      if (!ok) {
        setShaking(true);
        setPin("");
        setErrorMsg(
          state.lockoutRemainingMs > 0
            ? `Слишком много попыток. Подождите ${Math.ceil(state.lockoutRemainingMs / 1000)} сек.`
            : "Неверный PIN",
        );
        clearTimeout(shakeTimerRef.current);
        shakeTimerRef.current = setTimeout(() => setShaking(false), 500);
      }
    },
    [unlockApp, isLockedOut, lockoutSeconds, state.lockoutRemainingMs],
  );

  useEffect(() => {
    if (pin.length === PIN_LENGTH && !checking) {
      void handleSubmit(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const handleKey = useCallback(
    (key: string) => {
      if (isLockedOut || checking) return;
      if (key === "⌫") {
        setPin((p) => p.slice(0, -1));
        return;
      }
      if (key === "") return;
      if (pin.length >= PIN_LENGTH) return;
      setPin((p) => p + key);
    },
    [pin, isLockedOut, checking],
  );

  const handleBiometric = useCallback(async () => {
    if (isLockedOut) return;
    setChecking(true);
    const ok = await unlockWithBiometric();
    setChecking(false);
    if (!ok) setErrorMsg("Биометрия не подтверждена");
  }, [unlockWithBiometric, isLockedOut]);

  return (
    <div
      className={cn(
        theme === "dark" ? "dark" : "",
        "fixed inset-0 z-[9999] overflow-hidden font-[Manrope,system-ui,sans-serif] select-none",
        tokens.textPrimary,
      )}
      style={{ colorScheme: theme }}
    >
      <AuroraBackground theme={theme} />

      <div className="relative z-10 flex min-h-full items-center justify-center px-4 py-6">
        <div className="relative w-full max-w-[400px]">
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

            <div className="flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 220, damping: 16 }}
                className="relative h-16 w-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: BRAND_GRADIENT, boxShadow: "0 20px 60px -15px rgba(0,180,216,0.55)" }}
              >
                <Lock className="h-7 w-7 text-white" strokeWidth={2.4} />
              </motion.div>

              <h1 className={cn("text-2xl font-bold tracking-tight", tokens.textPrimary)}>Введите PIN</h1>

              <p
                className={cn(
                  "mt-2 text-sm min-h-[1.25rem]",
                  isLockedOut ? "text-rose-400" : errorMsg ? "text-rose-400" : tokens.textMuted,
                )}
              >
                {isLockedOut
                  ? `Заблокировано на ${lockoutSeconds} сек.`
                  : errorMsg ?? "Введите PIN для входа"}
              </p>

              <motion.div
                animate={shaking ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="flex gap-3 justify-center my-7"
              >
                {Array.from({ length: PIN_LENGTH }).map((_, i) => {
                  const filled = i < pin.length;
                  return (
                    <motion.div
                      key={i}
                      animate={filled ? { scale: [0.6, 1.15, 1] } : { scale: 1 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className={cn(
                        "w-3.5 h-3.5 rounded-full border-2 transition-colors",
                        filled
                          ? tokens.isDark
                            ? "border-cyan-300/80"
                            : "border-teal-500/70"
                          : tokens.isDark
                          ? "border-white/20"
                          : "border-slate-900/15",
                      )}
                      style={
                        filled
                          ? { background: BRAND_GRADIENT, boxShadow: "0 6px 18px -6px rgba(0,200,150,0.55)" }
                          : undefined
                      }
                    />
                  );
                })}
              </motion.div>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-3">
              {NUMPAD_KEYS.flat().map((key, i) =>
                key === "" ? (
                  <div key={i} aria-hidden />
                ) : (
                  <motion.button
                    key={i}
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => handleKey(key)}
                    disabled={checking || isLockedOut}
                    className={cn(
                      "h-16 rounded-2xl border backdrop-blur-xl text-xl font-semibold flex items-center justify-center transition disabled:opacity-40",
                      tokens.iconBtn,
                    )}
                  >
                    {key === "⌫" ? <Delete className="h-5 w-5" /> : key}
                  </motion.button>
                ),
              )}
            </div>

            {biometricEnabled && (
              <div className="mt-5">
                <GlassPrimaryButton
                  variant="brand"
                  size="md"
                  icon={<Fingerprint className="h-5 w-5" />}
                  onClick={() => void handleBiometric()}
                  disabled={checking || isLockedOut}
                >
                  Войти по биометрии
                </GlassPrimaryButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
