/**
 * src/pages/settings/SettingsCallsSection.tsx
 * Screen: "calls"
 */
import { Phone, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { SettingsHeader, SettingsToggleItem } from "./helpers";
import type { SectionProps } from "./types";

export function SettingsCallsSection({ isDark, onBack }: SectionProps) {
  const { user } = useAuth();
  const { settings, update: updateSettings } = useUserSettings();
  const isAuthed = !!user?.id;

  return (
    <>
      <SettingsHeader title="Calls" isDark={isDark} currentScreen="calls" onBack={onBack} onClose={onBack} />
      <div className="flex-1 overflow-y-auto native-scroll pb-8">
        <div className="px-4 grid gap-3">
          <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
            <SettingsToggleItem
              icon={<Phone className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
              label="Calls Tab"
              description="Show calls tab in the notification area"
              isDark={isDark}
              checked={settings?.show_calls_tab ?? true}
              onCheckedChange={async (val) => { if (isAuthed) await updateSettings({ show_calls_tab: val }); }}
            />
          </div>

          <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
            <SettingsToggleItem
              icon={<Volume2 className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
              label="Noise Suppression"
              description="Suppress background noise during calls"
              isDark={isDark}
              checked={settings?.calls_noise_suppression ?? true}
              onCheckedChange={async (val) => { if (isAuthed) await updateSettings({ calls_noise_suppression: val }); }}
            />
          </div>

          <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
            <div className="px-5 py-4">
              <p className="font-semibold">Peer-to-Peer</p>
              <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                Who can use direct P2P connections
              </p>
            </div>
            <div className="px-5 pb-4 flex flex-col gap-1">
              {(["everyone", "contacts", "nobody"] as const).map((mode) => {
                const labels: Record<string, string> = { everyone: "Everyone", contacts: "Contacts", nobody: "Nobody" };
                const isActive = (settings?.calls_p2p_mode ?? "contacts") === mode;
                return (
                  <button
                    key={mode}
                    onClick={async () => { if (isAuthed) await updateSettings({ calls_p2p_mode: mode }); }}
                    className={cn(
                      "w-full text-left px-4 py-3 rounded-xl transition-colors",
                      isActive
                        ? isDark ? "bg-white/10 font-semibold" : "bg-primary/10 font-semibold text-primary"
                        : isDark ? "hover:bg-white/5" : "hover:bg-muted/30",
                    )}
                  >
                    {labels[mode]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
