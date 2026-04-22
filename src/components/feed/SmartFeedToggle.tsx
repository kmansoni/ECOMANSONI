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
    <div className="flex items-center gap-1 rounded-full border border-white/25 bg-white/14 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.16)] backdrop-blur-xl">
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
                className="absolute inset-0 rounded-full border border-white/25 bg-white/22"
                initial={false}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Icon className={`relative z-10 h-3.5 w-3.5 transition-colors ${isActive ? 'text-white' : 'text-white/65'}`} />
            <span className={`relative z-10 transition-colors ${isActive ? 'text-white' : 'text-white/65'}`}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
