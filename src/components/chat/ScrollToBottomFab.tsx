import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface ScrollToBottomFabProps {
  /** Whether to show the FAB — caller should set this when scrolled > 300px from bottom */
  visible: boolean;
  /** Number of unread messages to show in the badge */
  unreadCount?: number;
  onClick: () => void;
}

/**
 * Telegram-style scroll-to-bottom floating action button.
 *
 * Renders a ChevronDown button in the bottom-right corner of the scroll area.
 * When `unreadCount > 0`, a red pill badge is displayed above the button.
 *
 * Framer-motion variants ensure a silky scale+opacity entrance/exit with
 * no layout thrash — the component is absolutely positioned so it never
 * affects document flow.
 */
export function ScrollToBottomFab({ visible, unreadCount = 0, onClick }: ScrollToBottomFabProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="scroll-fab"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute bottom-4 right-4 z-30 flex flex-col items-center gap-1 pointer-events-auto"
        >
          {/* Unread badge */}
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                key="badge"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="
                  min-w-[20px] h-5 px-1.5 rounded-full
                  bg-red-500 text-white text-[11px] font-bold
                  flex items-center justify-center
                  shadow-lg shadow-red-900/40
                  tabular-nums
                "
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </motion.span>
            )}
          </AnimatePresence>

          {/* FAB button */}
          <button
            type="button"
            onClick={onClick}
            aria-label="Прокрутить вниз"
            className="
              w-10 h-10 rounded-full
              bg-black/50 backdrop-blur-md
              border border-white/15
              flex items-center justify-center
              text-white/80
              hover:bg-black/65 active:bg-black/75
              shadow-lg shadow-black/30
              transition-colors duration-150
            "
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
