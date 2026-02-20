import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type ChatFolderItemKind = "dm" | "group" | "channel";

export type ChatFolder = {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  is_system: boolean;
  system_kind: "all" | "chats" | "groups" | "channels" | null;
  is_hidden: boolean;
  passcode_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatFolderItem = {
  id: string;
  folder_id: string;
  item_kind: ChatFolderItemKind;
  item_id: string;
  created_at: string;
};

export function useChatFolders() {
  const { user } = useAuth();

  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [items, setItems] = useState<ChatFolderItem[]>([]);
  const [loading, setLoading] = useState(true);

  const folderIds = useMemo(() => {
    const ids = folders.map((f) => f.id).filter((id) => typeof id === "string" && id.length > 0);
    return ids.filter((id) => /^[0-9a-f-]{16,}$/i.test(id));
  }, [folders]);

  const folderIdsFilter = useMemo(() => {
    if (!folderIds.length) return null;
    return `folder_id=in.(${folderIds.join(",")})`;
  }, [folderIds]);

  const fetchAll = useCallback(async () => {
    if (!user?.id) {
      setFolders([]);
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const foldersRes = await supabase
        .from("chat_folders")
        .select("id, user_id, name, sort_order, is_system, system_kind, is_hidden, passcode_hash, created_at, updated_at")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (foldersRes.error) throw foldersRes.error;

      const fetched = ((foldersRes.data ?? []) as any) as ChatFolder[];

      // Ensure system tabs exist (Supabase-backed): All / Chats / Groups / Channels
      const bySystemKind = new Map<string, ChatFolder>();
      for (const f of fetched) {
        if (f.system_kind) bySystemKind.set(f.system_kind, f);
      }

      const missing: Array<{ name: string; system_kind: ChatFolder["system_kind"]; sort_order: number }> = [];
      if (!bySystemKind.has("all")) missing.push({ name: "Все", system_kind: "all", sort_order: -400 });
      if (!bySystemKind.has("chats")) missing.push({ name: "Личные", system_kind: "chats", sort_order: -399 });
      if (!bySystemKind.has("groups")) missing.push({ name: "Группы", system_kind: "groups", sort_order: -398 });
      if (!bySystemKind.has("channels")) missing.push({ name: "Каналы", system_kind: "channels", sort_order: -397 });

      if (missing.length) {
        const ins = await supabase.from("chat_folders").insert(
          missing.map((m) => ({
            user_id: user.id,
            name: m.name,
            sort_order: m.sort_order,
            is_system: true,
            system_kind: m.system_kind,
          })),
        );
        if (ins.error) throw ins.error;

        // Refetch to include new rows.
        const again = await supabase
          .from("chat_folders")
          .select("id, user_id, name, sort_order, is_system, system_kind, is_hidden, passcode_hash, created_at, updated_at")
          .eq("user_id", user.id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true });
        if (again.error) throw again.error;
        const nextFolders = (again.data ?? []) as any;
        setFolders(nextFolders);

        const ids = (nextFolders as any[]).map((f) => f?.id).filter((id) => typeof id === "string" && id);
        if (ids.length) {
          const itemsRes = await supabase
            .from("chat_folder_items")
            .select("id, folder_id, item_kind, item_id, created_at")
            .in("folder_id", ids)
            .order("created_at", { ascending: true });
          if (itemsRes.error) throw itemsRes.error;
          setItems((itemsRes.data ?? []) as any);
        } else {
          setItems([]);
        }
      } else {
        setFolders(fetched as any);

        const ids = fetched.map((f) => f.id).filter((id) => typeof id === "string" && id);
        if (ids.length) {
          const itemsRes = await supabase
            .from("chat_folder_items")
            .select("id, folder_id, item_kind, item_id, created_at")
            .in("folder_id", ids)
            .order("created_at", { ascending: true });
          if (itemsRes.error) throw itemsRes.error;
          setItems((itemsRes.data ?? []) as any);
        } else {
          setItems([]);
        }
      }
    } catch (e) {
      // If migrations aren't applied yet (missing tables/columns), don't crash the UI.
      console.warn("useChatFolders: failed to fetch", e);
      setFolders([]);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!user?.id) return;

    let ch1: RealtimeChannel | null = null;
    let ch2: RealtimeChannel | null = null;

    ch1 = supabase
      .channel(`chat-folders:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_folders", filter: `user_id=eq.${user.id}` },
        () => void fetchAll(),
      )
      .subscribe();

    // Filter by folder ids to avoid global realtime storms.
    if (folderIdsFilter) {
      ch2 = supabase
        .channel(`chat-folder-items:${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "chat_folder_items", filter: folderIdsFilter },
          () => void fetchAll(),
        )
        .subscribe();
    }

    return () => {
      if (ch1) supabase.removeChannel(ch1);
      if (ch2) supabase.removeChannel(ch2);
    };
  }, [fetchAll, folderIdsFilter, user?.id]);

  const itemsByFolderId = useMemo(() => {
    const map: Record<string, ChatFolderItem[]> = {};
    for (const it of items) {
      (map[it.folder_id] ||= []).push(it);
    }
    return map;
  }, [items]);

  return { folders, itemsByFolderId, loading, refetch: fetchAll };
}
