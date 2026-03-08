import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ── Types ──────────────────────────────────────────────────────────────────

export type BusinessCategory = "retail" | "food" | "services" | "education" | "tech" | "other";

export interface BusinessHourEntry {
  open: string;   // "09:00"
  close: string;  // "18:00"
  closed: boolean;
}

export type BusinessHours = Partial<Record<
  "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
  BusinessHourEntry
>>;

export interface QuickReply {
  id: string;
  text: string;
  message: string;
}

export interface BusinessLabel {
  id: string;
  name: string;
  color: string;
}

export interface BusinessAccount {
  id: string;
  user_id: string;
  business_name: string;
  business_category: BusinessCategory;
  business_description: string | null;
  business_address: string | null;
  business_phone: string | null;
  business_email: string | null;
  business_website: string | null;
  business_hours: BusinessHours;
  greeting_message: string | null;
  away_message: string | null;
  quick_replies: QuickReply[];
  auto_reply_enabled: boolean;
  labels: BusinessLabel[];
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatLabel {
  id: string;
  business_id: string;
  chat_id: string;
  label: string;
  color: string;
  created_at: string;
}

export type CreateBusinessData = Pick<
  BusinessAccount,
  | "business_name"
  | "business_category"
  | "business_description"
  | "business_address"
  | "business_phone"
  | "business_email"
  | "business_website"
  | "business_hours"
  | "greeting_message"
  | "away_message"
  | "auto_reply_enabled"
>;

// ── Hook ───────────────────────────────────────────────────────────────────

interface UseBusinessAccountReturn {
  account: BusinessAccount | null;
  createAccount: (data: CreateBusinessData) => Promise<{ ok: boolean; error?: string }>;
  updateAccount: (data: Partial<BusinessAccount>) => Promise<{ ok: boolean; error?: string }>;
  deleteAccount: () => Promise<{ ok: boolean; error?: string }>;
  quickReplies: QuickReply[];
  addQuickReply: (text: string, message: string) => Promise<{ ok: boolean; error?: string }>;
  removeQuickReply: (id: string) => Promise<{ ok: boolean; error?: string }>;
  chatLabels: ChatLabel[];
  addLabel: (chatId: string, label: string, color?: string) => Promise<{ ok: boolean; error?: string }>;
  removeLabel: (chatId: string, label: string) => Promise<{ ok: boolean; error?: string }>;
  isBusinessAccount: boolean;
  isLoading: boolean;
  error: string | null;
  stats: { chats_today: number; chats_week: number; chats_month: number } | null;
  reloadStats: () => Promise<void>;
}

export function useBusinessAccount(): UseBusinessAccountReturn {
  const { user } = useAuth();
  const [account, setAccount] = useState<BusinessAccount | null>(null);
  const [chatLabels, setChatLabels] = useState<ChatLabel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ chats_today: number; chats_week: number; chats_month: number } | null>(null);

