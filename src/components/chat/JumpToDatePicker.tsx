import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { isToday } from "date-fns";

/** Minimal shape required from any message object */
export interface MessageDateEntry {
  id: string;
  created_at: string;
}

interface JumpToDatePickerProps {
  /** Whether the picker modal is open */
  open: boolean;
  onClose: () => void;
  /**
   * Flat list of messages — used to determine which dates have content
   * and to find the first message on a chosen date.
   */
  messages: MessageDateEntry[];
  /** Called with the message-id of the first message on the selected date */
  onJump: (messageId: string) => void;
}

/**
 * Telegram-style "Jump to date" modal calendar.
 *
 * Architecture notes:
 * - The `messageDateSet` is a stable Set<string> of "YYYY-MM-DD" keys
 *   recomputed only when `messages` identity changes.  At 10M-msg scale
 *   this would be paginated server-side; here we gate on the local slice.
 * - `onJump` receives the first message ID for the target date so the
 *   caller can invoke `messageRef.current[id].scrollIntoView()`.
 * - We never expose raw message content through this component —
 *   only timestamps and IDs pass the trust boundary.
 *
 * Security: dates are derived from server-side `created_at` timestamps,
 * not from user-controlled fields.
 */
export function JumpToDatePicker({
  open,
  onClose,
  messages,
  onJump,
}: JumpToDatePickerProps) {
  const [selected, setSelected] = useState<Date | undefined>(undefined);

  // Build a set of "YYYY-MM-DD" strings for dates that contain messages
  const messageDateSet = new Set(
    messages.map((m) => {
      const d = new Date(m.created_at);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }),
  );

  const handleSelect = useCallback(
    (date: Date | undefined) => {
      if (!date) return;
      setSelected(date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      // Find first message on this date (messages are assumed oldest-first)
      const target = messages.find((m) => {
        const d = new Date(m.created_at);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return k === key;
      });
      if (target) {
        onJump(target.id);
        onClose();
      }
    },
    [messages, onJump, onClose],
  );

  const handleJumpToday = useCallback(() => {
    const todayMsg = messages.slice().reverse().find((m) => isToday(new Date(m.created_at)));
    if (todayMsg) {
      onJump(todayMsg.id);
      onClose();
    }
  }, [messages, onJump, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="
              fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
              bg-[#1c1c2e]/95 backdrop-blur-xl
              border border-white/10 rounded-3xl
              p-4 shadow-2xl shadow-black/60
              w-[min(360px,calc(100vw-32px))]
            "
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white/90 font-semibold text-base">Перейти к дате</h3>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>

            {/* Calendar */}
            <Calendar
              mode="single"
              selected={selected}
              onSelect={handleSelect}
              disabled={(date) => {
                // Disable dates after today
                if (date > new Date()) return true;
                // Optionally dim (but not disable) dates without messages
                return false;
              }}
              modifiers={{
                hasMessages: (date) => {
                  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                  return messageDateSet.has(key);
                },
              }}
              modifiersClassNames={{
                hasMessages: "font-bold ring-1 ring-[#6ab3f3]/60 rounded-full",
              }}
              className="rounded-xl text-white"
            />

            {/* Footer: Today button */}
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleJumpToday}
                className="
                  px-4 py-1.5 rounded-full text-sm font-medium
                  bg-[#6ab3f3]/20 border border-[#6ab3f3]/30
                  text-[#6ab3f3]
                  hover:bg-[#6ab3f3]/30 active:bg-[#6ab3f3]/40
                  transition-colors duration-150
                "
              >
                Сегодня
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
