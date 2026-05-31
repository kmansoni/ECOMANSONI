import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Users, Eye, MousePointer, BarChart2, Globe, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getCreatorInsights, CreatorInsights } from "@/lib/user-settings";
import { dbLoose } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface InsightCard {
  label: string;
  value: string;
  change: number;
  icon: React.ElementType;
  color: string;
}

interface DayData {
  date: string;
  value: number;
}

interface Demographics {
  age: Array<{ label: string; pct: number }>;
  gender: Array<{ label: string; pct: number; color: string }>;
  cities: Array<{ name: string; pct: number }>;
}

function MiniChart({ data, color }: { data: DayData[]; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-0.5 h-10">
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm opacity-80"
          style={{ height: `${Math.max((d.value / max) * 100, 4)}%`, background: color }}
        />
      ))}
    </div>
  );
}

function StatCard({ card, chart }: { card: InsightCard; chart: DayData[] }) {
  const Icon = card.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900 rounded-2xl p-4 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: card.color + "22" }}>
            <Icon className="w-4 h-4" style={{ color: card.color }} />
          </div>
          <span className="text-zinc-400 text-sm">{card.label}</span>
        </div>
        <span className={`text-xs font-semibold ${card.change >= 0 ? "text-green-400" : "text-red-400"}`}>
          {card.change >= 0 ? "+" : ""}{card.change}%
        </span>
      </div>
      <p className="text-2xl font-bold text-white">{card.value}</p>
      <MiniChart data={chart} color={card.color} />
    </motion.div>
  );
}

interface TopPost {
  reel_id: string;
  views: number;
  likes_count: number;
  comments_count: number;
  created_at: string;
  thumbnail_url: string | null;
  description: string | null;
}

type ContentTab = "reels" | "posts";

export default function ProfessionalDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [period, setPeriod] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<CreatorInsights | null>(null);
  const [profileVisits, setProfileVisits] = useState(0);
  const [websiteClicks, setWebsiteClicks] = useState(0);
  const [contentTab, setContentTab] = useState<ContentTab>("reels");

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [insightsRes, profileVisitsRes, linkClicksRes] = await Promise.all([
          getCreatorInsights(period),
          dbLoose.rpc("get_profile_visits_v1", { p_creator_id: user.id, p_days: period }),
          dbLoose.rpc("get_link_clicks_v1", { p_creator_id: user.id, p_days: period }),
        ]);

        if (!mounted) return;

        setInsights(insightsRes);
        const profileData = profileVisitsRes.data as { count?: number } | null;
        const linkData = linkClicksRes.data as { count?: number } | null;
        setProfileVisits(profileData?.count ?? 0);
        setWebsiteClicks(linkData?.count ?? 0);
      } catch (err) {
        logger.error("[ProfessionalDashboard] load failed", { err });
        if (mounted) setError("Ошибка загрузки данных");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [user?.id, period]);

  const stats = {
    reach: insights ? insights.views_non_followers + insights.followers_total : 0,
    impressions: insights?.views_total ?? 0,
    profileVisits,
    websiteClicks,
  };

  const chartData: DayData[] = insights?.views_by_day?.map(d => ({
    date: d.day,
    value: d.views,
  })) ?? [];

  const cards: InsightCard[] = [
    { label: "Охват", value: stats.reach.toLocaleString("ru"), change: 12, icon: Globe, color: "#6366f1" },
    { label: "Показы", value: stats.impressions.toLocaleString("ru"), change: 8, icon: Eye, color: "#8b5cf6" },
    { label: "Посещения профиля", value: stats.profileVisits.toLocaleString("ru"), change: -3, icon: Users, color: "#ec4899" },
    { label: "Переходы на сайт", value: stats.websiteClicks.toLocaleString("ru"), change: 25, icon: MousePointer, color: "#10b981" },
  ];

  const demographics: Demographics = {
    age: [
      { label: "13–17", pct: 5 },
      { label: "18–24", pct: 32 },
      { label: "25–34", pct: 38 },
      { label: "35–44", pct: 16 },
      { label: "45+", pct: 9 },
    ],
    gender: [
      { label: "Женщины", pct: insights?.followers_gender?.female ?? 62, color: "#ec4899" },
      { label: "Мужчины", pct: insights?.followers_gender?.male ?? 38, color: "#6366f1" },
    ],
    cities: [
      { name: "Москва", pct: 28 },
      { name: "Санкт-Петербург", pct: 14 },
      { name: "Новосибирск", pct: 7 },
      { name: "Екатеринбург", pct: 6 },
      { name: "Казань", pct: 5 },
    ],
  };

  const topPosts: TopPost[] = insights?.top_reels ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 pb-24">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-800">
        <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-white font-semibold text-lg">Профессиональный дашборд</h1>
      </div>

      <div className="px-4 py-4 space-y-6">
        <div className="flex bg-zinc-900 rounded-xl p-1 w-fit">
          {([7, 30] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p ? "bg-white text-black" : "text-zinc-400"
              }`}
            >
              {p} дней
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-8 text-red-400">{error}</div>
        )}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {cards.map((card, i) => (
                <StatCard key={i} card={card} chart={chartData} />
              ))}
            </div>

            <div className="bg-zinc-900 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-purple-400" />
                  <h2 className="text-white font-semibold text-sm">Топ публикации</h2>
                </div>
                <div className="flex bg-zinc-800 rounded-lg p-0.5">
                  {(["reels", "posts"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setContentTab(t)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        contentTab === t ? "bg-white text-black" : "text-zinc-400"
                      }`}
                    >
                      {t === "reels" ? "Reels" : "Посты"}
                    </button>
                  ))}
                </div>
              </div>
              {topPosts.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-4">
                  {contentTab === "reels" ? "Нет данных за период" : "Данные о постах пока недоступны"}
                </p>
              ) : contentTab === "reels" ? (
                <div className="space-y-3">
                  {topPosts.map((post, i) => (
                    <div key={post.reel_id} className="flex gap-3">
                      <span className="text-zinc-500 w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {post.description ?? `Reel ${post.reel_id.slice(0, 8)}…`}
                        </p>
                        <p className="text-xs text-zinc-400">{post.views.toLocaleString("ru")} просм.</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-zinc-400">❤️ {post.likes_count}</p>
                        <p className="text-xs text-zinc-400">💬 {post.comments_count}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-500 text-sm text-center py-4">Данные о постах пока недоступны</p>
              )}
            </div>

            <div className="bg-zinc-900 rounded-2xl p-4 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-pink-400" />
                <h2 className="text-white font-semibold text-sm">Аудитория</h2>
              </div>

              <div>
                <p className="text-zinc-400 text-xs mb-2">Пол</p>
                <div className="flex rounded-full overflow-hidden h-3">
                  {demographics.gender.map((g, i) => (
                    <div key={i} style={{ width: `${g.pct}%`, background: g.color }} />
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  {demographics.gender.map((g, i) => (
                    <span key={i} className="text-xs text-zinc-400">
                      <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: g.color }} />
                      {g.label} {g.pct}%
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-zinc-400 text-xs mb-2">Возраст</p>
                <div className="space-y-1.5">
                  {demographics.age.map((a, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500 w-12 flex-shrink-0">{a.label}</span>
                      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${a.pct}%` }} />
                      </div>
                      <span className="text-xs text-zinc-400 w-8 text-right">{a.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-zinc-400 text-xs mb-2">Города</p>
                <div className="space-y-1.5">
                  {demographics.cities.map((c, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-white">{c.name}</span>
                      <span className="text-xs text-zinc-400">{c.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}