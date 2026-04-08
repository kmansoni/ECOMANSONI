/**
 * src/pages/settings/SettingsDataStorageSection.tsx
 * Screen: "data_storage"
 */
import { useState } from "react";
import { Download, FileText, Video, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import { toast } from "@/hooks/use-toast";
import { clearIceServerCache } from "@/lib/webrtc-config";
import { SettingsHeader, SettingsToggleItem } from "./helpers";
import { estimateLocalStorageBytes, formatBytes } from "./formatters";
import type { SectionProps } from "./types";

interface DataStorageSectionProps extends SectionProps {
  onDeleteAllFolders: () => void;
}

export function SettingsDataStorageSection({ isDark, onBack, onDeleteAllFolders }: DataStorageSectionProps) {
  const { user } = useAuth();
  const { settings, update: updateSettings } = useUserSettings();
  const isAuthed = !!user?.id;
  const [, setTick] = useState(0);
  const storageBytes = estimateLocalStorageBytes();

  return (
    <>
      <SettingsHeader title="Данные и память" isDark={isDark} currentScreen="data_storage" onBack={onBack} onClose={onBack} />
      <div className="flex-1 pb-8">
        <div className="px-4 grid gap-3">

          {/* Device storage */}
          <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
            <div className="px-5 py-4">
              <p className="font-semibold">Хранилище устройства</p>
              <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                Локальный кэш (localStorage): {formatBytes(storageBytes)}
              </p>
            </div>
            <div className="px-5 pb-5 flex flex-col gap-2">
              <Button variant="secondary" onClick={() => {
                const prefixes = ["chat.hiddenMessages.v1.", "chat.pinnedMessage.v1."];
                let removed = 0;
                try {
                  const keys: string[] = [];
                  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) keys.push(k); }
                  for (const k of keys) { if (prefixes.some((p) => k.startsWith(p))) { localStorage.removeItem(k); removed++; } }
                } catch (error) {
                  toast({ title: "Кэш", description: error instanceof Error ? error.message : "Failed to clear cache." });
                }
                toast({ title: "Готово", description: `Кэш чатов очищен (${removed}).` });
                setTick((x) => x + 1);
              }}>
                Очистить кэш чатов
              </Button>
              <Button variant="secondary" onClick={() => {
                if (!user?.id) { toast({ title: "Папки", description: "Необходимо войти в аккаунт." }); return; }
                onDeleteAllFolders();
              }}>
                Удалить папки чатов
              </Button>
              <Button variant="secondary" onClick={() => {
                clearIceServerCache();
                toast({ title: "Готово", description: "Кэш звонков (ICE/TURN) очищен." });
              }}>
                Очистить кэш звонков
              </Button>
            </div>
          </div>

          {/* Auto-download */}
          <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
            <SettingsToggleItem
              icon={<Download className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
              label="Автозагрузка медиа"
              description="Автоматически загружать фото и видео в чатах"
              isDark={isDark}
              checked={settings?.media_auto_download_enabled ?? true}
              onCheckedChange={async (val) => { if (isAuthed) await updateSettings({ media_auto_download_enabled: val }); }}
            />
            {(settings?.media_auto_download_enabled ?? true) && (
              <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
                <SettingsToggleItem
                  icon={<FileText className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
                  label="Фото" description="Автоматически скачивать изображения" isDark={isDark}
                  checked={settings?.media_auto_download_photos ?? true}
                  onCheckedChange={async (val) => { if (isAuthed) await updateSettings({ media_auto_download_photos: val }); }}
                />
                <SettingsToggleItem
                  icon={<Video className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
                  label="Видео" description="Автоматически скачивать видео" isDark={isDark}
                  checked={settings?.media_auto_download_videos ?? true}
                  onCheckedChange={async (val) => { if (isAuthed) await updateSettings({ media_auto_download_videos: val }); }}
                />
                <SettingsToggleItem
                  icon={<Download className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
                  label="Файлы" description="Автоматически скачивать файлы" isDark={isDark}
                  checked={settings?.media_auto_download_files ?? true}
                  onCheckedChange={async (val) => { if (isAuthed) await updateSettings({ media_auto_download_files: val }); }}
                />
                <div className={cn("px-5 py-4 border-t", isDark ? "border-white/10" : "border-white/20")}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">Лимит размера файла</p>
                      <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                        До {settings?.media_auto_download_files_max_mb ?? 3} МБ
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Slider value={[settings?.media_auto_download_files_max_mb ?? 3]} min={1} max={50} step={1}
                      onValueCommit={async (vals) => { if (isAuthed) await updateSettings({ media_auto_download_files_max_mb: Math.max(1, Math.round(vals[0] ?? 3)) }); }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Cache settings */}
          <div className={cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20")}>
            <div className="px-5 py-4"><p className="font-semibold">Кэш</p></div>
            <SettingsToggleItem
              icon={<Database className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />}
              label="Ограничить размер кэша" description="Если выключено — лимит автоматический" isDark={isDark}
              checked={settings?.cache_max_size_mb != null}
              onCheckedChange={async (val) => { if (isAuthed) await updateSettings({ cache_max_size_mb: val ? 500 : null }); }}
            />
            {settings?.cache_max_size_mb != null && (
              <div className={cn("px-5 py-4 border-t", isDark ? "border-white/10" : "border-white/20")}>
                <p className="font-medium">Максимум: {settings.cache_max_size_mb} МБ</p>
                <div className="mt-3">
                  <Slider value={[settings.cache_max_size_mb]} min={100} max={5000} step={50}
                    onValueCommit={async (vals) => { if (isAuthed) await updateSettings({ cache_max_size_mb: Math.max(100, Math.round(vals[0] ?? 500)) }); }}
                  />
                </div>
              </div>
            )}
            <div className={cn("px-5 py-4 border-t", isDark ? "border-white/10" : "border-white/20")}>
              <p className="font-medium">Автоочистка кэша</p>
              <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                {(settings?.cache_auto_delete_days ?? 7) === 0 ? "Никогда" : `Через ${settings?.cache_auto_delete_days ?? 7} дн.`}
              </p>
              <div className="mt-3">
                <Slider value={[settings?.cache_auto_delete_days ?? 7]} min={0} max={30} step={1}
                  onValueCommit={async (vals) => { if (isAuthed) await updateSettings({ cache_auto_delete_days: Math.max(0, Math.round(vals[0] ?? 7)) }); }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
