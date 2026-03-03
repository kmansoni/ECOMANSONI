import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, TrendingUp, Users, Eye, MousePointer, BarChart2, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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

export default function ProfessionalDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [period, setPeriod] = useState<7 | 30>(7);
  const [stats, setStats] = useState({
    reach: 0, impressions: 0, profileVisits: 0, websiteClicks: 0,
  });

  // Симуляция данных (в реальном проекте — запросы к БД)
  useEffect(() => {
    setStats({
      reach: Math.floor(Math.random() * 5000) + 500,
      impressions: Math.floor(Math.random() * 15000) + 1000,
      profileVisits: Math.floor(Math.random() * 1200) + 100,
      websiteClicks: Math.floor(Math.random() * 300) + 20,
    });
  }, [period]);

  const generateChart = (base: number): DayData[] =>
    Array.from({ length: period }, (_, i) => ({
      date: new Date(Date.now() - (period - i) * 86400000).toISOString().slice(0, 10),
      value: Math.floor(base * (0.5 + Math.random())),
    }));

  const cards: InsightCard[] = [
    { label: "Охват", value: stats.reach.toLocaleString("ru"), change: 12, icon: Globe, color: "#6366f1" },
    { label: "Показы", value: stats.impressions.toLocaleString("ru"), change: 8, icon: Eye, color: "#8b5cf6" },
    { label: "Посещения профиля", value: stats.profileVisits.toLocaleString("ru"), change: -3, icon: Users, color: "#ec4899" },
    { label: "Переходы на сайт", value: stats.websiteClicks.toLocaleString("ru"), change: 25, icon: MousePointer, color: "#10b981" },
  ];

  const demographics = {
    age: [
      { label: "13–17", pct: 5 },
      { label: "18–24", pct: 32 },
      { label: "25–34", pct: 38 },
      { label: "35–44", pct: 16 },
      { label: "45+", pct: 9 },
    ],
    gender: [
      { label: "Женщины", pct: 62, color: "#ec4899" },
      { label: "Мужчины", pct: 38, color: "#6366f1" },
    ],
    cities: [
      { name: "Москва", pct: 28 },
      { name: "Санкт-Петербург", pct: 14 },
      { name: "Новосибирск", pct: 7 },
      { name: "Екатеринбург", pct: 6 },
      { name: "Казань", pct: 5 },
    ],
  };

  return (
    <div className="min-h-screen bg-zinc-950 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-800">
        <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-white font-semibold text-lg">Профессиональный дашборд</h1>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* Period toggle */}
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

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3">
          {cards.map((card, i) => (
            <StatCard key={i} card={card} chart={generateChart(stats.reach / 4)} />
          ))}
        </div>

        {/* Top posts */}
        <div className="bg-zinc-900 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="w-4 h-4 text-purple-400" />
            <h2 className="text-white font-semibold text-sm">Топ публикации</h2>
          </div>
          <p className="text-zinc-500 text-sm text-center py-4">Нет данных за период</p>
        </div>

        {/* Demographics */}
        <div className="bg-zinc-900 rounded-2xl p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-pink-400" />
            <h2 className="text-white font-semibold text-sm">Аудитория</h2>
          </div>

          {/* Gender */}
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

          {/* Age */}
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

          {/* Cities */}
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
      </div>
    </div>
  );
}
