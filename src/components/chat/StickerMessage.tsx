import { useState, useRef } from "react";

interface StickerMessageProps {
  fileUrl: string;
  fileType?: string;
  isAnimated?: boolean;
  onReply?: () => void;
  onForward?: () => void;
  onDelete?: () => void;
}

export function StickerMessage({
  fileUrl,
  fileType = "webp",
  isAnimated = false,
  onReply,
  onForward,
  onDelete,
}: StickerMessageProps) {
  const [showMenu, setShowMenu] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const size = isAnimated ? 200 : 150;

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      setShowMenu(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowMenu(true);
  };

  return (
    <div className="relative inline-block select-none">
      <img
        src={fileUrl}
        alt="стикер"
        width={size}
        height={size}
        className="object-contain"
        style={{ width: size, height: size }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
        onContextMenu={handleContextMenu}
        draggable={false}
      />

      {showMenu && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />
          {/* Context menu */}
          <div className="absolute bottom-full left-0 mb-2 z-50 bg-[#1c1c1e] border border-white/10 rounded-2xl shadow-xl overflow-hidden min-w-[160px]">
            {onReply && (
              <button
                className="w-full text-left px-4 py-3 text-white text-sm hover:bg-white/10 transition-colors"
                onClick={() => { onReply(); setShowMenu(false); }}
              >
                Ответить
              </button>
            )}
            {onForward && (
              <button
                className="w-full text-left px-4 py-3 text-white text-sm hover:bg-white/10 transition-colors"
                onClick={() => { onForward(); setShowMenu(false); }}
              >
                Переслать
              </button>
            )}
            {onDelete && (
              <button
                className="w-full text-left px-4 py-3 text-red-400 text-sm hover:bg-white/10 transition-colors"
                onClick={() => { onDelete(); setShowMenu(false); }}
              >
                Удалить
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
