/**
 * ScheduleMessageSheet — Sheet для планирования отправки сообщения.
 * Date picker, Time picker, пресеты, кнопка "Запланировать".
 */

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, CalendarDays, Send } from "lucide-react";
import { format, setHours, setMinutes, addDays, nextMonday, isAfter } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { logger } from "@/lib/logger";

interface ScheduleMessageSheetProps {
  open: boolean;
  onClose: () => void;
  onSchedule: (scheduledAt: string) => void;
}

interface Preset {
  label: string;
  getDate: () => Date;
}

function buildPresets(): Preset[] {
  const now = new Date();
  const todayEvening = setMinutes(setHours(new Date(), 18), 0);
  const tomorrowMorning = setMinutes(setHours(addDays(new Date(), 1), 9), 0);
  const mondayMorning = setMinutes(setHours(nextMonday(new Date()), 9), 0);

  return [
    { label: "Позже сегодня (18:00)", getDate: () => todayEvening },
    { label: "Завтра утром (09:00)", getDate: () => tomorrowMorning },
    { label: "Понедельник утром (09:00)", getDate: () => mondayMorning },
  ].filter((p) => isAfter(p.getDate(), now));
}

export function ScheduleMessageSheet({ open, onClose, onSchedule }: ScheduleMessageSheetProps) {
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const presets = useMemo(() => buildPresets(), []);

  const handlePreset = useCallback(
    (getDate: () => Date) => {
      const date = getDate();
      onSchedule(date.toISOString());
      onClose();
    },
    [onSchedule, onClose],
  );

  const handleCustom = useCallback(() => {
    if (!customDate || !customTime) return;
    try {
      const dt = new Date(`${customDate}T${customTime}`);
      if (!isAfter(dt, new Date())) {
        return; // Не позволяем планировать в прошлое
      }
      onSchedule(dt.toISOString());
      onClose();
    } catch (err) {
      logger.error("[ScheduleMessageSheet] Ошибка парсинга даты", { customDate, customTime, error: err });
    }
  }, [customDate, customTime, onSchedule, onClose]);

  const customPreview = useMemo(() => {
    if (!customDate || !customTime) return null;
    try {
      return format(new Date(`${customDate}T${customTime}`), "d MMMM, HH:mm", { locale: ru });
    } catch {
      return null;
    }
  }, [customDate, customTime]);

  const isCustomValid = customDate && customTime && (() => {
    try {
      return isAfter(new Date(`${customDate}T${customTime}`), new Date());
    } catch {
      return false;
    }
  })();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="schedule-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            key="schedule-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl border-t border-white/10 pb-6"
          >
            <div className="flex items-center justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                Запланировать сообщение
              </h3>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="px-4 pt-4 space-y-3">
              {/* Presets */}
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePreset(preset.getDate)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left min-h-[48px]"
                  aria-label={preset.label}
                >
                  <CalendarDays className="w-5 h-5 text-amber-400 shrink-0" />
                  <span className="text-sm">{preset.label}</span>
                </button>
              ))}

              {/* Custom toggle */}
              <button
                onClick={() => setShowCustom((v) => !v)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left min-h-[48px]"
                aria-label="Выбрать дату и время"
              >
                <Clock className="w-5 h-5 text-muted-foreground shrink-0" />
                <span className="text-sm">Выбрать дату и время...</span>
              </button>

              {/* Custom date/time */}
              <AnimatePresence>
                {showCustom && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex gap-3 pt-1">
                      <Input
                        type="date"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="flex-1 min-h-[44px]"
                        aria-label="Дата"
                      />
                      <Input
                        type="time"
                        value={customTime}
                        onChange={(e) => setCustomTime(e.target.value)}
                        className="w-28 min-h-[44px]"
                        aria-label="Время"
                      />
                    </div>

                    {customPreview && (
                      <p className="text-xs text-muted-foreground mt-2 px-1">{customPreview}</p>
                    )}

                    <Button
                      onClick={handleCustom}
                      disabled={!isCustomValid}
                      className="w-full mt-3 min-h-[48px]"
                      aria-label="Запланировать"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Запланировать
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
