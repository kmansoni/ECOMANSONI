import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface NotificationBadgeProps {
  count: number;
  className?: string;
}

export function NotificationBadge({ count, className }: NotificationBadgeProps) {
  if (count <= 0) return null;

  return (
    <AnimatePresence>
      <motion.span
        key={count}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.5, opacity: 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
        className={cn(
          "absolute -top-1 -right-1",
          "bg-red-500 text-white",
          "text-[10px] font-bold leading-none",
          "rounded-full min-w-[18px] h-[18px]",
          "flex items-center justify-center px-1",
          "pointer-events-none z-10",
          className
        )}
      >
        {count > 99 ? "99+" : count}
      </motion.span>
    </AnimatePresence>
  );
}
