/**
 * CustomEmoji — renders a custom emoji (animated or static) inline in text.
 *
 * Custom emoji are referenced in message text as `:emoji_id:` or via
 * a special unicode placeholder + data attribute.
 *
 * Supports:
 * - Static images (WebP/PNG)
 * - Animated (Lottie JSON)
 * - Premium-gated emoji (shows lock overlay for non-premium users)
 */

import { useState, useEffect, useRef } from "react"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { Lock } from "lucide-react";

interface CustomEmojiProps {
  /** Emoji pack ID + emoji ID */
  emojiId: string;
  /** URL to the emoji asset */
  src: string;
  /** Whether this is an animated emoji (Lottie) */
  animated?: boolean;
  /** Size in pixels */
  size?: number;
  /** Whether user has premium access */
  isPremium?: boolean;
  /** Alt text */
  alt?: string;
}

export function CustomEmoji({
  emojiId,
  src,
  animated = false,
  size = 20,
  isPremium = true,
  alt,
}: CustomEmojiProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  // For animated emoji, use lottie-web
  useEffect(() => {
    if (!animated || !containerRef.current || !isPremium) return;

    let lottieInstance: any = null;

    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore – lottie-web is an optional peer; absence is handled via catch
        const lottie = await import("lottie-web").catch(() => null);
        if (!lottie) { setError(true); return; }
        if (!containerRef.current) return;

        lottieInstance = lottie.default.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: true,
          autoplay: true,
          path: src,
        });

        lottieInstance.addEventListener("DOMLoaded", () => setLoaded(true));
      } catch {
        setError(true);
      }
    })();

    return () => {
      lottieInstance?.destroy();
    };
  }, [animated, src, isPremium]);

  if (error) {
    return <span className="inline-block text-xs" title={alt ?? emojiId}>❓</span>;
  }

  // Non-premium: show blurred with lock
  if (!isPremium) {
    return (
      <span
        className="inline-flex items-center justify-center relative"
        style={{ width: size, height: size }}
        title="Доступно с Premium"
      >
        <img
          src={src}
          alt={alt ?? emojiId}
          className="blur-sm opacity-50"
          style={{ width: size, height: size }}
          onError={() => setError(true)}
        />
        <Lock className="absolute w-2.5 h-2.5 text-white/70" />
      </span>
    );
  }

  // Animated emoji
  if (animated) {
    return (
      <span
        ref={containerRef}
        className="inline-block align-middle"
        style={{ width: size, height: size }}
        title={alt ?? emojiId}
      />
    );
  }

  // Static emoji
  return (
    <img
      src={src}
      alt={alt ?? emojiId}
      className="inline-block align-middle"
      style={{ width: size, height: size }}
      onLoad={() => setLoaded(true)}
      onError={() => setError(true)}
    />
  );
}

/**
 * Parse custom emoji references in text.
 * Format: :custom_emoji_id: or <emoji:id>
 * Returns segments of plain text and emoji references.
 */
export interface TextSegment {
  type: "text" | "custom-emoji";
  content: string;
  emojiId?: string;
}

const CUSTOM_EMOJI_REGEX = /<emoji:([a-zA-Z0-9_-]+)>/g;

export function parseCustomEmoji(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  CUSTOM_EMOJI_REGEX.lastIndex = 0;
  while ((match = CUSTOM_EMOJI_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "custom-emoji", content: match[0], emojiId: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}
