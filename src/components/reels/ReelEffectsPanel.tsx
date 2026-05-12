/**
 * @file src/components/reels/ReelEffectsPanel.tsx
 * @description Панель эффектов и фильтров для Reel (как Instagram).
 * Показывает пресеты фильтров, скорость, красоту.
 */

import React, { memo, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EyeOff } from 'lucide-react';
import { SPEED_PRESETS } from '@/hooks/useReelPlayback';
import { cn } from '@/lib/utils';
import type { EffectType, EffectPreset } from '@/types/reels/premium';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReelEffectsPanelProps {
  /** Текущие применённые эффекты */
  appliedEffects: Array<{ type: EffectType; name: string }>;
  /** Список доступных пресетов */
  presets: EffectPreset[];
  /** Текущая скорость воспроизведения */
  speed: number;
  /** Включён ли режим красоты */
  beautyEnabled: boolean;
  /** Callback при выборе пресета */
  onApplyPreset: (preset: EffectPreset) => void;
  /** Callback при смене скорости */
  onSpeedChange: (speed: number) => void;
  /** Callback при переключении красоты */
  onBeautyToggle: () => void;
  /** Оpen/closed */
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Speed selector sub-component
// ---------------------------------------------------------------------------

const SpeedSelector = memo<{
  speed: number;
  onSelect: (speed: number) => void;
}>(({ speed, onSelect }) => (
  <div className="space-y-1">
    <p className="text-white/50 text-[10px] font-medium uppercase tracking-wider mb-1">Скорость</p>
    <div className="grid grid-cols-4 gap-1">
      {SPEED_PRESETS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect(s)}
          className={cn(
            'py-1 rounded text-xs font-medium transition-all duration-150',
            Math.abs(speed - s) < 0.01
              ? 'bg-purple-500 text-white'
              : 'bg-white/5 text-white/60 hover:bg-white/10',
          )}
        >
          {s}×
        </button>
      ))}
    </div>
  </div>
));
SpeedSelector.displayName = 'SpeedSelector';

// ---------------------------------------------------------------------------
// Filter preset sub-component
// ---------------------------------------------------------------------------

const FilterGrid = memo<{
  presets: EffectPreset[];
  applied: string[];
  onSelect: (preset: EffectPreset) => void;
}>(({ presets, applied, onSelect }) => (
  <div className="space-y-1">
    <p className="text-white/50 text-[10px] font-medium uppercase tracking-wider mb-1">Фильтры</p>
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {presets.map((preset) => {
        const isActive = applied.includes(preset.name);
        return (
          <motion.button
            key={preset.name}
            type="button"
            onClick={() => onSelect(preset)}
            className={cn(
              'flex flex-col items-center gap-1 min-w-[56px]',
              'p-1.5 rounded-lg transition-all duration-150',
              isActive
                ? 'bg-purple-500/30 ring-1 ring-purple-400'
                : 'bg-white/5 hover:bg-white/10',
            )}
            whileTap={{ scale: 0.9 }}
          >
            {preset.thumbnail_url ? (
              <img
                src={preset.thumbnail_url}
                alt={preset.display_name}
                className="w-10 h-10 rounded-md object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-md bg-gradient-to-br from-purple-500/30 to-pink-500/30" />
            )}
            <span className={cn(
              'text-[9px] font-medium truncate max-w-[56px] text-center',
              isActive ? 'text-purple-300' : 'text-white/50',
            )}>
              {preset.display_name}
            </span>
          </motion.button>
        );
      })}
    </div>
  </div>
));
FilterGrid.displayName = 'FilterGrid';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const ReelEffectsPanel = memo<ReelEffectsPanelProps>(({
  appliedEffects,
  presets,
  speed,
  beautyEnabled,
  onApplyPreset,
  onSpeedChange,
  onBeautyToggle,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'filters' | 'speed' | 'beauty'>('filters');

  const handleBeautyToggle = useCallback(() => {
    onBeautyToggle();
  }, [onBeautyToggle]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 bg-black/50 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900/95 backdrop-blur-xl rounded-t-2xl p-4 pb-safe-bottom border-t border-white/10"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            {/* Drag handle */}
            <div className="w-12 h-1 bg-zinc-600 rounded-full mx-auto mb-3" />

            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-medium text-sm">Эффекты</span>
              <motion.button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"
                whileTap={{ scale: 0.85 }}
                aria-label="Закрыть"
              >
                <EyeOff size={14} className="text-white" />
              </motion.button>
            </div>

            {/* Tab indicators */}
            <div className="flex gap-1 mb-4">
              {[
                { key: 'filters' as const, label: 'Фильтры', icon: WandSparkles },
                { key: 'speed' as const, label: 'Скорость', icon: Gauge },
                { key: 'beauty' as const, label: 'Красота', icon: Sparkles },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg text-xs font-medium transition-all duration-150',
                    activeTab === key
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/5 text-white/50 hover:bg-white/10',
                  )}
                >
                  <Icon className="w-3 h-3 inline mr-1" />
                  {label}
                </button>
              ))}
            </div>

            {/* Content */}
            <AnimatePresence mode="wait">
              {activeTab === 'filters' && (
                <motion.div
                  key="filters"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <FilterGrid
                    presets={presets}
                    applied={appliedEffects.map((e) => e.name)}
                    onSelect={onApplyPreset}
                  />
                </motion.div>
              )}
              {activeTab === 'speed' && (
                <motion.div
                  key="speed"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <SpeedSelector speed={speed} onSelect={onSpeedChange} />
                </motion.div>
              )}
              {activeTab === 'beauty' && (
                <motion.div
                  key="beauty"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="space-y-3">
                    <p className="text-white/50 text-[10px] font-medium uppercase tracking-wider">Красота</p>
                    <button
                      type="button"
                      onClick={handleBeautyToggle}
                      className={cn(
                        'w-full py-3 rounded-xl font-medium transition-all duration-200',
                        beautyEnabled
                          ? 'bg-purple-500 text-white'
                          : 'bg-white/5 text-white/60 hover:bg-white/10',
                      )}
                    >
                      {beautyEnabled ? '✅ Красота включена' : 'Красота выключена'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

ReelEffectsPanel.displayName = 'ReelEffectsPanel';

export { ReelEffectsPanel };
export type { ReelEffectsPanelProps };