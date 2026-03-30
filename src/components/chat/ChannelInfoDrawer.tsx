import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  MoreVertical,
  Radio,
  Search,
  Settings2,
  Users,
  Volume2 as Volume2Icon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Drawer, DrawerClose, DrawerContent } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import type { Channel } from "@/hooks/useChannels";
import { logger } from "@/lib/logger";

type InfoView = "main" | "admins" | "subscribers" | "settings" | "more";

interface MemberItem {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
}

interface ChannelInfoDrawerProps {
  channel: Channel;
  infoOpen: boolean;
  infoView: InfoView;
  setInfoView: (v: InfoView) => void;
  closeInfo: () => void;
  // Live
  liveMode: boolean;
  toggleLive: () => void;
  // Mute / notifications
  muted: boolean;
  setMuted: (v: boolean) => Promise<void>;
  muteForMs: (ms: number) => Promise<void>;
  muteUntil: (val: string | null) => Promise<void>;
  notificationsDisabled: boolean;
  enableNotifications: () => Promise<void>;
  disableNotifications: () => Promise<void>;
  // Membership
  isMember: boolean;
  role: string;
  handleLeave: () => void;
  handleJoin: () => void;
  // Capabilities
  canUpdateSettings: boolean;
  canManageMembers: boolean;
  canInvite: boolean;
  // Members data
  admins: MemberItem[];
  subscribers: MemberItem[];
  adminsLoading: boolean;
  subsLoading: boolean;
  loadAdmins: () => Promise<void>;
  loadSubscribers: () => Promise<void>;
  updateMemberRole: (userId: string, nextRole: "admin" | "member") => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  // Auto-delete
  autoDeleteSeconds: number;
  autoDeleteRadioValue: string;
  autoDeleteLoading: boolean;
  setAutoDeleteSeconds: (s: number) => Promise<void>;
  // Actions
  handleCreateInvite: () => void;
  deleteChannel: () => void;
  setSearchOpen: (v: boolean) => void;
  setSearchQuery: (v: string) => void;
  setSelectMode: (v: boolean) => void;
}

function formatSubscribers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M подписчиков`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K подписчиков`;
  return `${n} подписчик${n % 10 === 1 && n % 100 !== 11 ? "" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "а" : "ов"}`;
}

function formatAutoDeleteLabel(seconds: number): string {
  if (!seconds) return "Никогда";
  if (seconds < 60) return `${seconds} сек.`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} мин.`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} ч.`;
  return `${Math.round(seconds / 86400)} д.`;
}

