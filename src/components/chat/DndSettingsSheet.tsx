/**
 * DndSettingsSheet — Bottom sheet для настройки режима "Не беспокоить".
 *
 * Функции:
 *  - Переключатель DND вкл/выкл
 *  - Быстрые пресеты: 1ч, 2ч, 8ч, До утра (08:00), Навсегда
 *  - Кастомная дата/время окончания
 *  - Чекбокс "Пропускать звонки"
 *  - Автоответ (текстовое поле)
 *  - Кнопка "Применить"
 */

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Moon, Phone, MessageSquare, Clock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDndStatus, type DndSettings } from "@/hooks/useDndStatus";
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DndSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Preset = "1h" | "2h" | "8h" | "morning" | "forever" | "custom";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function presetToDate(preset: Exclude<Preset, "custom" | "forever">): Date {
  const now = new Date();
  switch (preset) {
    case "1h": {
      const d = new Date(now);
      d.setHours(d.getHours() + 1);
      return d;
    }
    case "2h": {
      const d = new Date(now);
      d.setHours(d.getHours() + 2);
      return d;
    }
    case "8h": {
      const d = new Date(now);
      d.setHours(d.getHours() + 8);
      return d;
    }
    case "morning": {
      // Next 08:00
      const d = new Date(now);
      d.setHours(8, 0, 0, 0);
      if (d <= now) d.setDate(d.getDate() + 1);
      return d;
    }
  }
}

/** Convert Date → "YYYY-MM-DDThh:mm" for datetime-local input */
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: "1h", label: "1 час" },
  { id: "2h", label: "2 часа" },
  { id: "8h", label: "8 часов" },
  { id: "morning", label: "До утра (08:00)" },
  { id: "forever", label: "Навсегда" },
  { id: "custom", label: "Другое время…" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function DndSettingsSheet({ open, onOpenChange }: DndSettingsSheetProps) {
  const { settings, isInDnd, isLoading, enable, disable, updateSettings } = useDndStatus();

  // Local draft state — committed only on "Apply"
  const [dndEnabled, setDndEnabled] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<Preset>("forever");
  const [customDatetime, setCustomDatetime] = useState("");
  const [allowCalls, setAllowCalls] = useState(false);
  const [autoReply, setAutoReply] = useState("");
  const [saving, setSaving] = useState(false);

  // Sync from loaded settings when sheet opens
  useEffect(() => {
    if (!open || isLoading) return;
    setDndEnabled(settings.dnd_enabled);
    setAllowCalls(settings.dnd_allow_calls);
    setAutoReply(settings.dnd_auto_reply ?? "");

    if (settings.dnd_until) {
      const until = new Date(settings.dnd_until);
      setCustomDatetime(toDatetimeLocal(until));
      setSelectedPreset("custom");
    } else if (settings.dnd_enabled) {
      setSelectedPreset("forever");
    }
  }, [open, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = async () => {
    setSaving(true);
    try {
      if (!dndEnabled) {
        await disable();
        toast.success("Режим «Не беспокоить» отключён");
      } else {
        let until: Date | undefined;

        if (selectedPreset === "forever") {
          until = undefined;
        } else if (selectedPreset === "custom") {
          if (!customDatetime) {
            toast.error("Укажите дату и время окончания");
            setSaving(false);
            return;
          }
          until = new Date(customDatetime);
          if (until <= new Date()) {
            toast.error("Время окончания должно быть в будущем");
            setSaving(false);
            return;
          }
        } else {
          until = presetToDate(selectedPreset as Exclude<Preset, "custom" | "forever">);
        }

        await enable({
          until,
          allowCalls,
          autoReply: autoReply.trim() || undefined,
          exceptions: settings.dnd_exceptions,
        });
        toast.success("Режим «Не беспокоить» включён");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error("Не удалось сохранить настройки");
      logger.error("dnd-settings: failed to apply settings", { error: e });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-t border-white/10 bg-zinc-950 text-white p-0"
        aria-describedby={undefined}
      >
        <div className="max-h-[85vh] overflow-y-auto p-6 pb-10 space-y-5">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-white flex items-center gap-2">
              <Moon className="w-5 h-5 text-indigo-400" />
              Не беспокоить
            </SheetTitle>
          </SheetHeader>

          {/* Master toggle */}
          <div className="flex items-center justify-between rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">Режим «Не беспокоить»</p>
              <p className="text-xs text-white/50 mt-0.5">
                {isInDnd ? "Активен" : "Уведомления приходят в обычном режиме"}
              </p>
            </div>
            <Switch
              checked={dndEnabled}
              onCheckedChange={setDndEnabled}
              aria-label="Включить режим Не беспокоить"
            />
          </div>

          {/* Duration presets — only when enabling */}
          {dndEnabled && (
            <>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-widest mb-2 px-1">
                  Продолжительность
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPreset(p.id)}
                      className={[
                        "rounded-xl px-3 py-2 text-sm transition-colors border",
                        selectedPreset === p.id
                          ? "bg-indigo-600 border-indigo-500 text-white"
                          : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10",
                      ].join(" ")}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom datetime picker */}
              {selectedPreset === "custom" && (
                <div className="space-y-1.5">
                  <Label htmlFor="dnd-custom-time" className="text-xs text-white/50">
                    Дата и время окончания
                  </Label>
                  <Input
                    id="dnd-custom-time"
                    type="datetime-local"
                    value={customDatetime}
                    onChange={(e) => setCustomDatetime(e.target.value)}
                    className="bg-white/5 border-white/10 text-white [color-scheme:dark]"
                    min={toDatetimeLocal(new Date())}
                  />
                </div>
              )}

              {/* Allow calls toggle */}
              <div className="flex items-center justify-between rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-white/50" />
                  <div>
                    <p className="text-sm text-white">Пропускать звонки</p>
                    <p className="text-xs text-white/40">Входящие звонки будут проходить</p>
                  </div>
                </div>
                <Switch
                  checked={allowCalls}
                  onCheckedChange={setAllowCalls}
                  aria-label="Пропускать звонки в режиме ДНД"
                />
              </div>

              {/* Auto-reply */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="dnd-autoreply"
                  className="text-xs text-white/50 flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Автоответ (необязательно)
                </Label>
                <Input
                  id="dnd-autoreply"
                  placeholder="Например: «Я занят, отвечу позже»"
                  value={autoReply}
                  onChange={(e) => setAutoReply(e.target.value)}
                  maxLength={200}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
                <p className="text-xs text-white/30 text-right">{autoReply.length}/200</p>
              </div>
            </>
          )}

          {/* Apply button */}
          <Button
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-12 font-medium"
            onClick={handleApply}
            disabled={saving}
          >
            {saving ? "Сохранение…" : "Применить"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
