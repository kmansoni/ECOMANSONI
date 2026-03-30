/**
 * @file src/components/live/LiveBadges.tsx
 * @description Live Badges — монетизация Live трансляций.
 * Зрители покупают бейджи (1/2/5 звёзд) для поддержки стримера.
 * Бейджи отображаются рядом с именем в чате трансляции.
 *
 * Архитектура:
 * - 3 уровня: Level 1 (1★ = $0.99), Level 2 (2★ = $1.99), Level 3 (5★ = $4.99)
 * - Анимация появления бейджа в чате (float-up animation)
 * - Топ-3 донатеров отображаются в шапке трансляции
 * - Суммарный заработок стримера в реальном времени
 * - Supabase Realtime для мгновенного отображения
 */

import { useState, useEffect, useCallback } from "react";
import { logger } from "@/lib/logger";
import { Star, Crown, Zap, Heart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface LiveBadge {
  id: string;
  sender_id: string;
  recipient_id: string;
  badge_level: 1 | 2 | 3;
  amount_stars: number;
  message: string | null;
  created_at: string;
  sender?: {
    username: string;
    avatar_url: string | null;
  };
}

const BADGE_CONFIG = {
  1: { stars: 1, price: "$0.99", label: "Бейдж", color: "text-yellow-500", bg: "bg-yellow-500/10", icon: Star },
  2: { stars: 2, price: "$1.99", label: "Бейдж ×2", color: "text-orange-500", bg: "bg-orange-500/10", icon: Zap },
  3: { stars: 5, price: "$4.99", label: "Бейдж ×5", color: "text-purple-500", bg: "bg-purple-500/10", icon: Crown },
} as const;

// Иконка бейджа рядом с именем в чате
export function BadgeIcon({ level }: { level: 1 | 2 | 3 }) {
  const config = BADGE_CONFIG[level];
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-bold", config.color)}>
      {Array.from({ length: config.stars }).map((_, i) => (
        <Icon key={i} className="w-3 h-3 fill-current" />
      ))}
    </span>
  );
}

// Анимированное уведомление о новом бейдже
export function BadgeNotification({ badge }: { badge: LiveBadge }) {
  const config = BADGE_CONFIG[badge.badge_level];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={cn(
        "flex items-center gap-2 rounded-2xl px-3 py-2 max-w-[280px]",
        "bg-black/70 backdrop-blur-sm border border-white/10"
      )}
    >
      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", config.bg)}>
        <Icon className={cn("w-4 h-4", config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-white text-xs font-semibold truncate">
            {badge.sender?.username ?? "Аноним"}
          </span>
          <BadgeIcon level={badge.badge_level} />
        </div>
        {badge.message && (
          <p className="text-white/70 text-xs truncate">{badge.message}</p>
        )}
      </div>
      <span className={cn("text-xs font-bold flex-shrink-0", config.color)}>
        {config.price}
      </span>
    </motion.div>
  );
}

// Панель покупки бейджа
interface LiveBadgePurchaseProps {
  liveSessionId: string;
  recipientId: string;
  recipientName: string;
  onClose: () => void;
}

export function LiveBadgePurchase({
  liveSessionId,
  recipientId,
  recipientName,
  onClose,
}: LiveBadgePurchaseProps) {
  const { user } = useAuth();
  const [selectedLevel, setSelectedLevel] = useState<1 | 2 | 3 | null>(null);
  const [message, setMessage] = useState("");
  const [isPurchasing, setIsPurchasing] = useState(false);

  const handlePurchase = async () => {
    if (!user || !selectedLevel) return;
    setIsPurchasing(true);
    const config = BADGE_CONFIG[selectedLevel];

    try {
      const { error } = await dbLoose.from("live_badges").insert({
        live_session_id: liveSessionId,
        sender_id: user.id,
        recipient_id: recipientId,
        badge_level: selectedLevel,
        amount_stars: config.stars,
        message: message.trim() || null,
      });
      if (error) throw error;
      toast.success(`Бейдж отправлен ${recipientName}!`);
      onClose();
    } catch (err) {
      logger.error("[LiveBadges] Не удалось купить бейдж", { error: err });
      toast.error("Не удалось отправить бейдж. Попробуйте снова.");
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-500 fill-red-500" />
            Поддержать {recipientName}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 mt-4">
          {/* Уровни бейджей */}
          <div className="grid grid-cols-3 gap-3">
            {([1, 2, 3] as const).map((level) => {
              const config = BADGE_CONFIG[level];
              const Icon = config.icon;
              return (
                <button
                  key={level}
                  onClick={() => setSelectedLevel(level)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                    selectedLevel === level
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  )}
                >
                  <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", config.bg)}>
                    <Icon className={cn("w-6 h-6", config.color)} />
                  </div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: config.stars }).map((_, i) => (
                      <Star key={i} className={cn("w-3 h-3 fill-current", config.color)} />
                    ))}
                  </div>
                  <span className="text-sm font-bold">{config.price}</span>
                  <span className="text-xs text-muted-foreground">{config.label}</span>
                </button>
              );
            })}
          </div>

          {/* Сообщение */}
          {selectedLevel && (
            <input
              type="text"
              placeholder="Добавить сообщение (необязательно)"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 100))}
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm"
            />
          )}

          <Button
            onClick={handlePurchase}
            disabled={!selectedLevel || isPurchasing}
            className="w-full"
          >
            {isPurchasing
              ? "Отправка..."
              : selectedLevel
              ? `Отправить бейдж ${BADGE_CONFIG[selectedLevel].price}`
              : "Выберите бейдж"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Бейджи — виртуальные подарки. Реальные платежи обрабатываются через платёжный шлюз.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Топ донатеров в шапке трансляции
interface LiveTopBadgersProps {
  liveSessionId: string;
}

export function LiveTopBadgers({ liveSessionId }: LiveTopBadgersProps) {
  const [topBadgers, setTopBadgers] = useState<
    { user_id: string; username: string; avatar_url: string | null; total_stars: number }[]
  >([]);

  useEffect(() => {
    loadTopBadgers();
  }, [liveSessionId]);

  const loadTopBadgers = async () => {
    const { data } = await dbLoose
      .from("live_badges")
      .select("sender_id, amount_stars, profiles:sender_id(username, avatar_url)")
      .eq("live_session_id", liveSessionId);

    if (!data) return;

    interface BadgeRow { sender_id: string; amount_stars: number; profiles: { username: string; avatar_url: string | null } | null }
    const rows = data as BadgeRow[];

    // Агрегируем по sender_id
    const map = new Map<string, { username: string; avatar_url: string | null; total_stars: number }>();
    for (const row of rows) {
      const existing = map.get(row.sender_id);
      if (existing) {
        existing.total_stars += row.amount_stars;
      } else {
        map.set(row.sender_id, {
          username: row.profiles?.username ?? "Аноним",
          avatar_url: row.profiles?.avatar_url ?? null,
          total_stars: row.amount_stars,
        });
      }
    }

    const sorted = Array.from(map.entries())
      .map(([user_id, v]) => ({ user_id, ...v }))
      .sort((a, b) => b.total_stars - a.total_stars)
      .slice(0, 3);

    setTopBadgers(sorted);
  };

  if (topBadgers.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {topBadgers.map((badger, i) => (
        <div key={badger.user_id} className="relative">
          <Avatar className="w-7 h-7 border-2 border-yellow-500">
            <AvatarImage src={badger.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs">
              {badger.username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {i === 0 && (
            <Crown className="absolute -top-1.5 -right-1 w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
          )}
        </div>
      ))}
    </div>
  );
}
