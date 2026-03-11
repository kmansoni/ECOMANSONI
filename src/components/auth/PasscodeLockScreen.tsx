/**
 * PasscodeLockScreen — Full-screen PIN lock overlay
 *
 * Features:
 *  - 4-6 digit PIN input with visual dots
 *  - "Use Biometric" button (renders only when biometricEnabled = true)
 *  - Brute-force lockout countdown display
 *  - Shake animation on wrong PIN
 *
 * Used as the `lockScreen` prop of PasscodeLockProvider:
 *
 *   <PasscodeLockProvider lockScreen={(state) => <PasscodeLockScreen state={state} />}>
 *     <App />
 *   </PasscodeLockProvider>
 */

import { useState, useEffect, useCallback } from "react";
import { Fingerprint, Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type PasscodeLockState } from "@/hooks/usePasscodeLock";

const PIN_LENGTH = 4; // Must match setPasscode validation (4-6)

const NUMPAD_KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "⌫"],
];

function PinDots({ entered, length }: { entered: number; length: number }) {
  return (
    <div className="flex gap-3 justify-center my-6">
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
            i < entered
              ? "bg-primary border-primary scale-110"
              : "bg-transparent border-muted-foreground"
          }`}
        />
      ))}
    </div>
  );
}

interface PasscodeLockScreenProps {
  state: PasscodeLockState;
}

export function PasscodeLockScreen({ state }: PasscodeLockScreenProps) {
  const { unlockApp, unlockWithBiometric, biometricEnabled, lockoutRemainingMs } = state;

  const [pin, setPin] = useState("");
  const [shaking, setShaking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Format lockout countdown
  const lockoutSeconds = Math.ceil(lockoutRemainingMs / 1000);
  const isLockedOut = lockoutRemainingMs > 0;

  // Auto-clear error after 2s
  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(null), 2000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  // Auto-submit when PIN reaches PIN_LENGTH digits
  useEffect(() => {
    if (pin.length === PIN_LENGTH && !checking) {
      handleSubmit(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

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
        setErrorMsg(state.lockoutRemainingMs > 0
          ? `Слишком много попыток. Подождите ${Math.ceil(state.lockoutRemainingMs / 1000)} сек.`
          : "Неверный PIN"
        );
        setTimeout(() => setShaking(false), 500);
      }
    },
    [unlockApp, isLockedOut, lockoutSeconds, state.lockoutRemainingMs]
  );

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
    [pin, isLockedOut, checking]
  );

  const handleBiometric = useCallback(async () => {
    if (isLockedOut) return;
    setChecking(true);
    const ok = await unlockWithBiometric();
    setChecking(false);
    if (!ok) {
      setErrorMsg("Биометрия не подтверждена");
    }
  }, [unlockWithBiometric, isLockedOut]);

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center select-none">
      {/* Lock icon */}
      <div className="mb-2 text-4xl">🔒</div>

      <h1 className="text-xl font-semibold mb-1">Введите PIN</h1>

      {isLockedOut ? (
        <p className="text-sm text-destructive mt-1 mb-4">
          Заблокировано на {lockoutSeconds} сек.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          {errorMsg ?? "Введите PIN для входа"}
        </p>
      )}

      {/* PIN dots with shake animation */}
      <div
        className={`transition-transform ${shaking ? "animate-[shake_0.4s_ease-in-out]" : ""}`}
        style={shaking ? { animation: "shake 0.4s ease-in-out" } : {}}
      >
        <PinDots entered={pin.length} length={PIN_LENGTH} />
      </div>

      {/* Number pad */}
      <div className="mt-2 space-y-2">
        {NUMPAD_KEYS.map((row, ri) => (
          <div key={ri} className="flex gap-4 justify-center">
            {row.map((key, ki) => (
              <button
                key={ki}
                onClick={() => handleKey(key)}
                disabled={key === "" || checking || isLockedOut}
                className={`
                  w-16 h-16 rounded-full text-xl font-medium
                  flex items-center justify-center
                  transition-colors
                  ${key === ""
                    ? "invisible"
                    : key === "⌫"
                    ? "text-muted-foreground hover:bg-muted active:bg-muted"
                    : "hover:bg-muted active:bg-muted"}
                  disabled:opacity-40
                `}
              >
                {key === "⌫" ? <Delete className="w-5 h-5" /> : key}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Biometric button */}
      {biometricEnabled && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-6 text-primary"
          onClick={handleBiometric}
          disabled={checking || isLockedOut}
        >
          <Fingerprint className="w-5 h-5 mr-2" />
          Войти по биометрии
        </Button>
      )}

      {/* Inline shake keyframes */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}
