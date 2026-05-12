/**
 * @file src/components/reels/ReelStoriesBar.tsx
 * @description Stories bar с glass avatars.
 */

import React, { memo, useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle, ChevronLeft, ChevronRight } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface StoryItem {
  id: string;
  avatarUrl: string | null;
  username: string;
  isSeen: boolean;
  isOwn?: boolean;
}

interface ReelStoriesBarProps {
  stories?: StoryItem[];
  onStoryPress: (storyId: string) => void;
  onCreateStory: () => void;
}

// ============================================================================
// GLASS STORY AVATAR
// ============================================================================

function GlassStoryAvatar({
  story,
  size = 52,
  isActive,
  onClick,
}: {
  story: StoryItem;
  size?: number;
  isActive: boolean;
  onClick: (id: string) => void;
}) {
  const getRingStyle = () => {
    if (story.isSeen) {
      return {
        border: '2px solid rgba(255,255,255,0.2)',
        opacity: 0.7,
      };
    }
    if (story.isOwn) {
      return {
        border: 'none',
        background: 'linear-gradient(135deg, #00b4d8, #00c896)',
        boxShadow: '0 0 16px -4px rgba(34,197,94,0.5)',
      };
    }
    return {
      border: 'none',
      background: 'linear-gradient(135deg, #00b4d8, #00c896)',
      boxShadow: '0 0 16px -4px rgba(0,180,216,0.5)',
    };
  };

  const ringStyle = getRingStyle();

  return (
    <motion.button
      type="button"
      onClick={() => onClick(story.id)}
      whileTap={{ scale: 0.85 }}
      className="relative flex flex-col items-center gap-1.5 flex-shrink-0"
    >
      {/* Ring */}
      <div
        className="relative rounded-full p-[3px]"
        style={ringStyle}
      >
        {/* Avatar */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          className="relative rounded-full overflow-hidden backdrop-blur-xl"
          style={{
            width: size,
            height: size,
            background: story.isSeen
              ? 'linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))'
              : 'linear-gradient(145deg, rgba(255,255,255,0.1), rgba(255,255,255,0.03))',
          }}
        >
          {/* Inner highlight */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.08), transparent)' }}
          />
          {story.avatarUrl ? (
            <img
              src={story.avatarUrl}
              alt={story.username}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: 'linear-gradient(145deg, rgba(0,180,216,0.15), rgba(0,200,150,0.08))' }}
            >
              <span className="text-white/80 text-lg font-bold">
                {story.username.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </motion.div>

        {/* Add button for own story */}
        {story.isOwn && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full"
            style={{
              background: 'linear-gradient(135deg, #34d399, #10b981)',
              boxShadow: '0 4px 12px -4px rgba(34,197,94,0.5)',
              border: '2px solid #050508',
            }}
          >
            <PlusCircle size={12} className="text-white" strokeWidth={3} />
          </motion.div>
        )}
      </div>

      {/* Username */}
      {!story.isOwn && (
        <span
          className="text-[10px] font-medium truncate max-w-[48px] text-center leading-tight"
          style={{
            color: story.isSeen ? 'rgba(255,255,255,0.5)' : 'white',
            textShadow: '0 2px 4px rgba(0,0,0,0.5)',
          }}
        >
          {story.username}
        </span>
      )}
    </motion.button>
  );
}

// ============================================================================
// CREATE STORY BUTTON
// ============================================================================

function CreateStoryButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="relative flex flex-col items-center gap-1.5 flex-shrink-0"
    >
      <div
        className="relative rounded-full"
        style={{
          background: 'linear-gradient(145deg, rgba(0,180,216,0.2), rgba(0,200,150,0.1))',
          border: '2px dashed rgba(0,180,216,0.4)',
          boxShadow: '0 0 20px -5px rgba(0,180,216,0.3)',
          width: 56,
          height: 56,
        }}
      >
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.1), transparent)' }}
        />
        <PlusCircle
          size={24}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-400/80"
          strokeWidth={2}
        />
      </div>
      <span className="text-[10px] text-cyan-400/70 font-medium">Ваша история</span>
    </motion.button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function ReelStoriesBar({ stories, onStoryPress, onCreateStory }: ReelStoriesBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 5);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
  }, []);

  const scroll = useCallback((direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.6;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
    setTimeout(checkScroll, 300);
  }, [checkScroll]);

  const defaultStories: StoryItem[] = stories ?? [];

  return (
    <div className="relative flex items-center px-1 py-2">
      {/* Left arrow */}
      <AnimatePresence>
        {canScrollLeft && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => scroll('left')}
            whileTap={{ scale: 0.9 }}
            className="absolute left-0 z-20 w-8 h-12 flex items-center justify-center"
            style={{
              background: 'linear-gradient(to right, rgba(0,0,0,0.8), transparent)',
            }}
            aria-label="Прокрутить влево"
          >
            <ChevronLeft size={18} className="text-white/70" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Stories container */}
      <div
        ref={scrollRef}
        className="flex items-center gap-4 overflow-x-auto scrollbar-hide overscroll-contain px-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onScroll={checkScroll}
      >
        <CreateStoryButton onClick={onCreateStory} />
        {defaultStories.slice(1).map((story) => (
          <GlassStoryAvatar
            key={story.id}
            story={story}
            size={52}
            isActive={!story.isSeen}
            onClick={onStoryPress}
          />
        ))}
      </div>

      {/* Right arrow */}
      <AnimatePresence>
        {canScrollRight && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => scroll('right')}
            whileTap={{ scale: 0.9 }}
            className="absolute right-0 z-20 w-8 h-12 flex items-center justify-center"
            style={{
              background: 'linear-gradient(to left, rgba(0,0,0,0.8), transparent)',
            }}
            aria-label="Прокрутить вправо"
          >
            <ChevronRight size={18} className="text-white/70" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Fade edges */}
      <div
        className="absolute inset-y-0 left-0 w-8 pointer-events-none"
        style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.6), transparent)' }}
      />
      <div
        className="absolute inset-y-0 right-0 w-8 pointer-events-none"
        style={{ background: 'linear-gradient(to left, rgba(0,0,0,0.6), transparent)' }}
      />
    </div>
  );
}

export { ReelStoriesBar };
