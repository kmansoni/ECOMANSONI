import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { X, Clock, Send, Pencil, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import type { ScheduledMessage } from '@/hooks/useScheduledMessages';

interface ScheduledMessagesListProps {
  open: boolean;
  onClose: () => void;
  scheduledMessages: ScheduledMessage[];
  onSendNow: (id: string) => void;
  onEdit: (msg: ScheduledMessage) => void;
  onDelete: (id: string) => void;
}

function formatScheduledTime(dateStr: string): string {
  try {
    return format(new Date(dateStr), "d MMM, HH:mm", { locale: ru });
  } catch {
    return dateStr;
  }
}

export function ScheduledMessagesList({
  open,
  onClose,
  scheduledMessages,
  onSendNow,
  onEdit,
  onDelete,
}: ScheduledMessagesListProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <AnimatePresence>
      {open && (
        <div key="scheduled-list-overlay">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl border-t border-white/10 max-h-[70vh] flex flex-col"
          >
            <div className="flex items-center justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                Запланированные сообщения
                {scheduledMessages.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
                    {scheduledMessages.length}
                  </span>
                )}
              </h3>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {scheduledMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                  <Clock className="w-10 h-10 opacity-30" />
                  <p className="text-sm">Нет запланированных сообщений</p>
                </div>
              ) : (
                <ul className="divide-y divide-white/5 pb-4">
                  {scheduledMessages.map((msg) => (
                    <li key={msg.id} className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground line-clamp-2 break-words">
                            {msg.content || '[медиа]'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                            <span className="text-xs text-amber-400">
                              {formatScheduledTime(msg.scheduled_for)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {confirmDeleteId === msg.id ? (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => {
                              onDelete(msg.id);
                              setConfirmDeleteId(null);
                            }}
                            className="flex-1 text-xs py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-400/30 transition-colors"
                          >
                            Удалить
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="flex-1 text-xs py-1.5 rounded-lg bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => onSendNow(msg.id)}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors"
                          >
                            <Send className="w-3 h-3" />
                            Отправить сейчас
                          </button>
                          <button
                            onClick={() => onEdit(msg)}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-muted/40 text-muted-foreground hover:bg-muted/60 border border-white/10 transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                            Изменить
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(msg.id)}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-400/20 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
