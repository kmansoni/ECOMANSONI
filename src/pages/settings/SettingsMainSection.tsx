/**
 * src/pages/settings/SettingsMainSection.tsx
 *
 * Extracted from SettingsPage.tsx — the main settings menu screen.
 * Renders grouped menu items (Account, Settings, Support, Logout).
 */
import { Moon, Bell, Lock, HelpCircle, Info, LogOut, Shield, Archive, Clock, Bookmark, Users, Smartphone, Database, AlertCircle, BarChart3, Accessibility, Globe, BadgeCheck, Smile, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsHeader, SettingsMenuItem } from "./helpers";
import type { Screen, SectionProps } from "./types";

interface SettingsMainSectionProps extends SectionProps {
  /** Current language code for the "Язык" menu item value. */
  languageCode: string | undefined;
  /** Status emoji for the "Стикеры и эмодзи" menu item value. */
  statusEmoji: string | null | undefined;
  /** Triggers the logout confirmation AlertDialog in the orchestrator. */
  onLogout: () => void;
  /** Navigate-back / close — passed through to SettingsHeader. */
  onClose: () => void;
}

export function SettingsMainSection({
  isDark,
  onNavigate,
  languageCode,
  statusEmoji,
  onLogout,
  onClose,
}: SettingsMainSectionProps) {
  const nav = (screen: Screen) => () => onNavigate(screen);

  const icon = (Icon: React.ElementType) => (
    <Icon className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />
  );

  return (
    <>
      <SettingsHeader
        title="Настройки"
        showBack={false}
        isDark={isDark}
        currentScreen="main"
        onBack={onClose}
        onClose={onClose}
      />

      <div className="flex-1 pb-8">
        {/* Account */}
        <div className="px-4 mb-3">
          <p className={cn("text-sm mb-2 px-1", isDark ? "text-white/60" : "text-white/60")}>Аккаунт</p>
          <div className={cn(
            "backdrop-blur-xl rounded-2xl border overflow-hidden",
            isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
          )}>
            <SettingsMenuItem icon={icon(Bookmark)} label="Сохранённое" isDark={isDark} onClick={nav("saved")} />
            <SettingsMenuItem icon={icon(Archive)} label="Архив" isDark={isDark} onClick={nav("archive")} />
            <SettingsMenuItem icon={icon(Clock)} label="Ваша активность" isDark={isDark} onClick={nav("activity")} />
          </div>
        </div>

        {/* Settings */}
        <div className="px-4 mb-3">
          <p className={cn("text-sm mb-2 px-1", isDark ? "text-white/60" : "text-white/60")}>Настройки</p>
          <div className={cn(
            "backdrop-blur-xl rounded-2xl border overflow-hidden",
            isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
          )}>
            <SettingsMenuItem icon={icon(Bell)} label="Уведомления и звук" isDark={isDark} onClick={nav("notifications")} />
            <SettingsMenuItem icon={icon(Phone)} label="Звонки" isDark={isDark} onClick={nav("calls")} />
            <SettingsMenuItem icon={icon(AlertCircle)} label="Энергосбережение" isDark={isDark} onClick={nav("energy_saver")} />
            <SettingsMenuItem icon={icon(Database)} label="Данные и память" isDark={isDark} onClick={nav("data_storage")} />
            <SettingsMenuItem icon={icon(Lock)} label="Конфиденциальность" isDark={isDark} onClick={nav("privacy")} />
            <SettingsMenuItem icon={icon(Users)} label="Близкие друзья" isDark={isDark} onClick={nav("close_friends")} />
            <SettingsMenuItem icon={icon(Smile)} label="Стикеры и эмодзи" isDark={isDark} onClick={nav("profile_status")} value={statusEmoji ?? undefined} />
            <SettingsMenuItem icon={icon(Shield)} label="Безопасность" isDark={isDark} onClick={nav("security")} />
            <SettingsMenuItem icon={icon(Moon)} label="Оформление" isDark={isDark} onClick={nav("appearance")} />
            <SettingsMenuItem icon={icon(Archive)} label="Папки с чатами" isDark={isDark} onClick={nav("chat_folders")} />
            <SettingsMenuItem icon={icon(Smartphone)} label="Устройства" isDark={isDark} onClick={nav("security_sessions")} />
            <SettingsMenuItem icon={icon(Globe)} label="Язык" isDark={isDark} onClick={nav("language")} value={languageCode ?? "ru"} />
            <SettingsMenuItem icon={icon(Accessibility)} label="Доступность" isDark={isDark} onClick={nav("accessibility")} />
            <SettingsMenuItem icon={icon(BarChart3)} label="Статистика" isDark={isDark} onClick={nav("statistics")} />
            <SettingsMenuItem icon={icon(BadgeCheck)} label="Брендированный контент" isDark={isDark} onClick={nav("branded_content")} />
          </div>
        </div>

        {/* Support */}
        <div className="px-4 mb-3">
          <p className={cn("text-sm mb-2 px-1", isDark ? "text-white/60" : "text-white/60")}>Поддержка</p>
          <div className={cn(
            "backdrop-blur-xl rounded-2xl border overflow-hidden",
            isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
          )}>
            <SettingsMenuItem icon={icon(HelpCircle)} label="Помощь" isDark={isDark} onClick={nav("help")} />
            <SettingsMenuItem icon={icon(Info)} label="О приложении" isDark={isDark} onClick={nav("about")} />
          </div>
        </div>

        {/* Logout */}
        <div className="px-4 mt-6">
          <button
            onClick={onLogout}
            className={cn(
              "w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-2xl transition-colors",
              isDark
                ? "bg-red-500/20 border border-red-500/30 text-red-200 hover:bg-red-500/30"
                : "bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/15",
            )}
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Выйти</span>
          </button>
        </div>
      </div>
    </>
  );
}
