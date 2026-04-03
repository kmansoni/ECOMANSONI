/**
 * ChatFolders — горизонтальные табы папок чатов как в Telegram.
 *
 * Системные папки: Все, Личные, Группы, Каналы.
 * Пользовательские папки: из таблицы chat_folders.
 * Фильтрация чатов на основе выбранной папки.
 */

import { useState, useMemo, useCallback } from "react";
import { Plus, FolderOpen, Settings2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useChatFolders, type ChatFolder } from "@/hooks/useChatFolders";
import { cn } from "@/lib/utils";
import { ChatFolderEditSheet } from "./ChatFolderEditSheet";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ChatFoldersProps {
  activeFolderId: string | null;
  onFolderChange: (folderId: string | null, systemKind: string | null) => void;
  unreadByFolder?: Record<string, number>;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const SYSTEM_FOLDER_ICONS: Record<string, string> = {
  all: "📋",
  chats: "💬",
  groups: "👥",
  channels: "📢",
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function ChatFolders({ activeFolderId, onFolderChange, unreadByFolder }: ChatFoldersProps) {
  const { folders, loading } = useChatFolders();
  const [editOpen, setEditOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ChatFolder | null>(null);

  const visibleFolders = useMemo(
    () => folders.filter((f) => !f.is_hidden),
    [folders],
  );

  const handleFolderClick = useCallback(
    (folder: ChatFolder) => {
      onFolderChange(folder.id, folder.system_kind);
    },
    [onFolderChange],
  );

  const handleAddFolder = useCallback(() => {
    setEditingFolder(null);
    setEditOpen(true);
  }, []);

  const handleEditFolder = useCallback((folder: ChatFolder) => {
    setEditingFolder(folder);
    setEditOpen(true);
  }, []);

  if (loading) {
    return (
      <div className="flex gap-1 px-3 py-2 overflow-x-auto scrollbar-none">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-16 rounded-full bg-muted animate-pulse flex-shrink-0"
          />
        ))}
      </div>
    );
  }

  if (visibleFolders.length === 0) return null;

  return (
    <>
      <div
        className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-none border-b"
        role="tablist"
        aria-label="Папки чатов"
      >
        {visibleFolders.map((folder) => {
          const isActive = activeFolderId === folder.id;
          const unread = unreadByFolder?.[folder.id] ?? 0;
          const icon = folder.system_kind ? SYSTEM_FOLDER_ICONS[folder.system_kind] : null;

          return (
            <FolderTab
              key={folder.id}
              folder={folder}
              isActive={isActive}
              icon={icon}
              unread={unread}
              onClick={handleFolderClick}
              onLongPress={handleEditFolder}
            />
          );
        })}

        {/* Кнопка добавить папку */}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "flex-shrink-0 h-8 px-2 rounded-full min-w-[36px]",
            "text-muted-foreground hover:text-foreground",
          )}
          onClick={handleAddFolder}
          aria-label="Создать папку"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <ChatFolderEditSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        folder={editingFolder}
      />
    </>
  );
}

// ─── FolderTab ─────────────────────────────────────────────────────────────────

interface FolderTabProps {
  folder: ChatFolder;
  isActive: boolean;
  icon: string | null;
  unread: number;
  onClick: (folder: ChatFolder) => void;
  onLongPress: (folder: ChatFolder) => void;
}

function FolderTab({ folder, isActive, icon, unread, onClick, onLongPress }: FolderTabProps) {
  const longPressTimerRef = { current: 0 };

  const handlePointerDown = useCallback(() => {
    longPressTimerRef.current = window.setTimeout(() => {
      if (!folder.is_system) {
        onLongPress(folder);
      }
    }, 500);
  }, [folder, onLongPress]);

  const handlePointerUp = useCallback(() => {
    clearTimeout(longPressTimerRef.current);
  }, []);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={`Папка: ${folder.name}${unread > 0 ? `, ${unread} непрочитанных` : ""}`}
      className={cn(
        "relative flex items-center gap-1.5 px-3 h-8 rounded-full text-sm font-medium whitespace-nowrap",
        "flex-shrink-0 transition-colors min-h-[36px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "bg-primary text-primary-foreground"
          : "bg-muted/50 text-muted-foreground hover:bg-muted",
      )}
      onClick={() => onClick(folder)}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {icon && <span className="text-xs">{icon}</span>}
      <span>{folder.name}</span>
      {unread > 0 && (
        <Badge
          variant={isActive ? "secondary" : "default"}
          className="min-w-[18px] h-4 text-[10px] px-1"
        >
          {unread > 99 ? "99+" : unread}
        </Badge>
      )}
      {isActive && (
        <motion.div
          layoutId="folder-active-indicator"
          className="absolute inset-0 rounded-full bg-primary -z-10"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
    </button>
  );
}
