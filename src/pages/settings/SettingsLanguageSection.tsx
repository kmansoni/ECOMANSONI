/**
 * src/pages/settings/SettingsLanguageSection.tsx
 *
 * Extracted from SettingsPage.tsx — application language selection.
 */
import { useState } from "react";
import { Globe, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { Input } from "@/components/ui/input";
import { SettingsHeader, SettingsMenuItem } from "./helpers";
import type { SectionProps } from "./types";

const LANGUAGES = [
  { code: "ru", label: "Русский", native: "Русский" },
  { code: "en", label: "English", native: "English" },
  { code: "uk", label: "Українська", native: "Українська" },
  { code: "kk", label: "Қазақша", native: "Қазақша" },
  { code: "uz", label: "O'zbekcha", native: "O'zbekcha" },
  { code: "tr", label: "Türkçe", native: "Türkçe" },
  { code: "de", label: "Deutsch", native: "Deutsch" },
  { code: "fr", label: "Français", native: "Français" },
  { code: "es", label: "Español", native: "Español" },
  { code: "ar", label: "العربية", native: "العربية" },
] as const;

export function SettingsLanguageSection({ isDark, onBack }: SectionProps) {
  const { user } = useAuth();
  const isAuthed = !!user?.id;
  const { settings, update: updateSettings } = useUserSettings();
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? LANGUAGES.filter((l) => l.label.toLowerCase().includes(search.toLowerCase()) || l.native.toLowerCase().includes(search.toLowerCase()))
    : LANGUAGES;

  return (
    <>
      <SettingsHeader
        title="Язык"
        isDark={isDark}
        currentScreen="language"
        onBack={onBack}
        onClose={onBack}
      />
      <div className="flex-1 pb-8">
        <div className="px-4 mb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск языка…"
              className="pl-9"
            />
          </div>
        </div>
        <div
          className={cn(
            "mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden",
            isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
          )}
        >
          {filtered.map((item) => (
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
