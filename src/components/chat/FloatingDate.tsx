import { motion, AnimatePresence } from "framer-motion";
import { format, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";

interface FloatingDateProps {
  /** ISO date string or Date object of the currently visible group */
  date: Date | string | null;
  /** Called when user clicks the floating date pill (open JumpToDatePicker) */
  onClick?: () => void;
}

/**
 * Telegram-style floating date pill that sticks to the top of the
 * scroll container and shows the date of the currently visible message group.
 *
 * Security note: `date` is derived from trusted server timestamps — no
 * user-supplied HTML is rendered, only formatted locale strings.
 */
export function FloatingDate({ date, onClick }: FloatingDateProps) {
  const label = date ? formatDateLabel(typeof date === "string" ? new Date(date) : date) : null;

  return (
    <AnimatePresence>
      {label && (
        <motion.div
          key={label}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="absolute top-3 left-1/2 z-30 -translate-x-1/2 pointer-events-auto"
        >
          <button
            type="button"
            onClick={onClick}
            className="
              px-3 py-1 rounded-full
              bg-black/40 backdrop-blur-md
              border border-white/10
              text-white/80 text-xs font-medium
              select-none whitespace-nowrap
              hover:bg-black/55 active:bg-black/65
              transition-colors duration-150
            "
          >
            {label}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function formatDateLabel(date: Date): string {
  if (isToday(date)) return "Сегодня";
  if (isYesterday(date)) return "Вчера";
  return format(date, "d MMMM yyyy", { locale: ru });
}

/**
 * Returns a compact date separator label used inside the message list.
 * Same logic as FloatingDate to keep visual parity.
 */
export function DateSeparator({
  date,
  id,
}: {
  date: Date | string;
  /** data-date-id attribute for IntersectionObserver lookups */
  id: string;
}) {
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    <div
      data-date-id={id}
      className="flex items-center justify-center py-3 select-none"
      aria-hidden="true"
    >
      <span
        className="
          px-3 py-1 rounded-full
          bg-black/35 backdrop-blur-sm
          border border-white/8
          text-white/55 text-xs font-medium
        "
      >
        {formatDateLabel(d)}
      </span>
    </div>
  );
}
