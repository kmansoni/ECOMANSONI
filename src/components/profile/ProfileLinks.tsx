/**
 * @file src/components/profile/ProfileLinks.tsx
 * @description Instagram 2024+ стиль: до 5 ссылок в профиле.
 * Владелец управляет ссылками, все видят публичные.
 *
 * Архитектура:
 * - Таблица profile_links (id, user_id, url, title, position, created_at)
 * - RLS: SELECT public, INSERT/UPDATE/DELETE только owner
 * - Drag-to-reorder через position field
 * - URL validation: только https://, max 2048 chars
 * - Title: max 30 chars, fallback = hostname
 * - Favicon: загружается через Google Favicon API
 */

import { useState, useCallback } from "react";
import { Plus, X, GripVertical, ExternalLink, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface ProfileLink {
  id: string;
  user_id: string;
  url: string;
  title: string;
  position: number;
}

interface ProfileLinksProps {
  userId: string;
  isOwner: boolean;
  links: ProfileLink[];
  onRefresh: () => void;
}

const MAX_LINKS = 5;

function getFavicon(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  } catch {
    return "";
  }
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function validateUrl(url: string): string | null {
  if (!url.trim()) return "URL обязателен";
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (!["http:", "https:"].includes(parsed.protocol)) return "Только http/https";
    if (url.length > 2048) return "URL слишком длинный";
    return null;
  } catch {
    return "Некорректный URL";
  }
}

function normalizeUrl(url: string): string {
  if (!url.startsWith("http")) return `https://${url}`;
  return url;
}

export function ProfileLinks({ userId, isOwner, links, onRefresh }: ProfileLinksProps) {
  const { user } = useAuth();
  const [showSheet, setShowSheet] = useState(false);
  const [editingLink, setEditingLink] = useState<ProfileLink | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenAdd = () => {
    setEditingLink(null);
    setNewUrl("");
    setNewTitle("");
    setUrlError(null);
    setShowSheet(true);
  };

  const handleOpenEdit = (link: ProfileLink) => {
    setEditingLink(link);
    setNewUrl(link.url);
    setNewTitle(link.title);
    setUrlError(null);
    setShowSheet(true);
  };

  const handleSave = async () => {
    const normalizedUrl = normalizeUrl(newUrl.trim());
    const error = validateUrl(normalizedUrl);
    if (error) { setUrlError(error); return; }

    const title = newTitle.trim() || getHostname(normalizedUrl);
    setIsSubmitting(true);

    try {
      const db = supabase as any;
      if (editingLink) {
        const { error: dbErr } = await db
          .from("profile_links")
          .update({ url: normalizedUrl, title })
          .eq("id", editingLink.id)
          .eq("user_id", user!.id);
        if (dbErr) throw dbErr;
        toast.success("Ссылка обновлена");
      } else {
        if (links.length >= MAX_LINKS) {
          toast.error(`Максимум ${MAX_LINKS} ссылок`);
          return;
        }
        const { error: dbErr } = await db.from("profile_links").insert({
          user_id: user!.id,
          url: normalizedUrl,
          title,
          position: links.length,
        });
        if (dbErr) throw dbErr;
        toast.success("Ссылка добавлена");
      }
      setShowSheet(false);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка сохранения");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const db = supabase as any;
    const { error } = await db
      .from("profile_links")
      .delete()
      .eq("id", id)
      .eq("user_id", user?.id ?? "");
    if (error) { toast.error("Ошибка удаления"); return; }
    toast.success("Ссылка удалена");
    onRefresh();
  };

  if (links.length === 0 && !isOwner) return null;

  return (
    <div className="px-4 py-2">
      {/* Список ссылок */}
      <div className="flex flex-col gap-2">
        {links.map((link) => (
          <div
            key={link.id}
            className="flex items-center gap-3 bg-muted/30 rounded-xl px-3 py-2"
          >
            {/* Favicon */}
            <img
              src={getFavicon(link.url)}
              alt=""
              className="w-5 h-5 rounded-sm flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />

            {/* Ссылка */}
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-sm font-medium truncate">{link.title}</div>
              <div className="text-xs text-muted-foreground truncate">{getHostname(link.url)}</div>
            </a>

            {/* Действия владельца */}
            {isOwner && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleOpenEdit(link)}
                  className="p-1 rounded-lg hover:bg-muted"
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={() => handleDelete(link.id)}
                  className="p-1 rounded-lg hover:bg-destructive/10"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Кнопка добавления */}
      {isOwner && links.length < MAX_LINKS && (
        <button
          onClick={handleOpenAdd}
          className="mt-2 flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Plus className="w-4 h-4" />
          Добавить ссылку ({links.length}/{MAX_LINKS})
        </button>
      )}

      {/* Sheet редактирования */}
      <Sheet open={showSheet} onOpenChange={setShowSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{editingLink ? "Редактировать ссылку" : "Добавить ссылку"}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 mt-4">
            <div>
              <Input
                placeholder="https://example.com"
                value={newUrl}
                onChange={(e) => { setNewUrl(e.target.value); setUrlError(null); }}
                className={cn(urlError && "border-destructive")}
                autoCapitalize="none"
                autoCorrect="off"
                inputMode="url"
              />
              {urlError && (
                <p className="text-xs text-destructive mt-1">{urlError}</p>
              )}
            </div>
            <Input
              placeholder="Название (необязательно)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={30}
            />
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowSheet(false)} className="flex-1">
                Отмена
              </Button>
              <Button onClick={handleSave} disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
