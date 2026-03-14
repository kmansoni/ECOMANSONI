/**
 * DriverEarningsPanel — статистика заработка водителя за смену/неделю/месяц.
 *
 * Функционал из анализа крупных агрегаторов:
 *   Uber Driver: ежедневная статистика + Quests (бонусы за N поездок)
 *   Яндекс Go: ставка + бонусы + рейтинговые достижения
 *   Bolt: цели смены с прогресс-баром
 *
 * Компонент показывает:
 *   - Текущая смена: заработок, поездки, время онлайн
 *   - Недельная статистика
 *   - Рейтинг-прогресс (достижения)
 *   - Goal tracker (N поездок за смену = бонус)
 */

import { useCallback, useEffect, useState } from "react";
import {
  Award,
  Clock,
  Star,
  TrendingUp,
  Zap,
} from "lucide-react";
import { supabase as _supabase } from "@/lib/supabase";
import type { DriverProfile } from "@/types/taxi";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

interface EarningsData {
  todayEarnings: number;
  todayTrips: number;
  todayOnlineMinutes: number;
  weekEarnings: number;
  weekTrips: number;
  avgRatingThisWeek: number;
  bonusGoal: { target: number; current: number; bonus: number };
}

interface DriverEarningsPanelProps {
  driverProfile: DriverProfile;
}

