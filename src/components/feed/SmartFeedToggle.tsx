import { motion } from 'framer-motion';
import { Sparkles, Users, Clock } from 'lucide-react';
import type { FeedMode } from '@/hooks/useSmartFeed';

interface SmartFeedToggleProps {
  mode: FeedMode;
  onChange: (mode: FeedMode) => void;
}

const TABS: { id: FeedMode; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'smart', label: 'Для вас', Icon: Sparkles },
  { id: 'following', label: 'Подписки', Icon: Users },
  { id: 'chronological', label: 'Новое', Icon: Clock },
];

export function SmartFeedToggle({ mode, onChange }: SmartFeedToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-zinc-900/80 backdrop-blur rounded-full p-1 border border-white/10">
      {TABS.map(({ id, label, Icon }) => {
        const isActive = mode === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-200 focus:outline-none"
          >
            {isActive && (
              <motion.div
                layoutId="feed-toggle-pill"
                className="absolute inset-0 bg-white/10 rounded-full"
                initial={false}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Icon className={`w-3.5 h-3.5 relative z-10 transition-colors ${isActive ? 'text-white' : 'text-zinc-500'}`} />
            <span className={`relative z-10 transition-colors ${isActive ? 'text-white' : 'text-zinc-500'}`}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
