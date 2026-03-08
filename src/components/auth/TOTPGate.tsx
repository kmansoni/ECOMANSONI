/**
 * TOTPGate — full-screen 2FA verification overlay shown after login
 * if the user has TOTP enabled.
 *
 * Usage: render conditionally based on auth state + 2FA status.
 * On success call onSuccess(); on failure the component shows an error
 * inline and resets the input.
 */

import React, { useRef, useState } from "react";
import { useTOTP } from "@/hooks/useTOTP";

interface TOTPGateProps {
  /** Called after successful 2FA validation. The session is already
   *  established at this point; this just unblocks UI navigation. */
  onSuccess: () => void;
  /** Optional — allow user to sign out and try a different account. */
  onSignOut?: () => void;
}

// ─── OTP input component (identical pattern to TwoFactorSetupPage) ─────────

function OTPInput({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 6);
    onChange(raw);
    if (raw.length === 6) onComplete?.(raw);
  }

  return (
    <div className="relative flex gap-3 justify-center select-none">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          onClick={() => inputRef.current?.focus()}
          className={`w-12 h-14 flex items-center justify-center rounded-xl border text-xl font-bold cursor-text transition-colors ${
            i === value.length
              ? "border-[var(--accent,#5b9cf6)] bg-white/5"
              : value[i]
              ? "border-white/20 bg-white/5 text-white"
              : "border-white/10 bg-white/5 text-white/30"
          }`}
        >
          {value[i] ?? ""}
        </div>
      ))}
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

// ─── Backup code input ────────────────────────────────────────────────────────

function BackupInput({
  onSubmit,
  onCancel,
  isLoading,
  error,
}: {
  onSubmit: (code: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [code, setCode] = useState("");

  return (
    <div className="flex flex-col gap-4 w-full">
      <p className="text-white/60 text-sm text-center">
        Введите один из резервных кодов в формате <span className="font-mono">XXXXXX-XXXXXX</span>
      </p>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABCDEF-123456"
        disabled={isLoading}
        className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white text-center font-mono tracking-widest outline-none focus:border-[var(--accent,#5b9cf6)]"
        autoFocus
        autoComplete="off"
      />
      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      <button
        onClick={() => onSubmit(code)}
        disabled={code.length < 13 || isLoading}
        className="w-full py-3 rounded-xl bg-[var(--accent,#5b9cf6)] text-white font-semibold text-sm disabled:opacity-40"
      >
        {isLoading ? "Проверка…" : "Продолжить"}
      </button>
      <button
        onClick={onCancel}
        className="text-white/40 text-sm text-center"
      >
        ← Вернуться к коду TOTP
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TOTPGate({ onSuccess, onSignOut }: TOTPGateProps) {
  const { validate, useBackupCode, isLoading, error } = useTOTP();
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
    const ok = await useBackupCode(code);
    if (ok) {
      onSuccess();
    } else {
      setLocalError(error ?? "Неверный или уже использованный код.");
    }
  }

  return (
    /* Full-screen overlay — sits on top of everything, prevents interaction beneath */
    <div
      className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Двухфакторная аутентификация"
    >
      {/* Branding */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="w-16 h-16 rounded-full bg-[var(--accent,#5b9cf6)]/20 flex items-center justify-center text-3xl">
          🔐
        </div>
        <h1 className="text-white font-bold text-xl">Двухфакторная аутентификация</h1>
        <p className="text-white/50 text-sm text-center max-w-xs">
          {showBackup
            ? "Используйте резервный код для входа."
            : "Введите код из приложения-аутентификатора."}
        </p>
      </div>

      {/* Input area */}
      <div className="w-full max-w-xs flex flex-col gap-4">
        {showBackup ? (
          <BackupInput
            onSubmit={handleBackup}
            onCancel={() => {
              setShowBackup(false);
              setLocalError(null);
            }}
            isLoading={isLoading}
            error={localError}
          />
        ) : (
          <>
            <OTPInput
              value={token}
              onChange={setToken}
              onComplete={handleTOTP}
              disabled={isLoading}
            />
            {localError && (
              <p className="text-red-400 text-sm text-center">{localError}</p>
            )}
            <button
              onClick={() => handleTOTP(token)}
              disabled={token.length < 6 || isLoading}
              className="w-full py-3 rounded-xl bg-[var(--accent,#5b9cf6)] text-white font-semibold text-sm disabled:opacity-40"
            >
              {isLoading ? "Проверка…" : "Войти"}
            </button>
            <button
              onClick={() => {
                setShowBackup(true);
                setLocalError(null);
                setToken("");
              }}
              className="text-white/40 text-sm text-center"
            >
              Использовать резервный код
            </button>
          </>
        )}
      </div>

      {/* Sign-out link */}
      {onSignOut && (
        <button
          onClick={onSignOut}
          className="mt-10 text-white/30 text-xs"
        >
          Выйти из аккаунта
        </button>
      )}
    </div>
  );
}
