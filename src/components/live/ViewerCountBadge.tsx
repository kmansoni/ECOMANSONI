import React from 'react';
import { Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ViewerCountBadgeProps {
  count: number;
  className?: string;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * Eye icon + viewer count with animated number transition.
 */
export const ViewerCountBadge = React.memo(function ViewerCountBadge({
  count,
  className,
}: ViewerCountBadgeProps) {
  const formatted = formatCount(count);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white backdrop-blur-sm',
        className,
      )}
      aria-label={`${count} viewers`}
    >
      <Eye className="h-3 w-3 shrink-0" aria-hidden="true" />
      <AnimatePresence mode="wait">
        <motion.span
          key={formatted}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2 }}
          className="tabular-nums"
        >
          {formatted}
        </motion.span>
      </AnimatePresence>
    </span>
  );
});
