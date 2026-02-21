import { useEffect, useMemo, useState } from "react";
import { Palette, Moon, Type, Radius, Sparkles, Sticker, Smartphone } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import {
  getOrCreateAppearanceSettings,
  updateAppearanceSettings,
  listAppIconCatalog,
  getOrCreateUserAppIconSelection,
  setUserAppIconSelection,
  getOrCreateEnergySaverSettings,
  updateEnergySaverSettings,
  type UserAppearanceSettings,
  type UserEnergySaverSettings,
  type AppIconCatalogItem,
} from "@/lib/appearance-energy";

type Props = {
  userId: string | null;
  isDark: boolean;
  mode: "appearance" | "energy";
  onOpenEnergy?: () => void;
};

function cardClass(isDark: boolean): string {
  return cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20");
}

const THEMES = [
  { id: "night", label: "Ночной режим", bubble: "from-indigo-500 to-violet-500" },
  { id: "duck", label: "Утка", bubble: "from-lime-500 to-emerald-500" },
  { id: "snow", label: "Снег", bubble: "from-sky-500 to-cyan-400" },
  { id: "diamond", label: "Алмаз", bubble: "from-fuchsia-500 to-purple-400" },
];

const WALLPAPERS = [
  { id: "home", label: "Дом" },
  { id: "duck", label: "Утка" },
  { id: "snowman", label: "Снеговик" },
  { id: "diamond", label: "Алмаз" },
];

