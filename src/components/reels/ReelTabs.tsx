/**
 * @file src/components/reels/ReelTabs.tsx
 * @description Tabs для переключения "Для вас" / "Подписки".
 * Включает: glass pill контейнер, sliding indicator с glow, spring-physics transitions.
 */

import React from 'react';
import { motion } from 'framer-motion';

// ============================================================================
// TYPES
// ============================================================================

interface ReelTabsProps {
  activeTab: 'for_you' | 'following';
  onChange: (tab: 'for_you' | 'following') => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TABS = [
  { key: 'for_you' as const, label: 'Для вас' },
  { key: 'following' as const, label: 'Подписки' },
];

// ============================================================================
// COMPONENT
// ============================================================================

function ReelTabs({ activeTab, onChange }: ReelTabsProps) {
  const activeIndex = TABS.findIndex((t) => t.key === activeTab);

  return (
    <div className="relative flex items-center justify-center py-1.5">
      {/* Glow backdrop for indicator */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{
          left: `${activeIndex * 50}%`,
          opacity: [0.4, 0.7, 0.4],
        }}
        transition={{
          left: { type: 'spring', stiffness: 400, damping: 25 },
          opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
        }}
        style={{
          width: '50%',
          background: 'radial-gradient(ellipse 100% 100% at 50% 50%, rgba(255,255,255,0.12), transparent)',
          filter: 'blur(4px)',
        }}
      />

      {/* Sliding indicator */}
      <motion.div
        className="absolute top-1/2 -translate-y-1/2 h-[calc(100%-6px)] rounded-lg"
        animate={{ left: `${activeIndex * 50}%` }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        style={{
          width: 'calc(50% - 6px)',
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 4px 16px -4px rgba(0,0,0,0.3)',
        }}
      />

      {TABS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`
            relative z-10 w-1/2 px-4 py-1.5 text-xs font-semibold
            transition-colors duration-200
            ${activeTab === key ? 'text-white' : 'text-white/60 hover:text-white/80'}
          `}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export { ReelTabs };
