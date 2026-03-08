/**
 * TwoFactorSetupPage — 4-step TOTP 2FA setup wizard.
 * Telegram-style dark UI with accent color from CSS variables.
 *
 * Steps:
 *   1. Scan QR code or copy secret
 *   2. Enter 6-digit verification code
 *   3. Save backup codes
 *   4. 2FA enabled confirmation
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useTOTP, type TOTPSetupResult } from "@/hooks/useTOTP";

// ─── Sub-components ───────────────────────────────────────────────────────────

function QRCanvas({ otpauthUrl }: { otpauthUrl: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    QRCode.toCanvas(ref.current, otpauthUrl, {
      width: 220,
      margin: 2,
      color: { dark: "#ffffff", light: "#1a1a1a" },
    }).catch(() => {/* canvas error — user can use manual secret */});
  }, [otpauthUrl]);

  return (
    <canvas
      ref={ref}
      className="rounded-xl border border-white/10 mx-auto"
      style={{ display: "block" }}
    />
  );
}

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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 6);
    onChange(raw);
    if (raw.length === 6) onComplete?.(raw);
  }

  // Render 6 visual "cells" backed by a single transparent input
  return (
    <div className="relative flex gap-3 justify-center select-none">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          onClick={() => inputRef.current?.focus()}
          className={`w-11 h-14 flex items-center justify-center rounded-xl border text-xl font-bold cursor-text transition-colors ${
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
        className="absolute inset-0 opacity-0 cursor-text"
        autoComplete="one-time-code"
      />
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function Step1Scan({
  setup,
  onNext,
}: {
  setup: TOTPSetupResult;
  onNext: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copySecret() {
    void navigator.clipboard.writeText(setup.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-6 items-center">
      <p className="text-white/60 text-sm text-center max-w-xs">
        Откройте приложение-аутентификатор (Google Authenticator, Aegis, Authy)
        и отсканируйте QR-код.
      </p>
      <QRCanvas otpauthUrl={setup.otpauthUrl} />
      <div className="w-full">
        <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Или введите вручную</p>
        <div className="flex items-center gap-2 bg-white/5 rounded-xl px-4 py-3 border border-white/10">
          <code className="text-sm text-white/80 flex-1 break-all font-mono tracking-widest">
            {setup.secret}
          </code>
          <button
            onClick={copySecret}
            className="text-xs text-[var(--accent,#5b9cf6)] shrink-0 ml-2"
          >
            {copied ? "Скопировано!" : "Копировать"}
          </button>
        </div>
      </div>
      <button
        onClick={onNext}
        className="w-full py-3 rounded-xl bg-[var(--accent,#5b9cf6)] text-white font-semibold text-sm"
      >
        Далее
      </button>
    </div>
  );
}

function Step2Verify({
  onVerify,
  isLoading,
  error,
}: {
  onVerify: (token: string) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [token, setToken] = useState("");

  return (
    <div className="flex flex-col gap-6 items-center">
      <p className="text-white/60 text-sm text-center max-w-xs">
        Введите 6-значный код из приложения-аутентификатора для подтверждения настройки.
      </p>
      <OTPInput
        value={token}
        onChange={setToken}
        onComplete={onVerify}
        disabled={isLoading}
      />
      {error && (
        <p className="text-red-400 text-sm text-center">{error}</p>
      )}
      <button
        onClick={() => onVerify(token)}
        disabled={token.length < 6 || isLoading}
        className="w-full py-3 rounded-xl bg-[var(--accent,#5b9cf6)] text-white font-semibold text-sm disabled:opacity-40"
      >
        {isLoading ? "Проверка…" : "Подтвердить"}
      </button>
    </div>
  );
}

function Step3Backup({
  codes,
  onNext,
}: {
  codes: string[];
  onNext: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copyAll() {
    void navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const blob = new Blob([codes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-white/60 text-sm text-center">
        Сохраните резервные коды — они помогут войти если вы потеряете доступ к
        аутентификатору. Каждый код можно использовать только один раз.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {codes.map((code, i) => (
          <div
            key={i}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-center font-mono text-sm text-white/80 tracking-widest"
          >
            {code}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={copyAll}
          className="flex-1 py-2 rounded-xl border border-white/20 text-white/70 text-sm"
        >
          {copied ? "Скопировано!" : "Копировать все"}
        </button>
        <button
          onClick={download}
          className="flex-1 py-2 rounded-xl border border-white/20 text-white/70 text-sm"
        >
          Скачать
        </button>
      </div>
      <button
        onClick={onNext}
        className="w-full py-3 rounded-xl bg-[var(--accent,#5b9cf6)] text-white font-semibold text-sm"
      >
        Я сохранил коды
      </button>
    </div>
  );
}

function Step4Done({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col gap-6 items-center py-4">
      <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-3xl">
        ✓
      </div>
      <div className="text-center">
        <h2 className="text-white font-bold text-lg mb-1">2FA включён</h2>
        <p className="text-white/50 text-sm">
          При каждом входе вы будете вводить код из приложения-аутентификатора.
        </p>
      </div>
      <button
        onClick={onClose}
        className="w-full py-3 rounded-xl bg-[var(--accent,#5b9cf6)] text-white font-semibold text-sm"
      >
        Готово
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface TwoFactorSetupPageProps {
  onClose?: () => void;
}

export default function TwoFactorSetupPage({ onClose }: TwoFactorSetupPageProps) {
  const { setup, verify, isLoading, error } = useTOTP();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [setupData, setSetupData] = useState<TOTPSetupResult | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const startSetup = useCallback(async () => {
    setInitError(null);
    const result = await setup();
    if (!result) {
      setInitError("Не удалось начать настройку 2FA");
      return;
    }
    setSetupData(result);
  }, [setup]);

  useEffect(() => {
    void startSetup();
  }, [startSetup]);

  async function handleVerify(token: string) {
    const ok = await verify(token);
    if (ok) setStep(3);
  }

  const STEP_LABELS = ["QR-код", "Верификация", "Резервные коды", "Готово"];

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe-top pt-4 pb-2">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white"
        >
          ←
        </button>
        <h1 className="text-white font-semibold text-base flex-1">
          Двухфакторная аутентификация
        </h1>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1 px-4 pb-4">
        {STEP_LABELS.map((label, i) => (
          <div
            key={label}
            className="flex-1 flex flex-col items-center gap-1"
          >
            <div
              className={`h-1 w-full rounded-full transition-colors ${
                i + 1 <= step
                  ? "bg-[var(--accent,#5b9cf6)]"
                  : "bg-white/10"
              }`}
            />
            <span className="text-[10px] text-white/30">{label}</span>
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {initError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
            {initError}
          </div>
        )}

        {!setupData && !initError && (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        )}

        {setupData && (
          <>
            {step === 1 && (
              <Step1Scan setup={setupData} onNext={() => setStep(2)} />
            )}
            {step === 2 && (
              <Step2Verify
                onVerify={handleVerify}
                isLoading={isLoading}
                error={error}
              />
            )}
            {step === 3 && (
              <Step3Backup
                codes={setupData.backupCodes}
                onNext={() => setStep(4)}
              />
            )}
            {step === 4 && <Step4Done onClose={onClose ?? (() => history.back())} />}
          </>
        )}
      </div>
    </div>
  );
}
