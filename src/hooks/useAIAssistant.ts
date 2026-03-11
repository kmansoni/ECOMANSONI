/**
 * src/hooks/useAIAssistant.ts
 * Hook for AI Assistant: send messages, get history, manage limits.
 */
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokens_used: number;
  model: string;
  created_at: string;
  conversation_id: string | null;
}

export interface AIUsageInfo {
  dailyUsed: number;
  dailyLimit: number | null;
  isPremium: boolean;
}

export interface SendMessageResult {
  reply: string;
  tokensUsed: number;
  remaining: number | null;
}

export function useAIAssistant() {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (text: string, conversationId?: string): Promise<SendMessageResult | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) throw new Error("Not authenticated");

        const res = await supabase.functions.invoke("ai-assistant", {
          body: { message: text, conversationId: conversationId ?? null },
        });

        if (res.error) {
          throw new Error(res.error.message ?? "AI assistant error");
        }

        const result = res.data as {
          reply: string;
          tokensUsed: number;
          remainingMessages: number | null;
        };

        // Optimistically update local messages
        const now = new Date().toISOString();
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "user",
            content: text,
            tokens_used: 0,
            model: "gpt-4o-mini",
            created_at: now,
            conversation_id: conversationId ?? null,
          },
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: result.reply,
            tokens_used: result.tokensUsed,
            model: "gpt-4o-mini",
            created_at: now,
            conversation_id: conversationId ?? null,
          },
        ]);

        return {
          reply: result.reply,
          tokensUsed: result.tokensUsed,
          remaining: result.remainingMessages ?? null,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const getHistory = useCallback(
    async (conversationId?: string, limit = 50): Promise<AIMessage[]> => {
      setIsLoading(true);
      setError(null);
      try {
        let query = supabase
          .from("ai_chat_messages")
          .select("*")
          .order("created_at", { ascending: true })
          .limit(limit);

        if (conversationId) {
          query = query.eq("conversation_id", conversationId);
        } else {
          query = query.is("conversation_id", null);
        }

        const { data, error: dbError } = await query;
        if (dbError) throw dbError;

        const msgs = (data ?? []) as AIMessage[];
        setMessages(msgs);
        return msgs;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const clearHistory = useCallback(async (conversationId?: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      let query = supabase.from("ai_chat_messages").delete();

      if (conversationId) {
        query = query.eq("conversation_id", conversationId);
      } else {
        query = query.is("conversation_id", null);
      }

      const { error: dbError } = await query;
      if (dbError) throw dbError;

      setMessages([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getUsageInfo = useCallback(async (): Promise<AIUsageInfo> => {
    try {
      const { data, error: dbError } = await supabase
        .from("ai_usage_limits")
        .select("daily_messages_used, is_premium, daily_reset_at")
        .single();

      if (dbError || !data) {
        return { dailyUsed: 0, dailyLimit: 20, isPremium: false };
      }

      const row = data as {
        daily_messages_used: number;
        is_premium: boolean;
        daily_reset_at: string;
      };

      // Reset check
      if (new Date(row.daily_reset_at) <= new Date()) {
        return { dailyUsed: 0, dailyLimit: row.is_premium ? null : 20, isPremium: row.is_premium };
      }

      return {
        dailyUsed: row.daily_messages_used,
        dailyLimit: row.is_premium ? null : 20,
        isPremium: row.is_premium,
      };
    } catch (_err) {
      return { dailyUsed: 0, dailyLimit: 20, isPremium: false };
    }
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    getHistory,
    clearHistory,
    getUsageInfo,
  };
}
