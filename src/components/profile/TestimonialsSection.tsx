import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquareQuote, Send, Star, Loader2, Check, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useTestimonials } from '@/hooks/useTestimonials';
import type { Testimonial } from '@/hooks/useTestimonials';

interface TestimonialsSectionProps {
  userId: string;
  isOwnProfile?: boolean;
}

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  const author = testimonial.author;
  const name = author?.display_name ?? 'Пользователь';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="shrink-0 w-64 p-4 rounded-xl bg-card border border-border space-y-3"
    >
      {/* Автор */}
      <div className="flex items-center gap-2">
        <img
          src={author?.avatar_url ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`}
          alt={name}
          className="w-8 h-8 rounded-full object-cover"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{name}</p>
          {author?.username && (
            <p className="text-xs text-muted-foreground">@{author.username}</p>
          )}
        </div>
      </div>

      {/* Текст */}
      <p className="text-sm text-foreground/80 line-clamp-4">{testimonial.text}</p>

      {/* Дата */}
      <p className="text-xs text-muted-foreground">
        {new Date(testimonial.created_at).toLocaleDateString('ru-RU')}
      </p>
    </motion.div>
  );
}

function PendingCard({
  testimonial,
  onApprove,
  onReject,
  loading,
}: {
  testimonial: Testimonial;
  onApprove: () => void;
  onReject: () => void;
  loading: boolean;
}) {
  const author = testimonial.author;
  const name = author?.display_name ?? 'Пользователь';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="p-4 rounded-xl bg-card border border-border space-y-3"
    >
      <div className="flex items-center gap-2">
        <img
          src={author?.avatar_url ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`}
          alt={name}
          className="w-8 h-8 rounded-full object-cover"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{name}</p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onApprove}
            disabled={loading}
            className="min-h-[44px] min-w-[44px] text-green-500"
            aria-label="Одобрить рекомендацию"
          >
            <Check className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onReject}
            disabled={loading}
            className="min-h-[44px] min-w-[44px] text-destructive"
            aria-label="Отклонить рекомендацию"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <p className="text-sm text-foreground/80">{testimonial.text}</p>
    </motion.div>
  );
}

export function TestimonialsSection({ userId, isOwnProfile }: TestimonialsSectionProps) {
  const { testimonials, pendingTestimonials, writeTestimonial, approve, reject, loading } =
    useTestimonials(userId);

  const [writeOpen, setWriteOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await writeTestimonial(userId, text);
      setText('');
      setWriteOpen(false);
    } finally {
      setSending(false);
    }
  }, [text, userId, writeTestimonial]);

  const charCount = text.trim().length;
  const isValid = charCount >= 10 && charCount <= 500;

  if (loading && testimonials.length === 0) {
    return (
      <div className="px-4 py-3">
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-64 h-32 rounded-xl bg-muted animate-pulse shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (testimonials.length === 0 && !isOwnProfile) {
    return null;
  }

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Рекомендации{testimonials.length > 0 ? ` (${testimonials.length})` : ''}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          {isOwnProfile && pendingTestimonials.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPendingOpen(true)}
              className="min-h-[44px] text-xs"
              aria-label={`${pendingTestimonials.length} ожидающих модерации`}
            >
              {pendingTestimonials.length} на модерации
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          )}
          {!isOwnProfile && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWriteOpen(true)}
              className="min-h-[44px]"
              aria-label="Написать рекомендацию"
            >
              <MessageSquareQuote className="w-3.5 h-3.5 mr-1" />
              Написать
            </Button>
          )}
        </div>
      </div>

      {/* Горизонтальный скролл */}
      {testimonials.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4">
          {testimonials.map((t) => (
            <TestimonialCard key={t.id} testimonial={t} />
          ))}
        </div>
      ) : isOwnProfile ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          <MessageSquareQuote className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Пока нет рекомендаций</p>
        </div>
      ) : null}

      {/* Sheet написания */}
      <Sheet open={writeOpen} onOpenChange={setWriteOpen}>
        <SheetContent side="bottom" className="max-h-[60vh]">
          <SheetHeader className="pb-4">
            <SheetTitle>Написать рекомендацию</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 pb-safe">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Расскажите, чем этот человек вас впечатлил..."
              className="min-h-[100px] resize-none"
              maxLength={500}
              aria-label="Текст рекомендации"
            />
            <div className="flex items-center justify-between">
              <span className={`text-xs ${charCount < 10 ? 'text-destructive' : charCount > 450 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                {charCount}/500
              </span>
              <Button
                onClick={handleSend}
                disabled={!isValid || sending}
                className="min-h-[44px]"
                aria-label="Отправить рекомендацию"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Send className="w-4 h-4 mr-1" />
                )}
                Отправить
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Sheet pending */}
      <Sheet open={pendingOpen} onOpenChange={setPendingOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle>На модерации ({pendingTestimonials.length})</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 pb-safe">
            <AnimatePresence>
              {pendingTestimonials.map((t) => (
                <PendingCard
                  key={t.id}
                  testimonial={t}
                  onApprove={() => approve(t.id)}
                  onReject={() => reject(t.id)}
                  loading={loading}
                />
              ))}
            </AnimatePresence>
            {pendingTestimonials.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">
                Нет рекомендаций на модерации
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
