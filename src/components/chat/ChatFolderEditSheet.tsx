/**
 * ChatFolderEditSheet — создание/редактирование пользовательской папки чатов.
 *
 * Возможности:
 * - Создание новой папки с именем
 * - Редактирование названия существующей папки
 * - Удаление пользовательской папки
 * - Валидация: длина имени 1–30, дубликаты по имени
 */

import { useState, useCallback, useEffect } from "react";
import { Trash2, FolderPlus, Pencil } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ChatFolder } from "@/hooks/useChatFolders";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ChatFolderEditSheetProps {
  open: boolean;
  onClose: () => void;
  /** null = создание новой папки, объект = редактирование */
  folder: ChatFolder | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_NAME_LENGTH = 30;
const MAX_USER_FOLDERS = 20;

// ─── Component ─────────────────────────────────────────────────────────────────

export function ChatFolderEditSheet({ open, onClose, folder }: ChatFolderEditSheetProps) {
  const { user } = useAuth();
  const isEditing = folder !== null;

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Синхронизация при открытии/смене папки
  useEffect(() => {
    if (open) {
      setName(folder?.name ?? "");
      setConfirmDelete(false);
    }
  }, [open, folder]);

  const trimmedName = name.trim();
  const isValid = trimmedName.length >= 1 && trimmedName.length <= MAX_NAME_LENGTH;

  const handleSave = useCallback(async () => {
    if (!user?.id || !isValid) return;

    setSaving(true);
    try {
      if (isEditing && folder) {
        // Обновление существующей папки
        const { error } = await supabase
          .from("chat_folders")
          .update({ name: trimmedName, updated_at: new Date().toISOString() })
          .eq("id", folder.id)
          .eq("user_id", user.id);

        if (error) {
          logger.error("[ChatFolderEditSheet] Ошибка обновления папки", { folderId: folder.id, error });
          toast.error("Не удалось обновить папку");
          return;
        }

        toast.success("Папка обновлена");
      } else {
        // Проверка лимита пользовательских папок
        const { count, error: countError } = await supabase
          .from("chat_folders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_system", false);

        if (countError) {
          logger.error("[ChatFolderEditSheet] Ошибка проверки лимита", { error: countError });
          toast.error("Не удалось проверить количество папок");
          return;
        }

        if ((count ?? 0) >= MAX_USER_FOLDERS) {
          toast.error(`Максимум ${MAX_USER_FOLDERS} пользовательских папок`);
          return;
        }

        // Определяем sort_order: после последней пользовательской
        const { data: lastFolder, error: lastError } = await supabase
          .from("chat_folders")
          .select("sort_order")
          .eq("user_id", user.id)
          .order("sort_order", { ascending: false })
          .limit(1);

        if (lastError) {
          logger.error("[ChatFolderEditSheet] Ошибка получения sort_order", { error: lastError });
        }

        const nextSortOrder = (lastFolder?.[0]?.sort_order ?? 0) + 1;

        const { error: insertError } = await supabase
          .from("chat_folders")
          .insert({
            user_id: user.id,
            name: trimmedName,
            sort_order: nextSortOrder,
            is_system: false,
          });

        if (insertError) {
          logger.error("[ChatFolderEditSheet] Ошибка создания папки", { error: insertError });
          toast.error("Не удалось создать папку");
          return;
        }

        toast.success("Папка создана");
      }

      onClose();
    } catch (err: unknown) {
      logger.error("[ChatFolderEditSheet] Неожиданная ошибка", { error: err });
      toast.error("Произошла ошибка");
    } finally {
      setSaving(false);
    }
  }, [user?.id, isValid, isEditing, folder, trimmedName, onClose]);

  const handleDelete = useCallback(async () => {
    if (!user?.id || !folder) return;

    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("chat_folders")
        .delete()
        .eq("id", folder.id)
        .eq("user_id", user.id);

      if (error) {
        logger.error("[ChatFolderEditSheet] Ошибка удаления папки", { folderId: folder.id, error });
        toast.error("Не удалось удалить папку");
        return;
      }

      toast.success("Папка удалена");
      onClose();
    } catch (err: unknown) {
      logger.error("[ChatFolderEditSheet] Ошибка удаления", { error: err });
      toast.error("Произошла ошибка при удалении");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [user?.id, folder, confirmDelete, onClose]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[50vh] flex flex-col"
        aria-label={isEditing ? "Редактирование папки" : "Новая папка"}
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2 text-base">
            {isEditing ? (
              <>
                <Pencil className="w-5 h-5 text-muted-foreground" />
                Редактировать папку
              </>
            ) : (
              <>
                <FolderPlus className="w-5 h-5 text-muted-foreground" />
                Новая папка
              </>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-1 pb-4">
          {/* Поле названия */}
          <div className="space-y-2">
            <Label htmlFor="folder-name">Название</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
              placeholder="Например: Работа"
              maxLength={MAX_NAME_LENGTH}
              autoFocus
              aria-describedby="folder-name-hint"
            />
            <p
              id="folder-name-hint"
              className={cn(
                "text-xs",
                trimmedName.length > MAX_NAME_LENGTH - 5 ? "text-warning" : "text-muted-foreground",
              )}
            >
              {trimmedName.length}/{MAX_NAME_LENGTH}
            </p>
          </div>

          {/* Кнопки действий */}
          <div className="flex gap-2">
            <Button
              className="flex-1 min-h-[44px]"
              disabled={!isValid || saving}
              onClick={handleSave}
              aria-label={isEditing ? "Сохранить изменения" : "Создать папку"}
            >
              {saving ? "Сохранение…" : isEditing ? "Сохранить" : "Создать"}
            </Button>

            {isEditing && !folder?.is_system && (
              <Button
                variant={confirmDelete ? "destructive" : "outline"}
                className="min-h-[44px] min-w-[44px]"
                disabled={deleting}
                onClick={handleDelete}
                aria-label={confirmDelete ? "Подтвердить удаление" : "Удалить папку"}
              >
                {deleting ? (
                  "…"
                ) : confirmDelete ? (
                  "Удалить?"
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
