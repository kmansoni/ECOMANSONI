/**
 * ArchivedChatsSheet — панель архивированных чатов как в Telegram/WhatsApp.
 *
 * Отображает список архивированных чатов, свайп для разархивации,
 * кнопка разархивировать в каждой строке.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Archive, ArchiveRestore, ArrowLeft, MessageSquare } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useArchivedChats } from "@/hooks/useArchivedChats";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ArchivedChatsSheetProps {
  open: boolean;
  onClose: () => void;
  onSelectChat?: (conversationId: string) => void;
}

interface ArchivedChatPreview {
  dialogId: string;
  previewText: string;
  updatedAt: string;
  unreadCount: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 80;

// ─── Component ─────────────────────────────────────────────────────────────────

export function ArchivedChatsSheet({ open, onClose, onSelectChat }: ArchivedChatsSheetProps) {
  const { user } = useAuth();
  const { archivedChatIds, archivedCount, unarchiveChat, loading: archiveLoading } = useArchivedChats();
  const [chatPreviews, setChatPreviews] = useState<ArchivedChatPreview[]>([]);
  const [loadingPreviews, setLoadingPreviews] = useState(false);

  // Загрузка превью архивированных чатов
  useEffect(() => {
    if (!open || !user?.id || archivedChatIds.size === 0) {
      setChatPreviews([]);
      return;
    }

    let cancelled = false;
    setLoadingPreviews(true);

    async function fetchPreviews() {
      try {
        const ids = Array.from(archivedChatIds).slice(0, 100);
        const { data, error } = await supabase
          .from("chat_inbox_projection")
          .select("dialog_id, preview_text, updated_at, unread_count")
          .eq("user_id", user!.id)
          .in("dialog_id", ids)
          .order("updated_at", { ascending: false })
          .limit(100);

        if (error) {
          logger.error("[ArchivedChatsSheet] Ошибка загрузки превью", { error });
          return;
        }

        if (!cancelled && data) {
          setChatPreviews(
            data.map((row) => ({
              dialogId: row.dialog_id,
              previewText: row.preview_text ?? "",
              updatedAt: row.updated_at,
              unreadCount: row.unread_count ?? 0,
            })),
          );
        }
      } catch (err: unknown) {
        logger.error("[ArchivedChatsSheet] Неожиданная ошибка", { error: err });
      } finally {
        if (!cancelled) setLoadingPreviews(false);
      }
    }

    void fetchPreviews();
    return () => { cancelled = true; };
  }, [open, user?.id, archivedChatIds]);

  const handleUnarchive = useCallback(
    async (conversationId: string) => {
      await unarchiveChat(conversationId);
    },
    [unarchiveChat],
  );

  const handleChatClick = useCallback(
    (conversationId: string) => {
      onSelectChat?.(conversationId);
      onClose();
    },
    [onSelectChat, onClose],
  );

  const isLoading = archiveLoading || loadingPreviews;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col"
        aria-label="Архивированные чаты"
      >
        <SheetHeader className="px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="min-h-[44px] min-w-[44px]"
              onClick={onClose}
              aria-label="Закрыть"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <SheetTitle className="flex items-center gap-2">
              <Archive className="w-5 h-5 text-muted-foreground" />
              Архив
              {archivedCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {archivedCount}
                </Badge>
              )}
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto" role="list" aria-label="Список архивированных чатов">
          {isLoading && (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          )}

          {!isLoading && chatPreviews.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-8 text-center text-muted-foreground">
              <MessageSquare className="w-12 h-12 opacity-50" />
              <p className="text-sm">Нет архивированных чатов</p>
              <p className="text-xs opacity-70">
                Свайпните чат влево или используйте контекстное меню для архивации
              </p>
            </div>
          )}

          {!isLoading &&
            chatPreviews.map((chat) => (
              <SwipeableArchiveItem
                key={chat.dialogId}
                chat={chat}
                onUnarchive={handleUnarchive}
                onClick={handleChatClick}
              />
            ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── SwipeableArchiveItem ──────────────────────────────────────────────────────

interface SwipeableArchiveItemProps {
  chat: ArchivedChatPreview;
  onUnarchive: (id: string) => Promise<void>;
  onClick: (id: string) => void;
}

function SwipeableArchiveItem({ chat, onUnarchive, onClick }: SwipeableArchiveItemProps) {
  const x = useMotionValue(0);
  const iconOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const iconScale = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0.5]);
  const startXRef = { current: 0 };
  const startYRef = { current: 0 };

  const formattedTime = useMemo(() => {
    try {
      const d = new Date(chat.updatedAt);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    } catch {
      return "";
    }
  }, [chat.updatedAt]);

  return (
    <div className="relative overflow-hidden" role="listitem">
      {/* Фон свайпа */}
      <motion.div
        className="absolute inset-y-0 right-0 flex items-center justify-end pr-4 bg-blue-500"
        style={{ opacity: iconOpacity }}
      >
        <motion.div style={{ scale: iconScale }}>
          <ArchiveRestore className="w-6 h-6 text-white" />
        </motion.div>
      </motion.div>

      <motion.div
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -SWIPE_THRESHOLD * 1.5, right: 0 }}
        dragElastic={0.2}
        onDragEnd={(_e, info) => {
          if (info.offset.x < -SWIPE_THRESHOLD) {
            void onUnarchive(chat.dialogId);
          }
          animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
        }}
        className="relative bg-background"
      >
        <button
          type="button"
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 text-left",
            "min-h-[64px] hover:bg-muted/50 active:bg-muted/70 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          onClick={() => onClick(chat.dialogId)}
          aria-label={`Чат, последнее сообщение: ${chat.previewText.slice(0, 40)}`}
        >
          {/* Аватар-заглушка */}
          <div className="w-12 h-12 rounded-full bg-muted flex-shrink-0 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-muted-foreground" />
          </div>

          {/* Контент */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm truncate">
                {chat.dialogId.slice(0, 8)}…
              </span>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {formattedTime}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground truncate">
                {chat.previewText || "Нет сообщений"}
              </p>
              {chat.unreadCount > 0 && (
                <Badge
                  variant="default"
                  className="min-w-[20px] h-5 text-[11px] flex-shrink-0"
                >
                  {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                </Badge>
              )}
            </div>
          </div>

          {/* Кнопка разархивировать */}
          <Button
            variant="ghost"
            size="icon"
            className="min-h-[44px] min-w-[44px] flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              void onUnarchive(chat.dialogId);
            }}
            aria-label="Разархивировать чат"
          >
            <ArchiveRestore className="w-4 h-4" />
          </Button>
        </button>
      </motion.div>
    </div>
  );
}