  // Load account on mount
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const { data, error: qErr } = await (supabase as any)
        .from("business_accounts")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (cancelled) return;
      if (qErr && qErr.code !== "PGRST116") {
        setError(qErr.message);
      } else if (data) {
        setAccount(data as BusinessAccount);
        // Load chat labels
        const { data: labels } = await (supabase as any)
          .from("business_chat_labels")
          .select("*")
          .eq("business_id", (data as BusinessAccount).id);
        if (!cancelled) setChatLabels((labels ?? []) as ChatLabel[]);
      }
      setIsLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [user]);

  const createAccount = useCallback(async (data: CreateBusinessData): Promise<{ ok: boolean; error?: string }> => {
    if (!user) return { ok: false, error: "not_authenticated" };
    setIsLoading(true);
    setError(null);
    try {
      const { data: created, error: insertErr } = await (supabase as any)
        .from("business_accounts")
        .insert({ ...data, user_id: user.id, quick_replies: [], labels: [] })
        .select()
        .single();
      if (insertErr) {
        setError(insertErr.message);
        return { ok: false, error: insertErr.message };
      }
      setAccount(created as BusinessAccount);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown_error";
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const updateAccount = useCallback(async (data: Partial<BusinessAccount>): Promise<{ ok: boolean; error?: string }> => {
    if (!user || !account) return { ok: false, error: "no_account" };
    setIsLoading(true);
    setError(null);
    try {
      const { data: updated, error: updateErr } = await (supabase as any)
        .from("business_accounts")
        .update(data)
        .eq("id", account.id)
        .eq("user_id", user.id) // RLS double-check
        .select()
        .single();
      if (updateErr) {
        setError(updateErr.message);
        return { ok: false, error: updateErr.message };
      }
      setAccount(updated as BusinessAccount);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown_error";
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, [user, account]);

  const deleteAccount = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!user || !account) return { ok: false, error: "no_account" };
    setIsLoading(true);
    try {
      const { error: delErr } = await (supabase as any)
        .from("business_accounts")
        .delete()
        .eq("id", account.id)
        .eq("user_id", user.id);
      if (delErr) return { ok: false, error: delErr.message };
      setAccount(null);
      setChatLabels([]);
      return { ok: true };
    } finally {
      setIsLoading(false);
    }
  }, [user, account]);

  const addQuickReply = useCallback(async (text: string, message: string): Promise<{ ok: boolean; error?: string }> => {
    if (!account) return { ok: false, error: "no_account" };
    const newReply: QuickReply = {
      id: crypto.randomUUID(),
      text: text.trim(),
      message: message.trim(),
    };
    if (!newReply.text || !newReply.message) return { ok: false, error: "empty_fields" };
    const updated = [...account.quick_replies, newReply];
    return updateAccount({ quick_replies: updated });
  }, [account, updateAccount]);

  const removeQuickReply = useCallback(async (id: string): Promise<{ ok: boolean; error?: string }> => {
    if (!account) return { ok: false, error: "no_account" };
    const updated = account.quick_replies.filter((r) => r.id !== id);
    return updateAccount({ quick_replies: updated });
  }, [account, updateAccount]);

  const addLabel = useCallback(async (chatId: string, label: string, color = "#3b82f6"): Promise<{ ok: boolean; error?: string }> => {
    if (!account) return { ok: false, error: "no_account" };
    const { data: created, error: insertErr } = await (supabase as any)
      .from("business_chat_labels")
      .insert({ business_id: account.id, chat_id: chatId, label, color })
      .select()
      .single();
    if (insertErr) return { ok: false, error: insertErr.message };
    setChatLabels((prev) => [...prev, created as ChatLabel]);
    return { ok: true };
  }, [account]);

  const removeLabel = useCallback(async (chatId: string, label: string): Promise<{ ok: boolean; error?: string }> => {
    if (!account) return { ok: false, error: "no_account" };
    const { error: delErr } = await (supabase as any)
      .from("business_chat_labels")
      .delete()
      .eq("business_id", account.id)
      .eq("chat_id", chatId)
      .eq("label", label);
    if (delErr) return { ok: false, error: delErr.message };
    setChatLabels((prev) => prev.filter((l) => !(l.chat_id === chatId && l.label === label)));
    return { ok: true };
  }, [account]);

  const reloadStats = useCallback(async () => {
    if (!account) return;
    const { data } = await (supabase as any).rpc("get_business_stats", { p_business_id: account.id });
    if (data?.ok) {
      setStats({
        chats_today: data.chats_today ?? 0,
        chats_week: data.chats_week ?? 0,
        chats_month: data.chats_month ?? 0,
      });
    }
  }, [account]);

  // Load stats when account is loaded
  useEffect(() => {
    if (account) reloadStats();
  }, [account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    account,
    createAccount,
    updateAccount,
    deleteAccount,
    quickReplies: account?.quick_replies ?? [],
    addQuickReply,
    removeQuickReply,
    chatLabels,
    addLabel,
    removeLabel,
    isBusinessAccount: !!account,
    isLoading,
    error,
    stats,
    reloadStats,
  };
}
