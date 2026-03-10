/**
 * PreviewControls.tsx — Контролы preview (fit/fill/100%, safe zones, grid).
 */

import React, { useCallback } from 'react';
import { Maximize, Minimize, Grid3X3, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useUIStore, type PreviewMode } from '../../stores/ui-store';

const PREVIEW_MODES: Array<{ value: PreviewMode; label: string }> = [
  { value: 'fit', label: 'Вместить' },
  { value: 'fill', label: 'Заполнить' },
  { value: '100%', label: '100%' },
];

export const PreviewControls = React.memo(function PreviewControls() {
  const previewMode = useUIStore((s) => s.previewMode);
  const setPreviewMode = useUIStore((s) => s.setPreviewMode);
  const showSafeZones = useUIStore((s) => s.showSafeZones);
  const toggleSafeZones = useUIStore((s) => s.toggleSafeZones);
  const showGrid = useUIStore((s) => s.showGrid);
  const toggleGrid = useUIStore((s) => s.toggleGrid);

  const handleModeChange = useCallback(
    (mode: PreviewMode) => {
      setPreviewMode(mode);
    },
    [setPreviewMode],
  );

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 bg-[#111827] border-t border-slate-800"
      role="toolbar"
      aria-label="Управление предпросмотром"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-slate-400 hover:text-white gap-1"
          >
            <Maximize className="h-3 w-3" />
            {PREVIEW_MODES.find((m) => m.value === previewMode)?.label ?? previewMode}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-[#1f2937] border-slate-700 min-w-[120px]">
          {PREVIEW_MODES.map((mode) => (
            <DropdownMenuItem
              key={mode.value}
              className={cn(
                'text-xs cursor-pointer',
                previewMode === mode.value && 'bg-indigo-600/20 text-indigo-300',
              )}
              onClick={() => handleModeChange(mode.value)}
            >
              {mode.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-6 w-6',
              showSafeZones ? 'text-yellow-400' : 'text-slate-500 hover:text-white',
            )}
            onClick={toggleSafeZones}
            aria-label={showSafeZones ? 'Скрыть безопасные зоны' : 'Показать безопасные зоны'}
          >
            <Shield className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Безопасные зоны</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-6 w-6',
              showGrid ? 'text-blue-400' : 'text-slate-500 hover:text-white',
            )}
            onClick={toggleGrid}
            aria-label={showGrid ? 'Скрыть сетку' : 'Показать сетку'}
          >
            <Grid3X3 className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Сетка</TooltipContent>
      </Tooltip>
    </div>
  );
});
