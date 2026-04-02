/**
 * DatingFilters — фильтры знакомств: возраст, пол, расстояние.
 */

import { useState, useCallback } from 'react';
import { Sliders, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DatingFiltersProps {
  filters: {
    minAge: number;
    maxAge: number;
    maxDistance: number;
    gender: string | null;
  };
  onUpdate: (filters: Partial<{
    minAge: number;
    maxAge: number;
    maxDistance: number;
    gender: string | null;
  }>) => void;
}

const GENDER_OPTIONS = [
  { value: null, label: 'Все' },
  { value: 'male', label: 'Мужчины' },
  { value: 'female', label: 'Женщины' },
  { value: 'non-binary', label: 'Небинарные' },
];

export function DatingFilters({ filters, onUpdate }: DatingFiltersProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm px-4 py-2 rounded-xl transition-colors min-h-[44px]"
        aria-label="Настройки фильтров"
      >
        <Sliders className="w-4 h-4" />
        Фильтры
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full bg-zinc-900 rounded-t-2xl p-5 space-y-5"
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="filters-title"
            >
              <div className="flex items-center justify-between">
                <h3 id="filters-title" className="text-white font-bold text-lg">Фильтры</h3>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-full hover:bg-zinc-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Закрыть фильтры"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              {/* Возраст */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-400 text-sm">Возраст</label>
                  <span className="text-white text-sm font-medium">
                    {filters.minAge}–{filters.maxAge}
                  </span>
                </div>
                <div className="flex gap-3 items-center">
                  <span className="text-zinc-500 text-xs w-6">от</span>
                  <input
                    type="range"
                    min={18}
                    max={99}
                    value={filters.minAge}
                    onChange={e => {
                      const val = Number(e.target.value);
                      onUpdate({ minAge: Math.min(val, filters.maxAge - 1) });
                    }}
                    className="flex-1 accent-pink-500 h-2"
                    aria-label="Минимальный возраст"
                  />
                  <span className="text-zinc-500 text-xs w-6">до</span>
                  <input
                    type="range"
                    min={18}
                    max={100}
                    value={filters.maxAge}
                    onChange={e => {
                      const val = Number(e.target.value);
                      onUpdate({ maxAge: Math.max(val, filters.minAge + 1) });
                    }}
                    className="flex-1 accent-pink-500 h-2"
                    aria-label="Максимальный возраст"
                  />
                </div>
              </div>

              {/* Расстояние */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-400 text-sm">Расстояние</label>
                  <span className="text-white text-sm font-medium">
                    {filters.maxDistance} км
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={200}
                  value={filters.maxDistance}
                  onChange={e => onUpdate({ maxDistance: Number(e.target.value) })}
                  className="w-full accent-pink-500 h-2"
                  aria-label="Максимальное расстояние"
                />
                <div className="flex justify-between text-zinc-600 text-xs">
                  <span>1 км</span>
                  <span>200 км</span>
                </div>
              </div>

              {/* Пол */}
              <div className="space-y-2">
                <label className="text-zinc-400 text-sm">Показывать</label>
                <div className="flex gap-2 flex-wrap">
                  {GENDER_OPTIONS.map(option => {
                    const isActive = filters.gender === option.value;
                    return (
                      <button
                        key={option.label}
                        onClick={() => onUpdate({ gender: option.value })}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
                          isActive
                            ? 'bg-pink-600 text-white'
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => setOpen(false)}
                className="w-full bg-pink-600 hover:bg-pink-700 text-white font-medium py-3 rounded-xl transition-colors min-h-[44px]"
              >
                Применить
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
