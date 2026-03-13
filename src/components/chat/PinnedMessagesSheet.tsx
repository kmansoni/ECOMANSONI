import { useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { X, Trash2, GripVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PinnedMessage } from '@/hooks/usePinnedMessages';
import { logger } from '@/lib/logger';

interface PinnedMessagesSheetProps {
  open: boolean;
  onClose: () => void;
  pinnedMessages: PinnedMessage[];
  onScrollTo: (messageId: string) => void;
  onUnpin: (messageId: string) => void;
  onReorder?: (orderedIds: string[]) => void;
}

export function PinnedMessagesSheet({
  open,
  onClose,
  pinnedMessages,
  onScrollTo,
  onUnpin,
}: PinnedMessagesSheetProps) {
  const [swipedId, setSwipedId] = useState<string | null>(null);

  if (!open) return null;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      return format(new Date(dateStr), 'd MMM, HH:mm', { locale: ru });
    } catch (error) {
      logger.debug('pinned-messages: failed to format pin date', { dateStr, error });
      return '';
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl border-t border-white/10 max-h-[70vh] flex flex-col"
          >
            {/* Handle */}
            <div className="flex items-center justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
              <h3 className="font-semibold text-base">
                📌 Закреплённые сообщения ({pinnedMessages.length})
              </h3>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {pinnedMessages.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  Нет закреплённых сообщений
                </div>
              ) : (
                <ul className="divide-y divide-white/5">
                  {pinnedMessages.map((pin) => {
                    const isSwiped = swipedId === pin.message_id;
                    const preview =
                      pin.content?.trim() ||
                      (pin.media_type ? `[${pin.media_type}]` : 'Сообщение');

                    return (
                      <li key={pin.id} className="relative overflow-hidden">
                        {/* Swipe-to-delete background */}
                        <div
                          className={`absolute inset-y-0 right-0 flex items-center justify-center w-20 bg-red-500/80 transition-opacity ${
                            isSwiped ? 'opacity-100' : 'opacity-0'
                          }`}
                        >
                          <Trash2 className="w-5 h-5 text-white" />
                        </div>

                        <motion.div
                          drag="x"
                          dragConstraints={{ left: -80, right: 0 }}
                          dragElastic={0.1}
                          onDragEnd={(_, info) => {
                            if (info.offset.x < -50) {
                              setSwipedId(pin.message_id);
                            } else {
                              setSwipedId(null);
                            }
                          }}
                          className="flex items-center gap-3 px-4 py-3 bg-background relative"
                          onClick={() => {
                            if (isSwiped) {
                              onUnpin(pin.message_id);
                              setSwipedId(null);
                            } else {
                              onScrollTo(pin.message_id);
                              onClose();
                            }
                          }}
                        >
                          <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{preview}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDate(pin.pinned_at)}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onUnpin(pin.message_id);
                            }}
                            className="shrink-0 p-1.5 rounded-md hover:bg-white/10 transition-colors"
                            aria-label="Открепить"
                          >
                            <X className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </motion.div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
