/**
 * ScheduledMessagesBar — компактный бар со счётчиком запланированных сообщений.
 * При клике раскрывает список с возможностью отмены.
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, ChevronDown, X, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { ScheduledMessage } from "@/hooks/useScheduledMessages";
import { logger } from "@/lib/logger";

interface ScheduledMessagesBarProps {
  messages: ScheduledMessage[];
  onCancel: (id: string) => void;
  onEdit?: (msg: ScheduledMessage) => void;
}

function formatTime(dateStr: string): string {
  try {
    return format(new Date(dateStr), "d MMM, HH:mm", { locale: ru });
  } catch (err) {
    logger.debug("[ScheduledMessagesBar] Ошибка форматирования даты", { dateStr, error: err });
    return dateStr;
  }
}

export function ScheduledMessagesBar({ messages, onCancel, onEdit }: ScheduledMessagesBarProps) {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  if (messages.length === 0) return null;

  return (
    <div className="border-b border-white/10">
      {/* Compact bar */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors min-h-[44px]"
        aria-label={`${messages.length} запланированных сообщений`}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          <span className="text-sm text-amber-400 font-medium">
            {messages.length} запланирован{messages.length === 1 ? "о" : messages.length < 5 ? "о" : "о"}
          </span>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      {/* Expanded list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <ul className="divide-y divide-white/5 max-h-48 overflow-y-auto">
              {messages.map((msg) => (
                <li key={msg.id} className="px-4 py-2.5 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm line-clamp-1 break-words">{msg.content || "[медиа]"}</p>
                    <p className="text-xs text-amber-400 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTime(msg.scheduled_for)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(msg)}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                        aria-label="Редактировать"
                      >
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    )}
                    <button
                      onClick={() => onCancel(msg.id)}
                      className="p-1.5 rounded-lg hover:bg-destructive/20 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                      aria-label="Отменить запланированное сообщение"
                    >
                      <X className="w-3.5 h-3.5 text-destructive/70" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
