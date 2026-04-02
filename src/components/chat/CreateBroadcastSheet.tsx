/**
 * src/components/chat/CreateBroadcastSheet.tsx
 *
 * Sheet для создания нового broadcast-канала.
 * Название, описание, публичность, превью.
 */
import { useState, useCallback } from "react";
import { Loader2, Radio, Globe, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { useBroadcastChannels, type BroadcastChannel } from "@/hooks/useBroadcastChannels";

// ── Props ────────────────────────────────────────────────────────────

interface CreateBroadcastSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (channel: BroadcastChannel) => void;
}

// ── Компонент ────────────────────────────────────────────────────────

export function CreateBroadcastSheet({ open, onOpenChange, onCreated }: CreateBroadcastSheetProps) {
  const { createChannel } = useBroadcastChannels();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = useCallback((): Record<string, string> => {
    const e: Record<string, string> = {};
    const trimName = name.trim();
    if (!trimName) e.name = "Название обязательно";
    else if (trimName.length > 100) e.name = "Максимум 100 символов";
    if (description.trim().length > 512) e.description = "Максимум 512 символов";
    return e;
  }, [name, description]);

  const handleCreate = useCallback(async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setCreating(true);

    const channel = await createChannel(name.trim(), description.trim());
    setCreating(false);

    if (channel) {
      setName("");
      setDescription("");
      setIsPublic(true);
      onOpenChange(false);
      onCreated?.(channel);
    }
  }, [validate, createChannel, name, description, onOpenChange, onCreated]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" />
            Новый канал-рассылка
          </SheetTitle>
          <SheetDescription>
            Создайте канал для отправки сообщений подписчикам
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Название */}
          <div className="space-y-1">
            <label htmlFor="bc-name" className="text-sm font-medium">
              Название
            </label>
            <Input
              id="bc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Мой канал"
              maxLength={100}
              className="min-h-[44px]"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "bc-name-error" : undefined}
            />
            {errors.name && (
              <p id="bc-name-error" className="text-sm text-destructive" role="alert">
                {errors.name}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{name.length}/100</p>
          </div>

          {/* Описание */}
          <div className="space-y-1">
            <label htmlFor="bc-desc" className="text-sm font-medium">
              Описание
            </label>
            <Textarea
              id="bc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="О чём будет канал..."
              maxLength={512}
              rows={3}
              className="min-h-[44px] resize-none"
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? "bc-desc-error" : undefined}
            />
            {errors.description && (
              <p id="bc-desc-error" className="text-sm text-destructive" role="alert">
                {errors.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{description.length}/512</p>
          </div>

          {/* Публичность */}
          <div className="flex items-center justify-between min-h-[44px]">
            <div className="flex items-center gap-2">
              {isPublic ? (
                <Globe className="w-4 h-4 text-primary" />
              ) : (
                <Lock className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-sm">
                {isPublic ? "Публичный канал" : "Приватный канал"}
              </span>
            </div>
            <Switch
              checked={isPublic}
              onCheckedChange={setIsPublic}
              aria-label="Публичный канал"
            />
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            {isPublic
              ? "Любой пользователь может найти и подписаться"
              : "Только по приглашению"}
          </p>

          {/* Превью */}
          {name.trim() && (
            <div className="bg-muted/50 rounded-xl p-3 border">
              <p className="text-xs text-muted-foreground mb-1">Превью</p>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Radio className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{name.trim()}</p>
                  {description.trim() && (
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {description.trim()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Кнопка */}
          <Button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="w-full min-h-[44px]"
          >
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Создание...
              </>
            ) : (
              "Создать канал"
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
