import React from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  getOrCreateAppearanceSettings,
  getOrCreateEnergySaverSettings,
  type UserAppearanceSettings,
  type UserEnergySaverSettings,
} from "@/lib/appearance-energy";

type AppearanceRuntimeValue = {
  appearance: UserAppearanceSettings | null;
  energy: UserEnergySaverSettings | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AppearanceRuntimeContext = React.createContext<AppearanceRuntimeValue | null>(null);

function applyRuntime(
  appearance: UserAppearanceSettings | null,
  energy: UserEnergySaverSettings | null,
) {
  const root = document.documentElement;

  const fontScale = Math.max(80, Math.min(200, appearance?.font_scale ?? 100));
  const messageRadius = Math.max(0, Math.min(28, appearance?.message_corner_radius ?? 18));

  root.style.setProperty("--app-font-scale", `${fontScale}%`);
  root.style.setProperty("--message-corner-radius", `${messageRadius}px`);
  root.style.setProperty("--accent-primary", appearance?.personal_color_primary ?? "#4f8cff");
  root.style.setProperty("--accent-secondary", appearance?.personal_color_secondary ?? "#8b5cf6");

  root.dataset.chatTheme = appearance?.chat_theme_id ?? "night";
  root.dataset.chatWallpaper = appearance?.chat_wallpaper_id ?? "home";

  root.classList.toggle("appearance-no-ui-anim", !(appearance?.ui_animations_enabled ?? true));
  root.classList.toggle(
    "appearance-no-sticker-anim",
    !(appearance?.stickers_emoji_animations_enabled ?? true),
  );
  root.classList.toggle(
    "appearance-no-media-tap",
    !(appearance?.media_tap_navigation_enabled ?? true),
  );

  root.classList.toggle("energy-no-video-autoplay", !(energy?.autoplay_video ?? true));
  root.classList.toggle("energy-no-media-preload", !(energy?.media_preload ?? true));
}

export function AppearanceRuntimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [appearance, setAppearance] = React.useState<UserAppearanceSettings | null>(null);
  const [energy, setEnergy] = React.useState<UserEnergySaverSettings | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    if (!userId) {
      setAppearance(null);
      setEnergy(null);
      setLoading(false);
      applyRuntime(null, null);
      return;
    }

    setLoading(true);
    try {
      const [nextAppearance, nextEnergy] = await Promise.all([
        getOrCreateAppearanceSettings(userId),
        getOrCreateEnergySaverSettings(userId),
      ]);
      setAppearance(nextAppearance);
      setEnergy(nextEnergy);
      applyRuntime(nextAppearance, nextEnergy);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    const onRefresh = () => {
      void refresh();
    };
    window.addEventListener("appearance-runtime-refresh", onRefresh);
    return () => {
      window.removeEventListener("appearance-runtime-refresh", onRefresh);
    };
  }, [refresh]);

  React.useEffect(() => {
    applyRuntime(appearance, energy);
  }, [appearance, energy]);

  const value = React.useMemo<AppearanceRuntimeValue>(
    () => ({
      appearance,
      energy,
      loading,
      refresh,
    }),
    [appearance, energy, loading, refresh],
  );

  return (
    <AppearanceRuntimeContext.Provider value={value}>
      {children}
    </AppearanceRuntimeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppearanceRuntime() {
  const ctx = React.useContext(AppearanceRuntimeContext);
  if (!ctx) {
    throw new Error("useAppearanceRuntime must be used within AppearanceRuntimeProvider");
  }
  return ctx;
}

