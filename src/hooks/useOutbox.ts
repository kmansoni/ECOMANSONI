/**
 * useOutbox — React hook for the offline message outbox.
 *
 * Responsibilities:
 *   1. Expose optimistic outbox entries for a given conversation.
 *   2. Provide sendMessage() that enqueues to IDB + registers the server sendFn.
 *   3. Re-renders on outbox state changes (subscribe/unsubscribe pattern).
 *   4. Exposes deleteFailedMessage() and retryFailedMessage() for UI controls.
 *
 * Integration with useChat:
 *   - Messages in state "pending" / "sending" / "failed" are shown above the
 *     server-fetched list with appropriate visual indicators.
 *   - On ACK, the outbox entry is removed and the server message takes its place
 *     (reconciled by localId matching the server's reflected client_local_id).
 *
 * Security:
 *   - Never logs message content.
 *   - localId is a client-generated UUID — safe to expose in UI.
 *   - sendFn is provided by the caller (useChat) — outbox does not hold
 *     Supabase credentials directly.
 *
 * Race conditions:
 *   - flushOutbox is mutex-guarded (_flushing flag) in messageOutbox.ts.
 *   - Concurrent enqueue() calls are serialized via IDB transactions.
 *   - ACK callbacks are cleaned up on unmount to prevent state updates on
 *     unmounted components.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  enqueueMessage,
  getOutboxForConversation,
  deleteOutboxEntry,
  retryOutboxEntry,
  subscribeOutbox,
  onOutboxAck,
  registerSendFn,
  type OutboxEntry,
} from "@/lib/chat/messageOutbox";
import { nextClientWriteSeq } from "@/lib/chat/protocolV11";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SendMessageParams {
  content: string;
  replyToId?: string | null;
  mediaUrls?: string[];
  messageType?: OutboxEntry["messageType"];
  encryptedPayload?: string;
  drHeader?: string;
}

export interface OutboxHookReturn {
  /** Outbox entries for this conversation (pending/sending/failed) */
  outboxEntries: OutboxEntry[];
  /**
   * Enqueue a message for sending.
   * Returns the localId for optimistic UI.
   */
  sendMessage: (params: SendMessageParams) => Promise<string>;
  /** Remove a failed message from the outbox */
  deleteFailedMessage: (localId: string) => Promise<void>;
  /** Retry a failed message immediately */
  retryFailedMessage: (localId: string) => Promise<void>;
  /**
   * Register the server send function.
   * Must be called once from the parent component after Supabase is ready.
   * Idempotent — safe to call multiple times.
   */
  registerServerSendFn: (
    fn: (entry: OutboxEntry) => Promise<{ serverId: string }>
  ) => void;
  /**
   * Called by useChat when it receives a server message that matches a localId.
   * Cleans up ACK callbacks for that message.
   */
  acknowledgeLocalId: (localId: string) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useOutbox(
  conversationId: string | null | undefined
): OutboxHookReturn {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [outboxEntries, setOutboxEntries] = useState<OutboxEntry[]>([]);
  // Ref to track registered ACK cleanup functions
  const ackCleanups = useRef<Map<string, () => void>>(new Map());

  // ── Load initial outbox state ─────────────────────────────────────────

  const loadEntries = useCallback(async () => {
    if (!conversationId || !userId) {
      setOutboxEntries([]);
      return;
    }
    const entries = await getOutboxForConversation(userId, conversationId);
    setOutboxEntries(entries);
  }, [conversationId, userId]);

  // ── Subscribe to outbox changes ──────────────────────────────────────

  useEffect(() => {
    void loadEntries();
    const unsubscribe = subscribeOutbox(() => {
      void loadEntries();
    });
    // Capture ref value at effect time to safely use in cleanup
    const cleanups = ackCleanups.current;
    return () => {
      unsubscribe();
      for (const cleanup of cleanups.values()) cleanup();
      cleanups.clear();
    };
  }, [loadEntries]);

  // ── Send a message via outbox ─────────────────────────────────────────

  const sendMessage = useCallback(
    async (params: SendMessageParams): Promise<string> => {
      if (!conversationId || !userId) {
        throw new Error("Cannot send: no active conversation or user");
      }

      const localId = crypto.randomUUID();
      const clientSeq = nextClientWriteSeq(userId);

      await enqueueMessage({
        localId,
        userId,
        conversationId,
        content: params.content,
        encryptedPayload: params.encryptedPayload,
        drHeader: params.drHeader,
        replyToId: params.replyToId ?? null,
        mediaUrls: params.mediaUrls ?? [],
        messageType: params.messageType ?? "text",
        clientSeq,
      });

      return localId;
    },
    [conversationId, userId]
  );

  // ── Acknowledge a server-confirmed message ────────────────────────────

  const acknowledgeLocalId = useCallback((localId: string) => {
    const cleanup = ackCleanups.current.get(localId);
    if (cleanup) {
      cleanup();
      ackCleanups.current.delete(localId);
    }
  }, []);

  // ── Register server send function ─────────────────────────────────────

  const registerServerSendFn = useCallback(
    (fn: (entry: OutboxEntry) => Promise<{ serverId: string }>) => {
      registerSendFn(fn);
    },
    []
  );

  // ── Delete failed message ─────────────────────────────────────────────

  const deleteFailedMessage = useCallback(async (localId: string) => {
    // Clean up ACK listener if one is registered
    const cleanup = ackCleanups.current.get(localId);
    if (cleanup) {
      cleanup();
      ackCleanups.current.delete(localId);
    }
    await deleteOutboxEntry(localId);
  }, []);

  // ── Retry failed message ──────────────────────────────────────────────

  const retryFailedMessage = useCallback(async (localId: string) => {
    await retryOutboxEntry(localId);
  }, []);

  return {
    outboxEntries,
    sendMessage,
    deleteFailedMessage,
    retryFailedMessage,
    registerServerSendFn,
    acknowledgeLocalId,
  };
}
