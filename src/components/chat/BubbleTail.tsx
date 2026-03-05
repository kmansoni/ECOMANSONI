import { memo } from "react";

interface BubbleTailProps {
  /** "right" for own messages, "left" for incoming */
  side: "left" | "right";
  /** Fill colour — must match the bubble background exactly */
  color?: string;
  className?: string;
}

/**
 * Telegram-style SVG tail for message bubbles.
 *
 * The tail is rendered as an absolutely-positioned SVG snippet that
 * attaches to the bottom corner of the bubble container.
 * Only show it for the FIRST message in a consecutive sender group.
 *
 * Design invariants:
 * - Size is fixed at 8×12 px — enough to mimic Telegram geometry.
 * - The `color` prop must receive the exact same RGBA/hex string the
 *   bubble uses so there is no visible seam.
 * - No shadow or border is drawn on the tail itself; the parent bubble
 *   handles drop-shadow via box-shadow.
 */
export const BubbleTail = memo(function BubbleTail({
  side,
  color = "rgba(255,255,255,0.1)",
  className = "",
}: BubbleTailProps) {
  if (side === "right") {
    return (
      <svg
        width="8"
        height="12"
        viewBox="0 0 8 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`absolute -bottom-[1px] -right-[7px] pointer-events-none ${className}`}
        aria-hidden="true"
      >
        {/*
          Right tail: attaches to bottom-right corner.
          The shape curves from the bubble bottom-right corner outward.
        */}
        <path d="M0 12 C0 12 0 0 8 0 C8 0 4 2 3 6 C2 10 0 12 0 12Z" fill={color} />
      </svg>
    );
  }

  return (
    <svg
      width="8"
      height="12"
      viewBox="0 0 8 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`absolute -bottom-[1px] -left-[7px] pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {/*
        Left tail: mirrors the right tail horizontally.
      */}
      <path d="M8 12 C8 12 8 0 0 0 C0 0 4 2 5 6 C6 10 8 12 8 12Z" fill={color} />
    </svg>
  );
});
