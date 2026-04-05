import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Info, ThumbsDown } from 'lucide-react';
import { useNotInterested } from '@/hooks/useNotInterested';
import { toast } from 'sonner';

interface WhyRecommendedProps {
  postId: string;
  reason?: 'interests' | 'followers' | 'similar';
  topic?: string;
  onDismiss?: () => void;
}

const REASON_TEXT: Record<string, (topic?: string) => string> = {
  interests: (topic) => `На основе ваших интересов${topic ? ` к «${topic}»` : ''}`,
  followers: () => 'Популярно среди ваших подписчиков',
  similar: () => 'Похоже на контент, который вам нравится',
};

export function WhyRecommended({ postId, reason = 'interests', topic, onDismiss }: WhyRecommendedProps) {
  const [open, setOpen] = useState(false);
  const { markNotInterested, undoNotInterested } = useNotInterested();

  const handleNotInterested = async () => {
    await markNotInterested('post', postId, 'not_interested');
    toast('Пост скрыт', {
      description: 'Мы учтём ваши предпочтения',
      action: {
        label: 'Отмена',
        onClick: () => {
          undoNotInterested('post', postId);
          toast('Скрытие отменено');
        },
      },
    });
    setOpen(false);
    onDismiss?.();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Почему вы это видите"
      >
        <Info className="w-3 h-3" />
        <span>Рекомендации для вас</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/60 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 rounded-t-3xl p-6 pb-10"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold text-lg">Почему вы это видите?</h3>
                <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-zinc-300 text-sm mb-6">
                {REASON_TEXT[reason]?.(topic) ?? REASON_TEXT.interests(topic)}
              </p>

              <button
                onClick={handleNotInterested}
                className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-2xl transition-colors"
              >
                <ThumbsDown className="w-4 h-4" />
                <span>Не интересно</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
