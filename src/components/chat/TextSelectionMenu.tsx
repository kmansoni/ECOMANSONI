import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Reply, Copy, Forward, Languages, Search } from "lucide-react";

interface TextSelectionMenuProps {
  onReplyWithQuote: (quotedText: string) => void;
  onCopy: (text: string) => void;
  onForward?: (text: string) => void;
  onTranslate?: (text: string) => void;
  onSearch?: (text: string) => void;
}

interface MenuPosition {
  top: number;
  left: number;
}

export function TextSelectionMenu({ onReplyWithQuote, onCopy, onForward, onTranslate, onSearch }: TextSelectionMenuProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ top: 0, left: 0 });
  const [selectedText, setSelectedText] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const MENU_HEIGHT = 40;

  const hide = useCallback(() => {
    setVisible(false);
    setSelectedText("");
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setVisible(false);
        setSelectedText("");
        return;
      }

      // Check that selection is inside a .message-bubble element
      const anchorNode = selection.anchorNode;
      if (!anchorNode) { hide(); return; }

      let el: Node | null = anchorNode instanceof Element ? anchorNode : anchorNode.parentElement;
      let insideBubble = false;
      while (el) {
        if (el instanceof Element && (el.classList.contains("message-bubble") || el.classList.contains("chat-bubble"))) {
          insideBubble = true;
          break;
        }
        el = el.parentElement;
      }

      if (!insideBubble) { hide(); return; }

      const text = selection.toString().trim();
      if (!text) { hide(); return; }

      // Get selection bounding rect
      const range = selection.getRangeAt(0);
      const rects = range.getClientRects();
      if (!rects.length) { hide(); return; }

      // Use first rect for positioning
      const firstRect = rects[0];
      const menuWidth = 220; // approximate for 5 buttons
      const centerX = firstRect.left + firstRect.width / 2;
      const topY = firstRect.top + window.scrollY;

      setPosition({
        top: topY - MENU_HEIGHT - 8,
        left: Math.max(8, Math.min(centerX - menuWidth / 2, window.innerWidth - menuWidth - 8)),
      });
      setSelectedText(text);
      setVisible(true);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [hide]);

  // Hide on outside click
  useEffect(() => {
    if (!visible) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hide();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [visible, hide]);

  const btnClass = "w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors";

  const handleAction = (fn: () => void) => {
    fn();
    window.getSelection()?.removeAllRanges();
    hide();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.12 }}
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            zIndex: 9999,
          }}
          className="flex items-center gap-0.5 px-1 py-0.5 bg-[#1e2c3a] rounded-xl shadow-lg border border-white/10"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleAction(() => onReplyWithQuote(selectedText))}
            className={btnClass}
            title="Ответить с цитатой"
          >
            <Reply className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleAction(() => { navigator.clipboard.writeText(selectedText); onCopy(selectedText); })}
            className={btnClass}
            title="Копировать"
          >
            <Copy className="w-4 h-4" />
          </button>
          {onForward && (
            <button
              onClick={() => handleAction(() => onForward(selectedText))}
              className={btnClass}
              title="Переслать"
            >
              <Forward className="w-4 h-4" />
            </button>
          )}
          {onTranslate && (
            <button
              onClick={() => handleAction(() => onTranslate(selectedText))}
              className={btnClass}
              title="Перевести"
            >
              <Languages className="w-4 h-4" />
            </button>
          )}
          {onSearch && (
            <button
              onClick={() => handleAction(() => onSearch(selectedText))}
              className={btnClass}
              title="Найти"
            >
              <Search className="w-4 h-4" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
