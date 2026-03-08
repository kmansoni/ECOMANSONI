import React, { useState, useEffect, useCallback } from "react";
import { X, Star, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentInvoice } from "@/hooks/useBotPayments";
import { supabase } from "@/integrations/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────

interface BotInfo {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
}

interface PaymentSheetProps {
  invoice: PaymentInvoice | null;
  onClose: () => void;
  onPay: (invoiceId: string) => Promise<{ ok: boolean; error?: string }>;
  isLoading?: boolean;
}

type SheetState = "idle" | "confirming" | "paying" | "success" | "error";

// ── Confetti ───────────────────────────────────────────────────────────────

const ConfettiParticle: React.FC<{ delay: number; x: number; color: string }> = ({
  delay,
  x,
  color,
}) => (
  <div
    className="absolute top-0 w-2 h-2 rounded-full animate-confetti"
    style={{
      left: `${x}%`,
      backgroundColor: color,
      animationDelay: `${delay}ms`,
      animationDuration: `${600 + Math.random() * 400}ms`,
    }}
  />
);

const Confetti: React.FC<{ active: boolean }> = ({ active }) => {
  if (!active) return null;
  const colors = ["#facc15", "#34d399", "#60a5fa", "#f472b6", "#a78bfa"];
  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    delay: i * 40,
    x: 5 + (i / 24) * 90,
    color: colors[i % colors.length],
  }));
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <ConfettiParticle key={p.id} delay={p.delay} x={p.x} color={p.color} />
      ))}
    </div>
  );
};

// ── Amount formatter ───────────────────────────────────────────────────────

function formatAmount(amount: number, currency: PaymentInvoice["currency"]): string {
  if (currency === "XTR") return `${amount}`;
  const val = (amount / 100).toFixed(2);
  const map: Record<string, string> = { USD: "$", EUR: "€", RUB: "₽" };
  return `${map[currency] ?? ""}${val}`;
}

// ── Main Component ─────────────────────────────────────────────────────────

