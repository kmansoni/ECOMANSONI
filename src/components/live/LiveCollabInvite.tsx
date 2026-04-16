/**
 * @file src/components/live/LiveCollabInvite.tsx
 * @description Совместный Live (Collab Live) — приглашение гостя в трансляцию.
 * Хост отправляет инвайт, гость принимает/отклоняет.
 * При принятии — split-screen трансляция.
 *
 * Архитектура:
 * - Таблица live_collab_sessions (host_id, guest_id, status)
 * - Supabase Realtime: хост и гость подписаны на изменения статуса
 * - WebRTC: отдельный peer connection для гостя через SFU
 * - Split-screen: CSS grid 50/50 или PiP режим
 */

import { useState, useEffect, useCallback } from "react";
import { UserPlus, X, Check, Users, Video } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { dbLoose } from "@/lib/supabase";

export interface CollabSession {
  id: string;
  host_id: string;
  guest_id: string | null;
  live_session_id: string;
  status: "pending" | "active" | "ended" | "declined";
}

interface LiveCollabInviteProps {
  liveSessionId: string;
  isHost: boolean;
  onCollabStarted: (guestId: string) => void;
}

interface SearchProfile {
  id: string;
  username: string | null;
  avatar_url: string | null;
}

export function LiveCollabInvite({ liveSessionId, isHost, onCollabStarted }: LiveCollabInviteProps) {
  const { user } = useAuth();
  const [showInviteSheet, setShowInviteSheet] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<CollabSession | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchProfile[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Подписка на входящие инвайты (для гостя)
  useEffect(() => {
    if (!user || isHost) return;
    // live_collab_sessions не в генерированных типах
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = dbLoose
      .channel(`collab_invite_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_collab_sessions",
          filter: `guest_id=eq.${user.id}`,
        },
        (payload: { new: CollabSession }) => {
          if (payload.new.status === "pending") {
            setPendingInvite(payload.new);
          }
        }
      )
      .subscribe();

    return () => { dbLoose.removeChannel(channel); };
  }, [user, isHost]);

  // Подписка на изменение статуса (для хоста)
  useEffect(() => {
    if (!user || !isHost) return;
    // live_collab_sessions не в генерированных типах
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = dbLoose
      .channel(`collab_status_${liveSessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "live_collab_sessions",
          filter: `live_session_id=eq.${liveSessionId}`,
        },
        (payload: { new: CollabSession }) => {
          if (payload.new.status === "active") {
            toast.success("Гость принял приглашение!");
            onCollabStarted(payload.new.guest_id!);
          } else if (payload.new.status === "declined") {
            toast.error("Гость отклонил приглашение");
          }
        }
      )
      .subscribe();

    return () => { dbLoose.removeChannel(channel); };
  }, [user, isHost, liveSessionId, onCollabStarted]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) { setSearchResults([]); return; }
    const { data } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .ilike("username", `%${query}%`)
      .neq("id", user?.id ?? "")
      .limit(10);
    setSearchResults((data ?? []) as SearchProfile[]);
  };

  const sendInvite = async (guestId: string) => {
    if (!user) return;
    setIsSending(true);
    const { error } = await dbLoose.from("live_collab_sessions").insert({
      host_id: user.id,
      guest_id: guestId,
      live_session_id: liveSessionId,
      status: "pending",
    });
    setIsSending(false);
    if (error) { toast.error("Ошибка отправки инвайта"); return; }
    toast.success("Приглашение отправлено");
    setShowInviteSheet(false);
  };

  const respondToInvite = async (accept: boolean) => {
    if (!pendingInvite) return;
    const { error } = await dbLoose
      .from("live_collab_sessions")
      .update({
        status: accept ? "active" : "declined",
        started_at: accept ? new Date().toISOString() : null,
      })
      .eq("id", pendingInvite.id);

    if (error) { toast.error("Ошибка"); return; }
    if (accept) {
      onCollabStarted(pendingInvite.host_id);
    }
    setPendingInvite(null);
  };

  return (
    <>
      {/* Кнопка для хоста */}
      {isHost && (
        <button
          onClick={() => setShowInviteSheet(true)}
          className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1.5"
        >
          <UserPlus className="w-4 h-4 text-white" />
          <span className="text-white text-sm">Collab</span>
        </button>
      )}

      {/* Входящий инвайт для гостя */}
      <AnimatePresence>
        {pendingInvite && !isHost && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-4 right-4 z-50"
          >
            <div className="bg-card border border-border rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Video className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Приглашение в Live</p>
                  <p className="text-xs text-muted-foreground">Хост приглашает вас в совместную трансляцию</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => respondToInvite(false)}
                  className="flex-1"
                >
                  <X className="w-4 h-4 mr-1" />
                  Отклонить
                </Button>
                <Button
                  onClick={() => respondToInvite(true)}
                  className="flex-1"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Принять
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sheet поиска гостя */}
      <Sheet open={showInviteSheet} onOpenChange={setShowInviteSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl h-[70vh] flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Пригласить в Collab
            </SheetTitle>
          </SheetHeader>

          <input
            type="text"
            placeholder="Поиск пользователей..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="mt-4 w-full px-4 py-3 rounded-xl border border-border bg-background text-sm"
            autoFocus
          />

          <div className="flex-1 overflow-y-auto mt-3">
            {searchResults.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 cursor-pointer"
                onClick={() => sendInvite(profile.id)}
              >
                <Avatar className="w-10 h-10">
                  <AvatarImage src={profile.avatar_url ?? undefined} />
                  <AvatarFallback>{profile.username?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium text-sm">{profile.username}</p>
                </div>
                <Button size="sm" disabled={isSending}>
                  Пригласить
                </Button>
              </div>
            ))}
            {searchQuery.length >= 2 && searchResults.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                Пользователи не найдены
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
