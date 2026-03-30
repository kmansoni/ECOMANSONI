/**
 * src/pages/settings/SettingsNotificationsSection.tsx
 * Screen: "notifications"
 */
import { useCallback, useMemo, useState } from "react";
import {
  Archive,
  Bell,
  Heart,
  MessageCircle,
  Share2,
  Smile,
  Users,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/contexts/UserSettingsContext";
import {
  useNotificationPreferences,
  type NotificationCategory,
} from "@/hooks/useNotificationPreferences";
import { useConversations, type Conversation } from "@/hooks/useChat";
import { useChannels } from "@/hooks/useChannels";
import { useGroupChats } from "@/hooks/useGroupChats";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SettingsHeader, SettingsToggleItem } from "./helpers";
import type { SectionProps } from "./types";

type ConversationParticipantLike = {
  user_id?: string;
  profile?: { display_name?: string | null } | null;
};

const CATEGORY_META: ReadonlyArray<{
  key: NotificationCategory;
  label: string;
  description: string;
}> = [
  { key: "dm", label: "Личные чаты", description: "Уведомления из личных чатов" },
  { key: "group", label: "Группы", description: "Уведомления из групп" },
  { key: "channel", label: "Каналы", description: "Уведомления из каналов" },
  { key: "stories", label: "Истории", description: "Истории и упоминания" },
  { key: "reactions", label: "Реакции", description: "Реакции на сообщения" },
];

const SOUND_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "rebound", label: "Rebound" },
  { id: "pop", label: "Pop" },
  { id: "note", label: "Note" },
  { id: "chime", label: "Chime" },
];

const CATEGORY_ICONS: Record<string, typeof MessageCircle> = {
  dm: MessageCircle,
  group: Users,
  channel: Share2,
  stories: Archive,
};

