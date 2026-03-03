import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot } from 'lucide-react';

interface BotCommandEntry {
  command: string;
  description: string;
  bot_id: string;
  bot_name: string;
}

interface BotCommandMenuProps {
  commands: BotCommandEntry[];
  visible: boolean;
  query: string;
  onSelect: (command: string) => void;
}

export const BotCommandMenu: React.FC<BotCommandMenuProps> = ({ commands, visible, query, onSelect }) => {
  const filtered = query.length > 1
    ? commands.filter(c => c.command.toLowerCase().includes(query.toLowerCase().slice(1)))
    : commands;

  return (
    <AnimatePresence>
      {visible && filtered.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          className="absolute bottom-full left-0 right-0 mb-1 mx-2 bg-[#1e1e3a] border border-white/10 rounded-xl overflow-hidden shadow-xl z-50 max-h-52 overflow-y-auto"
        >
          <div className="px-3 py-2 border-b border-white/10">
            <p className="text-white/40 text-xs font-medium flex items-center gap-1.5">
              <Bot size={12} />
              Команды ботов
            </p>
          </div>
          {filtered.map(cmd => (
            <button
              key={cmd.bot_id + cmd.command}
              onClick={() => onSelect(cmd.command)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/8 transition-colors text-left"
            >
              <span className="text-blue-400 font-mono text-sm font-medium w-32 flex-shrink-0">{cmd.command}</span>
              <span className="text-white/60 text-sm truncate">{cmd.description}</span>
              <span className="ml-auto text-white/30 text-xs flex-shrink-0">{cmd.bot_name}</span>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
