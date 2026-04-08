/**
 * src/pages/settings/SettingsHelpSection.tsx
 * Screen: "help"
 */
import { HelpCircle, AlertCircle, FileText, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsHeader, SettingsMenuItem } from "./helpers";
import type { SectionProps } from "./types";

export function SettingsHelpSection({ isDark, onNavigate: _onNavigate, onBack }: SectionProps) {
  return (
    <>
      <SettingsHeader
        title="Помощь"
        isDark={isDark}
        currentScreen="help"
        onBack={onBack}
        onClose={onBack}
      />
      <div className="flex-1">
        <div
          className={cn(
            "mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden",
            isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
          )}
        >
          <SettingsMenuItem
            icon={<HelpCircle className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Центр помощи"
            isDark={isDark}
            onClick={() => window.open("https://mansoni.app/help", "_blank", "noopener,noreferrer")}
          />
          <SettingsMenuItem
            icon={<AlertCircle className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Сообщить о проблеме"
            isDark={isDark}
            onClick={() =>
              window.open(
                "mailto:support@mansoni.app?subject=%D0%A1%D0%BE%D0%BE%D0%B1%D1%89%D0%B5%D0%BD%D0%B8%D0%B5%20%D0%BE%20%D0%BF%D1%80%D0%BE%D0%B1%D0%BB%D0%B5%D0%BC%D0%B5",
                "_blank",
                "noopener,noreferrer",
              )
            }
          />
          <SettingsMenuItem
            icon={<FileText className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Условия использования"
            isDark={isDark}
            onClick={() => window.open("https://mansoni.app/terms", "_blank", "noopener,noreferrer")}
          />
          <SettingsMenuItem
            icon={<Lock className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Политика конфиденциальности"
            isDark={isDark}
            onClick={() => window.open("https://mansoni.app/privacy", "_blank", "noopener,noreferrer")}
          />
        </div>
      </div>
    </>
  );
}
