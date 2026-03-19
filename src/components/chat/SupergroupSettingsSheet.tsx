import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CheckCircle2, XCircle, Users, Loader2, AlertTriangle, Shield, ShieldOff, UserX, Crown, ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { useSupergroup, type SupergroupSettings, type JoinRequest, type MemberRole, type GroupMember, type MemberPermissions } from "@/hooks/useSupergroup";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface SupergroupSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  /** Whether the conversation is still a group (not yet supergroup) */
  isGroup?: boolean;
}

export function SupergroupSettingsSheet({
  open,
  onOpenChange,
  conversationId,
  isGroup = false,
}: SupergroupSettingsSheetProps) {
  const { user } = useAuth();
  const {
    settings,
    joinRequests,
    membersCount,
    members,
    membersLoading,
    currentUserRole,
    isLoading,
    error,
    updateSettings,
    approveRequest,
    rejectRequest,
    convertToSupergroup,
    loadMembers,
    updateMemberRole,
    updateMemberPermissions,
    removeMember,
  } = useSupergroup(conversationId);

  const [converting, setConverting] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  // Load members when the members section is expanded
  useEffect(() => {
    if (showMembers && members.length === 0 && !membersLoading) {
      void loadMembers();
    }
  }, [showMembers, members.length, membersLoading, loadMembers]);

  // Local draft state for settings form
  const [draft, setDraft] = useState<Partial<SupergroupSettings>>({});
  // Merge draft over loaded settings for display
  const effective = { ...(settings ?? {}), ...draft } as SupergroupSettings;

  const handleToggle = (key: keyof SupergroupSettings, value: boolean) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveSettings = async () => {
    if (!Object.keys(draft).length) return;
    setSavingSettings(true);
    try {
      await updateSettings(draft);
      setDraft({});
      toast.success("Настройки сохранены");
    } catch (e) {
      toast.error("Ошибка сохранения настроек");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleApprove = async (req: JoinRequest) => {
    try {
      await approveRequest(req.id);
      toast.success(`${req.profile?.full_name ?? req.profile?.username ?? "Пользователь"} принят`);
    } catch (e) {
      toast.error("Ошибка при одобрении заявки");
    }
  };

  const handleReject = async (req: JoinRequest) => {
    try {
      await rejectRequest(req.id);
      toast.success("Заявка отклонена");
    } catch (e) {
      toast.error("Ошибка при отклонении заявки");
    }
  };

  const handleConvert = async () => {
    setConverting(true);
    try {
      await convertToSupergroup();
      toast.success("Группа конвертирована в супергруппу");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setConverting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-gray-950 border-gray-800 text-gray-100 p-0 flex flex-col"
      >
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-gray-100 text-lg font-semibold">
            {isGroup ? "Настройки группы" : "Настройки супергруппы"}
          </SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        )}

        {error && (
          <div className="mx-6 flex items-center gap-2 text-red-400 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className="px-6 pb-6 space-y-6">

            {/* Convert to Supergroup (if still a group) */}
            {isGroup && (
              <div className="rounded-xl border border-yellow-800/50 bg-yellow-900/20 p-4 space-y-3">
                <div className="flex items-center gap-2 text-yellow-400 font-medium text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Это обычная группа</span>
                </div>
                <p className="text-gray-400 text-xs leading-relaxed">
                  Конвертация в супергруппу даёт расширенные настройки, управление
                  участниками, заявки на вступление и форум-режим. Это действие 
                  необратимо.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-yellow-700 text-yellow-400 hover:bg-yellow-900/30 w-full"
                  onClick={handleConvert}
                  disabled={converting}
                >
                  {converting && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
                  Конвертировать в супергруппу
                </Button>
              </div>
            )}

            {/* Member count */}
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <Users className="w-4 h-4" />
              <span>{membersCount.toLocaleString("ru")} участников</span>
              {settings && (
                <Badge
                  variant="outline"
                  className="border-gray-700 text-gray-500 text-xs"
                >
                  макс. {settings.max_members.toLocaleString("ru")}
                </Badge>
              )}
            </div>

            {/* Settings (shown only for supergroups) */}
            {settings && !isGroup && (
              <>
                <Separator className="bg-gray-800" />

                <div className="space-y-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Основные настройки
                  </p>

                  {/* Max members */}
                  <div className="space-y-1.5">
                    <Label className="text-gray-300 text-sm">Максимум участников</Label>
                    <Input
                      type="number"
                      min={1}
                      max={1000000}
                      value={effective.max_members ?? 200000}
                      onChange={e =>
                        setDraft(prev => ({ ...prev, max_members: parseInt(e.target.value) || 200000 }))
                      }
                      className="bg-gray-900 border-gray-700 text-gray-100 h-9"
                    />
                  </div>

                  {/* Join by link */}
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-300 text-sm cursor-pointer">
                      Вступление по ссылке
                    </Label>
                    <Switch
                      checked={effective.join_by_link ?? true}
                      onCheckedChange={v => handleToggle("join_by_link", v)}
                    />
                  </div>

                  {/* Join request required */}
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-300 text-sm cursor-pointer">
                      Требовать заявку на вступление
                    </Label>
                    <Switch
                      checked={effective.join_request_required ?? false}
                      onCheckedChange={v => handleToggle("join_request_required", v)}
                    />
                  </div>

                  {/* History visible */}
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-300 text-sm cursor-pointer">
                      История видна новым участникам
                    </Label>
                    <Switch
                      checked={effective.history_visible_to_new_members ?? true}
                      onCheckedChange={v => handleToggle("history_visible_to_new_members", v)}
                    />
                  </div>

                  {/* Forum mode */}
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-gray-300 text-sm cursor-pointer">
                        Форум-режим (темы)
                      </Label>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Каждая тема — отдельная ветка обсуждения
                      </p>
                    </div>
                    <Switch
                      checked={effective.forum_mode ?? false}
                      onCheckedChange={v => handleToggle("forum_mode", v)}
                    />
                  </div>
                </div>

                <Separator className="bg-gray-800" />

                <div className="space-y-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Сообщения
                  </p>

                  {/* Messages TTL */}
                  <div className="space-y-1.5">
                    <Label className="text-gray-300 text-sm">
                      Авто-удаление сообщений (секунды, 0 = выкл)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={effective.messages_ttl ?? 0}
                      onChange={e =>
                        setDraft(prev => ({ ...prev, messages_ttl: parseInt(e.target.value) || 0 }))
                      }
                      className="bg-gray-900 border-gray-700 text-gray-100 h-9"
                    />
                  </div>

                  {/* Slow mode */}
                  <div className="space-y-1.5">
                    <Label className="text-gray-300 text-sm">
                      Медленный режим (секунды между сообщениями, 0 = выкл)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={effective.slow_mode_seconds ?? 0}
                      onChange={e =>
                        setDraft(prev => ({ ...prev, slow_mode_seconds: parseInt(e.target.value) || 0 }))
                      }
                      className="bg-gray-900 border-gray-700 text-gray-100 h-9"
                    />
                  </div>

                  <Separator className="bg-gray-800" />

                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Права новых участников
                  </p>

                  <div className="flex items-center justify-between">
                    <Label className="text-gray-300 text-sm cursor-pointer">
                      Разрешить отправку сообщений
                    </Label>
                    <Switch
                      checked={effective.default_member_can_send_messages ?? true}
                      onCheckedChange={v => handleToggle("default_member_can_send_messages", v)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-gray-300 text-sm cursor-pointer">
                      Разрешить отправку медиа
                    </Label>
                    <Switch
                      checked={effective.default_member_can_send_media ?? true}
                      onCheckedChange={v => handleToggle("default_member_can_send_media", v)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-gray-300 text-sm cursor-pointer">
                      Разрешить отправку ссылок
                    </Label>
                    <Switch
                      checked={effective.default_member_can_send_links ?? true}
                      onCheckedChange={v => handleToggle("default_member_can_send_links", v)}
                    />
                  </div>
                </div>

                {Object.keys(draft).length > 0 && (
                  <Button
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                  >
                    {savingSettings && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Сохранить изменения
                  </Button>
                )}
              </>
            )}

            {/* Members section (supergroup only) */}
            {!isGroup && (currentUserRole === 'owner' || currentUserRole === 'admin') && (
              <>
                <Separator className="bg-gray-800" />
                <div className="space-y-3">
                  <button
                    type="button"
                    className="flex items-center justify-between w-full"
                    onClick={() => setShowMembers(v => !v)}
                  >
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Участники
                    </p>
                    {showMembers ? (
                      <ChevronUp className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    )}
                  </button>

                  {showMembers && (
                    <div className="space-y-2">
                      {membersLoading && (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                        </div>
                      )}
                      {!membersLoading && members.map(member => (
                        <MemberCard
                          key={member.user_id}
                          member={member}
                          currentUserId={user?.id ?? ""}
                          currentUserRole={currentUserRole}
                          onUpdateRole={async (role) => {
                            try {
                              await updateMemberRole(member.user_id, role);
                              toast.success(role === "admin" ? "Назначен администратором" : "Понижен до участника");
                            } catch {
                              toast.error("Не удалось изменить роль");
                            }
                          }}
                          onKick={async () => {
                            try {
                              await removeMember(member.user_id);
                              toast.success("Участник удалён");
                            } catch {
                              toast.error("Не удалось удалить участника");
                            }
                          }}
                          onUpdatePermissions={async (patch) => {
                            try {
                              await updateMemberPermissions(member.user_id, patch);
                              toast.success("Ограничения обновлены");
                            } catch {
                              toast.error("Не удалось обновить ограничения");
                            }
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Join requests */}
            {joinRequests.length > 0 && (
              <>
                <Separator className="bg-gray-800" />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Заявки на вступление
                    </p>
                    <Badge className="bg-blue-900/40 text-blue-300 border-blue-800 text-xs">
                      {joinRequests.length}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {joinRequests.map(req => (
                      <JoinRequestCard
                        key={req.id}
                        request={req}
                        onApprove={() => handleApprove(req)}
                        onReject={() => handleReject(req)}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ── JoinRequestCard ────────────────────────────────────────────────────────

interface JoinRequestCardProps {
  request: JoinRequest;
  onApprove: () => void;
  onReject: () => void;
}

function JoinRequestCard({ request, onApprove, onReject }: JoinRequestCardProps) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  const handle = async (action: "approve" | "reject") => {
    setLoading(action);
    try {
      if (action === "approve") await onApprove();
      else await onReject();
    } finally {
      setLoading(null);
    }
  };

  const name =
    request.profile?.full_name ||
    request.profile?.username ||
    request.user_id.slice(0, 8);

  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-900/60 border border-gray-800">
      <Avatar className="w-9 h-9 flex-shrink-0">
        <AvatarImage src={request.profile?.avatar_url ?? undefined} />
        <AvatarFallback className="bg-gray-800 text-gray-300 text-xs">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-200 truncate">{name}</p>
        {request.profile?.username && (
          <p className="text-xs text-gray-500">@{request.profile.username}</p>
        )}
        {request.message && (
          <p className="text-xs text-gray-400 mt-1 line-clamp-2">
            {request.message}
          </p>
        )}
        <p className="text-xs text-gray-600 mt-1">
          {new Date(request.created_at).toLocaleDateString("ru", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <Button
          size="icon"
          variant="ghost"
          className="w-8 h-8 hover:bg-green-900/40 hover:text-green-400 text-gray-400"
          onClick={() => handle("approve")}
          disabled={!!loading}
          title="Принять"
        >
          {loading === "approve" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="w-8 h-8 hover:bg-red-900/40 hover:text-red-400 text-gray-400"
          onClick={() => handle("reject")}
          disabled={!!loading}
          title="Отклонить"
        >
          {loading === "reject" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

// ── MemberCard ─────────────────────────────────────────────────────────────

interface MemberCardProps {
  member: GroupMember;
  currentUserId: string;
  currentUserRole: MemberRole | null;
  onUpdateRole: (role: MemberRole) => Promise<void>;
  onUpdatePermissions: (patch: Partial<MemberPermissions>) => Promise<void>;
  onKick: () => Promise<void>;
}

function MemberCard({ member, currentUserId, currentUserRole, onUpdateRole, onUpdatePermissions, onKick }: MemberCardProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showPermissions, setShowPermissions] = useState(false);
  const isSelf = member.user_id === currentUserId;
  const canManage = !isSelf && member.role !== 'owner' && (
    currentUserRole === 'owner' ||
    (currentUserRole === 'admin' && member.role === 'member')
  );

  const name = member.profile?.display_name || member.user_id.slice(0, 8);
  const initials = name.slice(0, 2).toUpperCase();

  const roleBadge: Record<MemberRole, { label: string; cls: string }> = {
    owner: { label: "Владелец", cls: "bg-yellow-900/40 text-yellow-300 border-yellow-800" },
    admin: { label: "Администратор", cls: "bg-blue-900/40 text-blue-300 border-blue-800" },
    member: { label: "Участник", cls: "bg-gray-800 text-gray-400 border-gray-700" },
  };
  const badge = roleBadge[member.role];

  const handle = async (action: string, fn: () => Promise<void>) => {
    setBusy(action);
    try { await fn(); } finally { setBusy(null); }
  };

  const now = Date.now();
  const mutedUntilTs = member.permissions.muted_until ? Date.parse(member.permissions.muted_until) : NaN;
  const isMuted = Number.isFinite(mutedUntilTs) && mutedUntilTs > now;

  return (
    <div className="p-2.5 rounded-xl bg-gray-900/50 border border-gray-800 space-y-2">
      <div className="flex items-center gap-3">
        <Avatar className="w-8 h-8 flex-shrink-0">
          <AvatarImage src={member.profile?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-gray-800 text-gray-300 text-xs">{initials}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-200 truncate">{name}</p>
          {member.profile?.username && (
            <p className="text-xs text-gray-500 truncate">@{member.profile.username}</p>
          )}
        </div>

        <Badge variant="outline" className={`text-xs flex-shrink-0 ${badge.cls}`}>
          {member.role === "owner" && <Crown className="w-2.5 h-2.5 mr-1" />}
          {badge.label}
        </Badge>

        {canManage && (
          <div className="flex gap-1 flex-shrink-0">
            {member.role === "member" ? (
              <Button
                size="icon"
                variant="ghost"
                className="w-7 h-7 hover:bg-blue-900/30 hover:text-blue-400 text-gray-500"
                title="Назначить администратором"
                disabled={!!busy}
                onClick={() => handle("promote", () => onUpdateRole("admin"))}
              >
                {busy === "promote" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="w-7 h-7 hover:bg-gray-700 hover:text-gray-300 text-gray-500"
                title="Понизить до участника"
                disabled={!!busy}
                onClick={() => handle("demote", () => onUpdateRole("member"))}
              >
                {busy === "demote" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="w-7 h-7 hover:bg-indigo-900/30 hover:text-indigo-300 text-gray-500"
              title="Ограничения"
              disabled={!!busy}
              onClick={() => setShowPermissions(v => !v)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="w-7 h-7 hover:bg-red-900/30 hover:text-red-400 text-gray-500"
              title="Удалить из группы"
              disabled={!!busy}
              onClick={() => handle("kick", onKick)}
            >
              {busy === "kick" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
            </Button>
          </div>
        )}
      </div>

      {showPermissions && canManage && (
        <div className="mt-1 border border-gray-800 rounded-lg p-2.5 space-y-2.5 bg-gray-950/40">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300 cursor-pointer">Разрешить отправку сообщений</Label>
            <Switch
              checked={member.permissions.can_send_messages}
              onCheckedChange={(v) => void handle("perm-msg", () => onUpdatePermissions({ can_send_messages: v }))}
              disabled={!!busy}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300 cursor-pointer">Разрешить медиа</Label>
            <Switch
              checked={member.permissions.can_send_media}
              onCheckedChange={(v) => void handle("perm-media", () => onUpdatePermissions({ can_send_media: v }))}
              disabled={!!busy}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-300 cursor-pointer">Разрешить ссылки</Label>
            <Switch
              checked={member.permissions.can_send_links}
              onCheckedChange={(v) => void handle("perm-links", () => onUpdatePermissions({ can_send_links: v }))}
              disabled={!!busy}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {isMuted ? `Мут до ${new Date(mutedUntilTs).toLocaleString("ru")}` : "Не замьючен"}
            </span>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-gray-700 text-xs"
                disabled={!!busy}
                onClick={() => void handle("mute-1h", () => onUpdatePermissions({ muted_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() }))}
              >
                1ч
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-gray-700 text-xs"
                disabled={!!busy}
                onClick={() => void handle("mute-24h", () => onUpdatePermissions({ muted_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }))}
              >
                24ч
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-gray-700 text-xs"
                disabled={!!busy}
                onClick={() => void handle("unmute", () => onUpdatePermissions({ muted_until: null }))}
              >
                Снять
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
