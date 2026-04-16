import { useState, useEffect } from 'react';
import { Star, Camera, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { dbLoose } from "@/lib/supabase";

interface Review {
  id: string;
  user_id: string;
  rating: number;
  text?: string;
  photos: string[];
  created_at: string;
  profiles?: { username: string; avatar_url?: string };
}

interface ProductReviewsProps {
  productId: string;
}

function StarRating({ value, onChange, size = 'md' }: { value: number; onChange?: (v: number) => void; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'w-4 h-4' : 'w-6 h-6';
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          onClick={() => onChange?.(i)}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}
          aria-label={`${i} звезда`}
        >
          <Star
            className={`${sz} ${i <= value ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-600'}`}
          />
        </button>
      ))}
    </div>
  );
}

export function ProductReviews({ productId }: ProductReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data } = await dbLoose
        .from('product_reviews')
        .select('*, profiles(username, avatar_url)')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });
      setReviews(data ?? []);
      setLoading(false);
    })();
  }, [productId]);

  const submit = async () => {
    if (!text.trim()) { toast.error('Напишите отзыв'); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Войдите в аккаунт'); return; }

      const { data, error } = await dbLoose
        .from('product_reviews')
        .insert({ product_id: productId, user_id: user.id, rating, text, photos: [] })
        .select('*, profiles(username, avatar_url)')
        .single();

      if (error) throw error;
      setReviews(prev => [data, ...prev]);
      setText('');
      setRating(5);
      setShowForm(false);
      toast.success('Отзыв опубликован');
    } catch {
      toast.error('Ошибка при публикации отзыва');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white text-lg">Отзывы</h3>
          {reviews.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <StarRating value={Math.round(avgRating)} size="sm" />
              <span className="text-zinc-400 text-sm">
                {avgRating.toFixed(1)} ({reviews.length})
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-full"
        >
          Написать отзыв
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-zinc-900 rounded-2xl p-4 space-y-3"
          >
            <StarRating value={rating} onChange={setRating} />
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Поделитесь своим мнением о товаре..."
              className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl p-3 text-sm resize-none h-24 outline-none"
            />
            <button
              onClick={submit}
              disabled={submitting}
              className="flex items-center gap-2 bg-white text-black font-semibold text-sm px-4 py-2 rounded-full disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Публикация...' : 'Опубликовать'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="text-zinc-500 text-sm text-center py-4">Загрузка отзывов...</div>
      ) : reviews.length === 0 ? (
        <div className="text-zinc-500 text-sm text-center py-8">Отзывов пока нет. Будьте первым!</div>
      ) : (
        <div className="space-y-4">
          {reviews.map(review => (
            <div key={review.id} className="bg-zinc-900 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                {review.profiles?.avatar_url ? (
                  <img loading="lazy" src={review.profiles.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-zinc-700" />
                )}
                <span className="text-white text-sm font-medium">
                  @{review.profiles?.username ?? 'Пользователь'}
                </span>
                <span className="text-zinc-500 text-xs ml-auto">
                  {new Date(review.created_at).toLocaleDateString('ru-RU')}
                </span>
              </div>
              <StarRating value={review.rating} size="sm" />
              {review.text && <p className="text-zinc-300 text-sm mt-2">{review.text}</p>}
              {review.photos?.length > 0 && (
                <div className="flex gap-2 mt-3 overflow-x-auto">
                  {review.photos.map((photo, i) => (
                    <img loading="lazy" key={i} src={photo} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
