/**
 * CreativePreview — превью креатива в различных форматах.
 *
 * Форматы:
 * - feed: квадрат/landscape с headline и CTA
 * - story: вертикальное 9:16 с текстом поверх
 * - reels: 9:16 с CTA кнопкой
 * - carousel: несколько карточек
 */

import { Image as ImageIcon, Video, Package } from "lucide-react";
import type { AdCreative } from "@/lib/ads/types";

interface CreativePreviewProps {
  creative: AdCreative;
  format?: 'feed' | 'story' | 'reels' | 'carousel';
  showActions?: boolean;
}

export function CreativePreview({ 
  creative, 
  format = 'feed', 
  showActions = false 
}: CreativePreviewProps) {
  const isVideo = creative.type === 'video';
  const isCarousel = creative.type === 'carousel';

  const aspectRatioClasses = {
    feed: 'aspect-square md:aspect-[1.91/1]',
    story: 'aspect-[9/16]',
    reels: 'aspect-[9/16]',
    carousel: 'aspect-square',
  };

  const containerClasses = {
    feed: 'max-w-md mx-auto',
    story: 'max-w-[280px] mx-auto',
    reels: 'max-w-[280px] mx-auto',
    carousel: 'max-w-md mx-auto',
  };

  return (
    <div className={`${containerClasses[format]} border rounded-xl overflow-hidden bg-card`}>
      {/* Media */}
      <div className={`relative ${aspectRatioClasses[format]} bg-muted`}>
        {creative.media_url ? (
          <img
            src={creative.media_url}
            alt={creative.headline}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isVideo ? (
              <Video className="w-12 h-12 text-muted-foreground" />
            ) : isCarousel ? (
              <Package className="w-12 h-12 text-muted-foreground" />
            ) : (
              <ImageIcon className="w-12 h-12 text-muted-foreground" />
            )}
          </div>
        )}

        {/* Overlay для story/reels */}
        {(format === 'story' || format === 'reels') && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        )}

        {/* Текст поверх для story/reels */}
        {(format === 'story' || format === 'reels') && (
          <div className="absolute bottom-4 left-4 right-4">
            <p className="text-white font-semibold text-sm line-clamp-2 drop-shadow-md">
              {creative.headline}
            </p>
          </div>
        )}

        {/* Кнопка CTA для reels */}
        {format === 'reels' && (
          <div className="absolute bottom-4 right-4">
            <button className="bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-xs font-medium">
              {getCTALabel(creative.call_to_action)}
            </button>
          </div>
        )}
      </div>

      {/* Текстовая часть для feed */}
      {format === 'feed' && (
        <div className="p-3">
          <h3 className="font-semibold text-sm line-clamp-2 mb-1">
            {creative.headline}
          </h3>
          {creative.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
              {creative.description}
            </p>
          )}
          <button className="text-xs font-medium text-primary hover:underline">
            {getCTALabel(creative.call_to_action)}
          </button>
        </div>
      )}

      {/* Информация о креативе */}
      {showActions && (
        <div className="px-3 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>{creative.type}</span>
            <span>{new Date(creative.created_at).toLocaleDateString('ru-RU')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function getCTALabel(cta: string): string {
  const labels: Record<string, string> = {
    learn_more: 'Узнать больше',
    shop_now: 'Купить сейчас',
    sign_up: 'Зарегистрироваться',
    contact_us: 'Связаться',
    download: 'Скачать',
    get_quote: 'Получить расчёт',
    apply_now: 'Подать заявку',
  };
  return labels[cta] || cta;
}
