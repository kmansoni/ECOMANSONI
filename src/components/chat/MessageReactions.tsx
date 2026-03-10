import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

interface Reaction {
  emoji: string;
  count: number;
  hasReacted: boolean;
}

interface MessageReactionsProps {
  messageId: string;
  reactions: Reaction[];
  showPicker: boolean;
  onPickerClose: () => void;
  onReactionChange: () => void;
  /**
   * When provided, the component delegates reaction toggling to this callback
   * instead of making direct Supabase calls. The parent (typically the
   * useMessageReactions hook) handles persistence, optimistic updates,
   * localStorage fallback and realtime reconciliation.
   */
  onToggle?: (messageId: string, emoji: string) => void;
}

export function MessageReactions({
  messageId,
  reactions,
  showPicker,
  onPickerClose,
  onReactionChange,
  onToggle,
}: MessageReactionsProps) {
  const { user } = useAuth();

  const toggleReaction = useCallback(
    async (emoji: string) => {
      if (!user) return;

      // ── Delegated mode: let the parent hook handle persistence ──────────
      if (onToggle) {
        onToggle(messageId, emoji);
        onPickerClose();
        return;
      }

      // ── Legacy fallback: direct Supabase calls ─────────────────────────
      const existing = reactions.find((r) => r.emoji === emoji);

      if (existing?.hasReacted) {
        await (supabase as any)
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', user.id);
      } else {
        // Удалим предыдущую реакцию если есть
        await (supabase as any)
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', user.id);

        await (supabase as any)
          .from('message_reactions')
          .insert({ message_id: messageId, user_id: user.id, emoji });
      }

      onPickerClose();
      onReactionChange();
    },
    [user, messageId, reactions, onPickerClose, onReactionChange, onToggle]
  );

  return (
    <>
      {/* Быстрый пикер реакций */}
      <AnimatePresence>
        {showPicker && (
          <>
            <div className="fixed inset-0 z-40" onClick={onPickerClose} />
            <motion.div
              className="absolute bottom-full mb-2 left-0 z-50 flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-full px-3 py-2 shadow-xl"
              initial={{ opacity: 0, scale: 0.8, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 8 }}
              transition={{ duration: 0.15 }}
            >
              {QUICK_REACTIONS.map((emoji) => (
                <motion.button
                  key={emoji}
                  onClick={() => toggleReaction(emoji)}
                  className="text-2xl hover:scale-125 transition-transform w-9 h-9 flex items-center justify-center rounded-full hover:bg-zinc-700"
                  whileTap={{ scale: 0.9 }}
                >
                  {emoji}
                </motion.button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Отображение реакций */}
      {reactions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {reactions.map((r) => (
            <motion.button
              key={r.emoji}
              onClick={() => toggleReaction(r.emoji)}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
                r.hasReacted
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-300'
              }`}
              whileTap={{ scale: 0.9 }}
            >
              <span>{r.emoji}</span>
              {r.count > 1 && <span>{r.count}</span>}
            </motion.button>
          ))}
        </div>
      )}
    </>
  );
}