export function DriverEarningsPanel({ driverProfile }: DriverEarningsPanelProps) {
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadEarnings = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [todayRes, weekRes, ratingRes] = await Promise.all([
        // Today's completed rides
        supabase
          .from("taxi_rides")
          .select("final_price, completed_at")
          .eq("driver_id", driverProfile.driverId)
          .eq("status", "completed")
          .gte("completed_at", today.toISOString()),

        // Week's rides
        supabase
          .from("taxi_rides")
          .select("final_price, completed_at")
          .eq("driver_id", driverProfile.driverId)
          .eq("status", "completed")
          .gte("completed_at", weekAgo.toISOString()),

        // Week's ratings
        supabase
          .from("taxi_ratings")
          .select("rating")
          .eq("ratee_id", driverProfile.userId)
          .eq("rater_role", "passenger")
          .gte("created_at", weekAgo.toISOString()),
      ]);

      const todayTrips = (todayRes.data ?? []) as Array<{ final_price: number }>;
      const weekTrips  = (weekRes.data ?? [])  as Array<{ final_price: number }>;
      const weekRatings= (ratingRes.data ?? []) as Array<{ rating: number }>;

      const todayCount   = todayTrips.length;
      const todayEarned  = todayTrips.reduce((s: number, r: { final_price: number }) => s + (r.final_price ?? 0), 0);
      const weekCount    = weekTrips.length;
      const weekEarned   = weekTrips.reduce((s: number, r: { final_price: number }) => s + (r.final_price ?? 0), 0);
      const avgRating    = weekRatings.length > 0
        ? weekRatings.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / weekRatings.length
        : driverProfile.rating;

      // Online time estimate from shift start
      const onlineMin = driverProfile.onlineAt
        ? Math.floor((Date.now() - new Date(driverProfile.onlineAt).getTime()) / 60_000)
        : 0;

      // Bonus goal: 10 trips this shift = +500₽ bonus
      const GOAL_TRIPS = 10;
      const GOAL_BONUS = 500;

      setEarnings({
        todayEarnings: todayEarned,
        todayTrips: todayCount,
        todayOnlineMinutes: onlineMin,
        weekEarnings: weekEarned,
        weekTrips: weekCount,
        avgRatingThisWeek: avgRating,
        bonusGoal: { target: GOAL_TRIPS, current: driverProfile.shiftTrips, bonus: GOAL_BONUS },
      });
    } catch {
      // Show profile fallback
      setEarnings({
        todayEarnings: driverProfile.shiftEarnings,
        todayTrips: driverProfile.shiftTrips,
        todayOnlineMinutes: 0,
        weekEarnings: driverProfile.shiftEarnings,
        weekTrips: driverProfile.shiftTrips,
        avgRatingThisWeek: driverProfile.rating,
        bonusGoal: { target: 10, current: driverProfile.shiftTrips, bonus: 500 },
      });
    } finally {
      setLoading(false);
    }
  }, [driverProfile]);

  useEffect(() => { void loadEarnings(); }, [loadEarnings]);

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 animate-pulse">
        <div className="h-4 bg-zinc-800 rounded w-1/2 mb-3" />
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-zinc-800 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!earnings) return null;

  const goalPercent = Math.min(100, (earnings.bonusGoal.current / earnings.bonusGoal.target) * 100);
  const hours = Math.floor(earnings.todayOnlineMinutes / 60);
  const mins  = earnings.todayOnlineMinutes % 60;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-green-400" />
        <span className="text-white font-semibold text-sm">Заработок</span>
      </div>

      {/* Today stats */}
      <div className="px-4 pb-3 grid grid-cols-3 gap-2">
        <Stat
          icon={<TrendingUp className="w-4 h-4 text-green-400" />}
          label="Сегодня"
          value={`${earnings.todayEarnings.toLocaleString()} ₽`}
          accent="green"
        />
        <Stat
          icon={<Zap className="w-4 h-4 text-blue-400" />}
          label="Поездок"
          value={String(earnings.todayTrips)}
          accent="blue"
        />
        <Stat
          icon={<Clock className="w-4 h-4 text-zinc-400" />}
          label="Онлайн"
          value={hours > 0 ? `${hours}ч ${mins}м` : `${mins}м`}
          accent="default"
        />
      </div>

      {/* Bonus goal — Uber Quest style */}
      <div className="mx-4 mb-3 p-3 bg-zinc-800/60 rounded-lg border border-zinc-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-yellow-400" />
            <span className="text-white text-xs font-medium">
              Цель смены: {earnings.bonusGoal.target} поездок
            </span>
          </div>
          <span className="text-yellow-400 text-xs font-bold">
            +{earnings.bonusGoal.bonus} ₽
          </span>
        </div>
        <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 rounded-full transition-all duration-500"
            style={{ width: `${goalPercent}%` }}
          />
        </div>
        <p className="text-zinc-500 text-xs mt-1">
          {earnings.bonusGoal.current}/{earnings.bonusGoal.target} поездок ({Math.round(goalPercent)}%)
        </p>
      </div>

      {/* Week + rating */}
      <div className="px-4 pb-4 flex items-center justify-between">
        <div>
          <p className="text-zinc-500 text-xs">Неделя</p>
          <p className="text-white font-bold">{earnings.weekEarnings.toLocaleString()} ₽</p>
          <p className="text-zinc-500 text-xs">{earnings.weekTrips} поездок</p>
        </div>
        <div className="text-right">
          <p className="text-zinc-500 text-xs">Рейтинг (7д)</p>
          <div className="flex items-center gap-1 justify-end">
            <Star className="w-4 h-4 text-yellow-400" />
            <span className={cn(
              "font-bold",
              earnings.avgRatingThisWeek >= 4.8 ? "text-green-400" :
              earnings.avgRatingThisWeek >= 4.5 ? "text-yellow-400" : "text-red-400"
            )}>
              {earnings.avgRatingThisWeek.toFixed(2)}
            </span>
          </div>
          <RatingBadge rating={earnings.avgRatingThisWeek} />
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, accent }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "green" | "blue" | "default";
}) {
  return (
    <div className="bg-zinc-800 rounded-lg p-2.5">
      <div className="flex items-center gap-1 text-zinc-400 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <span className={cn(
        "font-bold text-sm",
        accent === "green" ? "text-green-300" :
        accent === "blue"  ? "text-blue-300"  : "text-white"
      )}>{value}</span>
    </div>
  );
}

function RatingBadge({ rating }: { rating: number }) {
  if (rating >= 4.9) return <p className="text-xs text-green-400">⭐ Отлично</p>;
  if (rating >= 4.7) return <p className="text-xs text-yellow-400">👍 Хорошо</p>;
  if (rating >= 4.5) return <p className="text-xs text-zinc-400">Нормально</p>;
  return <p className="text-xs text-red-400">⚠️ Улучшить</p>;
}
