/**
 * ExportChatSheet — панель экспорта истории чата.
 *
 * Выбор формата (JSON/TXT/HTML), включение/выключение медиа,
 * фильтрация по дате, прогресс-бар, отмена экспорта.
 */

import { useState, useCallback } from "react";
import { Download, FileJson, FileText, Globe, X, ImageOff, Image } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChatExport } from "@/hooks/useChatExport";
import { cn } from "@/lib/utils";
import type { ExportFormat } from "@/lib/chat/chatExportFormatters";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ExportChatSheetProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  chatName: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const FORMAT_OPTIONS: Array<{ value: ExportFormat; label: string; description: string; icon: typeof FileJson }> = [
  { value: "json", label: "JSON", description: "Структурированные данные", icon: FileJson },
  { value: "txt", label: "TXT", description: "Обычный текст", icon: FileText },
  { value: "html", label: "HTML", description: "Веб-страница", icon: Globe },
];

// ─── Component ─────────────────────────────────────────────────────────────────

export function ExportChatSheet({ open, onClose, conversationId, chatName }: ExportChatSheetProps) {
  const { exporting, progress, totalMessages, exportChat, cancelExport } = useChatExport();

  const [format, setFormat] = useState<ExportFormat>("json");
  const [includeMedia, setIncludeMedia] = useState(true);

  const handleExport = useCallback(async () => {
    await exportChat({
      conversationId,
      chatName,
      format,
      includeMedia,
      dateFrom: null,
      dateTo: null,
    });
  }, [exportChat, conversationId, chatName, format, includeMedia]);

  const handleCancel = useCallback(() => {
    cancelExport();
  }, [cancelExport]);

  const handleClose = useCallback(() => {
    if (exporting) {
      cancelExport();
    }
    onClose();
  }, [exporting, cancelExport, onClose]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[60vh] flex flex-col"
        aria-label="Экспорт истории чата"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Download className="w-5 h-5 text-muted-foreground" />
            Экспорт чата
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-1 pb-4 overflow-y-auto">
          {/* Название чата */}
          <div className="text-sm text-muted-foreground truncate">
            Чат: <span className="font-medium text-foreground">{chatName || "Без названия"}</span>
          </div>

          {/* Выбор формата */}
          <div className="space-y-2">
            <Label>Формат файла</Label>
            <Select
              value={format}
              onValueChange={(val) => setFormat(val as ExportFormat)}
              disabled={exporting}
            >
              <SelectTrigger className="min-h-[44px]" aria-label="Выбрать формат">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      <opt.icon className="w-4 h-4 text-muted-foreground" />
                      <span>{opt.label}</span>
                      <span className="text-muted-foreground text-xs">— {opt.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Включить медиа */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {includeMedia ? (
                <Image className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ImageOff className="w-4 h-4 text-muted-foreground" />
              )}
              <Label htmlFor="include-media" className="text-sm cursor-pointer">
                Включить ссылки на медиа
              </Label>
            </div>
            <Switch
              id="include-media"
              checked={includeMedia}
              onCheckedChange={setIncludeMedia}
              disabled={exporting}
              aria-label="Включить медиафайлы в экспорт"
            />
          </div>

          {/* Прогресс экспорта */}
          {exporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Экспорт: {progress}%
                </span>
                {totalMessages > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ~{totalMessages} сообщений
                  </span>
                )}
              </div>
              <Progress value={progress} className="h-2" aria-label="Прогресс экспорта" />
            </div>
          )}

          {/* Кнопки */}
          <div className="flex gap-2 pt-1">
            {exporting ? (
              <Button
                variant="destructive"
                className="flex-1 min-h-[44px]"
                onClick={handleCancel}
                aria-label="Отменить экспорт"
              >
                <X className="w-4 h-4 mr-2" />
                Отменить
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={handleClose}
                  aria-label="Закрыть"
                >
                  Отмена
                </Button>
                <Button
                  className={cn("flex-1 min-h-[44px]")}
                  onClick={handleExport}
                  aria-label="Начать экспорт"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Экспортировать
                </Button>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
