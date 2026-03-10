/**
 * ActiveSessionsPage — shows active sessions, known devices, and login history.
 * Designed in Telegram-style dark UI.
 *
 * Sections:
 *   1. Current session (this device)
 *   2. Other active sessions — with "Terminate" per session
 *   3. "Terminate all other sessions" button
 *   4. Known devices — with "Remove" per device
 *   5. Login history — last 20 entries
 */

import React, { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserSessions, type UserSessionRow } from "@/hooks/useUserSessions";
import {
  useLoginNotifications,
  type LoginEvent,
  type KnownDevice,
} from "@/hooks/useLoginNotifications";
import { useAuth } from "@/hooks/useAuth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function deviceIcon(ua: string | null): string {
  if (!ua) return "💻";
  if (/iPhone|iPad|iPod/i.test(ua)) return "📱";
  if (/Android/i.test(ua)) return "📱";
  if (/Mobile/i.test(ua)) return "📱";
  if (/Mac/i.test(ua)) return "🍎";
  if (/Windows/i.test(ua)) return "🪟";
  if (/Linux/i.test(ua)) return "🐧";
  return "💻";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-white/40 text-xs uppercase tracking-wider px-4 py-2 mt-2">
      {title}
    </h2>
  );
}

function SessionCard({
  session,
  isCurrent,
  onTerminate,
}: {
  session: UserSessionRow;
  isCurrent: boolean;
  onTerminate?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-white/5">
      <span className="text-2xl mt-0.5">{deviceIcon(session.user_agent)}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white text-sm font-medium truncate">
            {session.device_name ?? session.user_agent?.slice(0, 60) ?? "Неизвестное устройство"}
          </p>
          {isCurrent && (
            <span className="text-[10px] bg-green-500/20 text-green-400 rounded px-1.5 py-0.5 shrink-0">
              Текущий
            </span>
          )}
        </div>
        <p className="text-white/40 text-xs mt-0.5">
          Последняя активность: {formatDate(session.last_seen_at)}
        </p>
        <p className="text-white/30 text-xs">{formatDate(session.created_at)}</p>
      </div>
      {!isCurrent && onTerminate && (
        <button
          onClick={onTerminate}
          className="text-red-400 text-xs shrink-0 mt-1"
        >
          Завершить
        </button>
      )}
    </div>
  );
}

function DeviceCard({
  device,
  onRevoke,
}: {
  device: KnownDevice;
  onRevoke: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
      <span className="text-2xl">💻</span>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">
          {device.device_name ?? "Неизвестное устройство"}
        </p>
        <p className="text-white/40 text-xs mt-0.5">
          Последний вход: {formatDate(device.last_seen_at)}
        </p>
      </div>
      <button onClick={onRevoke} className="text-red-400 text-xs shrink-0">
        Удалить
      </button>
    </div>
  );
}

function LoginEventRow({ event }: { event: LoginEvent }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-white/5">
      <span className="text-lg mt-0.5">{event.is_new_device ? "🆕" : deviceIcon(event.user_agent)}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-white/80 text-sm truncate">
            {event.user_agent?.split(" ").slice(-3).join(" ") ?? "Неизвестно"}
          </p>
          {event.is_new_device && (
            <span className="text-[10px] bg-yellow-500/20 text-yellow-400 rounded px-1.5 py-0.5">
              Новое устройство
            </span>
          )}
        </div>
        <p className="text-white/40 text-xs mt-0.5">
          {[event.location_city, event.location_country].filter(Boolean).join(", ") || "Местоположение неизвестно"}
          {event.ip_address ? ` · ${event.ip_address}` : ""}
        </p>
        <p className="text-white/30 text-xs">{formatDate(event.created_at)}</p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface ActiveSessionsPageProps {
  onClose?: () => void;
}

export default function ActiveSessionsPage({ onClose }: ActiveSessionsPageProps) {
  const { user } = useAuth();
  const { rows: sessions, loading: sessionsLoading, refetch: refetchSessions } = useUserSessions();
  const {
    loginEvents,
    knownDevices,
    loading: notifLoading,
    revokeDevice,
    refetch: refetchNotif,
  } = useLoginNotifications();

  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const [terminatingAll, setTerminatingAll] = useState(false);

  // Determine current session heuristically: the most recently active one
  const currentSession = sessions.length > 0 ? sessions[0] : null;
  const otherSessions = sessions.slice(1);

  const terminateSession = useCallback(
    async (sessionId: string) => {
      setTerminatingId(sessionId);
      try {
         
        await (supabase as any)
          .from("user_sessions")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", sessionId)
          .eq("user_id", user?.id);
        await refetchSessions();
      } finally {
        setTerminatingId(null);
      }
    },
    [user?.id, refetchSessions],
  );

  const terminateAllOther = useCallback(async () => {
    if (!currentSession) return;
    setTerminatingAll(true);
    try {
       
      await (supabase as any)
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", user?.id)
        .neq("id", currentSession.id)
        .is("revoked_at", null);
      await refetchSessions();
    } finally {
      setTerminatingAll(false);
    }
  }, [currentSession, user?.id, refetchSessions]);

  const loading = sessionsLoading || notifLoading;

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe-top pt-4 pb-3 sticky top-0 bg-black/90 backdrop-blur z-10">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white"
        >
          ←
        </button>
        <h1 className="text-white font-semibold text-base flex-1">
          Активные сессии
        </h1>
        <button
          onClick={() => Promise.all([refetchSessions(), refetchNotif()])}
          className="text-white/40 text-sm"
        >
          ↻
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}

      {!loading && (
        <div className="flex-1 overflow-y-auto pb-8">
          {/* Active sessions */}
          {sessions.length > 0 && (
            <>
              <SectionHeader title="Активные сессии" />
              {currentSession && (
                <SessionCard
                  session={currentSession}
                  isCurrent={true}
                />
              )}
              {otherSessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  isCurrent={false}
                  onTerminate={
                    terminatingId === s.id
                      ? undefined
                      : () => terminateSession(s.id)
                  }
                />
              ))}
              {otherSessions.length > 0 && (
                <div className="px-4 py-3">
                  <button
                    onClick={terminateAllOther}
                    disabled={terminatingAll}
                    className="w-full py-3 rounded-xl border border-red-500/40 text-red-400 text-sm font-medium disabled:opacity-40"
                  >
                    {terminatingAll
                      ? "Завершение…"
                      : "Завершить все другие сессии"}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Known devices */}
          {knownDevices.length > 0 && (
            <>
              <SectionHeader title="Известные устройства" />
              {knownDevices.map((d) => (
                <DeviceCard
                  key={d.id}
                  device={d}
                  onRevoke={() => revokeDevice(d.id)}
                />
              ))}
            </>
          )}

          {/* Login history */}
          {loginEvents.length > 0 && (
            <>
              <SectionHeader title="История входов" />
              {loginEvents.map((e) => (
                <LoginEventRow key={e.id} event={e} />
              ))}
            </>
          )}

          {sessions.length === 0 && knownDevices.length === 0 && loginEvents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <span className="text-4xl">🔐</span>
              <p className="text-white/40 text-sm">Нет данных</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
