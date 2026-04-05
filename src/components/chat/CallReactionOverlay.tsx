import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const CALL_REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "👏", "😮"] as const;

export interface CallReaction {
  id: string;
  emoji: string;
  senderName: string;
  x: number; // 0-100 viewport percent
}

interface OverlayProps {
  reactions: CallReaction[];
  onExpired: (id: string) => void;
}

const ANIM_DURATION = 2200;

export function CallReactionOverlay({ reactions, onExpired }: OverlayProps) {
  return (
    <div className="fixed inset-0 z-40 pointer-events-none overflow-hidden">
      {reactions.map(r => (
        <FloatingEmoji key={r.id} reaction={r} onDone={() => onExpired(r.id)} />
      ))}
    </div>
  );
}

function FloatingEmoji({ reaction, onDone }: { reaction: CallReaction; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // trigger CSS transition on next frame
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(onDone, ANIM_DURATION);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      ref={ref}
      className={cn(
        "absolute flex flex-col items-center transition-all ease-out",
        visible ? "opacity-0 -translate-y-32" : "opacity-100 translate-y-0",
      )}
      style={{
        left: `${reaction.x}%`,
        bottom: "15%",
        transitionDuration: `${ANIM_DURATION}ms`,
      }}
    >
      <span className="text-4xl drop-shadow-lg select-none">{reaction.emoji}</span>
      <span className="text-xs text-white/80 font-medium mt-0.5 drop-shadow whitespace-nowrap">
        {reaction.senderName}
      </span>
    </div>
  );
}

// Picker — горизонтальная строка emoji над кнопкой
interface PickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionPicker({ onSelect, onClose }: PickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 flex gap-1 bg-zinc-800/90 backdrop-blur rounded-full px-2 py-1.5 shadow-xl"
    >
      {CALL_REACTION_EMOJIS.map(emoji => (
        <button
          key={emoji}
          onClick={() => { onSelect(emoji); onClose(); }}
          className="text-2xl hover:scale-125 active:scale-95 transition-transform p-0.5"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
