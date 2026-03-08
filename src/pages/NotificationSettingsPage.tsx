import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNotifications, type NotificationSettings } from "@/hooks/useNotifications";
import { QuietHoursSettings } from "@/components/settings/QuietHoursSettings";

const SETTINGS_LABELS: { key: keyof NotificationSettings; label: string; description?: string }[] = [
  { key: "likes", label: "Лайки", description: "Когда кто-то лайкнул вашу публикацию" },
  { key: "comments", label: "Комментарии", description: "Когда кто-то прокомментировал вашу публикацию" },
  { key: "follows", label: "Подписки", description: "Когда кто-то подписался на вас" },
  { key: "mentions", label: "Упоминания", description: "Когда вас упоминают в комментариях" },
  { key: "story_reactions", label: "Реакции на истории", description: "Когда кто-то отреагировал на вашу историю" },
  { key: "live_notifications", label: "Прямые эфиры", description: "Когда подписанный пользователь начинает эфир" },
  { key: "dm_notifications", label: "Личные сообщения", description: "Когда вам пишут в Direct" },
];

const PAUSE_OPTIONS = [
  { label: "1 час", hours: 1 },
  { label: "8 часов", hours: 8 },
  { label: "1 неделя", hours: 168 },
];

export function NotificationSettingsPage() {
  const navigate = useNavigate();
  const { getNotificationSettings, updateNotificationSettings } = useNotifications();
  const [settings, setSettings] = useState<NotificationSettings>({
    likes: true,
    comments: true,
    follows: true,
    mentions: true,
    story_reactions: true,
    live_notifications: true,
    dm_notifications: true,
    pause_all: false,
    pause_until: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getNotificationSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, [getNotificationSettings]);

  const handleToggle = (key: keyof NotificationSettings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePause = async (hours: number) => {
    const until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    const updated = { ...settings, pause_all: true, pause_until: until };
    setSettings(updated);
    setSaving(true);
    await updateNotificationSettings(updated);
    setSaving(false);
    toast.success(`Уведомления приостановлены на ${hours < 24 ? hours + " ч." : Math.round(hours / 24) + " дн."}`);
  };

  const handleResume = async () => {
    const updated = { ...settings, pause_all: false, pause_until: null };
    setSettings(updated);
    setSaving(true);
    await updateNotificationSettings(updated);
    setSaving(false);
    toast.success("Уведомления возобновлены");
  };

  const handleSave = async () => {
    setSaving(true);
    await updateNotificationSettings(settings);
    setSaving(false);
    toast.success("Настройки сохранены");
    navigate(-1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="w-9 h-9 text-white" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold flex-1">Настройки уведомлений</h1>
        {saving && <Loader2 className="w-4 h-4 text-white/50 animate-spin" />}
      </div>

      <div className="px-4 py-4 space-y-6 pb-28">
        {/* Pause All */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
            Приостановить все
          </h2>
          <div className="bg-white/5 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Пауза уведомлений</p>
                {settings.pause_until && (
                  <p className="text-xs text-white/50 mt-0.5">
                    До {new Date(settings.pause_until).toLocaleString("ru-RU")}
                  </p>
                )}
              </div>
              <Switch
                checked={settings.pause_all}
                onCheckedChange={(v) => {
                  if (!v) handleResume();
                  else setSettings((p) => ({ ...p, pause_all: true }));
                }}
              />
            </div>

            {settings.pause_all && (
              <div className="flex gap-2 flex-wrap">
                {PAUSE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.hours}
                    variant="outline"
                    size="sm"
                    className="border-white/20 text-white hover:bg-white/10 text-xs"
                    onClick={() => handlePause(opt.hours)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quiet Hours */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
            Расписание уведомлений
          </h2>
          <div className="bg-white/5 rounded-2xl p-4">
            <QuietHoursSettings />
          </div>
        </div>

        {/* Individual Settings */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
            Типы уведомлений
          </h2>
          <div className="bg-white/5 rounded-2xl divide-y divide-white/10">
            {SETTINGS_LABELS.map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between px-4 py-3">
                <div className="flex-1 mr-4">
                  <p className="font-medium text-sm">{label}</p>
                  {description && (
                    <p className="text-xs text-white/50 mt-0.5">{description}</p>
                  )}
                </div>
                <Switch
                  checked={Boolean(settings[key])}
                  onCheckedChange={() => handleToggle(key)}
                  disabled={settings.pause_all}
                />
              </div>
            ))}
          </div>
        </div>

        <Button
          className="w-full h-12 bg-white text-black font-semibold hover:bg-white/90"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Сохранить
        </Button>
      </div>
    </div>
  );
}

export default NotificationSettingsPage;
