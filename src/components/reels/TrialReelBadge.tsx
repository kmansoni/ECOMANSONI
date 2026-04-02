import { motion } from 'framer-motion';
import { FlaskConical } from 'lucide-react';

interface TrialReelBadgeProps {
  audiencePercent: number;
  isAuthor: boolean;
}

export function TrialReelBadge({ audiencePercent, isAuthor }: TrialReelBadgeProps) {
  if (!isAuthor) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/90 dark:bg-amber-600/90 backdrop-blur-sm"
    >
      <FlaskConical className="w-3 h-3 text-white" />
      <span className="text-xs font-semibold text-white">
        Пробный · {audiencePercent}%
      </span>
    </motion.div>
  );
}
