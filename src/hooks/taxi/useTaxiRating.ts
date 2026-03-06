import { useState, useCallback } from 'react';
import { TIPS_PRESETS } from '@/lib/taxi/calculations';

// Предустановленные теги для оценки
export const RATING_TAGS = [
  { id: 'clean_car', label: 'Чистое авто', emoji: '✨' },
  { id: 'polite', label: 'Вежливый', emoji: '😊' },
  { id: 'fast', label: 'Быстро приехал', emoji: '⚡' },
  { id: 'good_music', label: 'Хорошая музыка', emoji: '🎵' },
  { id: 'quiet', label: 'Тихая поездка', emoji: '🤫' },
  { id: 'good_route', label: 'Оптимальный маршрут', emoji: '🗺️' },
  { id: 'comfortable', label: 'Комфортно', emoji: '🛋️' },
  { id: 'safe', label: 'Безопасная езда', emoji: '🛡️' },
];

// Предустановленные суммы чаевых
export { TIPS_PRESETS };

interface RatingState {
  stars: number;          // 1–5 (0 = не выбрано)
  tip: number;            // ₽
  customTip: string;      // для ввода произвольной суммы
  comment: string;
  selectedTags: Set<string>;
  isSubmitting: boolean;
}

export function useTaxiRating() {
  const [state, setState] = useState<RatingState>({
    stars: 0,
    tip: 0,
    customTip: '',
    comment: '',
    selectedTags: new Set(),
    isSubmitting: false,
  });

  // ─── Выставить оценку звёздами ────────────────────────────────────────────
  const setStars = useCallback((value: number) => {
    // При высокой оценке (5) автоматически предлагаем теги позитивного плана
    setState((s) => ({
      ...s,
      stars: value,
      // При оценке < 3 сбрасываем теги (показываем негативные)
      selectedTags: value < 3 ? new Set() : s.selectedTags,
    }));
  }, []);

  // ─── Переключить тег ──────────────────────────────────────────────────────
  const toggleTag = useCallback((tagId: string) => {
    setState((s) => {
      const next = new Set(s.selectedTags);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return { ...s, selectedTags: next };
    });
  }, []);

  // ─── Установить предустановленные чаевые ──────────────────────────────────
  const setTip = useCallback((amount: number) => {
    setState((s) => ({ ...s, tip: amount, customTip: '' }));
  }, []);

  // ─── Изменить произвольные чаевые ─────────────────────────────────────────
  const setCustomTip = useCallback((value: string) => {
    const num = parseInt(value.replace(/\D/g, ''), 10);
    setState((s) => ({
      ...s,
      customTip: value,
      tip: isNaN(num) ? 0 : num,
    }));
  }, []);

  // ─── Изменить комментарий ─────────────────────────────────────────────────
  const setComment = useCallback((text: string) => {
    setState((s) => ({ ...s, comment: text }));
  }, []);

  // ─── Установить флаг отправки ─────────────────────────────────────────────
  const setSubmitting = useCallback((value: boolean) => {
    setState((s) => ({ ...s, isSubmitting: value }));
  }, []);

  // ─── Сброс ────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setState({
      stars: 0,
      tip: 0,
      customTip: '',
      comment: '',
      selectedTags: new Set(),
      isSubmitting: false,
    });
  }, []);

  // ─── Готовность к отправке ────────────────────────────────────────────────
  const canSubmit = state.stars > 0 && !state.isSubmitting;

  return {
    stars: state.stars,
    tip: state.tip,
    customTip: state.customTip,
    comment: state.comment,
    selectedTags: state.selectedTags,
    isSubmitting: state.isSubmitting,
    canSubmit,

    setStars,
    toggleTag,
    setTip,
    setCustomTip,
    setComment,
    setSubmitting,
    reset,
  };
}