export function ChannelInfoDrawer(props: ChannelInfoDrawerProps) {
  const {
    channel,
    infoOpen,
    infoView,
    setInfoView,
    closeInfo,
    liveMode,
    toggleLive,
    muted,
    setMuted,
    muteForMs,
    muteUntil,
    notificationsDisabled,
    enableNotifications,
    disableNotifications,
    isMember,
    role,
    handleLeave,
    handleJoin,
    canUpdateSettings,
    canManageMembers,
    canInvite,
    admins,
    subscribers,
    adminsLoading,
    subsLoading,
    loadAdmins,
    loadSubscribers,
    updateMemberRole,
    removeMember,
    autoDeleteSeconds,
    autoDeleteRadioValue,
    autoDeleteLoading,
    setAutoDeleteSeconds,
    handleCreateInvite,
    deleteChannel,
    setSearchOpen,
    setSearchQuery,
    setSelectMode,
  } = props;

  return (
    <Drawer
      open={infoOpen}
      onOpenChange={(open) => {
        if (!open) closeInfo();
      }}
    >
      <DrawerContent className="h-[92dvh] max-h-[92dvh] rounded-t-3xl p-0 overflow-hidden mt-0">
        <div className="px-4 pb-6 flex flex-col h-full">
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              onClick={() => {
                if (infoView !== "main") setInfoView("main");
                else closeInfo();
              }}
              className="p-2 text-muted-foreground hover:text-foreground"
              aria-label={infoView !== "main" ? "Назад" : "Закрыть"}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {infoView === "main" ? (
              <button
                type="button"
                onClick={() => setInfoView("settings")}
                disabled={!canUpdateSettings}
                className={`px-3 py-2 rounded-full text-sm ${
                  canUpdateSettings
                    ? "text-foreground hover:bg-muted"
                    : "text-muted-foreground opacity-60"
                }`}
              >
                Изм.
              </button>
            ) : (
              <div className="px-3 py-2 text-sm font-medium text-foreground">
                {infoView === "admins" && "Администраторы"}
                {infoView === "subscribers" && "Подписчики"}
                {infoView === "settings" && "Настройки канала"}
                {infoView === "more" && "Ещё"}
              </div>
            )}

            <DrawerClose asChild>
              <button type="button" className="p-2 text-muted-foreground hover:text-foreground" aria-label="Закрыть">
                <X className="w-5 h-5" />
              </button>
            </DrawerClose>
          </div>

          {infoView === "main" ? (
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col items-center pt-3 pb-4">
                <GradientAvatar
                  name={channel.name}
                  seed={channel.id}
                  avatarUrl={channel.avatar_url}
                  size="lg"
                  className="w-20 h-20 text-xl"
                />
                <div className="pt-3 text-center">
                  <div className="text-xl font-semibold text-foreground">{channel.name}</div>
                  <div className="text-sm text-muted-foreground">{formatSubscribers(channel.member_count || 0)}</div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 pb-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={!isMember}
                      className={`rounded-2xl bg-card border border-border/60 py-3 flex flex-col items-center gap-2 ${
                        isMember ? "" : "opacity-60"
                      }`}
                    >
                      <Radio className={`w-5 h-5 ${liveMode ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-xs text-muted-foreground">трансляция</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center">
                    <DropdownMenuItem onClick={toggleLive}>
                      {liveMode ? "Остановить" : "Начать трансляцию"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast.message("Анонсы трансляции скоро")}>
                      Анонсировать трансляцию
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast.message("Скоро")}>
                      Начать с помощью…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={!isMember}
                      className={`rounded-2xl bg-card border border-border/60 py-3 flex flex-col items-center gap-2 ${
                        isMember ? "" : "opacity-60"
                      }`}
                    >
                      <Volume2Icon className={`w-5 h-5 ${muted ? "text-muted-foreground" : "text-primary"}`} />
                      <span className="text-xs text-muted-foreground">звук</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Выключить на время…</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={() => void muteForMs(60 * 60 * 1000)}>На 1 час</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void muteForMs(8 * 60 * 60 * 1000)}>На 8 часов</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void muteForMs(2 * 24 * 60 * 60 * 1000)}>На 2 дня</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void muteUntil("infinity")}>Навсегда</DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    {muted ? (
                      <DropdownMenuItem onClick={() => void muteUntil(null)}>
                        Включить звук
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => void muteUntil("infinity")}>Выключить звук</DropdownMenuItem>
                    )}

                    <DropdownMenuItem onClick={() => setInfoView("settings")}>Настроить</DropdownMenuItem>

                    {notificationsDisabled ? (
                      <DropdownMenuItem onClick={() => void enableNotifications()}>
                        Вкл. уведомления
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => void disableNotifications()}
                        className="text-destructive focus:text-destructive"
                      >
                        Выкл. уведомления
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen(true);
                    setSearchQuery("");
                    closeInfo();
                  }}
                  className="rounded-2xl bg-card border border-border/60 py-3 flex flex-col items-center gap-2"
                >
                  <Search className="w-5 h-5 text-primary" />
                  <span className="text-xs text-muted-foreground">поиск</span>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="rounded-2xl bg-card border border-border/60 py-3 flex flex-col items-center gap-2"
                    >
                      <MoreVertical className="w-5 h-5 text-primary" />
                      <span className="text-xs text-muted-foreground">ещё</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center">
                    <DropdownMenuItem onClick={() => toast.message("Подарки скоро")}>Отправить подарок</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast.message("Скоро")}>Голоса</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast.message("Скоро")}>Архив историй</DropdownMenuItem>
                    <DropdownMenuSeparator />

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger disabled={!canUpdateSettings || autoDeleteLoading}>
                        Автоудаление
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuRadioGroup
                          value={autoDeleteRadioValue}
                          onValueChange={(v) => {
                            if (v === "custom") return;
                            void setAutoDeleteSeconds(Number(v));
                          }}
                        >
                          <DropdownMenuRadioItem value="0">Никогда</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value={String(24 * 60 * 60)}>1 день</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value={String(7 * 24 * 60 * 60)}>1 нед.</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value={String(30 * 24 * 60 * 60)}>1 месяц</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem
                            value="custom"
                            onSelect={(e) => {
                              e.preventDefault();
                              const raw = window.prompt("Автоудаление: секунд (0 = никогда)", String(autoDeleteSeconds));
                              if (raw == null) return;
                              const n = Number(raw);
                              void setAutoDeleteSeconds(Number.isFinite(n) ? n : autoDeleteSeconds);
                            }}
                          >
                            Другое
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuItem disabled>Удалить переписку</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLeave}
                      disabled={!isMember}
                      className="text-destructive focus:text-destructive"
                    >
                      Покинуть канал
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-border/60">
                  <div className="text-xs text-muted-foreground">описание</div>
                  <div className="text-sm text-foreground pt-1">{(channel.description || "").trim() || channel.name}</div>
                </div>

                <button
                  type="button"
                  onClick={() => setInfoView("admins")}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-sm text-foreground">Администраторы</div>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-sm">{Math.max(1, admins.length || 1)}</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setInfoView("subscribers")}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 border-t border-border/60"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-sm text-foreground">Подписчики</div>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-sm">{channel.member_count || 0}</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setInfoView("settings")}
                  disabled={!canUpdateSettings}
                  className={`w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 border-t border-border/60 ${
                    canUpdateSettings ? "" : "opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Settings2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-sm text-foreground">Настройки канала</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          ) : null}

          {infoView === "admins" ? (
            <div className="flex-1 overflow-y-auto">
              {adminsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : (
                <div className="space-y-2">
                  {canManageMembers ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await loadSubscribers();
                          setInfoView("subscribers");
                          toast.message("Выберите участника и назначьте админом");
                        } catch (error) {
                          logger.warn("[ChannelInfoDrawer] Failed to open subscribers from admins pane", {
                            channelId: channel.id,
                            error,
                          });
                        }
                      }}
                      className="w-full flex items-center justify-between p-3 rounded-2xl bg-card border border-border/60 hover:bg-muted/40"
                    >
                      <div className="text-sm text-foreground">Добавить администратора</div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ) : null}
                  {admins.map((a) => (
                    <div key={a.user_id} className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/60">
                      <GradientAvatar name={a.display_name || "User"} seed={a.user_id} avatarUrl={a.avatar_url} size="sm" className="w-10 h-10" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground truncate">{a.display_name || a.user_id}</div>
                        <div className="text-xs text-muted-foreground">{a.role === "owner" ? "владелец" : "админ"}</div>
                      </div>
                      {canManageMembers && a.role !== "owner" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void updateMemberRole(a.user_id, "member")}
                        >
                          Снять
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {admins.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">Нет данных</div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {infoView === "subscribers" ? (
            <div className="flex-1 overflow-y-auto">
              {subsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : (
                <div className="space-y-2">
                  {(canManageMembers || canInvite) ? (
                    <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
                      {canManageMembers ? (
                        <button
                          type="button"
                          onClick={() => toast.message("Добавление подписчиков скоро")}
                          className="w-full px-4 py-3 text-left hover:bg-muted/40"
                        >
                          <div className="text-sm text-primary">Добавить подписчиков</div>
                        </button>
                      ) : null}
                      {canInvite ? (
                        <button
                          type="button"
                          onClick={handleCreateInvite}
                          className={`w-full px-4 py-3 text-left hover:bg-muted/40 ${canManageMembers ? "border-t border-border/60" : ""}`}
                        >
                          <div className="text-sm text-primary">Пригласить по ссылке</div>
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {subscribers.map((s) => (
                    <div key={s.user_id} className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/60">
                      <GradientAvatar name={s.display_name || "User"} seed={s.user_id} avatarUrl={s.avatar_url} size="sm" className="w-10 h-10" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground truncate">{s.display_name || s.user_id}</div>
                        <div className="text-xs text-muted-foreground">{String(s.role || "member")}</div>
                      </div>

                      {String(s.user_id) === String(channel.owner_id) ? (
                        <span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary">owner</span>
                      ) : null}

                      {canManageMembers && String(s.user_id) !== String(channel.owner_id) ? (
                        <div className="flex items-center gap-1">
                          {String(s.role) === "admin" ? (
                            <Button variant="ghost" size="sm" onClick={() => void updateMemberRole(s.user_id, "member")}>
                              Снять
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => void updateMemberRole(s.user_id, "admin")}>
                              Админ
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => void removeMember(s.user_id)} className="text-destructive">
                            Удалить
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {subscribers.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">Нет данных</div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {infoView === "settings" ? (
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-3">
                <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between border-b border-border/60">
                    <div>
                      <div className="text-sm font-medium text-foreground">Уведомления</div>
                      <div className="text-xs text-muted-foreground">Вкл/выкл для этого канала</div>
                    </div>
                    <Switch
                      checked={!muted}
                      onCheckedChange={async (checked) => {
                        try {
                          await setMuted(!checked);
                        } catch (e) {
                          logger.error("[ChannelInfoDrawer] Mute toggle failed", {
                            channelId: channel.id,
                            checked,
                            error: e,
                          });
                          toast.error("Не удалось обновить уведомления");
                        }
                      }}
                      disabled={!isMember}
                    />
                  </div>

                  <div className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-foreground">Автоудаление</div>
                      <div className="text-xs text-muted-foreground">Сколько хранить новые публикации</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatAutoDeleteLabel(autoDeleteSeconds)}</div>
                  </div>
                </div>

                <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
                  <button
                    type="button"
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40"
                    onClick={() => void setAutoDeleteSeconds(0)}
                    disabled={!canUpdateSettings}
                  >
                    <div className="text-sm text-foreground">Никогда</div>
                    {autoDeleteSeconds === 0 ? <CheckCircle2 className="w-4 h-4 text-primary" /> : null}
                  </button>
                  <button
                    type="button"
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 border-t border-border/60"
                    onClick={() => void setAutoDeleteSeconds(24 * 60 * 60)}
                    disabled={!canUpdateSettings}
                  >
                    <div className="text-sm text-foreground">1 день</div>
                    {autoDeleteSeconds === 24 * 60 * 60 ? <CheckCircle2 className="w-4 h-4 text-primary" /> : null}
                  </button>
                  <button
                    type="button"
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 border-t border-border/60"
                    onClick={() => void setAutoDeleteSeconds(7 * 24 * 60 * 60)}
                    disabled={!canUpdateSettings}
                  >
                    <div className="text-sm text-foreground">1 нед.</div>
                    {autoDeleteSeconds === 7 * 24 * 60 * 60 ? <CheckCircle2 className="w-4 h-4 text-primary" /> : null}
                  </button>
                  <button
                    type="button"
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 border-t border-border/60"
                    onClick={() => void setAutoDeleteSeconds(30 * 24 * 60 * 60)}
                    disabled={!canUpdateSettings}
                  >
                    <div className="text-sm text-foreground">1 месяц</div>
                    {autoDeleteSeconds === 30 * 24 * 60 * 60 ? <CheckCircle2 className="w-4 h-4 text-primary" /> : null}
                  </button>
                  <button
                    type="button"
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 border-t border-border/60"
                    onClick={() => {
                      const raw = window.prompt("Автоудаление: секунд (0 = никогда)", String(autoDeleteSeconds));
                      if (raw == null) return;
                      const n = Number(raw);
                      void setAutoDeleteSeconds(Number.isFinite(n) ? n : autoDeleteSeconds);
                    }}
                    disabled={!canUpdateSettings}
                  >
                    <div className="text-sm text-foreground">Другое…</div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {infoView === "more" ? (
            <div className="flex-1 overflow-y-auto">
              <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
                <button
                  type="button"
                  onClick={isMember ? handleLeave : handleJoin}
                  className="w-full px-4 py-3 text-left hover:bg-muted/40"
                >
                  <div className="text-sm text-foreground">{isMember ? "Отписаться от канала" : "Подписаться на канал"}</div>
                </button>
                <button
                  type="button"
                  onClick={handleCreateInvite}
                  disabled={!canInvite}
                  className={`w-full px-4 py-3 text-left hover:bg-muted/40 border-t border-border/60 ${canInvite ? "" : "opacity-60"}`}
                >
                  <div className="text-sm text-foreground">Пригласить в канал</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode(true);
                    closeInfo();
                  }}
                  disabled={!isMember}
                  className={`w-full px-4 py-3 text-left hover:bg-muted/40 border-t border-border/60 ${isMember ? "" : "opacity-60"}`}
                >
                  <div className="text-sm text-foreground">Выбрать сообщения</div>
                </button>
                <button
                  type="button"
                  onClick={deleteChannel}
                  disabled={role !== "owner"}
                  className={`w-full px-4 py-3 text-left hover:bg-muted/40 border-t border-border/60 text-destructive ${
                    role === "owner" ? "" : "opacity-60"
                  }`}
                >
                  <div className="text-sm">Удалить канал</div>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
