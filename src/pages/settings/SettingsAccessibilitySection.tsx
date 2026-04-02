/**
 * src/pages/settings/SettingsAccessibilitySection.tsx
 *
 * Extracted from SettingsPage.tsx — accessibility toggles
 * (reduce_motion, high_contrast).
 */
import { Accessibility, Eye, Type, Palette, MonitorSmartphone, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { SettingsHeader, SettingsToggleItem } from "./helpers";
import type { SectionProps } from "./types";

export function SettingsAccessibilitySection({ isDark, onBack }: SectionProps) {
  const { user } = useAuth();
  const isAuthed = !!user?.id;
  const { settings, update: updateSettings } = useUserSettings();

  return (
    <>
      <SettingsHeader
        title="Доступность"
        isDark={isDark}
        currentScreen="accessibility"
        onBack={onBack}
        onClose={onBack}
      />
      <div className="flex-1 overflow-y-auto native-scroll">
        <div
          className={cn(
            "mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden",
            isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
          )}
        >
          <SettingsToggleItem
            icon={<Accessibility className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Уменьшить анимации"
            description="Меньше движения для снижения нагрузки"
            isDark={isDark}
            checked={!!settings?.reduce_motion}
            onCheckedChange={async (val) => {
              if (!isAuthed) return;
              await updateSettings({ reduce_motion: val });
            }}
          />
          <SettingsToggleItem
            icon={<Eye className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Высокий контраст"
            description="Для лучшей читаемости"
            isDark={isDark}
            checked={!!settings?.high_contrast}
            onCheckedChange={async (val) => {
              if (!isAuthed) return;
              await updateSettings({ high_contrast: val });
            }}
          />
          <SettingsToggleItem
            icon={<Type className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Крупный текст"
            description="Увеличенный размер шрифта в интерфейсе"
            isDark={isDark}
            checked={!!settings?.large_text}
            onCheckedChange={async (val) => {
              if (!isAuthed) return;
              await updateSettings({ large_text: val });
            }}
          />
          <SettingsToggleItem
            icon={<Palette className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Режим для дальтоников"
            description="Адаптированные цвета для цветовой слепоты"
            isDark={isDark}
            checked={!!settings?.color_blind_mode}
            onCheckedChange={async (val) => {
              if (!isAuthed) return;
              await updateSettings({ color_blind_mode: val });
            }}
          />
          <SettingsToggleItem
            icon={<MonitorSmartphone className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Автовоспроизведение GIF"
            description="Отключите для экономии трафика"
            isDark={isDark}
            checked={settings?.autoplay_gifs !== false}
            onCheckedChange={async (val) => {
              if (!isAuthed) return;
              await updateSettings({ autoplay_gifs: val });
            }}
          />
          <SettingsToggleItem
            icon={<Volume2 className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Тактильная отдача"
            description="Вибрация при нажатии на элементы"
            isDark={isDark}
            checked={settings?.haptic_feedback !== false}
            onCheckedChange={async (val) => {
              if (!isAuthed) return;
              await updateSettings({ haptic_feedback: val });
            }}
          />
        </div>
      </div>
    </>
  );
}
