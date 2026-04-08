/**
 * src/pages/settings/SettingsAboutSection.tsx
 * Screen: "about"
 */
import { FileText, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { SettingsHeader, SettingsMenuItem } from "./helpers";
import type { SectionProps } from "./types";

export function SettingsAboutSection({ isDark, onNavigate: _onNavigate, onBack }: SectionProps) {
  return (
    <>
      <SettingsHeader
        title="О приложении"
        isDark={isDark}
        currentScreen="about"
        onBack={onBack}
        onClose={onBack}
      />
      <div className="flex-1">
        <div className="p-8 flex flex-col items-center">
          <div
            className={cn(
              "w-20 h-20 rounded-2xl flex items-center justify-center mb-4 shadow-lg",
              isDark ? "settings-dark-card" : "bg-primary",
            )}
          >
            <span className={cn("text-3xl font-bold", isDark ? "text-white" : "text-primary-foreground")}>
              M
            </span>
          </div>
          <h3 className="text-xl font-semibold">mansoni</h3>
          <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/60")}>Версия 2.0.0</p>
        </div>
        <div
          className={cn(
            "mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden",
            isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
          )}
        >
          <SettingsMenuItem
            icon={<FileText className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Лицензии открытого ПО"
            isDark={isDark}
            onClick={() => window.open("https://mansoni.app/licenses", "_blank", "noopener,noreferrer")}
          />
          <SettingsMenuItem
            icon={<Info className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
            label="Информация о разработчике"
            isDark={isDark}
            onClick={() =>
              toast({
                title: "Разработчик",
                description: "mansoni — мессенджер нового поколения. © 2024–2026 Mansoni.",
              })
            }
          />
        </div>
      </div>
    </>
  );
}
