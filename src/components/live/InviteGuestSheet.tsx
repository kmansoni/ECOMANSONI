/**
 * InviteGuestSheet — приглашение гостя в эфир, split-screen UI
 */
import React, { useState, useRef, useEffect } from "react";
import { X, Search, UserPlus, Video, VideoOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const db = supabase as any;

interface UserResult {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
}

interface GuestStream {
  userId: string;
  username: string;
  stream: MediaStream | null;
}

interface Props {
  sessionId: string;
  onClose: () => void;
  hostStream: MediaStream | null;
}

export function InviteGuestSheet({ sessionId, onClose, hostStream }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [guest, setGuest] = useState<GuestStream | null>(null);
  const guestVideoRef = useRef<HTMLVideoElement>(null);
  const hostVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (hostStream && hostVideoRef.current) {
      hostVideoRef.current.srcObject = hostStream;
    }
  }, [hostStream]);

  useEffect(() => {
    if (guest?.stream && guestVideoRef.current) {
      guestVideoRef.current.srcObject = guest.stream;
    }
  }, [guest]);

  const searchUsers = async (q: string) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const { data } = await db.from("profiles")
        .select("id, username, display_name, avatar_url")
        .ilike("username", `%${q}%`)
        .limit(8);
      setResults((data || []) as UserResult[]);
    } finally { setSearching(false); }
  };

  const inviteGuest = async (u: UserResult) => {
    setInviting(true);
    try {
      // Сохраняем приглашение в Supabase (упрощённо через live_chat_messages)
      await db.from("live_chat_messages").insert({
        session_id: sessionId,
        sender_id: (await supabase.auth.getUser()).data.user?.id,
        content: `__guest_invite__:${u.id}:${u.username}`,
        is_creator_message: true,
      });
      toast.success(`Приглашение отправлено @${u.username}`);
      setGuest({ userId: u.id, username: u.username, stream: null });
      setQuery("");
      setResults([]);
    } catch { toast.error("Ошибка отправки приглашения"); }
    finally { setInviting(false); }
  };

  const removeGuest = () => {
    guest?.stream?.getTracks().forEach((t) => t.stop());
    setGuest(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Split-screen */}
      <div className="flex-1 flex flex-col md:flex-row gap-1 p-1">
        {/* Хост */}
        <div className="flex-1 relative bg-zinc-900 rounded-2xl overflow-hidden">
          <video ref={hostVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">Вы</div>
        </div>

        {/* Гость */}
        <div className={cn(
          "flex-1 relative bg-zinc-900 rounded-2xl overflow-hidden flex items-center justify-center",
          !guest && "border-2 border-dashed border-white/20",
        )}>
          {guest ? (
            <>
              <video ref={guestVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                @{guest.username}
              </div>
              <button
                onClick={removeGuest}
                className="absolute top-2 right-2 w-8 h-8 bg-red-600/80 rounded-full flex items-center justify-center"
              >
                <X className="w-4 h-4 text-white" />
              </button>
              {!guest.stream && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <VideoOff className="w-10 h-10 text-white/30" />
                  <p className="text-white/50 text-sm">Ожидание @{guest.username}...</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/40">
              <UserPlus className="w-10 h-10" />
              <p className="text-sm">Пригласить гостя</p>
            </div>
          )}
        </div>
      </div>

      {/* Поиск */}
      {!guest && (
        <div className="p-4 bg-zinc-900/90 backdrop-blur-sm border-t border-white/10">
          <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2 mb-3">
            <Search className="w-4 h-4 text-white/40" />
            <input
              value={query}
              onChange={(e) => searchUsers(e.target.value)}
              placeholder="Найти пользователя для приглашения..."
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-white/30"
            />
          </div>
          {results.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => inviteGuest(u)}
                  disabled={inviting}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 transition-colors text-left disabled:opacity-50"
                >
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center">
                      <span className="text-white/40 text-sm">{u.display_name[0]}</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium">{u.display_name}</p>
                    <p className="text-xs text-white/50">@{u.username}</p>
                  </div>
                  <Video className="w-4 h-4 text-primary" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        <button onClick={onClose} className="w-full py-3 bg-zinc-800 text-white rounded-xl text-sm">
          Закрыть
        </button>
      </div>
    </div>
  );
}
