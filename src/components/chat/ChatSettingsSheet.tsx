import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, BellOff, Volume2, Vibrate, Palette, Type, Layers, Download, Archive, ArchiveRestore, Pin, PinOff } from 'lucide-react';
import { useChatSettings } from '@/hooks/useChatSettings';
import { useArchivedChats } from '@/hooks/useArchivedChats';
import { usePinnedChats } from '@/hooks/usePinnedChats';
import { WallpaperPicker } from './WallpaperPicker';
import { BubbleGradientPicker } from './BubbleGradientPicker';
import { MessageDensityToggle } from './MessageDensityToggle';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ChatSettingsSheetProps {
  conversationId: string;
  open: boolean;
  onClose: () => void;
}

type MuteDuration = '1h' | '8h' | '1d' | 'forever';

const MUTE_OPTIONS: { label: string; value: MuteDuration }[] = [
  { label: '1 час', value: '1h' },
  { label: '8 часов', value: '8h' },
  { label: '1 день', value: '1d' },
  { label: 'Навсегда', value: 'forever' },
];

const SOUNDS = ['default', 'none', 'chime', 'pop', 'ding'];
const FONT_SIZES = ['small', 'medium', 'large'];
const BUBBLE_STYLES = ['modern', 'classic', 'minimal'];

function SettingRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <span className="text-sm">{label}</span>
      </div>
      {children}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="pt-4 pb-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
    </div>
  );
}

