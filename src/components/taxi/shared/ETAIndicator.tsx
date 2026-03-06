import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatEta } from '@/lib/taxi/formatters';

interface ETAIndicatorProps {
  minutes: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  pulsing?: boolean;
  className?: string;
}

const SIZE_CLASSES = {
  sm: { wrap: 'gap-1', icon: 'h-3 w-3', time: 'text-sm font-semibold', label: 'text-xs' },
  md: { wrap: 'gap-1.5', icon: 'h-4 w-4', time: 'text-base font-semibold', label: 'text-xs' },
  lg: { wrap: 'gap-2', icon: 'h-5 w-5', time: 'text-xl font-bold', label: 'text-sm' },
};

export function ETAIndicator({
  minutes,
  label,
  size = 'md',
  pulsing = false,
  className,
}: ETAIndicatorProps) {
  const cls = SIZE_CLASSES[size];

  return (
    <div className={cn('flex items-center', cls.wrap, className)}>
      <Clock
        className={cn(
          cls.icon,
          'text-muted-foreground flex-shrink-0',
          pulsing && 'animate-pulse'
        )}
      />
      <span className={cn(cls.time, 'tabular-nums')}>{formatEta(minutes)}</span>
      {label && (
        <span className={cn(cls.label, 'text-muted-foreground')}>{label}</span>
      )}
    </div>
  );
}
