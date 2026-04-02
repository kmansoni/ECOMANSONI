/**
 * src/components/chat/MessageSeenBySheet.tsx
 *
 * Sheet показывающий кто прочитал сообщение в группе.
 * Список аватаров + имён + время прочтения.
 */
import { CheckCheck, Clock, Eye } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { useGroupReadReceipts, type SeenByEntry } from "@/hooks/useGroupReadReceipts";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { logger } from "@/lib/logger";

// ── Props ────────────────────────────────────────────────────────────

interface MessageSeenBySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string | null;
  totalParticipants?: number;
}

// ── Компонент ────────────────────────────────────────────────────────

export function MessageSeenBySheet({
  open,
  onOpenChange,
  messageId,
  totalParticipants = 0,
}: MessageSeenBySheetProps) {
  const { seenBy, loading } = useGroupReadReceipts(open ? messageId : null);

  const notSeenCount = Math.max(0, totalParticipants - seenBy.length - 1); // -1 = отправитель

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-safe max-h-[70vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Кто прочитал
          </SheetTitle>
          <SheetDescription>
            {loading
              ? "Загрузка..."
              : `${seenBy.length} прочитали`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Loading */}
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Прочитали */}
          {!loading && seenBy.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground px-1 mb-2">
                <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                <span>Прочитано ({seenBy.length})</span>
              </div>
              {seenBy.map((entry) => (
                <SeenByRow key={entry.userId} entry={entry} />
              ))}
            </div>
          )}

          {/* Не доставлено / не прочитано */}
          {!loading && notSeenCount > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground px-1 mb-2">
                <Clock className="w-3.5 h-3.5" />
                <span>Не прочитано ({notSeenCount})</span>
              </div>
              <p className="text-xs text-muted-foreground px-1">
                {notSeenCount} участник{notSeenCount === 1 ? "" : notSeenCount < 5 ? "а" : "ов"} ещё не прочитали
              </p>
            </div>
          )}

          {/* Пусто */}
          {!loading && seenBy.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
              <Eye className="w-10 h-10 opacity-50" />
              <p className="text-sm">Никто ещё не прочитал</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Строка участника ─────────────────────────────────────────────────

function SeenByRow({ entry }: { entry: SeenByEntry }) {
  const timeStr = (() => {
    try {
      return format(new Date(entry.seenAt), "d MMM, HH:mm", { locale: ru });
    } catch (e) {
      logger.error("[SeenByRow] Ошибка форматирования даты", { error: e });
      return "";
    }
  })();

  return (
    <div className="flex items-center gap-3 px-1 py-2 rounded-lg hover:bg-muted/50 transition-colors">
      <GradientAvatar
        name={entry.displayName}
        avatarUrl={entry.avatarUrl}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{entry.displayName}</p>
        {timeStr && (
          <p className="text-xs text-muted-foreground">{timeStr}</p>
        )}
      </div>
      <CheckCheck className="w-4 h-4 text-blue-500 shrink-0" />
    </div>
  );
}
