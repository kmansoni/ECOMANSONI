import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Hash } from 'lucide-react';

const POPULAR_EMOJIS = ['💬', '📢', '🎮', '🎨', '📚', '🎵', '🏆', '💡', '🔥', '⚡', '🌟', '🎯', '📊', '🛠️', '🤝', '🎉'];

const COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // yellow
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
];

interface CreateTopicSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (params: { name: string; icon_emoji: string; icon_color: string; description?: string }) => Promise<void>;
}

export const CreateTopicSheet: React.FC<CreateTopicSheetProps> = ({ open, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('💬');
  const [color, setColor] = useState('#3B82F6');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onSubmit({ name: name.trim(), icon_emoji: emoji, icon_color: color, description: description.trim() || undefined });
      setName('');
      setDescription('');
      setEmoji('💬');
      setColor('#3B82F6');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
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
            className="fixed bottom-0 left-0 right-0 bg-[#1e1e3a] rounded-t-2xl z-50 p-5 pb-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-white text-lg font-semibold">Новая тема</h3>
              <button onClick={onClose} className="text-white/50 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* Preview */}
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                style={{ backgroundColor: color + '30', border: '2px solid ' + color }}
              >
                {emoji}
              </div>
              <div className="flex-1">
                <p className="text-white font-medium">{name || 'Название темы'}</p>
                <p className="text-white/40 text-sm">{description || 'Описание темы'}</p>
              </div>
            </div>

            {/* Название */}
            <div className="mb-4">
              <label className="text-white/60 text-xs mb-1.5 block">НАЗВАНИЕ</label>
              <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2.5">
                <Hash size={16} className="text-white/40" />
                <input
                  className="flex-1 bg-transparent text-white placeholder:text-white/30 text-sm outline-none"
                  placeholder="Введите название темы"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={50}
                />
              </div>
            </div>

            {/* Эмодзи */}
            <div className="mb-4">
              <label className="text-white/60 text-xs mb-1.5 block">ИКОНКА</label>
              <div className="grid grid-cols-8 gap-2">
                {POPULAR_EMOJIS.map(e => (
                  <button
                    key={e}
                    onClick={() => setEmoji(e)}
                    className={'w-9 h-9 rounded-lg text-xl flex items-center justify-center transition-all ' + (emoji === e ? 'bg-blue-500/30 ring-2 ring-blue-500' : 'bg-white/8 hover:bg-white/15')}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Цвет */}
            <div className="mb-4">
              <label className="text-white/60 text-xs mb-1.5 block">ЦВЕТ</label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={'w-8 h-8 rounded-full transition-all ' + (color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1e1e3a] scale-110' : '')}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Описание */}
            <div className="mb-6">
              <label className="text-white/60 text-xs mb-1.5 block">ОПИСАНИЕ (необязательно)</label>
              <textarea
                className="w-full bg-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/30 outline-none resize-none"
                placeholder="Описание темы..."
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={200}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={!name.trim() || loading}
              className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: color }}
            >
              {loading ? 'Создание...' : 'Создать тему'}
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
