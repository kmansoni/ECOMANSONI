import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HardDrive, Trash2, Image, Film, Wifi, Signal, Loader2, CheckCircle2 } from 'lucide-react';
import { useStorageSettings } from '@/hooks/useStorageSettings';
import { cn } from '@/lib/utils';

// ─── Переключатель ────────────────────────────────────────────────────────────
interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        checked ? 'bg-blue-600' : 'bg-zinc-600',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
}

// ─── Строка настройки ─────────────────────────────────────────────────────────
interface SettingRowProps {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function SettingRow({ icon, label, checked, onChange }: SettingRowProps) {
  return (
    <div className="flex items-center gap-4 py-3 px-4">
      <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 text-white/60">
        {icon}
      </div>
      <span className="flex-1 text-white text-sm">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

// ─── Страница ─────────────────────────────────────────────────────────────────
export function StorageSettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSettings, cacheStats, clearCache, isClearing } = useStorageSettings();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearDone, setClearDone] = useState(false);

  const handleClearCache = async () => {
    setShowClearConfirm(false);
    await clearCache();
    setClearDone(true);
    setTimeout(() => setClearDone(false), 3000);
  };

  // Прогрессбар: используем оценку браузера. Если quota == 0 — показываем 0
  const MAX_DISPLAY_MB = 500; // Показываем из 500 MB
  const usedPercent = Math.min(100, (cacheStats.sizeMB / MAX_DISPLAY_MB) * 100);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Шапка */}
      <div className="sticky top-0 z-10 bg-zinc-900/80 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-lg text-white">Данные и хранилище</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* ── Блок: Использование хранилища ── */}
        <section>
          <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider px-1 mb-3">
            Использование хранилища
          </h2>
          <div className="bg-zinc-900 rounded-2xl overflow-hidden">
            <div className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-600/20 rounded-full flex items-center justify-center">
                  <HardDrive className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-white font-medium">
                    {cacheStats.sizeMB > 0 ? `${cacheStats.sizeMB} МБ` : '< 1 МБ'}
                  </p>
                  <p className="text-white/40 text-xs">
                    {cacheStats.count} файлов в кэше
                  </p>
                </div>
                <div className="ml-auto text-white/30 text-xs">
                  из {MAX_DISPLAY_MB} МБ
                </div>
              </div>

              {/* Прогрессбар */}
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
            </div>

            <div className="border-t border-white/10">
              {clearDone ? (
                <div className="flex items-center justify-center gap-2 py-3.5 text-green-400 text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Кэш очищен
                </div>
              ) : showClearConfirm ? (
                <div className="p-4 space-y-3">
                  <p className="text-white/70 text-sm text-center">
                    Очистить кэш медиа ({cacheStats.sizeMB} МБ)?
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      className="flex-1 py-2 rounded-xl bg-zinc-800 text-white/70 text-sm hover:bg-zinc-700 transition-colors"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={handleClearCache}
                      disabled={isClearing}
                      className="flex-1 py-2 rounded-xl bg-red-600/80 text-white text-sm hover:bg-red-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isClearing && <Loader2 className="w-4 h-4 animate-spin" />}
                      Очистить
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  disabled={isClearing || cacheStats.sizeMB === 0}
                  className="flex items-center gap-3 w-full px-4 py-3.5 text-red-400 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">Очистить кэш медиа</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── Блок: Автозагрузка фото ── */}
        <section>
          <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider px-1 mb-3">
            Автозагрузка фото
          </h2>
          <div className="bg-zinc-900 rounded-2xl overflow-hidden divide-y divide-white/5">
            <SettingRow
              icon={<Wifi className="w-4 h-4" />}
              label="При подключении Wi-Fi"
              checked={settings.autoDownloadPhotosWifi}
              onChange={(v) => updateSettings({ autoDownloadPhotosWifi: v })}
            />
            <SettingRow
              icon={<Signal className="w-4 h-4" />}
              label="При мобильных данных"
              checked={settings.autoDownloadPhotosMobile}
              onChange={(v) => updateSettings({ autoDownloadPhotosMobile: v })}
            />
          </div>
        </section>

        {/* ── Блок: Автозагрузка видео ── */}
        <section>
          <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider px-1 mb-3">
            Автозагрузка видео
          </h2>
          <div className="bg-zinc-900 rounded-2xl overflow-hidden divide-y divide-white/5">
            <SettingRow
              icon={<Wifi className="w-4 h-4" />}
              label="При подключении Wi-Fi"
              checked={settings.autoDownloadVideoWifi}
              onChange={(v) => updateSettings({ autoDownloadVideoWifi: v })}
            />
            <SettingRow
              icon={<Signal className="w-4 h-4" />}
              label="При мобильных данных"
              checked={settings.autoDownloadVideoMobile}
              onChange={(v) => updateSettings({ autoDownloadVideoMobile: v })}
            />
          </div>
        </section>

        {/* ── Блок: Статистика типов ── */}
        <section>
          <h2 className="text-xs font-medium text-white/40 uppercase tracking-wider px-1 mb-3">
            Типы медиа в кэше
          </h2>
          <div className="bg-zinc-900 rounded-2xl overflow-hidden divide-y divide-white/5">
            <div className="flex items-center gap-3 px-4 py-3">
              <Image className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="flex-1 text-white/70 text-sm">Фото</span>
              <span className="text-white/40 text-xs">Stale-While-Revalidate</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <Film className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="flex-1 text-white/70 text-sm">Видео</span>
              <span className="text-white/40 text-xs">Stale-While-Revalidate</span>
            </div>
          </div>
          <p className="text-xs text-white/30 px-1 mt-2">
            Медиа хранится до {MAX_DISPLAY_MB} МБ или 200 файлов. При превышении удаляются старые файлы.
          </p>
        </section>

      </div>
    </div>
  );
}

export default StorageSettingsPage;
