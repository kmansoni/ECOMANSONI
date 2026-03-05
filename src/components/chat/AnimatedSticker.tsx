import { useEffect, useRef, useState, memo } from "react";

export type StickerSize = "small" | "medium" | "large";

const SIZE_MAP: Record<StickerSize, number> = {
  small: 100,
  medium: 150,
  large: 200,
};

interface AnimatedStickerProps {
  /** URL of the sticker asset — .json/.lottie / .webp / .webm / .tgs */
  url: string;
  size?: StickerSize;
  alt?: string;
  className?: string;
}

/**
 * Universal animated sticker renderer.
 *
 * Format dispatch table:
 *  • `.json`  → dynamic import of `lottie-web` (if available), canvas renderer
 *  • `.webp`  → `<img>` — browsers natively loop animated WebP
 *  • `.webm`  → `<video autoPlay loop muted playsInline>`
 *  • `.tgs`   → static `<img>` fallback (TGS = gzip Lottie; no browser support)
 *  • Other    → `<img>` fallback
 *
 * IntersectionObserver pauses/resumes the animation when the sticker
 * leaves/enters the viewport, conserving CPU/GPU on long-history chats.
 *
 * Security note:
 *  - `url` is rendered as a resource URL only — never as innerHTML.
 *  - `alt` is a static label, never interpolated from message content.
 */
export const AnimatedSticker = memo(function AnimatedSticker({
  url,
  size = "medium",
  alt = "стикер",
  className = "",
}: AnimatedStickerProps) {
  const px = SIZE_MAP[size];
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";

  if (ext === "webm") {
    return (
      <VideoSticker url={url} px={px} alt={alt} className={className} />
    );
  }

  if (ext === "json" || ext === "lottie") {
    return (
      <LottieSticker url={url} px={px} alt={alt} className={className} />
    );
  }

  // webp, tgs, png, gif and everything else → <img>
  return (
    <img
      src={url}
      alt={alt}
      width={px}
      height={px}
      draggable={false}
      className={`object-contain select-none ${className}`}
      style={{ width: px, height: px }}
    />
  );
});

// ─── Internal helpers ──────────────────────────────────────────────────────────

function VideoSticker({
  url,
  px,
  alt,
  className,
}: {
  url: string;
  px: number;
  alt: string;
  className: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useIntersectionPlayer(videoRef, (visible) => {
    const v = videoRef.current;
    if (!v) return;
    if (visible) {
      v.play().catch(() => undefined);
    } else {
      v.pause();
    }
  });

  return (
    <video
      ref={videoRef}
      src={url}
      width={px}
      height={px}
      autoPlay
      loop
      muted
      playsInline
      aria-label={alt}
      draggable={false}
      className={`object-contain select-none ${className}`}
      style={{ width: px, height: px }}
    />
  );
}

function LottieSticker({
  url,
  px,
  alt,
  className,
}: {
  url: string;
  px: number;
  alt: string;
  className: string;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<any>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let anim: any = null;

    (async () => {
      try {
        // Dynamic import — will fail gracefully if lottie-web is not installed
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore – lottie-web is an optional peer; absence is handled via .catch
        const lottie = await import("lottie-web").catch(() => null);
        if (!lottie || cancelled || !canvasRef.current) {
          setFallback(true);
          return;
        }
        const response = await fetch(url);
        const animData = await response.json();
        if (cancelled || !canvasRef.current) return;

        anim = lottie.default.loadAnimation({
          container: canvasRef.current,
          renderer: "svg",
          loop: true,
          autoplay: false,
          animationData: animData,
        });
        animRef.current = anim;
      } catch {
        if (!cancelled) setFallback(true);
      }
    })();

    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [url]);

  useIntersectionPlayer(canvasRef, (visible) => {
    const a = animRef.current;
    if (!a) return;
    if (visible) a.play();
    else a.pause();
  });

  if (fallback) {
    return (
      <img
        src={url}
        alt={alt}
        width={px}
        height={px}
        draggable={false}
        className={`object-contain select-none ${className}`}
        style={{ width: px, height: px }}
      />
    );
  }

  return (
    <div
      ref={canvasRef}
      aria-label={alt}
      className={`select-none ${className}`}
      style={{ width: px, height: px }}
    />
  );
}

/**
 * Subscribes to IntersectionObserver for the given ref element.
 * Fires `onVisibilityChange(true)` when ≥10% of the element is visible,
 * `onVisibilityChange(false)` otherwise.
 */
function useIntersectionPlayer(
  ref: React.RefObject<Element | null>,
  onVisibilityChange: (visible: boolean) => void,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => onVisibilityChange(entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, onVisibilityChange]);
}
