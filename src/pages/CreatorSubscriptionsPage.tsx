/**
 * @file src/pages/CreatorSubscriptionsPage.tsx
 * @description Платные подписки на авторов — Instagram Subscriptions стиль.
 *
 * Архитектура:
 * - Автор настраивает цену подписки (от $0.99/мес)
 * - Подписчики получают доступ к эксклюзивному контенту
 * - Эксклюзивный контент: посты с audience='subscribers'
 * - Управление подписками: список активных, история платежей
 * - Монетизация: 70% автору, 30% платформе (стандарт)
 */

import { useState, useEffect, useCallback } from "react";
import { Crown, Star, Users, DollarSign, Lock, Check, ChevronRight, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";

interface SubscriptionTier {
  id: string;
  creator_id: string;
  name: string;
  price_monthly: number;
  currency: string;
  benefits: string[];
  subscriber_count: number;
}

interface CreatorProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  subscriber_count: number;
}

interface CreatorSubscriptionRow {
  id?: string;
  started_at?: string;
  price_monthly?: number | null;
  profiles?: {
    username?: string | null;
    avatar_url?: string | null;
  };
}

interface ErrorWithMessage {
  message?: string;
}

export default function CreatorSubscriptionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { creatorId } = useParams<{ creatorId: string }>();
  const isOwnPage = !creatorId || creatorId === user?.id;

  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [mySubscription, setMySubscription] = useState<CreatorSubscriptionRow | null>(null);
  const [mySubscribers, setMySubscribers] = useState<CreatorSubscriptionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [totalEarnings, setTotalEarnings] = useState(0);

  const targetId = creatorId ?? user?.id;

  const loadData = useCallback(async (id: string) => {
    setIsLoading(true);
    const db = dbLoose;

    // Профиль
    const { data: profile } = await db
      .from("profiles")
      .select("id, username, avatar_url, bio")
      .eq("id", id)
      .single();

    if (profile) {
      const profileRow = profile as { id?: unknown; username?: unknown; avatar_url?: unknown; bio?: unknown };
      setCreator({
        id: String(profileRow.id ?? ""),
        username: String(profileRow.username ?? ""),
        avatar_url: typeof profileRow.avatar_url === "string" ? profileRow.avatar_url : null,
        bio: typeof profileRow.bio === "string" ? profileRow.bio : null,
        subscriber_count: 0,
      });
    }

    // Тарифы (пока используем дефолтный)
    const defaultTiers: SubscriptionTier[] = [
      {
        id: "tier_1",
        creator_id: id,
        name: "Подписчик",
        price_monthly: 0.99,
        currency: "USD",
        benefits: [
          "Эксклюзивные посты",
          "Значок подписчика",
          "Приоритетные ответы",
        ],
        subscriber_count: 0,
      },
      {
        id: "tier_2",
        creator_id: id,
        name: "Фанат",
        price_monthly: 4.99,
        currency: "USD",
        benefits: [
          "Всё из уровня Подписчик",
          "Эксклюзивные Stories",
          "Прямые сообщения",
          "Ранний доступ к контенту",
        ],
        subscriber_count: 0,
      },
    ];
    setTiers(defaultTiers);

    // Моя подписка
    if (user && !isOwnPage) {
      const { data: sub } = await db
        .from("creator_subscriptions")
        .select("*")
        .eq("creator_id", id)
        .eq("subscriber_id", user.id)
        .eq("status", "active")
        .single();
      setMySubscription(sub);
    }

    // Мои подписчики (для владельца)
    if (isOwnPage && user) {
      const { data: subs } = await db
        .from("creator_subscriptions")
        .select("*, profiles:subscriber_id(username, avatar_url)")
        .eq("creator_id", user.id)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(20);
      setMySubscribers((subs ?? []) as CreatorSubscriptionRow[]);

      // Подсчёт заработка
      const total = ((subs ?? []) as CreatorSubscriptionRow[]).reduce((sum: number, s) => sum + (s.price_monthly ?? 0), 0);
      setTotalEarnings(total);
    }

    setIsLoading(false);
  }, [isOwnPage, user]);

  useEffect(() => {
    if (targetId) void loadData(targetId);
  }, [targetId, loadData]);

  const handleSubscribe = async (tier: SubscriptionTier) => {
    if (!user || !targetId) return;
    setSubscribing(tier.id);
    const db = dbLoose;

    try {
      const { error } = await db.from("creator_subscriptions").upsert(
        {
          creator_id: targetId,
          subscriber_id: user.id,
          price_monthly: tier.price_monthly,
          currency: tier.currency,
          status: "active",
          started_at: new Date().toISOString(),
        },
        { onConflict: "creator_id,subscriber_id" }
      );
      if (error) throw error;
      toast.success(`Подписка оформлена! ${tier.price_monthly}$/мес`);
      setMySubscription({ price_monthly: tier.price_monthly });
    } catch (err) {
      const apiError = err as ErrorWithMessage;
      toast.error(apiError.message ?? "Ошибка оформления подписки");
    } finally {
      setSubscribing(null);
    }
  };

  const handleUnsubscribe = async () => {
    if (!user || !targetId) return;
    const db = dbLoose;
    const { error } = await db
      .from("creator_subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("creator_id", targetId)
      .eq("subscriber_id", user.id);
    if (error) { toast.error("Ошибка"); return; }
    toast.success("Подписка отменена");
    setMySubscription(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Шапка */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)}>
          <ArrowLeft className="w-6 h-6" />
        </button>
        <span className="font-semibold">
          {isOwnPage ? "Мои подписчики" : "Подписка"}
        </span>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Профиль автора */}
        {creator && (
          <div className="flex flex-col items-center gap-3 mb-8">
            <Avatar className="w-20 h-20">
              <AvatarImage src={creator.avatar_url ?? undefined} />
              <AvatarFallback className="text-2xl">
                {creator.username?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <h1 className="text-xl font-bold">{creator.username}</h1>
              {creator.bio && (
                <p className="text-sm text-muted-foreground mt-1">{creator.bio}</p>
              )}
            </div>
          </div>
        )}

        {/* Статистика для владельца */}
        {isOwnPage && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-muted/30 rounded-2xl p-4 text-center">
              <Users className="w-6 h-6 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold">{mySubscribers.length}</p>
              <p className="text-xs text-muted-foreground">Подписчиков</p>
            </div>
            <div className="bg-muted/30 rounded-2xl p-4 text-center">
              <DollarSign className="w-6 h-6 mx-auto mb-1 text-green-500" />
              <p className="text-2xl font-bold">${totalEarnings.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">В месяц</p>
            </div>
            <div className="bg-muted/30 rounded-2xl p-4 text-center">
              <Star className="w-6 h-6 mx-auto mb-1 text-yellow-500" />
              <p className="text-2xl font-bold">70%</p>
              <p className="text-xs text-muted-foreground">Ваша доля</p>
            </div>
          </div>
        )}

        {/* Активная подписка */}
        {mySubscription && !isOwnPage && (
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mb-6 flex items-center gap-3">
            <Crown className="w-6 h-6 text-primary" />
            <div className="flex-1">
              <p className="font-semibold text-sm">Вы подписаны</p>
              <p className="text-xs text-muted-foreground">${mySubscription.price_monthly}/мес</p>
            </div>
            <button
              onClick={handleUnsubscribe}
              className="text-xs text-destructive"
            >
              Отменить
            </button>
          </div>
        )}

        {/* Тарифы */}
        {!isOwnPage && !mySubscription && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-bold">Выберите план</h2>
            {tiers.map((tier, i) => (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={cn(
                  "border-2 rounded-2xl p-5 cursor-pointer transition-all",
                  i === 1 ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                {i === 1 && (
                  <div className="flex items-center gap-1 mb-2">
                    <Crown className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-primary uppercase">Популярный</span>
                  </div>
                )}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-lg">{tier.name}</h3>
                  <div className="text-right">
                    <span className="text-2xl font-bold">${tier.price_monthly}</span>
                    <span className="text-sm text-muted-foreground">/мес</span>
                  </div>
                </div>
                <ul className="flex flex-col gap-2 mb-4">
                  {tier.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                      {benefit}
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => handleSubscribe(tier)}
                  disabled={subscribing === tier.id}
                  className="w-full"
                  variant={i === 1 ? "default" : "outline"}
                >
                  {subscribing === tier.id ? "Оформление..." : `Подписаться за $${tier.price_monthly}/мес`}
                </Button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Список подписчиков для владельца */}
        {isOwnPage && mySubscribers.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-4">Подписчики</h2>
            <div className="flex flex-col gap-3">
              {mySubscribers.map((sub) => (
                <div key={sub.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={sub.profiles?.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {sub.profiles?.username?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{sub.profiles?.username}</p>
                    <p className="text-xs text-muted-foreground">
                      с {sub.started_at ? new Date(sub.started_at).toLocaleDateString("ru") : "—"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-green-500">
                    ${sub.price_monthly}/мес
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isOwnPage && mySubscribers.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Lock className="w-12 h-12 text-muted-foreground" />
            <p className="text-muted-foreground text-center">
              У вас пока нет подписчиков.<br />
              Создавайте эксклюзивный контент для привлечения аудитории.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
