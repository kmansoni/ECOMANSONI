/**
 * useChatExport — хук для экспорта истории чата.
 *
 * Загружает сообщения пакетами по 100, форматирует в выбранном формате,
 * генерирует blob URL и скачивает файл. Поддерживает отмену.
 */

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import {
  formatExport,
  getExportMimeType,
  getExportExtension,
  type ExportFormat,
  type ExportMessage,
  type ExportMeta,
} from "@/lib/chat/chatExportFormatters";
import { fetchUserBriefMap, type UserBrief } from "@/lib/users/userBriefs";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ExportOptions {
  conversationId: string;
  chatName: string;
  format: ExportFormat;
  includeMedia: boolean;
  dateFrom: Date | null;
  dateTo: Date | null;
}

export interface UseChatExportReturn {
  exporting: boolean;
  progress: number;
  totalMessages: number;
  exportChat: (options: ExportOptions) => Promise<void>;
  cancelExport: () => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const BATCH_SIZE = 100;
const MAX_MESSAGES = 50_000;

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useChatExport(): UseChatExportReturn {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const cancelledRef = useRef(false);
  const blobUrlRef = useRef<string | null>(null);

  const cancelExport = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const exportChat = useCallback(
    async (options: ExportOptions) => {
      if (!user?.id) {
        toast.error("Войдите в аккаунт для экспорта");
        return;
      }

      cancelledRef.current = false;
      setExporting(true);
      setProgress(0);
      setTotalMessages(0);

      // Очистка предыдущего blob URL
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      try {
        // 1. Подсчёт общего количества сообщений
        let countQuery = supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", options.conversationId);

        if (options.dateFrom) {
          countQuery = countQuery.gte("created_at", options.dateFrom.toISOString());
        }
        if (options.dateTo) {
          countQuery = countQuery.lte("created_at", options.dateTo.toISOString());
        }

        const { count, error: countError } = await countQuery;
        if (countError) {
          logger.error("[useChatExport] Ошибка подсчёта сообщений", {
            conversationId: options.conversationId,
            error: countError,
          });
          toast.error("Не удалось подсчитать сообщения");
          return;
        }

        const total = Math.min(count ?? 0, MAX_MESSAGES);
        if (total === 0) {
          toast.info("В чате нет сообщений для экспорта");
          return;
        }

        setTotalMessages(total);

        // 2. Загрузка сообщений пакетами
        const allMessages: ExportMessage[] = [];
        const senderIds = new Set<string>();
        let offset = 0;

        while (offset < total) {
          if (cancelledRef.current) {
            toast.info("Экспорт отменён");
            return;
          }

          let batchQuery = supabase
            .from("messages")
            .select("id, content, sender_id, created_at, media_type, media_url")
            .eq("conversation_id", options.conversationId)
            .order("created_at", { ascending: true })
            .range(offset, offset + BATCH_SIZE - 1)
            .limit(BATCH_SIZE);

          if (options.dateFrom) {
            batchQuery = batchQuery.gte("created_at", options.dateFrom.toISOString());
          }
          if (options.dateTo) {
            batchQuery = batchQuery.lte("created_at", options.dateTo.toISOString());
          }

          const { data: batch, error: batchError } = await batchQuery;
          if (batchError) {
            logger.error("[useChatExport] Ошибка загрузки пакета", {
              offset,
              error: batchError,
            });
            toast.error("Ошибка при загрузке сообщений");
            return;
          }

          if (!batch || batch.length === 0) break;

          for (const row of batch) {
            senderIds.add(row.sender_id);
            allMessages.push({
              id: row.id,
              senderName: row.sender_id,
              content: row.content,
              createdAt: row.created_at,
              mediaType: options.includeMedia ? row.media_type : null,
              mediaUrl: options.includeMedia ? row.media_url : null,
            });
          }

          offset += batch.length;
          setProgress(Math.round((offset / total) * 100));
        }

        if (cancelledRef.current) {
          toast.info("Экспорт отменён");
          return;
        }

        // 3. Резолв имён отправителей
        const briefMap = await resolveSenderNames(Array.from(senderIds));
        for (const msg of allMessages) {
          const brief = briefMap.get(msg.senderName);
          if (brief) {
            msg.senderName = brief.display_name || brief.username || msg.senderName.slice(0, 8);
          } else {
            msg.senderName = msg.senderName.slice(0, 8);
          }
        }

        // 4. Форматирование
        const meta: ExportMeta = {
          chatName: options.chatName,
          exportedAt: new Date().toISOString(),
          totalMessages: allMessages.length,
          dateFrom: options.dateFrom?.toISOString() ?? null,
          dateTo: options.dateTo?.toISOString() ?? null,
        };

        const content = formatExport(options.format, allMessages, meta);

        // 5. Скачивание
        const blob = new Blob([content], {
          type: getExportMimeType(options.format),
        });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        const ext = getExportExtension(options.format);
        const safeName = options.chatName.replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]/g, "_");
        const filename = `export_${safeName}_${Date.now()}.${ext}`;

        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setProgress(100);
        toast.success(`Экспортировано ${allMessages.length} сообщений`);
      } catch (err: unknown) {
        logger.error("[useChatExport] Неожиданная ошибка экспорта", { error: err });
        toast.error("Произошла ошибка при экспорте");
      } finally {
        setExporting(false);
      }
    },
    [user?.id],
  );

  return { exporting, progress, totalMessages, exportChat, cancelExport };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function resolveSenderNames(
  senderIds: string[],
): Promise<Map<string, UserBrief>> {
  try {
    return await fetchUserBriefMap(senderIds);
  } catch (err: unknown) {
    logger.warn("[useChatExport] Не удалось загрузить профили отправителей", { error: err });
    return new Map();
  }
}
