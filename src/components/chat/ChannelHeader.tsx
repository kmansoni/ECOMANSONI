import { toast } from "sonner";
import {
  ArrowLeft,
  Link,
  MoreVertical,
  QrCode,
  Search,
  Trash2,
} from "lucide-react";
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

function formatSubscribers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M подписчиков`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K подписчиков`;
  return `${n} подписчик${n % 10 === 1 && n % 100 !== 11 ? "" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "а" : "ов"}`;
}


interface ChannelHeaderProps {
  channel: Channel;
  onBack: () => void;
  openInfo: () => void;
  liveMode: boolean;
  // Search
  setSearchOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  // Membership
  isMember: boolean;
  handleLeave: () => void;
  handleJoin: () => void;
  // Mute
  muted: boolean;
  setMuted: (v: boolean) => Promise<void>;
  // Capabilities
  canUpdateSettings: boolean;
  canInvite: boolean;
  role: string;
  // Auto-delete
  autoDeleteRadioValue: string;
  autoDeleteSeconds: number;
  setAutoDeleteSeconds: (s: number) => Promise<void>;
  // Live
  toggleLive: () => void;
  // Select mode
  selectMode: boolean;
  setSelectMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  // Invite
  handleCreateInvite: () => void;
  handleShowInviteQr: () => void;
  // Delete
  deleteChannel: () => void;
}

export function ChannelHeader(props: ChannelHeaderProps) {
  const {
    channel,
    onBack,
    openInfo,
    liveMode,
    setSearchOpen,
    isMember,
    handleLeave,
    handleJoin,
    muted,
    setMuted,
    canUpdateSettings,
    canInvite,
    role,
    autoDeleteRadioValue,
    autoDeleteSeconds,
    setAutoDeleteSeconds,
    toggleLive,
    selectMode,
    setSelectMode,
    handleCreateInvite,
    handleShowInviteQr,
    deleteChannel,
  } = props;

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-2 py-2 bg-background/95 backdrop-blur-sm border-b border-border relative z-10 safe-area-top">
      <button onClick={onBack} className="flex items-center gap-1 text-primary" aria-label="Назад">
        <ArrowLeft className="w-5 h-5" />
      </button>

      <button
        type="button"
        onClick={openInfo}
        className="rounded-full"
        aria-label="Открыть меню канала"
        title="Канал"
      >
        <GradientAvatar
          name={channel.name}
          seed={channel.id}
          avatarUrl={channel.avatar_url}
          size="sm"
          className="w-9 h-9 text-xs border-border/60"
        />
      </button>

      <div className="flex-1 min-w-0">
        <button type="button" onClick={openInfo} className="text-left w-full">
          <h2 className="font-semibold text-foreground text-sm truncate flex items-center gap-2">
            <span className="truncate">{channel.name}</span>
            {liveMode ? (
              <span className="shrink-0 rounded-full bg-primary/10 text-primary text-[10px] leading-none px-2 py-1">
                LIVE
              </span>
            ) : null}
          </h2>
        </button>
        <p className="text-[11px] text-muted-foreground">{formatSubscribers(channel.member_count || 0)}</p>
      </div>

      <button
        type="button"
        onClick={() => setSearchOpen((v: boolean) => !v)}
        className="p-2 text-muted-foreground hover:text-foreground"
        aria-label="Поиск сообщений"
        title="Поиск сообщений"
      >
        <Search className="w-5 h-5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-2 text-muted-foreground hover:text-foreground">
            <MoreVertical className="w-5 h-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={isMember ? handleLeave : handleJoin}>
            {isMember ? "Отписаться от канала" : "Подписаться на канал"}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={async () => {
              try {
                await setMuted(!muted);
                toast.success(!muted ? "Уведомления выключены" : "Уведомления включены");
              } catch (e) {
                logger.error("[ChannelHeader] Mute toggle failed", { channelId: channel.id, error: e });
                toast.error("Не удалось обновить уведомления");
              }
            }}
            disabled={!isMember}
          >
            {muted ? "Включить уведомления" : "Выключить уведомления"}
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={!isMember || !canUpdateSettings}>
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

          <DropdownMenuItem
            onClick={toggleLive}
            disabled={!isMember}
          >
            {liveMode ? "Остановить трансляцию" : "Трансляция"}
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => setSelectMode((v: boolean) => !v)}
            disabled={!isMember}
          >
            {selectMode ? "Отменить выбор" : "Выбрать сообщения"}
          </DropdownMenuItem>

          <DropdownMenuItem disabled>Отправить подарок</DropdownMenuItem>

          <DropdownMenuItem onClick={handleCreateInvite} disabled={!canInvite}>
            <Link className="w-4 h-4 mr-2" />
            Пригласить в канал
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShowInviteQr} disabled={!canInvite}>
            <QrCode className="w-4 h-4 mr-2" />
            Показать QR-приглашение
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={deleteChannel}
            className="text-destructive focus:text-destructive"
            disabled={role !== "owner"}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Удалить канал
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
