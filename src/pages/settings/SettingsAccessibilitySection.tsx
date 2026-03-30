/**
 * src/pages/settings/SettingsAccessibilitySection.tsx
 *
 * Extracted from SettingsPage.tsx — accessibility toggles
 * (reduce_motion, high_contrast).
 */
import { Accessibility, Eye } from "lucide-react";
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
            description="Respect prefers-reduced-motion"
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
        </div>
      </div>
    </>
  );
}