export function AppearanceAndEnergyCenter({ userId, isDark, mode, onOpenEnergy }: Props) {
  const { setTheme } = useTheme();
  const { update: updateUserSettings } = useUserSettings();
  const [appearance, setAppearance] = useState<UserAppearanceSettings | null>(null);
  const [energy, setEnergy] = useState<UserEnergySaverSettings | null>(null);
  const [icons, setIcons] = useState<AppIconCatalogItem[]>([]);
  const [selectedIconId, setSelectedIconId] = useState<string>("main");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [a, e, iconCatalog, iconId] = await Promise.all([
          getOrCreateAppearanceSettings(userId),
          getOrCreateEnergySaverSettings(userId),
          listAppIconCatalog(),
          getOrCreateUserAppIconSelection(userId),
        ]);
        if (cancelled) return;
        setAppearance(a);
        setEnergy(e);
        setIcons(iconCatalog);
        setSelectedIconId(iconId);
      } catch (err) {
        if (!cancelled) {
          toast({ title: "Настройки", description: err instanceof Error ? err.message : String(err) });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const applyThemeMode = (modeValue: UserAppearanceSettings["dark_theme"]) => {
    if (modeValue === "system") setTheme("system");
    if (modeValue === "light") setTheme("light");
    if (modeValue === "dark") setTheme("dark");
  };

  const updateAppearance = async (patch: Partial<Omit<UserAppearanceSettings, "user_id" | "updated_at" | "created_at">>) => {
    if (!userId || !appearance) return;
    const next = await updateAppearanceSettings(userId, patch);
    setAppearance(next);
    if (patch.dark_theme) applyThemeMode(patch.dark_theme);
    window.dispatchEvent(new Event("appearance-runtime-refresh"));
  };

  const updateEnergy = async (patch: Partial<Omit<UserEnergySaverSettings, "user_id" | "updated_at" | "created_at">>) => {
    if (!userId || !energy) return;
    const next = await updateEnergySaverSettings(userId, patch);
    setEnergy(next);
    window.dispatchEvent(new Event("appearance-runtime-refresh"));
  };

  const energyRows = useMemo(
    () => [
      ["autoplay_video", "Автозапуск видео"],
      ["autoplay_gif", "Автозапуск GIF"],
      ["animated_stickers", "Анимированные стикеры"],
      ["animated_emoji", "Анимированные эмодзи"],
      ["interface_animations", "Анимации интерфейса"],
      ["media_preload", "Предзагрузка медиа"],
      ["background_updates", "Обновление в фоне"],
    ] as Array<[keyof UserEnergySaverSettings, string]>,
    [],
  );

  if (loading) {
    return <div className={cn("px-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</div>;
  }

  if (!appearance || !energy) {
    return <div className={cn("px-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Недостаточно данных.</div>;
  }

  if (mode === "energy") {
    return (
      <div className="px-4 pb-8 grid gap-3">
        <div className={cardClass(isDark)}>
          <div className="px-5 py-4">
            <p className="font-semibold">Режим энергосбережения</p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {[
                ["off", "Выкл."],
                ["auto", "Авто"],
                ["manual", "Вкл."],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  variant={energy.mode === value ? "default" : "secondary"}
                  onClick={() => void updateEnergy({ mode: value as UserEnergySaverSettings["mode"] })}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="mt-4">
              <p className={cn("text-sm mb-2", isDark ? "text-white/60" : "text-white/70")}>
                Порог: {energy.battery_threshold_percent}%
              </p>
              <Slider
                value={[energy.battery_threshold_percent]}
                min={5}
                max={99}
                step={1}
                onValueCommit={(vals) => void updateEnergy({ battery_threshold_percent: Math.round(vals[0] ?? 15) })}
              />
            </div>
          </div>
        </div>

        <div className={cardClass(isDark)}>
          {energyRows.map(([key, label], idx) => (
            <div
              key={key}
              className={cn(
                "px-5 py-4 flex items-center justify-between gap-3",
                idx < energyRows.length - 1 && (isDark ? "border-b border-white/10" : "border-b border-white/20"),
              )}
            >
              <p className="font-medium">{label}</p>
              <Switch
                checked={Boolean(energy[key])}
                onCheckedChange={(val) => void updateEnergy({ [key]: val } as any)}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 grid gap-3">
      <div className={cardClass(isDark)}>
        <div className="px-5 py-4">
          <p className="font-semibold mb-3">Темы для чатов</p>
          <div className="grid grid-cols-4 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => void updateAppearance({ chat_theme_id: t.id })}
                className={cn(
                  "rounded-xl border p-2 text-left",
                  appearance.chat_theme_id === t.id
                    ? "border-blue-400"
                    : isDark
                      ? "border-white/10"
                      : "border-white/20",
                )}
              >
                <div className={cn("h-8 rounded-lg bg-gradient-to-r", t.bubble)} />
                <p className={cn("text-xs mt-2 truncate", isDark ? "text-white/80" : "text-white/80")}>{t.label}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={cardClass(isDark)}>
        <div className="px-5 py-4">
          <p className="font-semibold">Обои для чатов</p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {WALLPAPERS.map((w) => (
              <Button
                key={w.id}
                variant={appearance.chat_wallpaper_id === w.id ? "default" : "secondary"}
                onClick={() => void updateAppearance({ chat_wallpaper_id: w.id })}
              >
                {w.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className={cardClass(isDark)}>
        <div className="px-5 py-4 grid gap-3">
          <p className="font-semibold">Персональные цвета</p>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Palette className={cn("w-4 h-4", isDark ? "text-white/60" : "text-muted-foreground")} />
              <span className="text-sm">Основной</span>
            </div>
            <Input type="color" value={appearance.personal_color_primary} onChange={(e) => void updateAppearance({ personal_color_primary: e.target.value })} className="w-16 p-1 h-9" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Palette className={cn("w-4 h-4", isDark ? "text-white/60" : "text-muted-foreground")} />
              <span className="text-sm">Дополнительный</span>
            </div>
            <Input type="color" value={appearance.personal_color_secondary} onChange={(e) => void updateAppearance({ personal_color_secondary: e.target.value })} className="w-16 p-1 h-9" />
          </div>
        </div>
      </div>

      <div className={cardClass(isDark)}>
        <div className={cn("px-5 py-4 flex items-center justify-between gap-3", isDark ? "border-b border-white/10" : "border-b border-white/20")}>
          <div className="flex items-center gap-2">
            <Moon className={cn("w-4 h-4", isDark ? "text-white/60" : "text-muted-foreground")} />
            <span className="font-medium">Ночной режим</span>
          </div>
          <Switch
            checked={appearance.dark_mode_enabled}
            onCheckedChange={(val) =>
              void (async () => {
                await updateAppearance({
                  dark_mode_enabled: val,
                  dark_theme: val ? "dark" : "light",
                });
                await updateUserSettings({ theme: val ? "dark" : "light" });
              })()
            }
          />
        </div>
        <div className="px-5 py-4">
          <p className={cn("text-sm mb-2", isDark ? "text-white/60" : "text-white/70")}>Ночная тема</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["system", "Системная"],
              ["dark", "Темная"],
              ["light", "Светлая"],
            ].map(([modeValue, label]) => (
              <Button
                key={modeValue}
                variant={appearance.dark_theme === modeValue ? "default" : "secondary"}
                onClick={() =>
                  void (async () => {
                    await updateAppearance({
                      dark_theme: modeValue as any,
                      dark_mode_enabled: modeValue !== "light",
                    });
                    await updateUserSettings({ theme: modeValue as "system" | "dark" | "light" });
                  })()
                }
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className={cardClass(isDark)}>
        <div className={cn("px-5 py-4", isDark ? "border-b border-white/10" : "border-b border-white/20")}>
          <div className="flex items-center gap-2 mb-2">
            <Type className={cn("w-4 h-4", isDark ? "text-white/60" : "text-muted-foreground")} />
            <p className="font-medium">Размер текста: {appearance.font_scale}%</p>
          </div>
          <Slider value={[appearance.font_scale]} min={80} max={200} step={5} onValueCommit={(vals) => void updateAppearance({ font_scale: Math.round(vals[0] ?? 100) })} />
        </div>
        <div className={cn("px-5 py-4", isDark ? "border-b border-white/10" : "border-b border-white/20")}>
          <div className="flex items-center gap-2 mb-2">
            <Radius className={cn("w-4 h-4", isDark ? "text-white/60" : "text-muted-foreground")} />
            <p className="font-medium">Углы сообщений: {appearance.message_corner_radius}</p>
          </div>
          <Slider value={[appearance.message_corner_radius]} min={0} max={28} step={1} onValueCommit={(vals) => void updateAppearance({ message_corner_radius: Math.round(vals[0] ?? 18) })} />
        </div>
        <div className={cn("px-5 py-4 flex items-center justify-between gap-3", isDark ? "border-b border-white/10" : "border-b border-white/20")}>
          <div className="flex items-center gap-2">
            <Sparkles className={cn("w-4 h-4", isDark ? "text-white/60" : "text-muted-foreground")} />
            <p className="font-medium">Анимации интерфейса</p>
          </div>
          <Switch checked={appearance.ui_animations_enabled} onCheckedChange={(val) => void updateAppearance({ ui_animations_enabled: val })} />
        </div>
        <div className={cn("px-5 py-4 flex items-center justify-between gap-3", isDark ? "border-b border-white/10" : "border-b border-white/20")}>
          <div className="flex items-center gap-2">
            <Sticker className={cn("w-4 h-4", isDark ? "text-white/60" : "text-muted-foreground")} />
            <p className="font-medium">Стикеры и эмодзи</p>
          </div>
          <Switch checked={appearance.stickers_emoji_animations_enabled} onCheckedChange={(val) => void updateAppearance({ stickers_emoji_animations_enabled: val })} />
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Smartphone className={cn("w-4 h-4", isDark ? "text-white/60" : "text-muted-foreground")} />
            <p className="font-medium">Листать медиа по нажатию</p>
          </div>
          <Switch checked={appearance.media_tap_navigation_enabled} onCheckedChange={(val) => void updateAppearance({ media_tap_navigation_enabled: val })} />
        </div>
      </div>

      <div className={cardClass(isDark)}>
        <div className="px-5 py-4">
          <p className="font-semibold mb-3">Иконка приложения</p>
          <div className="grid grid-cols-3 gap-2">
            {icons.map((icon) => (
              <button
                key={icon.id}
                type="button"
                onClick={async () => {
                  if (!userId) return;
                  await setUserAppIconSelection(userId, icon.id);
                  setSelectedIconId(icon.id);
                  toast({
                    title: "Иконка приложения",
                    description: "Иконка сохранена. Может потребоваться перезапуск приложения.",
                  });
                }}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left text-sm",
                  selectedIconId === icon.id
                    ? "border-blue-400"
                    : isDark
                      ? "border-white/10"
                      : "border-white/20",
                )}
              >
                <p className="font-medium truncate">{icon.name}</p>
                {icon.is_premium ? <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>Premium</p> : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={cardClass(isDark)}>
        <button type="button" onClick={onOpenEnergy} className="w-full px-5 py-4 text-left flex items-center justify-between">
          <span className="font-medium">Энергосбережение</span>
          <span className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>{energy.mode === "off" ? "Выкл." : energy.mode === "auto" ? `Авто ${energy.battery_threshold_percent}%` : "Вкл."}</span>
        </button>
      </div>
    </div>
  );
}
