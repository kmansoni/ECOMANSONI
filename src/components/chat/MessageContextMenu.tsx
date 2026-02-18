import { useEffect, useRef } from "react";
import { Reply, Copy, Pin, Forward, Trash2, CheckSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MessageContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  messageId: string;
  messageContent: string;
  isOwn: boolean;
  position?: { top: number; left: number; width: number };
  onDelete?: (messageId: string) => void;
  onPin?: (messageId: string) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onReply?: (messageId: string) => void;
  onForward?: (messageId: string) => void;
}

const QUICK_REACTIONS = ["❤️", "🔥", "👍", "😂", "😮", "🎉"];

export function MessageContextMenu({
  isOpen,
  onClose,
  messageId,
  messageContent,
  isOwn,
  position,
  onDelete,
  onPin,
  onReaction,
  onReply,
  onForward,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleReaction = (emoji: string) => {
    onReaction?.(messageId, emoji);
    onClose();
  };

  const handleDelete = () => {
    onDelete?.(messageId);
    onClose();
  };

  const handlePin = () => {
    onPin?.(messageId);
    onClose();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageContent);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
    onClose();
  };

  const handleReply = () => {
    onReply?.(messageId);
    onClose();
  };

  const handleForward = () => {
    onForward?.(messageId);
    onClose();
  };

  // Prevent scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Calculate optimal position for the menu
  const getMenuStyle = (): React.CSSProperties => {
    if (!position) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      };
    }

    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    const menuHeight = 320; // Approximate menu height
    const reactionsHeight = 48;
    const messageHeight = 60; // Approximate message preview height
    const totalHeight = reactionsHeight + messageHeight + menuHeight + 24; // gaps
    
    // Calculate where to position the menu container
    let top = position.top;
    
    // If message is in lower half, position menu so message appears at bottom of visible area
    if (position.top > windowHeight / 2) {
      top = Math.max(16, position.top - totalHeight + messageHeight + 60);
    } else {
      // Message is in upper half, position below it
      top = Math.max(16, position.top - reactionsHeight - 8);
    }
    
    // Ensure menu doesn't go off screen
    top = Math.min(top, windowHeight - totalHeight - 16);
    top = Math.max(16, top);

    return {
      top,
      left: isOwn ? 'auto' : 16,
      right: isOwn ? 16 : 'auto',
    };
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[300]"
          onClick={onClose}
        >
          {/* Dark backdrop with blur */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Menu container */}
          <motion.div
            ref={menuRef}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 400 }}
            className="absolute flex flex-col gap-2 w-[calc(100%-32px)] max-w-[320px]"
            style={getMenuStyle()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Quick reactions bar */}
            <motion.div
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.03 }}
              className={`flex items-center gap-0.5 bg-[#1e2c3a] rounded-full px-1.5 py-1 shadow-xl w-fit ${isOwn ? 'self-end' : 'self-start'}`}
            >
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 active:scale-125 transition-all text-xl"
                >
                  {emoji}
                </button>
              ))}
            </motion.div>

            {/* Message preview - styled like actual message */}
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.02 }}
              className={`${isOwn ? "self-end" : "self-start"}`}
            >
              <div
                className={`max-w-[280px] rounded-2xl px-3 py-2 shadow-lg ${
                  isOwn
                    ? "bg-[#2b5278] text-white rounded-br-sm"
                    : "bg-[#182533] text-white rounded-bl-sm"
                }`}
              >
                <p className="text-[15px] leading-[1.4] whitespace-pre-wrap line-clamp-4">
                  {messageContent}
                </p>
              </div>
            </motion.div>

            {/* Action menu */}
            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.05 }}
              className="bg-[#1e2c3a] rounded-xl overflow-hidden shadow-xl"
            >
              <MenuItem icon={Reply} label="Ответить" onClick={handleReply} />
              <MenuItem icon={Copy} label="Скопировать" onClick={handleCopy} />
              <MenuItem icon={Pin} label="Закрепить" onClick={handlePin} />
              <MenuItem icon={Forward} label="Переслать" onClick={handleForward} />
              {isOwn && (
                <MenuItem icon={Trash2} label="Удалить" onClick={handleDelete} isDestructive />
              )}
              <MenuItem icon={CheckSquare} label="Выбрать" onClick={onClose} isLast />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface MenuItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  isDestructive?: boolean;
  isLast?: boolean;
}

function MenuItem({ icon: Icon, label, onClick, isDestructive, isLast }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/10 transition-colors ${
        !isLast ? "border-b border-white/5" : ""
      }`}
    >
      <Icon className={`w-5 h-5 ${isDestructive ? "text-red-400" : "text-white/70"}`} />
      <span className={`text-[15px] ${isDestructive ? "text-red-400" : "text-white"}`}>
        {label}
      </span>
    </button>
  );
}
