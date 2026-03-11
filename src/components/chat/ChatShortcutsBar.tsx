import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pin, Plus, Trash2 } from "lucide-react";
import { useChatShortcuts, type ChatShortcut } from "@/hooks/useChatShortcuts";

// ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢
// Props
// ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢

export interface ChatShortcutsBarProps {
  /** Called when user taps a shortcut */
  onChatSelect?: (chatId: string) => void;
  /** Render function for the "Add shortcut" dialog content.
   *  If omitted, the dialog shows a placeholder message. */
  addDialogContent?: (
    onAdd: (
      chatId: string,
      label: string,
      iconUrl?: string
    ) => Promise<void>
  ) => ReactNode;
  className?: string;
}

// ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢
// Long-press hook
// Activates after 500 ms; cancels on move or release.
// ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢

function useLongPress(onLongPress: () => void, ms = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(() => {
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onLongPress();
    }, ms);
  }, [onLongPress, ms]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { onPointerDown: start, onPointerUp: cancel, onPointerLeave: cancel };
}

// ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢
// Individual shortcut avatar
// ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢

interface ShortcutAvatarProps {
  shortcut: ChatShortcut;
  onTap: () => void;
  onRemove: () => void;
}

function ShortcutAvatar({ shortcut, onTap, onRemove }: ShortcutAvatarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const longPress = useLongPress(() => setMenuOpen(true));

  const initials = shortcut.label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        {/* Wrapper: clicking navigates; long-press opens menu */}
        <button
          className="flex flex-col items-center gap-1 w-16 flex-shrink-0 touch-none select-none focus:outline-none"
          onClick={() => {
            if (!menuOpen) onTap();
          }}
          {...longPress}
        >
          {/* Avatar circle (40px) */}
          <div className="relative w-10 h-10 rounded-full overflow-hidden bg-white/10 ring-2 ring-white/10 flex items-center justify-center">
            {shortcut.icon_url ? (
              <img
                src={shortcut.icon_url}
                alt={shortcut.label}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="text-sm font-semibold text-white/80">
                {initials || "?"}
              </span>
            )}
            {/* Pin indicator */}
            <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-blue-500 flex items-center justify-center">
              <Pin className="w-2 h-2 text-white" />
            </div>
          </div>

          {/* Label */}
          <span className="text-[10px] text-white/60 text-center leading-tight w-full truncate px-0.5">
            {shortcut.label}
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="center"
        className="bg-[#1a2332] border-white/10 text-white"
      >
        <DropdownMenuItem
          className="text-red-400 focus:text-red-300 cursor-pointer"
          onClick={() => {
            setMenuOpen(false);
            onRemove();
          }}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          ÃÃÃÂ´ÃÃÂ°ÃÃÂ»ÃÃÂ¸ÃÃ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢
// Main bar component
// ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢ÃÂ¢

export function ChatShortcutsBar({
  onChatSelect,
  addDialogContent,
  className = "",
}: ChatShortcutsBarProps) {
  const { getShortcuts, removeShortcut, addShortcut } = useChatShortcuts();
  const [shortcuts, setShortcuts] = useState<ChatShortcut[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  const refresh = useCallback(async () => {
    const data = await getShortcuts();
    setShortcuts(data);
  }, [getShortcuts]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRemove = useCallback(
    async (chatId: string) => {
      await removeShortcut(chatId);
      setShortcuts((prev) => prev.filter((s) => s.chat_id !== chatId));
    },
    [removeShortcut]
  );

  const handleAdd = useCallback(
    async (chatId: string, label: string, iconUrl?: string) => {
      // Default to 'dm' type; callers can pass the right type via addDialogContent
      await addShortcut(chatId, "dm", label, iconUrl);
      setAddOpen(false);
      await refresh();
    },
    [addShortcut, refresh]
  );

  // Bar is hidden when no shortcuts and no ability to add
  // (no-op if you always want to show the + button)

  return (
    <>
      <div
        className={`flex items-center gap-0 bg-transparent ${className}`}
        style={{ minHeight: 72 }}
      >
        <div className="flex-1 overflow-x-auto scrollbar-none">
          <div className="flex items-end gap-2 px-3 py-2 w-max min-w-full">
            {shortcuts.map((sc) => (
              <ShortcutAvatar
                key={sc.id}
                shortcut={sc}
                onTap={() => onChatSelect?.(sc.chat_id)}
                onRemove={() => handleRemove(sc.chat_id)}
              />
            ))}

            {/* Add button */}
            <button
              className="flex flex-col items-center gap-1 w-16 flex-shrink-0 focus:outline-none"
              onClick={() => setAddOpen(true)}
            >
              <div className="w-10 h-10 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors">
                <Plus className="w-4 h-4 text-white/40" />
              </div>
              <span className="text-[10px] text-white/30">ÃÃÃÂ¾ÃÃÂ±ÃÃÂ°ÃÃÂ²ÃÃÂ¸ÃÃ</span>
            </button>
          </div>
        </div>
      </div>

      {/* Add-shortcut dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-[#1a2332] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Pin className="w-4 h-4 text-blue-400" />
              ÃÃÃÂ¾ÃÃÂ±ÃÃÂ°ÃÃÂ²ÃÃÂ¸ÃÃ ÃÃÃÂ°ÃÃ ÃÃÂ°Ã
            </DialogTitle>
          </DialogHeader>

          {addDialogContent ? (
            addDialogContent(handleAdd)
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-white/40">
              <Pin className="w-8 h-8 opacity-30" />
              <p className="text-sm text-center">
                ÃÃÃÃÂµÃÃÂ´ÃÃÂ°ÃÃÂ¹ÃÃÂµ ÃÃÂ² `addDialogContent` ÃÃÃÂ¸ÃÃÃÃÂµÃÃÂ¼Ã ÃÃÂ²ÃÃÂ±ÃÃÂ¾ÃÃÃÂ° ÃÃÃÂ°ÃÃÃÂ°
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ChatShortcutsBar;
