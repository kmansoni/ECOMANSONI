import React, { useState, useEffect } from "react";
import {
  MapPin,
  Phone,
  Clock,
  X,
  MessageSquare,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessAccount, BusinessHours } from "@/hooks/useBusinessAccount";

interface BusinessGreetingOverlayProps {
  account: BusinessAccount;
  avatarUrl?: string | null;
  onClose: () => void;
  onWrite: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAY_MAP: Record<number, DayKey> = {
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
  0: "sun",
};

const CATEGORY_LABELS: Record<string, string> = {
  retail: "Розница",
  food: "Еда и рестораны",
  services: "Услуги",
  education: "Образование",
  tech: "Технологии",
  other: "Другое",
};

function isBusinessOpen(hours: BusinessHours): boolean {
  const now = new Date();
  const dayKey = DAY_MAP[now.getDay()];
  const entry = hours[dayKey];
  if (!entry || entry.closed) return false;

  const [openH, openM] = entry.open.split(":").map(Number);
  const [closeH, closeM] = entry.close.split(":").map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

function getTodayHours(hours: BusinessHours): string | null {
  const now = new Date();
  const dayKey = DAY_MAP[now.getDay()];
  const entry = hours[dayKey];
  if (!entry) return null;
  if (entry.closed) return "Выходной";
  return `${entry.open} — ${entry.close}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export const BusinessGreetingOverlay: React.FC<BusinessGreetingOverlayProps> = ({
  account,
  avatarUrl,
  onClose,
  onWrite,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [todayHours, setTodayHours] = useState<string | null>(null);

  useEffect(() => {
    setIsOpen(isBusinessOpen(account.business_hours));
    setTodayHours(getTodayHours(account.business_hours));
  }, [account.business_hours]);

  const hasHours = Object.keys(account.business_hours).length > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Card */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 rounded-t-3xl",
          "border-t border-white/10 shadow-2xl",
          "animate-in slide-in-from-bottom duration-300",
          "max-w-lg mx-auto"
        )}
      >
        {/* Close handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full
                     bg-white/10 text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-5 pb-6 space-y-4">
          {/* Avatar + name */}
          <div className="flex items-center gap-4 pt-2">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={account.business_name}
                className="w-16 h-16 rounded-2xl object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center">
                <span className="text-accent font-bold text-2xl">
                  {account.business_name[0].toUpperCase()}
                </span>
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-white font-bold text-lg truncate">{account.business_name}</h2>
                {account.is_verified && (
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
                )}
              </div>
              <p className="text-zinc-400 text-sm">{CATEGORY_LABELS[account.business_category] ?? account.business_category}</p>
            </div>
          </div>

          {/* Description */}
          {account.business_description && (
            <p className="text-zinc-300 text-sm leading-relaxed">{account.business_description}</p>
          )}

          {/* Info rows */}
          <div className="space-y-2.5">
            {/* Working hours */}
            {hasHours && (
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                    isOpen
                      ? "bg-green-400/15 text-green-400"
                      : "bg-red-400/15 text-red-400"
                  )}
                >
                  <div
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      isOpen ? "bg-green-400" : "bg-red-400"
                    )}
                  />
                  {isOpen ? "Открыто" : "Закрыто"}
                </div>
                {todayHours && (
                  <div className="flex items-center gap-1.5 text-zinc-400 text-sm">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{todayHours}</span>
                  </div>
                )}
              </div>
            )}

            {account.business_address && (
              <div className="flex items-center gap-2.5 text-zinc-300 text-sm">
                <MapPin className="w-4 h-4 text-zinc-500 shrink-0" />
                <span>{account.business_address}</span>
              </div>
            )}

            {account.business_phone && (
              <div className="flex items-center gap-2.5 text-zinc-300 text-sm">
                <Phone className="w-4 h-4 text-zinc-500 shrink-0" />
                <a href={`tel:${account.business_phone}`} className="hover:text-white transition-colors">
                  {account.business_phone}
                </a>
              </div>
            )}
          </div>

          {/* Write button */}
          <button
            onClick={() => {
              onWrite();
              onClose();
            }}
            className="w-full py-3.5 rounded-2xl bg-accent text-white font-semibold text-base
                       hover:bg-accent/90 active:scale-[0.98] transition-all duration-150
                       flex items-center justify-center gap-2"
          >
            <MessageSquare className="w-5 h-5" />
            Написать
          </button>
        </div>
      </div>
    </>
  );
};
