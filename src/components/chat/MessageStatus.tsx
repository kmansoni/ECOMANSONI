import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import type { DeliveryStatus } from '@/hooks/useReadReceipts';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MessageStatusProps {
  status: DeliveryStatus;
  onRetry?: () => void;
  className?: string;
  readAt?: string;
  deliveredAt?: string;
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ru", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      day: "numeric",
      month: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function StatusIcon({ status, onRetry, className = '' }: Pick<MessageStatusProps, 'status' | 'onRetry' | 'className'>) {
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={status}
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.7 }}
        transition={{ duration: 0.15 }}
        className={`inline-flex items-center ${className}`}
        style={{ fontSize: '12px', lineHeight: 1 }}
      >
        {status === 'sending' && (
          <span className="text-white/40" title="Отправка…">⏱</span>
        )}
        {status === 'sent' && (
          <span className="text-white/40" title="Отправлено">✓</span>
        )}
        {status === 'delivered' && (
          <span className="text-white/40" title="Доставлено">✓✓</span>
        )}
        {status === 'read' && (
          <span className="text-blue-400" title="Прочитано">✓✓</span>
        )}
        {status === 'failed' && (
          <span className="flex items-center gap-0.5">
            <span className="text-red-500" title="Ошибка отправки">✗</span>
            {onRetry && (
              <button
                onClick={onRetry}
                className="text-red-400 hover:text-red-300 transition-colors ml-0.5"
                title="Повторить"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </span>
        )}
      </motion.span>
    </AnimatePresence>
  );
}

export function MessageStatus({ status, onRetry, className = '', readAt, deliveredAt }: MessageStatusProps) {
  const hasTooltipData = (status === 'delivered' || status === 'read') && (deliveredAt || readAt);

  if (!hasTooltipData) {
    return <StatusIcon status={status} onRetry={onRetry} className={className} />;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center cursor-default">
            <StatusIcon status={status} onRetry={onRetry} className={className} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {readAt ? (
            <div className="space-y-0.5">
              {deliveredAt && <div>Доставлено: {formatTime(deliveredAt)}</div>}
              <div>Прочитано: {formatTime(readAt)}</div>
            </div>
          ) : deliveredAt ? (
            <div>Доставлено: {formatTime(deliveredAt)}</div>
          ) : (
            <div>Отправлено</div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
