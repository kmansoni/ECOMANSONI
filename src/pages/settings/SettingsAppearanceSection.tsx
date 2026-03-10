/**
 * src/pages/settings/SettingsAppearanceSection.tsx
 * Screens: "appearance" | "energy_saver"
 * Delegates to the existing AppearanceAndEnergyCenter component.
 */
import { AppearanceAndEnergyCenter } from "@/components/settings/AppearanceAndEnergyCenter";
import { useAuth } from "@/hooks/useAuth";
import { SettingsHeader } from "./helpers";
import type { SectionProps } from "./types";

type AppearanceScreen = "appearance" | "energy_saver";

interface AppearanceSectionProps extends SectionProps {
  currentScreen: AppearanceScreen;
}

export function SettingsAppearanceSection({ isDark, currentScreen, onNavigate, onBack }: AppearanceSectionProps) {
  const { user } = useAuth();
  const title = currentScreen === "energy_saver" ? "Energy Saver" : "Appearance";

  return (
    <>
      <SettingsHeader
        title={title}
        isDark={isDark}
        currentScreen={currentScreen}
        onBack={onBack}
        onClose={onBack}
      />
      <div className="flex-1 overflow-y-auto native-scroll pb-8">
        <AppearanceAndEnergyCenter
          mode={currentScreen === "energy_saver" ? "energy" : "appearance"}
          userId={user?.id ?? null}
          isDark={isDark}
          onOpenEnergy={currentScreen === "appearance" ? () => onNavigate("energy_saver") : undefined}
        />
      </div>
    </>
  );
}
