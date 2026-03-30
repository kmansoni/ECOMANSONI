/**
 * QuietHoursSettings — секция для страницы настроек уведомлений.
 *
 * Компонент предназначен для встраивания в NotificationSettingsPage.
 * Реализует Telegram-style расписание тихих часов.
 */

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { Moon, Clock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useQuietHours, type QuietHoursSettings as QHSettings } from "@/hooks/useQuietHours";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS: { id: number; short: string; long: string }[] = [
  { id: 1, short: "Пн", long: "Понедельник" },
  { id: 2, short: "Вт", long: "Вторник" },
  { id: 3, short: "Ср", long: "Среда" },
  { id: 4, short: "Чт", long: "Четверг" },
  { id: 5, short: "Пт", long: "Пятница" },
  { id: 6, short: "Сб", long: "Суббота" },
  { id: 0, short: "Вс", long: "Воскресенье" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPreviewText(settings: QHSettings): string {
  if (!settings.quiet_hours_enabled) return "";

  const activeDays = DAYS.filter((d) => settings.quiet_days.includes(d.id));
  let daysLabel = "ежедневно";

  if (activeDays.length === 7) {
    daysLabel = "ежедневно";
  } else if (activeDays.length === 0) {
    return "Выберите хотя бы один день";
  } else if (
    activeDays.map((d) => d.id).sort().join(",") === "1,2,3,4,5"
  ) {
    daysLabel = "в Пн–Пт";
  } else if (activeDays.map((d) => d.id).sort().join(",") === "0,6") {
    daysLabel = "в выходные";
  } else {
    daysLabel = "в " + activeDays.map((d) => d.short).join(", ");
  }

  return `Уведомления будут отключены с ${settings.quiet_start} до ${settings.quiet_end} ${daysLabel}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuietHoursSettings() {
  const { settings, isInQuietHours, isLoading, updateSettings } = useQuietHours();

  // Local draft — committed on Save
  const [draft, setDraft] = useState<QHSettings>(settings);
  const [saving, setSaving] = useState(false);

  // Sync draft when settings load
  useEffect(() => {
    if (!isLoading) {
      setDraft(settings);
    }
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDay = (dayId: number) => {
    setDraft((prev) => {
      const has = prev.quiet_days.includes(dayId);
      const next = has
        ? prev.quiet_days.filter((d) => d !== dayId)
        : [...prev.quiet_days, dayId];
      return { ...prev, quiet_days: next };
    });
  };

  const handleSave = async () => {
    if (draft.quiet_days.length === 0 && draft.quiet_hours_enabled) {
      toast.error("Выберите хотя бы один день недели");
      return;
    }

    setSaving(true);
    try {
      await updateSettings(draft);
      toast.success("Расписание тихих часов сохранено");
    } catch (e) {
      toast.error("Не удалось сохранить настройки");
      logger.error("[QuietHoursSettings] save error", { error: e });
    } finally {
      setSaving(false);
    }
  };

  const previewText = buildPreviewText(draft);

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2 px-1">
        <Moon className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-semibold text-white">Тихие часы</h3>
        {isInQuietHours && (
          <span className="ml-auto text-xs bg-indigo-900/60 text-indigo-300 border border-indigo-700/50 rounded-full px-2 py-0.5">
            Сейчас активны
          </span>
        )}
      </div>

      {/* Master toggle */}
      <div className="flex items-center justify-between rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-white">Включить тихие часы</p>
          <p className="text-xs text-white/50 mt-0.5">
            Уведомления будут приглушены в указанное время
          </p>
        </div>
        <Switch
          checked={draft.quiet_hours_enabled}
          onCheckedChange={(v) => setDraft((p) => ({ ...p, quiet_hours_enabled: v }))}
          disabled={isLoading}
        />
      </div>

      {draft.quiet_hours_enabled && (
        <>
          {/* Time range */}
          <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-4 space-y-3">
            <div className="flex items-center gap-2 text-xs text-white/40 uppercase tracking-widest">
              <Clock className="w-3.5 h-3.5" />
              Время
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="qh-start" className="text-xs text-white/50">
                  С
                </Label>
                <input
                  id="qh-start"
                  type="time"
                  value={draft.quiet_start}
                  onChange={(e) => setDraft((p) => ({ ...p, quiet_start: e.target.value }))}
                  className="w-full rounded-xl bg-white/10 border border-white/10 text-white px-3 py-2 text-sm [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <span className="text-white/30 mt-5">—</span>
              <div className="flex-1 space-y-1">
                <Label htmlFor="qh-end" className="text-xs text-white/50">
                  До
                </Label>
                <input
                  id="qh-end"
                  type="time"
                  value={draft.quiet_end}
                  onChange={(e) => setDraft((p) => ({ ...p, quiet_end: e.target.value }))}
                  className="w-full rounded-xl bg-white/10 border border-white/10 text-white px-3 py-2 text-sm [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Days of week */}
          <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-4 space-y-3">
            <p className="text-xs text-white/40 uppercase tracking-widest">Дни недели</p>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS.map((day) => {
                const active = draft.quiet_days.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleDay(day.id)}
                    title={day.long}
                    aria-pressed={active}
                    className={cn(
                      "w-10 h-10 rounded-full text-sm font-medium transition-colors border",
                      active
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
                    )}
                  >
                    {day.short}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          {previewText && (
            <p className="text-xs text-indigo-300 bg-indigo-900/30 border border-indigo-700/30 rounded-xl px-4 py-3">
              {previewText}
            </p>
          )}
        </>
      )}

      {/* Save button */}
      <Button
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 font-medium"
        onClick={handleSave}
        disabled={saving || isLoading}
      >
        {saving ? "Сохранение…" : "Сохранить"}
      </Button>
    </div>
  );
}
