/**
 * SchedulePostPicker — выбор даты/времени для запланированной публикации
 * Минимум через 20 минут от текущего момента
 */
import React, { useState } from "react";
import { Calendar, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, addMinutes, isBefore } from "date-fns";
import { ru } from "date-fns/locale";

interface Props {
  value: Date | null;
  onChange: (date: Date | null) => void;
  onClose: () => void;
}

export function SchedulePostPicker({ value, onChange, onClose }: Props) {
  const minDate = addMinutes(new Date(), 20);

  const toLocalDateTimeString = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [dateTimeStr, setDateTimeStr] = useState<string>(
    value ? toLocalDateTimeString(value) : toLocalDateTimeString(addMinutes(new Date(), 30)),
  );

  const handleConfirm = () => {
    const selected = new Date(dateTimeStr);
    if (isBefore(selected, minDate)) {
      alert("Минимальное время планирования — 20 минут от сейчас");
      return;
    }
    onChange(selected);
    onClose();
  };

  const handleClear = () => {
    onChange(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md bg-zinc-900 rounded-t-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-base flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Запланировать публикацию
          </h3>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-white/60">Дата и время публикации</label>
          <input
            type="datetime-local"
            value={dateTimeStr}
            min={toLocalDateTimeString(minDate)}
            onChange={(e) => setDateTimeStr(e.target.value)}
            className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm border border-white/10 focus:border-primary outline-none"
          />
          <p className="text-xs text-white/40 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Минимум через 20 минут от текущего времени
          </p>
        </div>

        {value && (
          <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-3">
            <p className="text-sm text-primary">
              Запланировано на: {format(value, "d MMMM yyyy, HH:mm", { locale: ru })}
            </p>
          </div>
        )}

        <div className="flex gap-3">
          {value && (
            <Button variant="outline" onClick={handleClear} className="flex-1">
              Отменить план
            </Button>
          )}
          <Button onClick={handleConfirm} className="flex-1">
            Подтвердить
          </Button>
        </div>
      </div>
    </div>
  );
}
