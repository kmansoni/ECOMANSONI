/**
 * PremiumPage — страница Premium подписки.
 * 3 плана, чеклист фич, текущий план, подписка/смена.
 */

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Crown, Check, X, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePremium, type PlanType } from "@/hooks/usePremium";
import { PremiumBadge } from "@/components/premium/PremiumBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface PlanCard {
  plan: PlanType;
  name: string;
  price: string;
  gradient: string;
  borderColor: string;
}

const PLANS: PlanCard[] = [
  {
    plan: "basic",
    name: "Basic",
    price: "99₽/мес",
    gradient: "from-blue-500 to-blue-600",
    borderColor: "border-blue-500/40",
  },
  {
    plan: "pro",
    name: "Pro",
    price: "299₽/мес",
    gradient: "from-amber-500 to-yellow-500",
    borderColor: "border-amber-500/40",
  },
  {
    plan: "business",
    name: "Business",
    price: "699₽/мес",
    gradient: "from-purple-500 to-violet-600",
    borderColor: "border-purple-500/40",
  },
];

export function PremiumPage() {
  const navigate = useNavigate();
  const { subscription, isPremium, features, subscribe, cancelSubscription, loading } = usePremium();
  const [subscribingTo, setSubscribingTo] = useState<PlanType | null>(null);

  const handleSubscribe = useCallback(
    async (plan: PlanType) => {
      setSubscribingTo(plan);
      await subscribe(plan);
      setSubscribingTo(null);
    },
    [subscribe],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Skeleton className="h-8 w-40 mb-6" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-white/10">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Назад"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Crown className="w-6 h-6 text-amber-400" />
          <h1 className="text-lg font-bold">Premium</h1>
          {isPremium && subscription && <PremiumBadge plan={subscription.plan} />}
        </div>
      </div>

      <div className="px-4 pt-6 space-y-6 max-w-lg mx-auto">
        {/* Current subscription */}
        {isPremium && subscription && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 to-purple-500/10 border border-amber-500/20"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Текущий план</p>
                <p className="text-lg font-bold">{subscription.plan.toUpperCase()}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  {subscription.auto_renew ? "Продление" : "Истекает"}
                </p>
                <p className="text-sm">{new Date(subscription.expires_at).toLocaleDateString("ru-RU")}</p>
              </div>
            </div>
            {subscription.auto_renew && (
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelSubscription}
                className="mt-2 text-xs text-destructive/70 hover:text-destructive min-h-[44px]"
              >
                Отменить подписку
              </Button>
            )}
          </motion.div>
        )}

        {/* Plan cards */}
        {PLANS.map((p, idx) => {
          const isCurrent = subscription?.plan === p.plan;
          const isUpgrade = subscription ? (
            PLANS.findIndex((x) => x.plan === subscription.plan) < idx
          ) : false;

          return (
            <motion.div
              key={p.plan}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`rounded-2xl border p-5 ${
                isCurrent ? `${p.borderColor} ring-2 ring-offset-2 ring-offset-background` : "border-white/10"
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`px-3 py-1 rounded-full bg-gradient-to-r ${p.gradient} text-white text-sm font-bold`}>
                    {p.name}
                  </div>
                  {isCurrent && (
                    <span className="text-xs text-muted-foreground">текущий</span>
                  )}
                </div>
                <span className="text-lg font-bold">{p.price}</span>
              </div>

              {/* Features checklist */}
              <ul className="space-y-2 mb-4">
                {features.map((f) => {
                  const included = (() => {
                    const order: Record<PlanType, number> = { basic: 1, pro: 2, business: 3 };
                    return order[p.plan] >= order[f.min_plan];
                  })();

                  return (
                    <li key={f.slug} className="flex items-center gap-2 text-sm">
                      {included ? (
                        <Check className="w-4 h-4 text-green-400 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                      )}
                      <span className={included ? "" : "text-muted-foreground/50"}>
                        {f.name}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {!isCurrent && (
                <Button
                  onClick={() => handleSubscribe(p.plan)}
                  disabled={subscribingTo !== null}
                  className={`w-full min-h-[48px] bg-gradient-to-r ${p.gradient} text-white hover:opacity-90`}
                  aria-label={`Подписаться на ${p.name}`}
                >
                  {subscribingTo === p.plan ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  {isUpgrade ? "Улучшить" : "Подписаться"}
                </Button>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
