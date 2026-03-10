/**
 * SliderControl.tsx — Слайдер с label и числовым input.
 * Использует shadcn Slider + Input для точного управления значениями.
 */

import React, { useCallback, useState, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

export const SliderControl = React.memo(function SliderControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  disabled = false,
  className,
}: SliderControlProps) {
  const [inputValue, setInputValue] = useState(String(value));

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const handleSliderChange = useCallback(
    (values: number[]) => {
      const clamped = Math.max(min, Math.min(max, values[0]));
      onChange(clamped);
    },
    [onChange, min, max],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    },
    [],
  );

  const handleInputBlur = useCallback(() => {
    const parsed = parseFloat(inputValue);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      onChange(clamped);
      setInputValue(String(clamped));
    } else {
      setInputValue(String(value));
    }
  }, [inputValue, min, max, onChange, value]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        (e.target as HTMLInputElement).blur();
      }
    },
    [],
  );

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-400">{label}</Label>
        <div className="flex items-center gap-1">
          <Input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            disabled={disabled}
            className="h-6 w-16 bg-[#1f2937] border-slate-700 text-xs text-right font-mono tabular-nums px-1.5"
            aria-label={`${label} value`}
          />
          {unit && <span className="text-xs text-slate-500">{unit}</span>}
        </div>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={handleSliderChange}
        disabled={disabled}
        className="w-full"
        aria-label={label}
      />
    </div>
  );
});