export function ChatSettingsSheet({ conversationId, open, onClose }: ChatSettingsSheetProps) {
  const { settings, updateSetting, uploadCustomWallpaper, muteChat, unmuteChat, isMuted } = useChatSettings(conversationId);
  const { isArchived, archiveChat, unarchiveChat } = useArchivedChats();
  const { isPinned, pinChat, unpinChat } = usePinnedChats();
  const [showMuteMenu, setShowMuteMenu] = useState(false);
  const [showWallpaper, setShowWallpaper] = useState(false);
  const [isUploadingWallpaper, setIsUploadingWallpaper] = useState(false);

  const archived = isArchived(conversationId);
  const pinned = isPinned(conversationId);

  const handleMute = async (duration: MuteDuration) => {
    await muteChat(duration);
    setShowMuteMenu(false);
  };

  const handleCustomWallpaper = async (file: File) => {
    setIsUploadingWallpaper(true);
    try {
      await uploadCustomWallpaper(file);
      toast.success('Фон чата обновлен');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить изображение';
      toast.error('Ошибка загрузки фона', { description: message });
    } finally {
      setIsUploadingWallpaper(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 bg-black/50 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl max-h-[85vh] overflow-y-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            <div className="flex items-center justify-between px-4 py-2">
              <h2 className="text-lg font-semibold">Настройки чата</h2>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 pb-8">
              {/* === Уведомления === */}
              <SectionHeader title="Уведомления" />
              <div className="bg-muted/30 rounded-xl px-3 divide-y divide-border/50">
                <SettingRow icon={<Bell className="w-4 h-4" />} label="Уведомления">
                  <Switch
                    checked={settings.notifications_enabled}
                    onCheckedChange={(v) => updateSetting('notifications_enabled', v)}
                  />
                </SettingRow>

                <SettingRow icon={<BellOff className="w-4 h-4" />} label="Замьютить">
                  <div className="relative">
                    {isMuted ? (
                      <button
                        onClick={unmuteChat}
                        className="text-xs text-destructive font-medium px-3 py-1.5 rounded-lg bg-destructive/10"
                      >
                        Снять мут
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowMuteMenu(!showMuteMenu)}
                        className="text-xs text-primary font-medium px-3 py-1.5 rounded-lg bg-primary/10"
                      >
                        Замьютить
                      </button>
                    )}
                    <AnimatePresence>
                      {showMuteMenu ? (
                        <motion.div
                          className="absolute right-0 top-9 bg-popover border border-border rounded-xl shadow-xl z-50 min-w-[140px] overflow-hidden"
                          initial={{ opacity: 0, scale: 0.95, y: -5 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -5 }}
                        >
                          {MUTE_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => handleMute(opt.value)}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </SettingRow>

                <SettingRow icon={<Volume2 className="w-4 h-4" />} label="Звук">
                  <select
                    value={settings.notification_sound}
                    onChange={(e) => updateSetting('notification_sound', e.target.value)}
                    className="text-sm bg-transparent text-right outline-none"
                  >
                    {SOUNDS.map((s) => (
                      <option key={s} value={s}>{s === 'default' ? 'По умолчанию' : s === 'none' ? 'Без звука' : s}</option>
                    ))}
                  </select>
                </SettingRow>

                <SettingRow icon={<Vibrate className="w-4 h-4" />} label="Вибрация">
                  <Switch
                    checked={settings.notification_vibration}
                    onCheckedChange={(v) => updateSetting('notification_vibration', v)}
                  />
                </SettingRow>
              </div>

              {/* === Внешний вид === */}
              <SectionHeader title="Внешний вид" />
              <div className="bg-muted/30 rounded-xl px-3 divide-y divide-border/50">
                <SettingRow icon={<Palette className="w-4 h-4" />} label="Обои">
                  <button
                    onClick={() => setShowWallpaper(!showWallpaper)}
                    className="text-xs text-primary font-medium px-3 py-1.5 rounded-lg bg-primary/10"
                  >
                    Изменить
                  </button>
                </SettingRow>

                {showWallpaper ? (
                  <div className="py-3">
                    <WallpaperPicker
                      selected={settings.chat_wallpaper}
                      onChange={(w) => updateSetting('chat_wallpaper', w)}
                      onCustomFileSelected={handleCustomWallpaper}
                      isUploading={isUploadingWallpaper}
                    />
                  </div>
                ) : null}

                <SettingRow icon={<Type className="w-4 h-4" />} label="Размер шрифта">
                  <div className="flex gap-1">
                    {FONT_SIZES.map((fs) => (
                      <button
                        key={fs}
                        onClick={() => updateSetting('font_size', fs)}
                        className={cn(
                          'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                          settings.font_size === fs ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {fs === 'small' ? 'Малый' : fs === 'medium' ? 'Средний' : 'Крупный'}
                      </button>
                    ))}
                  </div>
                </SettingRow>

                <SettingRow icon={<Layers className="w-4 h-4" />} label="Стиль пузырей">
                  <div className="flex gap-1">
                    {BUBBLE_STYLES.map((bs) => (
                      <button
                        key={bs}
                        onClick={() => updateSetting('bubble_style', bs)}
                        className={cn(
                          'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                          settings.bubble_style === bs ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {bs === 'modern' ? 'Модерн' : bs === 'classic' ? 'Классик' : 'Минимал'}
                      </button>
                    ))}
                  </div>
                </SettingRow>
              </div>

              {/* === Цвет сообщений === */}
              <div className="pt-4 pb-3">
                <BubbleGradientPicker />
              </div>
              <div className="pb-3">
                <MessageDensityToggle />
              </div>

              {/* === Медиа === */}
              <SectionHeader title="Медиа" />
              <div className="bg-muted/30 rounded-xl px-3">
                <SettingRow icon={<Download className="w-4 h-4" />} label="Автозагрузка медиа">
                  <Switch
                    checked={settings.auto_download_media}
                    onCheckedChange={(v) => updateSetting('auto_download_media', v)}
                  />
                </SettingRow>
              </div>

              {/* === Действия === */}
              <SectionHeader title="Действия" />
              <div className="bg-muted/30 rounded-xl px-3 divide-y divide-border/50">
                <SettingRow
                  icon={pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                  label={pinned ? "Открепить чат" : "Закрепить чат"}
                >
                  <button
                    onClick={() => {
                      if (pinned) {
                        void unpinChat(conversationId);
                      } else {
                        void pinChat(conversationId);
                      }
                    }}
                    className={cn(
                      "text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
                      pinned
                        ? "text-muted-foreground bg-muted hover:bg-muted/80"
                        : "text-primary bg-primary/10 hover:bg-primary/20"
                    )}
                  >
                    {pinned ? "Открепить" : "Закрепить"}
                  </button>
                </SettingRow>

                <SettingRow
                  icon={archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                  label={archived ? "Разархивировать чат" : "Архивировать чат"}
                >
                  <button
                    onClick={() => {
                      if (archived) {
                        void unarchiveChat(conversationId);
                      } else {
                        void archiveChat(conversationId);
                      }
                    }}
                    className={cn(
                      "text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
                      archived
                        ? "text-primary bg-primary/10 hover:bg-primary/20"
                        : "text-orange-600 bg-orange-500/10 hover:bg-orange-500/20 dark:text-orange-400"
                    )}
                  >
                    {archived ? "Разархивировать" : "В архив"}
                  </button>
                </SettingRow>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
