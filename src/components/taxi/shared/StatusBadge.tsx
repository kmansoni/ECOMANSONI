import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/types/taxi';
import { formatOrderStatus } from '@/lib/taxi/formatters';

interface StatusBadgeProps {
  status: OrderStatus;
  className?: string;
  size?: 'sm' | 'md';
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  idle: 'bg-slate-100 text-slate-600',
  selecting_route: 'bg-blue-50 text-blue-700',
  selecting_tariff: 'bg-violet-50 text-violet-700',
  searching_driver: 'bg-amber-50 text-amber-700 animate-pulse',
  driver_found: 'bg-emerald-50 text-emerald-700',
  driver_arriving: 'bg-emerald-50 text-emerald-700',
  driver_arrived: 'bg-teal-50 text-teal-700',
  in_trip: 'bg-green-50 text-green-700',
  completed: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-red-50 text-red-600',
  rating: 'bg-amber-50 text-amber-600',
};

export function StatusBadge({ status, className, size = 'md' }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        size === 'md' ? 'px-2.5 py-0.5 text-xs' : 'px-2 py-0.5 text-[10px]',
        STATUS_STYLES[status],
        className
      )}
    >
      {formatOrderStatus(status)}
    </span>
  );
}
