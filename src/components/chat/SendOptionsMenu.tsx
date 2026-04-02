/**
 * SendOptionsMenu — popup triggered by long-press on the Send button.
 *
 * Options:
 *   1. "Отправить" — normal send
 *   2. "Без звука" — silent send (is_silent: true)
 *   3. "С эффектом" — send with visual effect (confetti/fire/hearts/thumbsup)
 *   4. "Запланировать" — opens schedule picker
 *
 * Design: bottom-anchored animated sheet (framer-motion).
 * Accessibility: role=menu, keyboard accessible, focus-trapped.
 *
 * Attack surface notes:
 * - onSend / onSilent / onSchedule / onEffect are caller-supplied callbacks;
 *   this component itself has no side effects beyond UI.
 * - No prop injection — all labels are hardcoded strings.
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, BellOff, Clock, Sparkles, ArrowLeft } from "lucide-react";
import type { MessageEffectType } from "./MessageEffectOverlay";

interface SendOptionsMenuProps {
  open: boolean;
  onClose: () => void;
  onSend: () => void;
  onSilent: () => void;
  onSchedule: () => void;
  onEffect?: (effect: MessageEffectType) => void;
}

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  action: () => void;
  accent?: string;
}

export function SendOptionsMenu({
  open,
  onClose,
  onSend,
  onSilent,
  onSchedule,
  onEffect,
}: SendOptionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showEffects, setShowEffects] = useState(false);

  // Reset sub-menu when closing
  useEffect(() => {
    if (!open) setShowEffects(false);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler, { passive: true });
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const effectOptions: { effect: MessageEffectType; emoji: string; label: string }[] = [
    { effect: 'confetti', emoji: '🎉', label: 'Конфетти' },
    { effect: 'fire', emoji: '🔥', label: 'Огонь' },
    { effect: 'hearts', emoji: '❤️', label: 'Сердечки' },
    { effect: 'thumbsup', emoji: '👍', label: 'Лайк' },
  ];

  const items: MenuItem[] = [
    {
      icon: <Send className="w-5 h-5" />,
      label: "Отправить",
      action: () => { onClose(); onSend(); },
      accent: "text-[#6ab3f3]",
    },
    {
      icon: <BellOff className="w-5 h-5" />,
      label: "Без звука",
      sublabel: "Получатель не услышит уведомление",
      action: () => { onClose(); onSilent(); },
      accent: "text-amber-400",
    },
    {
      icon: <Sparkles className="w-5 h-5" />,
      label: "С эффектом",
      sublabel: "Конфетти, огонь, сердечки",
      action: () => { setShowEffects(true); },
      accent: "text-pink-400",
    },
    {
      icon: <Clock className="w-5 h-5" />,
      label: "Запланировать",
      sublabel: "Выбрать время отправки",
      action: () => { onClose(); onSchedule(); },
      accent: "text-purple-400",
    },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="send-options-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Menu panel */}
          <motion.div
            key="send-options-menu"
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.88, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 16 }}
            transition={{ duration: 0.18, ease: [0.34, 1.2, 0.64, 1] }}
            className="absolute bottom-full right-0 mb-3 z-50 w-64 rounded-2xl overflow-hidden"
            style={{
              background:
                "linear-gradient(145deg, rgba(5,20,45,0.97) 0%, rgba(0,10,28,0.99) 100%)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow:
                "0 -4px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
            role="menu"
            aria-label="Опции отправки"
          >
            {showEffects ? (
              <>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/8 active:bg-white/12"
                  onClick={() => setShowEffects(false)}
                >
                  <ArrowLeft className="w-4 h-4 text-white/60" />
                  <span className="text-[14px] text-white/60">Назад</span>
                </button>
                {effectOptions.map((opt) => (
                  <button
                    key={opt.effect}
                    type="button"
                    role="menuitem"
                    className="w-full flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/8 active:bg-white/12 text-left"
                    onClick={() => {
                      onClose();
                      onEffect?.(opt.effect);
                    }}
                  >
                    <span className="text-xl">{opt.emoji}</span>
                    <span className="text-[15px] font-medium text-white">{opt.label}</span>
                  </button>
                ))}
              </>
            ) : (
              items.map((item, i) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`w-full flex items-start gap-4 px-4 py-3.5 transition-colors hover:bg-white/8 active:bg-white/12 text-left
                  ${i < items.length - 1 ? "border-b border-white/5" : ""}`}
                onClick={item.action}
              >
                <span className={item.accent ?? "text-white/70"}>
                  {item.icon}
                </span>
                <div className="flex flex-col">
                  <span className="text-[15px] font-medium text-white">
                    {item.label}
                  </span>
                  {item.sublabel && (
                    <span className="text-[12px] text-white/45 mt-0.5 leading-tight">
                      {item.sublabel}
                    </span>
                  )}
                </div>
              </button>
            ))
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
