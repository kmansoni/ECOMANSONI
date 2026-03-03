import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertCircle } from "lucide-react";
import { useGifts, GiftCatalogItem } from "@/hooks/useGifts";
import { useStars } from "@/hooks/useStars";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { toast } from "sonner";

interface GiftCatalogProps {
  open: boolean;
  onClose: () => void;
  recipientId: string;
  recipientName: string;
  recipientAvatar?: string | null;
  conversationId: string;
  onGiftSent?: (giftEmoji: string, giftName: string, sentGiftId: string) => void;
}

type Category = "all" | "general" | "premium";

const RARITY_BORDER: Record<string, string> = {
  common: "border-gray-500/50",
  rare: "border-blue-500/70",
  epic: "border-purple-500/70",
  legendary: "border-yellow-400/80",
};

const RARITY_LABEL: Record<string, string> = {
  common: "Обычный",
  rare: "Редкий",
  epic: "Эпический",
  legendary: "Легендарный",
};

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "general", label: "Популярные" },
  { key: "premium", label: "Премиум" },
];

export function GiftCatalog({
  open,
  onClose,
  recipientId,
  recipientName,
  recipientAvatar,
  conversationId,
  onGiftSent,
}: GiftCatalogProps) {
  const { catalog, sendGift } = useGifts();
  const { balance, refetch: refetchStars } = useStars();
  const [category, setCategory] = useState<Category>("all");
  const [selectedGift, setSelectedGift] = useState<GiftCatalogItem | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

  const filtered = useMemo(() => {
    if (category === "all") return catalog;
    return catalog.filter((g) => g.category === category);
  }, [catalog, category]);

  const handleSend = async () => {
    if (!selectedGift) return;
    setSending(true);
    try {
      const result = await sendGift({
        recipientId,
        giftId: selectedGift.id,
        conversationId,
        messageText: messageText.trim() || undefined,
      });
      if (!result.ok) {
        if (result.error === "insufficient_stars") {
          toast.error("Недостаточно звёзд", {
            description: `Нужно ${selectedGift.price_stars} ⭐, у вас ${balance} ⭐`,
          });
        } else {
          toast.error("Не удалось отправить подарок");
        }
        return;
      }
      toast.success(`Подарок «${selectedGift.name}» отправлен! ${selectedGift.emoji}`);
      refetchStars();
      onGiftSent?.(result.giftEmoji!, result.giftName!, result.sentGiftId!);
      setSelectedGift(null);
      setMessageText("");
      onClose();
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => {
          if (selectedGift) setSelectedGift(null);
          else onClose();
        }}
      />

      {/* Confirmation modal */}
      {selectedGift && (
        <motion.div
          key="confirm"
          className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[310] rounded-3xl overflow-hidden"
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.85, opacity: 0 }}
        >
          <div className="bg-[#1a1a24] border border-white/10 p-6">
            <div className="text-center mb-4">
              <motion.div
                animate={{ scale: [1, 1.15, 1], rotate: [0, -6, 6, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 2 }}
                className="text-7xl mb-3"
              >
                {selectedGift.emoji}
              </motion.div>
              <h3 className="text-white font-bold text-xl">{selectedGift.name}</h3>
              <p className="text-white/50 text-sm mt-1">{selectedGift.description}</p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="text-amber-400 font-bold">⭐ {selectedGift.price_stars}</span>
                <span className="text-white/30 text-xs">•</span>
                <span className="text-white/50 text-xs">{RARITY_LABEL[selectedGift.rarity]}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 mb-4">
              <GradientAvatar name={recipientName} seed={recipientId} avatarUrl={recipientAvatar} size="sm" />
              <div>
                <p className="text-white/50 text-xs">Получатель</p>
                <p className="text-white text-sm font-medium">{recipientName}</p>
              </div>
            </div>

            <input
              type="text"
              placeholder="Сопроводительное сообщение (необязательно)"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 text-sm outline-none mb-4"
              maxLength={200}
            />

            {balance < selectedGift.price_stars && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-4">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-red-300 text-sm">
                  Недостаточно звёзд. Нужно {selectedGift.price_stars} ⭐, у вас {balance} ⭐
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedGift(null)}
                className="flex-1 py-3 rounded-xl bg-white/10 text-white text-sm font-medium"
              >
                Отмена
              </button>
              <button
                onClick={handleSend}
                disabled={sending || balance < selectedGift.price_stars}
                className="flex-1 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition-all"
                style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}
              >
                {sending ? "Отправка…" : `Отправить ⭐ ${selectedGift.price_stars}`}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Catalog sheet */}
      {!selectedGift && (
        <motion.div
          key="catalog"
          className="fixed bottom-0 left-0 right-0 z-[301] rounded-t-3xl overflow-hidden flex flex-col"
          style={{ maxHeight: "80vh" }}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
        >
          <div className="bg-[#1a1a24] border-t border-white/10 flex flex-col" style={{ maxHeight: "80vh" }}>
            {/* Header */}
            <div className="px-4 pt-4 pb-3 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <GradientAvatar name={recipientName} seed={recipientId} avatarUrl={recipientAvatar} size="sm" />
                  <div>
                    <p className="text-white/50 text-xs">Отправить подарок</p>
                    <p className="text-white font-semibold text-sm">{recipientName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 text-sm font-bold">⭐ {balance}</span>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white/70" />
                  </button>
                </div>
              </div>

              {/* Categories */}
              <div className="flex gap-2 pb-1">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setCategory(c.key)}
                    className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                      category === c.key
                        ? "bg-amber-400 text-black"
                        : "bg-white/10 text-white/70"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid */}
            <div className="overflow-y-auto flex-1 px-4 pb-6">
              <div className="grid grid-cols-3 gap-3">
                {filtered.map((gift) => (
                  <motion.button
                    key={gift.id}
                    onClick={() => setSelectedGift(gift)}
                    whileTap={{ scale: 0.92 }}
                    className={`flex flex-col items-center p-3 rounded-2xl bg-white/5 border-2 ${RARITY_BORDER[gift.rarity]} hover:bg-white/10 transition-all`}
                  >
                    <span className="text-4xl mb-2">{gift.emoji}</span>
                    <p className="text-white text-xs font-medium text-center leading-tight">{gift.name}</p>
                    <p className="text-amber-400 text-xs mt-1">⭐ {gift.price_stars}</p>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </>
  );
}
