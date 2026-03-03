import { Check, Timer } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AVAILABLE_TIMERS, formatTimerLabel } from "@/hooks/useDisappearingMessages";

interface DisappearTimerPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTimer: number | null;
  onSelect: (seconds: number | null) => void;
}

const TIMER_LABELS: Record<string, string> = {
  "null": "Выкл",
  "30": "30 секунд",
  "60": "1 минута",
  "300": "5 минут",
  "3600": "1 час",
  "86400": "1 день",
  "604800": "7 дней",
};

export function DisappearTimerPicker({
  open,
  onOpenChange,
  currentTimer,
  onSelect,
}: DisappearTimerPickerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />

          {/* Bottom sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[301] rounded-t-3xl bg-[#1c1c1e] border-t border-white/10 px-4 pt-4 pb-8 safe-area-bottom"
          >
            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />

            {/* Title */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                <Timer className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-base">Автоудаление сообщений</h3>
                <p className="text-white/50 text-xs">Сообщения исчезнут после прочтения</p>
              </div>
            </div>

            {/* Options */}
            <div className="space-y-1">
              {AVAILABLE_TIMERS.map((seconds) => {
                const key = String(seconds);
                const label = TIMER_LABELS[key] ?? formatTimerLabel(seconds);
                const isSelected = currentTimer === seconds;

                return (
                  <button
                    key={key}
                    onClick={() => {
                      onSelect(seconds);
                      onOpenChange(false);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-colors ${
                      isSelected
                        ? "bg-orange-500/15 border border-orange-500/30"
                        : "hover:bg-white/5 active:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {seconds === null ? (
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                          <span className="text-white/60 text-sm font-bold">✕</span>
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-orange-500/15 flex items-center justify-center">
                          <Timer className="w-4 h-4 text-orange-400" />
                        </div>
                      )}
                      <span className={`text-[15px] ${isSelected ? "text-orange-300 font-medium" : "text-white"}`}>
                        {label}
                      </span>
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-orange-400" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
