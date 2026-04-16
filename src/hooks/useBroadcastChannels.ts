/**
 * src/hooks/useBroadcastChannels.ts
 *
 * Хук для broadcast-каналов (каналы-рассылки).
 * Creator создаёт канал → подписчики читают → реакции разрешены всем.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, dbLoose } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Типы ─────────────────────────────────────────────────────────────

export interface BroadcastChannel {
  id: string;
  creator_id: string;
  name: string;
  description: string;
  avatar_url: string | null;
  is_public: boolean;
  member_count: number;
  created_at: string;
}

export interface BroadcastMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  text: string;
  media_url: string | null;
  created_at: string;
}

type UnknownRecord = Record<string, unknown>;

// ── Утилиты ──────────────────────────────────────────────────────────

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null;
}

function str(obj: UnknownRecord, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

function strNull(obj: UnknownRecord, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

function num(obj: UnknownRecord, key: string): number {
  const v = obj[key];
  return typeof v === "number" ? v : 0;
}

function bool(obj: UnknownRecord, key: string): boolean {
  const v = obj[key];
  return typeof v === "boolean" ? v : false;
}

function toBroadcastChannel(row: unknown): BroadcastChannel | null {
  if (!isRecord(row)) return null;
  const id = str(row, "id");
  const creator_id = str(row, "creator_id");
  const name = str(row, "name");
  if (!id || !creator_id || !name) return null;
  return {
    id,
    creator_id,
    name,
    description: str(row, "description"),
    avatar_url: strNull(row, "avatar_url"),
    is_public: bool(row, "is_public"),
    member_count: num(row, "member_count"),
    created_at: str(row, "created_at"),
  };
}

function toBroadcastMessage(row: unknown): BroadcastMessage | null {
  if (!isRecord(row)) return null;
  const id = str(row, "id");
  const channel_id = str(row, "channel_id");
  const sender_id = str(row, "sender_id");
  const text = str(row, "text");
  if (!id || !channel_id || !sender_id) return null;
  return {
    id,
    channel_id,
    sender_id,
    text,
    media_url: strNull(row, "media_url"),
    created_at: str(row, "created_at"),
  };
}

const PAGE_SIZE = 50;

// ── Хук: мои каналы + подписки ───────────────────────────────────────

export function useBroadcastChannels() {
  const { user } = useAuth();
  const [myChannels, setMyChannels] = useState<BroadcastChannel[]>([]);
  const [joinedChannels, setJoinedChannels] = useState<BroadcastChannel[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChannels = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const db = supabase as unknown as {
        from(t: string): {
          select(c: string): {
            eq(col: string, val: string): {
              order(col: string, opts: { ascending: boolean }): {
                limit(n: number): Promise<{ data: unknown[] | null; error: unknown }>;
              };
              limit(n: number): Promise<{ data: unknown[] | null; error: unknown }>;
            };
          };
        };
      };

      // Мои каналы (я = creator)
      const { data: myRaw, error: myErr } = await db
        .from("broadcast_channels")
        .select("id, creator_id, name, description, avatar_url, is_public, member_count, created_at")
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (myErr) {
        logger.error("[useBroadcastChannels] Ошибка загрузки моих каналов", { error: myErr });
      } else {
        setMyChannels((myRaw ?? []).map(toBroadcastChannel).filter((c): c is BroadcastChannel => c !== null));
      }

      // Подписки
      const { data: memberRows, error: memberErr } = await db
        .from("broadcast_channel_members")
        .select("channel_id")
        .eq("user_id", user.id)
        .limit(200);

      if (memberErr) {
        logger.error("[useBroadcastChannels] Ошибка загрузки подписок", { error: memberErr });
      } else if (memberRows && memberRows.length > 0) {
        const channelIds = (memberRows as UnknownRecord[]).map((r) => str(r, "channel_id")).filter(Boolean);
        if (channelIds.length > 0) {
          const dbIn = supabase as unknown as {
            from(t: string): {
              select(c: string): {
                in(col: string, vals: string[]): {
                  order(col: string, opts: { ascending: boolean }): {
                    limit(n: number): Promise<{ data: unknown[] | null; error: unknown }>;
                  };
                };
              };
            };
          };
          const { data: joinedRaw, error: joinedErr } = await dbIn
            .from("broadcast_channels")
            .select("id, creator_id, name, description, avatar_url, is_public, member_count, created_at")
            .in("id", channelIds)
            .order("created_at", { ascending: false })
            .limit(PAGE_SIZE);

          if (joinedErr) {
            logger.error("[useBroadcastChannels] Ошибка загрузки подписанных каналов", { error: joinedErr });
          } else {
            setJoinedChannels(
              (joinedRaw ?? []).map(toBroadcastChannel).filter((c): c is BroadcastChannel => c !== null),
            );
          }
        }
      }
    } catch (e) {
      logger.error("[useBroadcastChannels] Непредвиденная ошибка", { error: e });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  const createChannel = useCallback(
    async (name: string, description: string): Promise<BroadcastChannel | null> => {
      if (!user) return null;
      const trimName = name.trim();
      const trimDesc = description.trim();

      if (trimName.length < 1 || trimName.length > 100) {
        toast.error("Название канала от 1 до 100 символов");
        return null;
      }

      try {
        const db = supabase as unknown as {
          from(t: string): {
            insert(row: UnknownRecord): {
              select(c: string): {
                single(): Promise<{ data: unknown; error: unknown }>;
              };
            };
          };
        };
        const { data, error } = await db
          .from("broadcast_channels")
          .insert({ creator_id: user.id, name: trimName, description: trimDesc })
          .select("id, creator_id, name, description, avatar_url, is_public, member_count, created_at")
          .single();

        if (error) {
          logger.error("[useBroadcastChannels] Ошибка создания канала", { error });
          toast.error("Не удалось создать канал");
          return null;
        }

        const channel = toBroadcastChannel(data);
        if (channel) {
          setMyChannels((prev) => [channel, ...prev]);
          toast.success("Канал создан");
        }
        return channel;
      } catch (e) {
        logger.error("[useBroadcastChannels] Ошибка создания канала", { error: e });
        toast.error("Не удалось создать канал");
        return null;
      }
    },
    [user],
  );

  const joinChannel = useCallback(
    async (channelId: string) => {
      if (!user) return;
      try {
        const db = supabase as unknown as {
          from(t: string): {
            insert(row: UnknownRecord): Promise<{ error: unknown }>;
          };
        };
        const { error } = await db
          .from("broadcast_channel_members")
          .insert({ channel_id: channelId, user_id: user.id });

        if (error) {
          logger.error("[useBroadcastChannels] Ошибка подписки", { error });
          toast.error("Не удалось подписаться");
          return;
        }
        toast.success("Вы подписались на канал");
        void loadChannels();
      } catch (e) {
        logger.error("[useBroadcastChannels] Ошибка подписки", { error: e });
        toast.error("Не удалось подписаться");
      }
    },
    [user, loadChannels],
  );

  const leaveChannel = useCallback(
    async (channelId: string) => {
      if (!user) return;
      try {
        const db = supabase as unknown as {
          from(t: string): {
            delete(): {
              eq(col: string, val: string): {
                eq(col2: string, val2: string): Promise<{ error: unknown }>;
              };
            };
          };
        };
        const { error } = await db
          .from("broadcast_channel_members")
          .delete()
          .eq("channel_id", channelId)
          .eq("user_id", user.id);

        if (error) {
          logger.error("[useBroadcastChannels] Ошибка отписки", { error });
          toast.error("Не удалось отписаться");
          return;
        }
        setJoinedChannels((prev) => prev.filter((c) => c.id !== channelId));
        toast.success("Вы отписались от канала");
      } catch (e) {
        logger.error("[useBroadcastChannels] Ошибка отписки", { error: e });
        toast.error("Не удалось отписаться");
      }
    },
    [user],
  );

  const sendMessage = useCallback(
    async (channelId: string, text: string): Promise<BroadcastMessage | null> => {
      if (!user) return null;
      const trimText = text.trim();
      if (trimText.length < 1 || trimText.length > 4096) {
        toast.error("Сообщение от 1 до 4096 символов");
        return null;
      }

      try {
        const db = supabase as unknown as {
          from(t: string): {
            insert(row: UnknownRecord): {
              select(c: string): {
                single(): Promise<{ data: unknown; error: unknown }>;
              };
            };
          };
        };
        const { data, error } = await db
          .from("broadcast_channel_messages")
          .insert({ channel_id: channelId, sender_id: user.id, text: trimText })
          .select("id, channel_id, sender_id, text, media_url, created_at")
          .single();

        if (error) {
          logger.error("[useBroadcastChannels] Ошибка отправки сообщения", { error });
          toast.error("Не удалось отправить сообщение");
          return null;
        }

        return toBroadcastMessage(data);
      } catch (e) {
        logger.error("[useBroadcastChannels] Ошибка отправки сообщения", { error: e });
        toast.error("Не удалось отправить сообщение");
        return null;
      }
    },
    [user],
  );

  return {
    myChannels,
    joinedChannels,
    createChannel,
    joinChannel,
    leaveChannel,
    sendMessage,
    loading,
    refresh: loadChannels,
  } as const;
}

// ── Хук: сообщения канала + realtime ─────────────────────────────────

export function useBroadcastMessages(channelId: string | null) {
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const realtimeRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!channelId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const cid = channelId;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const { data, error } = await dbLoose
          .from("broadcast_channel_messages")
          .select("id, channel_id, sender_id, text, media_url, created_at")
          .eq("channel_id", cid)
          .order("created_at", { ascending: true })
          .limit(PAGE_SIZE);

        if (!cancelled) {
          if (error) {
            logger.error("[useBroadcastMessages] Ошибка загрузки", { channelId, error });
          } else {
            setMessages(
              (data ?? []).map(toBroadcastMessage).filter((m): m is BroadcastMessage => m !== null),
            );
          }
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          logger.error("[useBroadcastMessages] Ошибка загрузки", { channelId, error: e });
          setLoading(false);
        }
      }
    }

    void load();

    // Realtime подписка
    const channel = supabase
      .channel(`bc-messages:${channelId}`)
      .on(
        "postgres_changes" as "system",
        {
          event: "INSERT",
          schema: "public",
          table: "broadcast_channel_messages",
          filter: `channel_id=eq.${channelId}`,
        } as Record<string, unknown>,
        (payload: unknown) => {
          if (isRecord(payload)) {
            const msg = toBroadcastMessage(isRecord(payload.new) ? payload.new : null);
            if (msg) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                return [...prev, msg];
              });
            }
          }
        },
      )
      .subscribe();

    realtimeRef.current = channel;

    return () => {
      cancelled = true;
      if (realtimeRef.current) {
        void supabase.removeChannel(realtimeRef.current);
        realtimeRef.current = null;
      }
    };
  }, [channelId]);

  return { messages, loading } as const;
}
