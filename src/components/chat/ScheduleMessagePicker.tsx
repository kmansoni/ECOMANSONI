import { useState } from 'react';
import { X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, setHours, setMinutes, addDays } from 'date-fns';
import { ru } from 'date-fns/locale';

interface ScheduleMessagePickerProps {
  open: boolean;
  onClose: () => void;
  onSchedule: (scheduledFor: string) => void;
  messagePreview?: string;
}

function getPresets(): { label: string; getScheduledDate: () => Date }[] {
  const now = new Date();
  const todayEvening = setMinutes(setHours(new Date(), 20), 0);
  const tomorrowMorning = setMinutes(setHours(addDays(new Date(), 1), 9), 0);
  const tomorrowAfternoon = setMinutes(setHours(addDays(new Date(), 1), 14), 0);

  return [
    { label: 'Сегодня вечером (20:00)', getScheduledDate: () => todayEvening },
    { label: 'Завтра утром (9:00)', getScheduledDate: () => tomorrowMorning },
    { label: 'Завтра днём (14:00)', getScheduledDate: () => tomorrowAfternoon },
  ].filter((p) => p.getScheduledDate() > now);
}

export function ScheduleMessagePicker({
  open,
  onClose,
  onSchedule,
  messagePreview,
}: ScheduleMessagePickerProps) {
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const presets = getPresets();

  const handlePreset = (getScheduledDate: () => Date) => {
    onSchedule(getScheduledDate().toISOString());
    onClose();
  };

  const handleCustomSchedule = () => {
    if (!customDate || !customTime) return;
    const dt = new Date(`${customDate}T${customTime}`);
    if (dt <= new Date()) return;
    onSchedule(dt.toISOString());
    onClose();
  };

  let customPreview: string | null = null;
  if (customDate && customTime) {
    try {
      customPreview = format(new Date(`${customDate}T${customTime}`), 'd MMMM, HH:mm', { locale: ru });
    } catch {
      customPreview = null;
    }
  }

  const isCustomValid = !!(customDate && customTime);

  return (
    <AnimatePresence>
      {open && (
        <div key="schedule-picker-overlay">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl border-t border-white/10 pb-6"
          >
            <div className="flex items-center justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                Запланировать отправку
              </h3>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="px-4 py-3 space-y-3">
              {messagePreview && (
                <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground border border-white/10 truncate">
                  «{messagePreview}»
                </div>
              )}

              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePreset(preset.getScheduledDate)}
                  className="w-full flex items-center gap-3 rounded-xl bg-muted/40 hover:bg-muted/60 border border-white/10 px-4 py-3 transition-colors text-left"
                >
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-sm text-foreground">{preset.label}</span>
                </button>
              ))}

              <button
                onClick={() => setUseCustom((v) => !v)}
                className="w-full flex items-center gap-3 rounded-xl bg-muted/40 hover:bg-muted/60 border border-amber-400/30 px-4 py-3 transition-colors text-left"
              >
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-sm text-amber-400 font-medium">Выбрать дату и время</span>
              </button>

              {useCustom && (
                <div className="space-y-2 pt-1">
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={customDate}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="flex-1 rounded-xl bg-muted/50 border border-white/10 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-amber-400/50"
                    />
                    <input
                      type="time"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      className="flex-1 rounded-xl bg-muted/50 border border-white/10 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-amber-400/50"
                    />
                  </div>

                  {customPreview && (
                    <p className="text-xs text-amber-400/80 px-1">
                      Сообщение будет отправлено: {customPreview}
                    </p>
                  )}

                  <button
                    onClick={handleCustomSchedule}
                    disabled={!isCustomValid}
                    className="w-full rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-400 font-medium py-3 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Запланировать
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
