import { useState } from "react";
import { motion } from "framer-motion";
import { useGifts } from "@/hooks/useGifts";

interface GiftMessageProps {
  sentGiftId: string;
  giftId: string;
  giftEmoji: string;
  giftName: string;
  giftRarity: "common" | "rare" | "epic" | "legendary";
  starsSpent: number;
  senderName: string;
  messageText?: string | null;
  isOwn: boolean;
  isOpened: boolean;
  isRecipient: boolean;
  onOpen?: () => void;
}

const RARITY_BORDER_STYLE: Record<string, React.CSSProperties> = {
  common: { border: "2px solid rgba(156,163,175,0.5)" },
  rare: { border: "2px solid rgba(59,130,246,0.7)" },
  epic: { border: "2px solid", borderImage: "linear-gradient(135deg, #a855f7, #ec4899) 1" },
  legendary: {
    border: "2px solid",
    borderImage: "linear-gradient(135deg, #fbbf24, #f59e0b, #f97316) 1",
    boxShadow: "0 0 24px rgba(251,191,36,0.3)",
  },
};

const RARITY_BG: Record<string, string> = {
  common: "bg-white/5",
  rare: "bg-blue-500/5",
  epic: "bg-purple-500/8",
  legendary: "bg-amber-400/8",
};

export function GiftMessage({
  sentGiftId,
  giftEmoji,
  giftName,
  giftRarity,
  starsSpent,
  senderName,
  messageText,
  isOwn,
  isOpened,
  isRecipient,
  onOpen,
}: GiftMessageProps) {
  const { openGift } = useGifts();
  const [opening, setOpening] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const handleOpen = async () => {
    if (opening || isOpened) return;
    setOpening(true);
    try {
      await openGift(sentGiftId);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
      onOpen?.();
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className={`flex flex-col items-center my-2 relative ${isOwn ? "items-end" : "items-start"} w-full`}>
      {showConfetti && <ConfettiEffect />}

      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 16, stiffness: 200 }}
        className={`flex flex-col items-center p-5 rounded-3xl max-w-[220px] ${RARITY_BG[giftRarity]} backdrop-blur-xl`}
        style={RARITY_BORDER_STYLE[giftRarity]}
      >
        {/* Emoji */}
        <motion.div
          animate={!isOpened ? { y: [0, -6, 0] } : {}}
          transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1 }}
          className="text-7xl mb-3 select-none"
        >
          {giftEmoji}
        </motion.div>

        {/* Gift info */}
        <p className="text-white font-bold text-base text-center">{giftName}</p>
        <p className="text-amber-400 text-xs mt-0.5">⭐ {starsSpent}</p>

        {/* Sender label */}
        <p className="text-white/40 text-xs mt-2 text-center">
          {isOwn ? "Вы отправили подарок" : `🎁 ${senderName} отправил подарок`}
        </p>

        {/* Message text */}
        {messageText && (
          <p className="text-white/70 text-sm mt-2 text-center italic">&ldquo;{messageText}&rdquo;</p>
        )}

        {/* Open button */}
        {!isOwn && isRecipient && !isOpened && (
          <button
            onClick={handleOpen}
            disabled={opening}
            className="mt-3 px-5 py-2 rounded-full text-black text-sm font-bold active:scale-95 transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
          >
            {opening ? "Открывается…" : "Открыть 🎊"}
          </button>
        )}

        {!isOwn && isRecipient && isOpened && (
          <p className="mt-2 text-green-400 text-xs">✓ Открыт</p>
        )}
      </motion.div>
    </div>
  );
}

const CONFETTI_COLORS = ["#fbbf24", "#f59e0b", "#a855f7", "#3b82f6", "#ec4899", "#10b981"];
const CONFETTI_PIECES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  left: (i * 4.17).toFixed(1) + "%",
  yEnd: 120 + (i % 4) * 20,
  xEnd: ((i % 5) - 2) * 30,
  rot: (i * 15) % 360,
  dur: 1.2 + (i % 4) * 0.2,
}));

function ConfettiEffect() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {CONFETTI_PIECES.map((p) => (
        <motion.div
          key={p.id}
          className="absolute w-2 h-2 rounded-sm"
          style={{ backgroundColor: p.color, left: p.left, top: "10%" }}
          initial={{ y: 0, x: 0, opacity: 1, rotate: 0 }}
          animate={{ y: p.yEnd, x: p.xEnd, opacity: 0, rotate: p.rot }}
          transition={{ duration: p.dur, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
