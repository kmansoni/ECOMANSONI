/**
 * HDRoadModeToggle — UI-переключатель HD-режима 3D-инфраструктуры.
 *
 * Кнопка в углу карты: переключает HD overlay (полосы, знаки, камеры в 3D).
 * Состояние хранится в localStorage для повторного открытия.
 */

import { useEffect, useState } from 'react';
import { Box } from 'lucide-react';

const STORAGE_KEY = 'mansoni:hd-road-3d';

interface HDRoadModeToggleProps {
  onChange: (enabled: boolean) => void;
  className?: string;
}

export function HDRoadModeToggle({ onChange, className = '' }: HDRoadModeToggleProps) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    onChange(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // ignore
    }
  }, [enabled, onChange]);

  return (
    <button
      type="button"
      aria-label="Переключить HD 3D-режим"
      aria-pressed={enabled}
      onClick={() => setEnabled((v) => !v)}
      className={
        'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium shadow-md transition-colors ' +
        (enabled
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'bg-white/90 text-slate-700 hover:bg-white dark:bg-slate-800/90 dark:text-slate-100') +
        ' ' +
        className
      }
    >
      <Box className="h-4 w-4" />
      HD 3D
    </button>
  );
}

export function isHDRoadEnabledFromStorage(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
