import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bot, Plus, MessageSquare } from 'lucide-react';
import { dbLoose } from "@/lib/supabase";
import { Bot as BotType, BotCommand } from '@/hooks/useBots';

interface BotProfileSheetProps {
  bot: BotType | null;
  open: boolean;
  onClose: () => void;
  onStartCommand?: (command: string) => void;
  onAddToGroup?: (botId: string) => void;
}

export const BotProfileSheet: React.FC<BotProfileSheetProps> = ({
  bot,
  open,
  onClose,
  onStartCommand,
  onAddToGroup,
}) => {
  const [commands, setCommands] = useState<BotCommand[]>([]);

  useEffect(() => {
    if (!bot) return;
    dbLoose
      .from('bot_commands')
      .select('*')
      .eq('bot_id', bot.id)
      .order('sort_order')
      .then(({ data }) => {
        if (data) setCommands(data as BotCommand[]);
      });
  }, [bot]);

  if (!bot) return null;

  return (
    <AnimatePresence>
      {open && (
        <React.Fragment>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-[#1e1e3a] rounded-t-2xl z-50 p-5 pb-8 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white text-lg font-semibold">Профиль бота</h3>
              <button onClick={onClose} className="text-white/50 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* Аватар + инфо */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/20 border-2 border-blue-500/40 flex items-center justify-center overflow-hidden flex-shrink-0">
                {bot.avatar_url
                  ? <img loading="lazy" src={bot.avatar_url} alt={bot.display_name} className="w-full h-full object-cover" />
                  : <Bot size={28} className="text-blue-400" />
                }
              </div>
              <div>
                <h4 className="text-white text-lg font-semibold">{bot.display_name}</h4>
                <p className="text-blue-400 text-sm">@{bot.username}</p>
                {bot.description && (
                  <p className="text-white/60 text-sm mt-1">{bot.description}</p>
                )}
              </div>
            </div>

            {/* Кнопки действий */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => onStartCommand && onStartCommand('/start')}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
              >
                <MessageSquare size={16} />
                Начать
              </button>
              {onAddToGroup && (
                <button
                  onClick={() => onAddToGroup(bot.id)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium transition-colors"
                >
                  <Plus size={16} />
                  В группу
                </button>
              )}
            </div>

            {/* Команды */}
            {commands.length > 0 && (
              <div>
                <p className="text-white/50 text-xs font-medium mb-3 uppercase tracking-wide">Команды</p>
                <div className="flex flex-col gap-1">
                  {commands.map(cmd => (
                    <button
                      key={cmd.id}
                      onClick={() => onStartCommand && onStartCommand(cmd.command)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left"
                    >
                      <span className="text-blue-400 font-mono text-sm font-medium">{cmd.command}</span>
                      <span className="text-white/60 text-sm">{cmd.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>
  );
};
