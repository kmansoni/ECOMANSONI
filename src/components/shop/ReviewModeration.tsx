/**
 * ReviewModeration — панель модерации отзывов для продавца.
 *
 * Список отзывов со статусами: на модерации, одобрен, отклонён.
 * Кнопки: одобрить, отклонить, ответить продавцу.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Star,
  Filter,
  Send,
  Video,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { dbLoose } from "@/lib/supabase";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

type ModerationStatus = 'pending' | 'approved' | 'rejected';

interface ReviewProfile {
  username: string;
  avatar_url: string | null;
}

interface ModeratableReview {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  text: string | null;
  video_url: string | null;
  moderation_status: ModerationStatus;
  seller_reply: string | null;
  seller_reply_at: string | null;
  created_at: string;
  profiles: ReviewProfile | null;
  product_name: string;
}

interface ReviewModerationProps {
  shopId: string;
}

const STATUS_CONFIG: Record<ModerationStatus, { label: string; icon: typeof Clock; color: string; badgeClass: string }> = {
  pending: { label: 'На модерации', icon: Clock, color: 'text-yellow-400', badgeClass: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  approved: { label: 'Одобрен', icon: CheckCircle2, color: 'text-green-400', badgeClass: 'bg-green-500/20 text-green-400 border-green-500/30' },
  rejected: { label: 'Отклонён', icon: XCircle, color: 'text-red-400', badgeClass: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

const PAGE_SIZE = 20;

export function ReviewModeration({ shopId }: ReviewModerationProps) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<ModeratableReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ModerationStatus | 'all'>('all');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchReviews = useCallback(async () => {
    if (!user) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      // Сначала получаем ID товаров магазина
      const { data: shopProducts } = await dbLoose
        .from('shop_products')
        .select('id')
        .eq('shop_id', shopId);

      const productIds = (shopProducts ?? []).map((p: { id: string }) => p.id);
      if (productIds.length === 0) {
        setReviews([]);
        return;
      }

      let query = dbLoose
        .from('product_reviews')
        .select(`
          id, product_id, user_id, rating, text, video_url,
          moderation_status, seller_reply, seller_reply_at, created_at,
          profiles(username, avatar_url)
        `)
        .in('product_id', productIds)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (filter !== 'all') {
        query = query.eq('moderation_status', filter);
      }

      const { data, error } = await query;

      if (controller.signal.aborted) return;
      if (error) throw error;

      // Получаем названия товаров отдельным запросом
      const rows = (data ?? []) as unknown as ModeratableReview[];
      const reviewProductIds = [...new Set(rows.map(r => r.product_id))];
      let productNames: Record<string, string> = {};

      if (reviewProductIds.length > 0) {
        const { data: products } = await dbLoose
          .from('shop_products')
          .select('id, name')
          .in('id', reviewProductIds)
          .limit(100);

        if (products) {
          productNames = Object.fromEntries(
            products.map((p: { id: string; name: string }) => [p.id, p.name]),
          );
        }
      }

      setReviews(
        rows.map(r => ({
          ...r,
          product_name: productNames[r.product_id] ?? 'Товар',
        })),
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      logger.error('[ReviewModeration] Ошибка загрузки отзывов', { shopId, error: err });
      toast.error('Не удалось загрузить отзывы');
    } finally {
      setLoading(false);
    }
  }, [user, shopId, filter]);

  useEffect(() => {
    fetchReviews();
    return () => { abortRef.current?.abort(); };
  }, [fetchReviews]);

  const updateStatus = useCallback(async (reviewId: string, status: ModerationStatus) => {
    setSubmitting(reviewId);
    try {
      const { error } = await dbLoose
        .from('product_reviews')
        .update({ moderation_status: status })
        .eq('id', reviewId);

      if (error) throw error;

      setReviews(prev =>
        prev.map(r => (r.id === reviewId ? { ...r, moderation_status: status } : r)),
      );
      toast.success(status === 'approved' ? 'Отзыв одобрен' : 'Отзыв отклонён');
    } catch (err) {
      logger.error('[ReviewModeration] Ошибка обновления статуса', { reviewId, status, error: err });
      toast.error('Не удалось обновить статус отзыва');
    } finally {
      setSubmitting(null);
    }
  }, []);

  const submitReply = useCallback(async (reviewId: string) => {
    if (!replyText.trim()) {
      toast.error('Введите текст ответа');
      return;
    }

    setSubmitting(reviewId);
    try {
      const now = new Date().toISOString();
      const { error } = await dbLoose
        .from('product_reviews')
        .update({ seller_reply: replyText.trim(), seller_reply_at: now })
        .eq('id', reviewId);

      if (error) throw error;

      setReviews(prev =>
        prev.map(r =>
          r.id === reviewId ? { ...r, seller_reply: replyText.trim(), seller_reply_at: now } : r,
        ),
      );
      setReplyText('');
      setReplyingTo(null);
      toast.success('Ответ опубликован');
    } catch (err) {
      logger.error('[ReviewModeration] Ошибка отправки ответа', { reviewId, error: err });
      toast.error('Не удалось опубликовать ответ');
    } finally {
      setSubmitting(null);
    }
  }, [replyText]);

  const pendingCount = reviews.filter(r => r.moderation_status === 'pending').length;

  if (!user) return null;

  return (
    <div className="space-y-4">
      {/* Заголовок + фильтр */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white text-lg">Модерация отзывов</h3>
          {pendingCount > 0 && (
            <p className="text-yellow-400 text-sm mt-0.5">
              {pendingCount} {pluralReviews(pendingCount)} ожидает модерации
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Filter className="w-4 h-4 text-zinc-400" />
          {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors min-h-[32px] ${
                filter === f
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
              aria-label={`Фильтр: ${f === 'all' ? 'все' : STATUS_CONFIG[f].label}`}
            >
              {f === 'all' ? 'Все' : STATUS_CONFIG[f].label}
            </button>
          ))}
        </div>
      </div>

      {/* Список */}
      {loading ? (
        <ModerationSkeleton />
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <MessageSquare className="w-12 h-12 opacity-30" />
          <p className="text-sm">
            {filter === 'all' ? 'Отзывов пока нет' : `Нет отзывов со статусом "${STATUS_CONFIG[filter as ModerationStatus]?.label ?? filter}"`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {reviews.map(review => (
              <ReviewCard
                key={review.id}
                review={review}
                isSubmitting={submitting === review.id}
                isReplying={replyingTo === review.id}
                replyText={replyText}
                onApprove={() => updateStatus(review.id, 'approved')}
                onReject={() => updateStatus(review.id, 'rejected')}
                onToggleReply={() => {
                  setReplyingTo(prev => (prev === review.id ? null : review.id));
                  setReplyText(review.seller_reply ?? '');
                }}
                onReplyTextChange={setReplyText}
                onSubmitReply={() => submitReply(review.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  isSubmitting,
  isReplying,
  replyText,
  onApprove,
  onReject,
  onToggleReply,
  onReplyTextChange,
  onSubmitReply,
}: {
  review: ModeratableReview;
  isSubmitting: boolean;
  isReplying: boolean;
  replyText: string;
  onApprove: () => void;
  onReject: () => void;
  onToggleReply: () => void;
  onReplyTextChange: (text: string) => void;
  onSubmitReply: () => void;
}) {
  const cfg = STATUS_CONFIG[review.moderation_status];
  const StatusIcon = cfg.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-zinc-900 rounded-2xl p-4 space-y-3"
    >
      {/* Шапка: автор + статус */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {review.profiles?.avatar_url ? (
            <img loading="lazy"
              src={review.profiles.avatar_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-zinc-700 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">
              @{review.profiles?.username ?? 'Пользователь'}
            </p>
            <p className="text-zinc-500 text-xs truncate">{review.product_name}</p>
          </div>
        </div>

        <Badge className={cfg.badgeClass}>
          <StatusIcon className={`w-3 h-3 mr-1 ${cfg.color}`} />
          {cfg.label}
        </Badge>
      </div>

      {/* Рейтинг */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            className={`w-4 h-4 ${i <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-600'}`}
          />
        ))}
        <span className="text-zinc-500 text-xs ml-2">
          {new Date(review.created_at).toLocaleDateString('ru-RU')}
        </span>
      </div>

      {/* Текст */}
      {review.text && (
        <p className="text-zinc-300 text-sm leading-relaxed">{review.text}</p>
      )}

      {/* Видео */}
      {review.video_url && (
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-blue-400" />
          <a
            href={review.video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 text-sm underline underline-offset-2 hover:text-blue-300"
          >
            Видео-отзыв
          </a>
        </div>
      )}

      {/* Ответ продавца (если есть) */}
      {review.seller_reply && !isReplying && (
        <div className="bg-zinc-800 rounded-xl p-3 border-l-2 border-blue-500">
          <p className="text-xs text-blue-400 font-medium mb-1">Ваш ответ</p>
          <p className="text-zinc-300 text-sm">{review.seller_reply}</p>
          {review.seller_reply_at && (
            <p className="text-zinc-500 text-xs mt-1">
              {new Date(review.seller_reply_at).toLocaleDateString('ru-RU')}
            </p>
          )}
        </div>
      )}

      {/* Кнопки действий */}
      <div className="flex flex-wrap gap-2">
        {review.moderation_status !== 'approved' && (
          <Button
            variant="outline"
            size="sm"
            onClick={onApprove}
            disabled={isSubmitting}
            className="gap-1.5 text-green-400 border-green-500/30 hover:bg-green-500/10 min-h-[36px]"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Одобрить
          </Button>
        )}

        {review.moderation_status !== 'rejected' && (
          <Button
            variant="outline"
            size="sm"
            onClick={onReject}
            disabled={isSubmitting}
            className="gap-1.5 text-red-400 border-red-500/30 hover:bg-red-500/10 min-h-[36px]"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
            Отклонить
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onToggleReply}
          disabled={isSubmitting}
          className="gap-1.5 min-h-[36px]"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {review.seller_reply ? 'Изменить ответ' : 'Ответить'}
        </Button>
      </div>

      {/* Форма ответа */}
      <AnimatePresence>
        {isReplying && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden"
          >
            <textarea
              value={replyText}
              onChange={e => onReplyTextChange(e.target.value)}
              placeholder="Напишите ответ на отзыв..."
              maxLength={1000}
              className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl p-3 text-sm resize-none h-20 outline-none focus:ring-1 focus:ring-blue-500"
              aria-label="Ответ на отзыв"
            />
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 text-xs">{replyText.length}/1000</span>
              <Button
                size="sm"
                onClick={onSubmitReply}
                disabled={isSubmitting || !replyText.trim()}
                className="gap-1.5 min-h-[36px]"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Отправить
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ModerationSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-zinc-900 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="w-8 h-8 rounded-full" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-24 ml-auto rounded-full" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

function pluralReviews(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'отзыв';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'отзыва';
  return 'отзывов';
}
