import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Music } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MusicTrack } from '@/hooks/useMusic';

interface MusicBadgeProps {
  track: MusicTrack;
  reelId?: string;
}

export function MusicBadge({ track, reelId }: MusicBadgeProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const text = `${track.title} · ${track.artist}`;

  const handleClick = () => {
    if (reelId) {
      navigate('/explore');
    }
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/10 max-w-[200px]"
    >
      {/* Animated note icon */}
      <motion.div
        animate={{ rotate: [0, 10, -10, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        className="flex-shrink-0"
      >
        <Music className="w-3.5 h-3.5 text-white" />
      </motion.div>

      {/* Scrolling text */}
      <div ref={containerRef} className="overflow-hidden flex-1">
        <motion.p
          animate={{ x: ['0%', '-100%', '0%'] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear', repeatDelay: 1 }}
          className="text-white text-xs font-medium whitespace-nowrap"
          style={{ width: 'max-content' }}
        >
          {text}&nbsp;&nbsp;&nbsp;&nbsp;{text}
        </motion.p>
      </div>
    </button>
  );
}
