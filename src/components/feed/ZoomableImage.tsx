/**
 * @file src/components/feed/ZoomableImage.tsx
 * @description Изображение с поддержкой pinch-to-zoom и double-tap zoom.
 * Используется в PostCard для просмотра фото с жестами.
 *
 * Интегрирует usePinchZoom hook.
 * При zoom > 1 блокирует вертикальный скролл страницы (touch-action: none).
 */

import { usePinchZoom } from "@/hooks/usePinchZoom";
import { cn } from "@/lib/utils";
import { Haptics } from "@/lib/haptics";

interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
  onPress?: () => void;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

export function ZoomableImage({ src, alt, className, onPress, onLoad }: ZoomableImageProps) {
  const { ref, style, isZoomed, reset } = usePinchZoom({
    minScale: 1,
    maxScale: 5,
    doubleTapScale: 2.5,
    onZoomChange: (scale) => {
      if (scale > 1.1) {
        Haptics.tap();
      }
    },
  });

  return (
    <div
      className={cn("overflow-hidden relative", className)}
      style={{ touchAction: isZoomed ? "none" : "pan-y" }}
    >
      <div ref={ref} style={style} className="w-full h-full">
        <img
          src={src}
          alt={alt ?? ""}
          className="w-full h-full object-cover select-none"
          draggable={false}
          onClick={!isZoomed ? onPress : undefined}
          onLoad={onLoad}
        />
      </div>

      {/* Кнопка сброса зума */}
      {isZoomed && (
        <button
          onClick={reset}
          className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full z-10"
        >
          Сбросить
        </button>
      )}
    </div>
  );
}
