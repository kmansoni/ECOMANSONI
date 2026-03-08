/**
 * GroupCallInviteSheet — bottom sheet для приглашения участников в текущий групповой звонок.
 *
 * Загружает участников группы из Supabase, фильтрует уже присутствующих в звонке.
 * Приглашение отправляется через Edge Function group-call-invite (push + presence).
 *
 * Безопасность:
 *  - Только аутентифицированный участник текущего звонка может приглашать
 *  - Edge Function проверяет членство отправителя в комнате
 *  - Множественное приглашение одного пользователя идемпотентно (сервер дедуплицирует)
 */

import { useState, useEffect, useCallback } from "react";
import { X, Search, UserPlus, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface GroupMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

interface Props {
  groupId: string;
  /** ID участников уже находящихся в звонке — они скрыты */
  currentParticipantIds: string[];
  onInvite: (userId: string) => void;
  onClose: () => void;
}

export function GroupCallInviteSheet({ groupId, currentParticipantIds, onInvite, onClose }: Props) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // Загрузить участников группы
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        // group_members JOIN profiles
        type RawRow = {
          user_id: string;
          profiles: { id: string; display_name: string; avatar_url: string | null } | null;
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("group_members")
          .select(`
            user_id,
            profiles:user_id (
              id,
              display_name,
              avatar_url
            )
          `)
          .eq("group_id", groupId);

        if (error) throw error;
        if (cancelled) return;

        const mapped: GroupMember[] = ((data ?? []) as RawRow[])
          .map((row) => ({
            id: row.user_id,
            displayName: row.profiles?.display_name ?? "Участник",
            avatarUrl: row.profiles?.avatar_url ?? null,
          }))
          .filter(m => !currentParticipantIds.includes(m.id));

        setMembers(mapped);
      } catch (err) {
        console.error("[GroupCallInviteSheet] load error", err);
        toast.error("Не удалось загрузить список участников");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [groupId, currentParticipantIds]);

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleInvite = useCallback(async () => {
    if (selected.size === 0) return;
    setIsSending(true);
    try {
      for (const userId of selected) {
        onInvite(userId);
      }
      toast.success(`Приглашено ${selected.size} участников`);
      onClose();
    } finally {
      setIsSending(false);
    }
  }, [selected, onInvite, onClose]);

  const filtered = members.filter(m =>
    m.displayName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-60 flex items-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Sheet */}
      <div className="w-full bg-zinc-900 rounded-t-2xl overflow-hidden flex flex-col max-h-[70vh] animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-white font-semibold">Добавить участников</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-zinc-700 text-zinc-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-zinc-800">
          <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск участников..."
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-zinc-500"
              autoFocus
            />
          </div>
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-sm">
              {search ? "Никого не найдено" : "Все участники уже в звонке"}
            </div>
          ) : (
            <ul>
              {filtered.map(member => {
                const isSelected = selected.has(member.id);
                return (
                  <li key={member.id}>
                    <button
                      onClick={() => toggleSelect(member.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors text-left",
                        isSelected && "bg-zinc-800/60",
                      )}
                    >
                      <GradientAvatar
                        seed={member.id}
                        name={member.displayName}
                        avatarUrl={member.avatarUrl}
                        size="md"
                      />
                      <span className="flex-1 text-white text-sm font-medium truncate">
                        {member.displayName}
                      </span>
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                          isSelected
                            ? "bg-blue-600 border-blue-600"
                            : "border-zinc-600",
                        )}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800">
          <button
            onClick={handleInvite}
            disabled={selected.size === 0 || isSending}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-3 rounded-xl",
              "font-semibold text-sm transition-colors",
              selected.size === 0
                ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white",
            )}
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            {selected.size === 0
              ? "Выберите участников"
              : `Пригласить ${selected.size} ${selected.size === 1 ? "участника" : "участников"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