export function SettingsNotificationsSection({ isDark, onBack }: SectionProps) {
  const { user } = useAuth();
  const { settings, update: updateSettings } = useUserSettings();
  const {
    categoriesByKey,
    exceptions: notificationExceptions,
    loading: notificationLoading,
    upsertCategory,
    upsertException,
    removeException,
  } = useNotificationPreferences();
  const { conversations } = useConversations();
  const { channels } = useChannels();
  const { groups } = useGroupChats();

  const isAuthed = !!user?.id;

  const [notificationSearch, setNotificationSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const getDmOtherLabel = useCallback(
    (conv: Conversation) => {
      const participants =
        (conv as Conversation & { participants?: ConversationParticipantLike[] })
          .participants ?? [];
      const other = participants.find((p) => p.user_id !== user?.id);
      return other?.profile?.display_name || "Пользователь";
    },
    [user?.id],
  );

  const notificationTargets = useMemo(() => {
    const list: Array<{
      key: string;
      kind: "dm" | "group" | "channel";
      id: string;
      label: string;
      hint: string;
    }> = [];
    for (const conv of conversations) {
      list.push({
        key: `dm:${conv.id}`,
        kind: "dm",
        id: conv.id,
        label: getDmOtherLabel(conv),
        hint: "Личный чат",
      });
    }
    for (const group of groups) {
      list.push({
        key: `group:${group.id}`,
        kind: "group",
        id: group.id,
        label: group.name || "Группа",
        hint: "Группа",
      });
    }
    for (const channel of channels) {
      list.push({
        key: `channel:${channel.id}`,
        kind: "channel",
        id: channel.id,
        label: channel.name || "Канал",
        hint: "Канал",
      });
    }
    return list.sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [channels, conversations, getDmOtherLabel, groups]);

  const filteredTargets = useMemo(() => {
    const q = notificationSearch.trim().toLowerCase();
    if (!q) return notificationTargets;
    return notificationTargets.filter((t) => t.label.toLowerCase().includes(q));
  }, [notificationSearch, notificationTargets]);

  const exceptionMap = useMemo(() => {
    const map = new Map<string, (typeof notificationExceptions)[number]>();
    for (const ex of notificationExceptions) {
      map.set(`${ex.item_kind}:${ex.item_id}`, ex);
    }
    return map;
  }, [notificationExceptions]);

  const cardCls = cn(
    "backdrop-blur-xl rounded-2xl border overflow-hidden",
    isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
  );
  const hintCls = cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70");
  const borderCls = cn("border-t", isDark ? "border-white/10" : "border-white/20");
  const iconCls = cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground");

  return (
    <>
      <SettingsHeader
        title="Уведомления"
        isDark={isDark}
        currentScreen="notifications"
        onBack={onBack}
        onClose={onBack}
      />
      <div className="flex-1 overflow-y-auto native-scroll pb-8">
        <div className="px-4 grid gap-3">
          {/* ── Общие ── */}
          <div className={cardCls}>
            <div className="px-5 py-4">
              <p className="font-semibold">Общие</p>
              <p className={hintCls}>Общий звук и предпросмотр уведомлений.</p>
            </div>

            <div className={cn("px-5 pb-4", isDark ? "text-white" : "text-white")}>
              <div className="grid gap-2">
                <p className={cn("text-sm", isDark ? "text-white/70" : "text-white/70")}>
                  Звук
                </p>
                <Select
                  value={settings?.notif_sound_id ?? "rebound"}
                  onValueChange={async (val) => {
                    if (!isAuthed) return;
                    await updateSettings({ notif_sound_id: val });
                  }}
                >
                  <SelectTrigger
                    className={cn(
                      "w-full",
                      isDark ? "settings-dark-pill" : "bg-card/80 border-white/20",
                    )}
                  >
                    <SelectValue placeholder="Выберите звук" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOUND_OPTIONS.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <SettingsToggleItem
              icon={<Volume2 className={iconCls} />}
              label="Вибрация"
              description="Включить вибрацию для уведомлений"
              isDark={isDark}
              checked={!!settings?.notif_vibrate}
              onCheckedChange={async (val) => {
                if (isAuthed) await updateSettings({ notif_vibrate: val });
              }}
            />
            <SettingsToggleItem
              icon={<Bell className={iconCls} />}
              label="Показывать текст"
              description="Показывать текст сообщения в уведомлении"
              isDark={isDark}
              checked={settings?.notif_show_text ?? true}
              onCheckedChange={async (val) => {
                if (isAuthed) await updateSettings({ notif_show_text: val });
              }}
            />
            <SettingsToggleItem
              icon={<MessageCircle className={iconCls} />}
              label="Показывать отправителя"
              description="Показывать имя отправителя"
              isDark={isDark}
              checked={settings?.notif_show_sender ?? true}
              onCheckedChange={async (val) => {
                if (isAuthed) await updateSettings({ notif_show_sender: val });
              }}
            />
          </div>

          {/* ── Категории чатов ── */}
          <div className={cardCls}>
            <div className="px-5 py-4">
              <p className="font-semibold">Категории чатов</p>
              <p className={hintCls}>Отдельные настройки для разных типов чатов.</p>
            </div>
            <div className={borderCls}>
              {CATEGORY_META.map((meta) => {
                const row = categoriesByKey.get(meta.key);
                const enabled = row?.is_enabled ?? true;
                const IconComp = CATEGORY_ICONS[meta.key] ?? Smile;
                return (
                  <div key={meta.key}>
                    <SettingsToggleItem
                      icon={<IconComp className={iconCls} />}
                      label={meta.label}
                      description={meta.description}
                      isDark={isDark}
                      checked={enabled}
                      onCheckedChange={async (val) => {
                        if (isAuthed) await upsertCategory(meta.key, { is_enabled: val });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Исключения ── */}
          <div className={cardCls}>
            <div className="px-5 py-4">
              <p className="font-semibold">Исключения</p>
              <p className={hintCls}>Исключения перекрывают настройки категорий.</p>
            </div>

            <div className="px-5 pb-4">
              <Button
                variant="secondary"
                onClick={() => setPickerOpen((prev) => !prev)}
              >
                {pickerOpen ? "Скрыть список" : "Добавить исключение"}
              </Button>
            </div>

            {pickerOpen && (
              <div className={cn("px-5 pb-5", borderCls)}>
                <Input
                  placeholder="Поиск чатов, групп или каналов"
                  value={notificationSearch}
                  onChange={(e) => setNotificationSearch(e.target.value)}
                  className={cn(
                    "mt-4",
                    isDark ? "settings-dark-pill" : "bg-card/80 border-white/20",
                  )}
                />
                <div className="mt-3 grid gap-2 max-h-72 overflow-y-auto native-scroll">
                  {filteredTargets.map((target) => {
                    const hasException = exceptionMap.has(target.key);
                    return (
                      <label
                        key={target.key}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-xl border",
                          isDark ? "border-white/10" : "border-white/20",
                        )}
                      >
                        <Checkbox
                          checked={hasException}
                          onCheckedChange={async (val) => {
                            if (!isAuthed) return;
                            if (val) {
                              await upsertException(target.kind, target.id, {
                                is_muted: true,
                              });
                            } else {
                              await removeException(target.kind, target.id);
                            }
                          }}
                        />
                        <div className="min-w-0">
                          <p
                            className={cn(
                              "font-medium truncate",
                              isDark ? "text-white" : "text-white",
                            )}
                          >
                            {target.label}
                          </p>
                          <p className={cn("text-xs", isDark ? "text-white/60" : "text-white/70")}>
                            {target.hint}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                  {!filteredTargets.length && (
                    <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>
                      Ничего не найдено.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className={borderCls}>
              {notificationLoading ? (
                <div className="px-5 py-4">
                  <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>
                    Загрузка…
                  </p>
                </div>
              ) : notificationExceptions.length === 0 ? (
                <div className="px-5 py-4">
                  <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>
                    Исключений нет.
                  </p>
                </div>
              ) : (
                notificationExceptions.map((ex) => {
                  const key = `${ex.item_kind}:${ex.item_id}`;
                  const target = notificationTargets.find((t) => t.key === key);
                  const title = target?.label ?? ex.item_id;
                  const hint = target?.hint ?? "Исключение";
                  return (
                    <div
                      key={ex.id}
                      className={cn(
                        "px-5 py-4 flex items-center justify-between gap-3",
                        isDark ? "hover:bg-white/5" : "hover:bg-muted/30",
                        "border-b",
                        isDark ? "border-white/10" : "border-white/20",
                      )}
                    >
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "font-medium truncate",
                            isDark ? "text-white" : "text-white",
                          )}
                        >
                          {title}
                        </p>
                        <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>
                          {hint}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!ex.is_muted}
                          onCheckedChange={async (val) => {
                            if (isAuthed) await upsertException(ex.item_kind, ex.item_id, { is_muted: !val });
                          }}
                        />
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            if (isAuthed) await removeException(ex.item_kind, ex.item_id);
                          }}
                        >
                          Удалить
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Активность ── */}
          <div className={cardCls}>
            <div className="px-5 py-4">
              <p className="font-semibold">Активность</p>
              <p className={hintCls}>Отдельные уведомления для активности в ленте.</p>
            </div>
            <SettingsToggleItem
              icon={<Bell className={iconCls} />}
              label="Push-уведомления"
              description="Получать уведомления на устройство"
              isDark={isDark}
              checked={!!settings?.push_notifications}
              onCheckedChange={async (val) => {
                if (isAuthed) await updateSettings({ push_notifications: val });
              }}
            />
            <SettingsToggleItem
              icon={<Heart className={iconCls} />}
              label="Лайки"
              description="Уведомлять о новых лайках"
              isDark={isDark}
              checked={!!settings?.likes_notifications}
              onCheckedChange={async (val) => {
                if (isAuthed) await updateSettings({ likes_notifications: val });
              }}
            />
            <SettingsToggleItem
              icon={<MessageCircle className={iconCls} />}
              label="Комментарии"
              description="Уведомлять о новых комментариях"
              isDark={isDark}
              checked={!!settings?.comments_notifications}
              onCheckedChange={async (val) => {
                if (isAuthed) await updateSettings({ comments_notifications: val });
              }}
            />
            <SettingsToggleItem
              icon={<Users className={iconCls} />}
              label="Подписчики"
              description="Уведомлять о новых подписчиках"
              isDark={isDark}
              checked={!!settings?.followers_notifications}
              onCheckedChange={async (val) => {
                if (isAuthed) await updateSettings({ followers_notifications: val });
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
