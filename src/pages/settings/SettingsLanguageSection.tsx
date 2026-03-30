/**
 * src/pages/settings/SettingsLanguageSection.tsx
 *
 * Extracted from SettingsPage.tsx — application language selection.
 */
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { SettingsHeader, SettingsMenuItem } from "./helpers";
import type { SectionProps } from "./types";

const LANGUAGES = [
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
] as const;

export function SettingsLanguageSection({ isDark, onBack }: SectionProps) {
  const { user } = useAuth();
  const isAuthed = !!user?.id;
  const { settings, update: updateSettings } = useUserSettings();

  return (
    <>
      <SettingsHeader
        title="Язык"
        isDark={isDark}
        currentScreen="language"
        onBack={onBack}
        onClose={onBack}
      />
      <div className="flex-1 overflow-y-auto native-scroll pb-8">
        <div
          className={cn(
            "mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden",
            isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
          )}
        >
          {LANGUAGES.map((item) => (
            <SettingsMenuItem
              key={item.code}
              icon={<Globe className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
              label={item.label}
              isDark={isDark}
              onClick={async () => {
                if (!isAuthed) return;
                await updateSettings({ language_code: item.code });
              }}
              value={settings?.language_code === item.code ? "✓" : undefined}
            />
          ))}
        </div>
      </div>
    </>
  );
}