export const PaymentSheet = ({
  invoice,
  onClose,
  onPay,
  isLoading = false,
}: PaymentSheetProps): React.ReactElement | null => {
  const [sheetState, setSheetState] = useState<SheetState>("idle");
  const [agreed, setAgreed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [starsBalance, setStarsBalance] = useState<number | null>(null);
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);

  // Load stars balance and bot info on open
  useEffect(() => {
    if (!invoice) {
      setSheetState("idle");
      setAgreed(false);
      setErrorMessage("");
      return;
    }

    const loadData = async () => {
      // Stars balance
      if (invoice.currency === "XTR") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from("user_stars")
          .select("balance")
          .eq("user_id", invoice.user_id)
          .single();
        setStarsBalance((data as { balance: number } | null)?.balance ?? 0);
      }

      // Bot info
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: bot } = await (supabase as any)
        .from("bots")
        .select("id, name, username, avatar_url")
        .eq("id", invoice.bot_id)
        .single();
      setBotInfo(bot ?? null);
    };

    loadData();
  }, [invoice]);

  const handlePay = useCallback(async () => {
    if (!invoice || !agreed) return;
    setSheetState("paying");
    setErrorMessage("");

    const result = await onPay(invoice.id);

    if (result.ok) {
      setSheetState("success");
      // Auto-close after success animation
      setTimeout(() => {
        onClose();
        setSheetState("idle");
      }, 2500);
    } else {
      const humanError =
        result.error === "insufficient_stars"
          ? "Недостаточно Stars для оплаты"
          : result.error === "invalid_status"
          ? "Этот счёт уже обработан"
          : result.error ?? "Ошибка оплаты. Попробуйте ещё раз.";
      setErrorMessage(humanError);
      setSheetState("error");
    }
  }, [invoice, agreed, onPay, onClose]);

  if (!invoice) return null;

  const isStars = invoice.currency === "XTR";
  const isPaying = sheetState === "paying" || isLoading;
  const hasEnoughStars = !isStars || starsBalance === null || starsBalance >= invoice.amount;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={sheetState === "success" ? undefined : onClose}
      />

      {/* Sheet */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 rounded-t-3xl",
          "border-t border-white/10 shadow-2xl",
          "animate-in slide-in-from-bottom duration-300",
          "max-w-lg mx-auto"
        )}
      >
        {/* Confetti on success */}
        <Confetti active={sheetState === "success"} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            {botInfo?.avatar_url ? (
              <img
                src={botInfo.avatar_url}
                alt={botInfo.name}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                <span className="text-accent font-bold text-sm">
                  {(botInfo?.name ?? "B")[0].toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <p className="text-white font-semibold text-sm">{botInfo?.name ?? "Бот"}</p>
              {botInfo?.username && (
                <p className="text-zinc-400 text-xs">@{botInfo.username}</p>
              )}
            </div>
          </div>
          {sheetState !== "success" && (
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-white/10 mx-5" />

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {sheetState === "success" ? (
            // Success state
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-16 h-16 rounded-full bg-green-400/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <p className="text-white font-bold text-lg">Оплачено!</p>
              <p className="text-zinc-400 text-sm text-center">
                {invoice.title} успешно оплачен
              </p>
            </div>
          ) : (
            <>
              {/* Invoice info */}
              <div className="space-y-1">
                <p className="text-white font-semibold">{invoice.title}</p>
                <p className="text-zinc-400 text-sm">{invoice.description}</p>
              </div>

              {/* Payment method */}
              <div className="rounded-xl bg-zinc-800 p-3 space-y-2">
                <p className="text-zinc-400 text-xs uppercase tracking-wider font-medium">
                  Способ оплаты
                </p>
                {isStars ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                      <span className="text-white font-medium">Telegram Stars</span>
                    </div>
                    {starsBalance !== null && (
                      <span
                        className={cn(
                          "text-sm font-medium",
                          hasEnoughStars ? "text-green-400" : "text-red-400"
                        )}
                      >
                        Баланс: {starsBalance} ⭐
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">💳</span>
                    <span className="text-white font-medium">Карта</span>
                  </div>
                )}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between py-2">
                <span className="text-zinc-400 text-sm">Итого:</span>
                <div className="flex items-center gap-1.5">
                  {isStars && <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />}
                  <span className="text-white font-bold text-xl">
                    {formatAmount(invoice.amount, invoice.currency)}
                  </span>
                  {!isStars && (
                    <span className="text-zinc-400 text-sm">{invoice.currency}</span>
                  )}
                </div>
              </div>

              {/* Error */}
              {sheetState === "error" && errorMessage && (
                <div className="flex items-center gap-2 rounded-xl bg-red-400/10 border border-red-400/20 px-3 py-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-red-400 text-sm">{errorMessage}</p>
                </div>
              )}

              {/* Agreement */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <div
                  className={cn(
                    "w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                    agreed
                      ? "bg-accent border-accent"
                      : "border-zinc-600 bg-transparent"
                  )}
                  onClick={() => setAgreed((v) => !v)}
                >
                  {agreed && (
                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2 6l3 3 5-5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span className="text-zinc-400 text-sm leading-relaxed">
                  Я соглашаюсь с условиями оплаты и подтверждаю покупку
                </span>
              </label>

              {/* Pay button */}
              <button
                onClick={handlePay}
                disabled={!agreed || isPaying || !hasEnoughStars}
                className={cn(
                  "w-full py-3.5 rounded-2xl font-semibold text-base transition-all duration-150",
                  "flex items-center justify-center gap-2",
                  agreed && !isPaying && hasEnoughStars
                    ? "bg-accent text-white hover:bg-accent/90 active:scale-[0.98]"
                    : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                )}
              >
                {isPaying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Обработка...</span>
                  </>
                ) : (
                  <span>Подтвердить оплату</span>
                )}
              </button>
            </>
          )}
        </div>

        {/* Safe area bottom */}
        <div className="h-safe-bottom pb-6" />
      </div>

      {/* Confetti CSS (injected once) */}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(300px) rotate(720deg); opacity: 0; }
        }
        .animate-confetti { animation: confetti-fall linear forwards; }
      `}</style>
    </>
  );
};
