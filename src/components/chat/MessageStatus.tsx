import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import type { DeliveryStatus } from '@/hooks/useReadReceipts';

interface MessageStatusProps {
  status: DeliveryStatus;
  onRetry?: () => void;
  className?: string;
}

export function MessageStatus({ status, onRetry, className = '' }: MessageStatusProps) {
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
