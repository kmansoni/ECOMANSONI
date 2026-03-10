/**
 * ColorPicker.tsx — Выбор цвета с hex input, пресетами и opacity.
 */

import React, { useCallback, useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const PRESET_COLORS = [
  '#FFFFFF', '#000000', '#EF4444', '#F97316',
  '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6',
  '#EC4899', '#6B7280', '#14B8A6', '#F59E0B',
  '#A855F7', '#06B6D4', '#10B981', '#F43F5E',
];

export interface ColorPickerProps {
  label?: string;
  value: string;
  opacity?: number;
  showOpacity?: boolean;
  onChange: (color: string) => void;
  onOpacityChange?: (opacity: number) => void;
  className?: string;
}

export const ColorPicker = React.memo(function ColorPicker({
  label,
  value,
  opacity = 1,
  showOpacity = false,
  onChange,
  onOpacityChange,
  className,
}: ColorPickerProps) {
  const [hexInput, setHexInput] = useState(value);

  useEffect(() => {
    setHexInput(value);
  }, [value]);

  const handleHexBlur = useCallback(() => {
    const cleaned = hexInput.startsWith('#') ? hexInput : `#${hexInput}`;
    if (/^#[0-9A-Fa-f]{3,8}$/.test(cleaned)) {
      onChange(cleaned);
    } else {
      setHexInput(value);
    }
  }, [hexInput, onChange, value]);

  const handleHexKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        (e.target as HTMLInputElement).blur();
      }
    },
    [],
  );

  const handleNativeColor = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const handlePresetClick = useCallback(
    (color: string) => {
      onChange(color);
    },
    [onChange],
  );

  const handleOpacityChange = useCallback(
    (values: number[]) => {
      onOpacityChange?.(values[0] / 100);
    },
    [onOpacityChange],
  );

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && <Label className="text-xs text-slate-400">{label}</Label>}

      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="h-8 w-8 rounded-md border border-slate-700 cursor-pointer flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ backgroundColor: value, opacity }}
              aria-label={`Текущий цвет: ${value}`}
            />
          </PopoverTrigger>
          <PopoverContent
            className="w-64 bg-[#111827] border-slate-700 p-3"
            align="start"
          >
            <div className="flex flex-col gap-3">
              {/* Native color picker */}
              <div className="relative h-32 w-full rounded-md overflow-hidden">
                <input
                  type="color"
                  value={value}
                  onChange={handleNativeColor}
                  className="absolute inset-0 w-full h-full cursor-pointer border-0 p-0"
                  aria-label="Выбор цвета"
                />
              </div>

              {/* Preset colors */}
              <div className="grid grid-cols-8 gap-1">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handlePresetClick(color)}
                    className={cn(
                      'h-6 w-6 rounded-sm border cursor-pointer transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-indigo-500',
                      color === value ? 'border-white ring-1 ring-white' : 'border-slate-600',
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={`Цвет ${color}`}
                  />
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Input
          type="text"
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onBlur={handleHexBlur}
          onKeyDown={handleHexKeyDown}
          className="h-8 bg-[#1f2937] border-slate-700 text-xs font-mono uppercase"
          placeholder="#000000"
          aria-label="HEX значение цвета"
        />
      </div>

      {showOpacity && onOpacityChange && (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-slate-500 w-16">Opacity</Label>
          <Slider
            value={[opacity * 100]}
            min={0}
            max={100}
            step={1}
            onValueChange={handleOpacityChange}
            className="flex-1"
            aria-label="Прозрачность"
          />
          <span className="text-xs text-slate-400 font-mono w-10 text-right">
            {Math.round(opacity * 100)}%
          </span>
        </div>
      )}
    </div>
  );
});
