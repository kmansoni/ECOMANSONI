import React, { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { TrendingUp, Users, Eye, Heart, Download, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

// --- Mock data ---
const generateFollowerGrowth = () => {
  const data = [];
  let count = 1200;
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    count += Math.floor(Math.random() * 80) - 10;
    data.push({
      date: d.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' }),
      followers: count,
    });
  }
  return data;
};

const TRAFFIC_SOURCES = [
  { name: 'Главная', value: 35, color: '#8b5cf6' },
  { name: 'Поиск', value: 25, color: '#06b6d4' },
  { name: 'Профиль', value: 20, color: '#10b981' },
  { name: 'Reels', value: 12, color: '#f59e0b' },
  { name: 'Другое', value: 8, color: '#6b7280' },
];

const DEMOGRAPHICS_AGE = [
  { age: '13-17', pct: 8 },
  { age: '18-24', pct: 32 },
  { age: '25-34', pct: 28 },
  { age: '35-44', pct: 18 },
  { age: '45-54', pct: 9 },
  { age: '55+', pct: 5 },
];

const TOP_POSTS = [
  { id: '1', type: 'Reels', title: 'Закат на море 🌅', likes: 4820, comments: 214, reach: 18400, engagement: 8.9 },
  { id: '2', type: 'Фото', title: 'Кофе утром ☕', likes: 2100, comments: 98, reach: 9200, engagement: 7.1 },
  { id: '3', type: 'Reels', title: 'Танец под дождём 💃', likes: 3650, comments: 183, reach: 14800, engagement: 8.0 },
  { id: '4', type: 'Stories', title: 'Опрос: ваш цвет?', likes: 800, comments: 320, reach: 6100, engagement: 9.2 },
  { id: '5', type: 'Фото', title: 'Горы зимой 🏔️', likes: 1900, comments: 76, reach: 8700, engagement: 6.5 },
];

// Activity heatmap: hours x days
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const generateHeatmap = () =>
  DAYS.map(day => ({
    day,
    hours: HOURS.map(h => ({
      hour: h,
      activity: Math.random() * 100,
    })),
  }));

const HEATMAP_DATA = generateHeatmap();

function getHeatColor(value: number): string {
  if (value < 20) return 'bg-muted';
  if (value < 40) return 'bg-primary/20';
  if (value < 60) return 'bg-primary/40';
  if (value < 80) return 'bg-primary/70';
  return 'bg-primary';
}

const PERIODS = ['7 дней', '30 дней', '90 дней'] as const;
type Period = typeof PERIODS[number];

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  change: string;
  positive: boolean;
}

function StatCard({ icon, label, value, change, positive }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-2xl p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-muted-foreground">{icon}</div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          positive ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-500'
        }`}>
          {change}
        </span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </motion.div>
  );
}

export function AdvancedAnalytics() {
  const [period, setPeriod] = useState<Period>('30 дней');
  const followerGrowth = useMemo(() => generateFollowerGrowth(), []);

  const handleExport = () => {
    const exportData = {
      period,
      followerGrowth,
      topPosts: TOP_POSTS,
      trafficSources: TRAFFIC_SOURCES,
      demographics: DEMOGRAPHICS_AGE,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Аналитика</h2>
          <p className="text-muted-foreground text-sm">Расширенные метрики</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
          <Download className="w-4 h-4" />
          Экспорт
        </Button>
      </div>

      {/* Period selector */}
      <div className="flex gap-2">
        {PERIODS.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              period === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<Users className="w-4 h-4" />} label="Подписчики" value="3 847" change="+12.4%" positive={true} />
        <StatCard icon={<Eye className="w-4 h-4" />} label="Охват" value="142K" change="+8.1%" positive={true} />
        <StatCard icon={<Heart className="w-4 h-4" />} label="Вовлечённость" value="7.8%" change="+1.2%" positive={true} />
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Просмотры" value="89.4K" change="-2.3%" positive={false} />
      </div>

      {/* Follower growth chart */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <h3 className="font-semibold mb-4">Рост подписчиков</h3>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={followerGrowth} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="followerGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false}
              interval={Math.floor(followerGrowth.length / 5)} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: 12 }}
              labelStyle={{ color: '#e5e7eb' }}
            />
            <Area type="monotone" dataKey="followers" stroke="#8b5cf6" strokeWidth={2}
              fill="url(#followerGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Top content */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <h3 className="font-semibold mb-4">Топ-контент</h3>
        <div className="space-y-3">
          {TOP_POSTS.map((post, i) => (
            <div key={post.id} className="flex items-center gap-3">
              <span className="text-lg font-bold text-muted-foreground w-6 text-center">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{post.type}</span>
                  <span className="text-sm font-medium truncate">{post.title}</span>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>❤️ {post.likes.toLocaleString()}</span>
                  <span>💬 {post.comments}</span>
                  <span>👁️ {post.reach.toLocaleString()}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold text-primary">{post.engagement}%</span>
                <p className="text-xs text-muted-foreground">ER</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Traffic sources + Demographics */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="font-semibold mb-4">Источники трафика</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={120} height={120}>
              <PieChart>
                <Pie data={TRAFFIC_SOURCES} dataKey="value" cx="50%" cy="50%"
                  innerRadius={30} outerRadius={55} strokeWidth={0}>
                  {TRAFFIC_SOURCES.map(s => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {TRAFFIC_SOURCES.map(s => (
                <div key={s.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-xs text-muted-foreground">{s.name}</span>
                  </div>
                  <span className="text-xs font-semibold">{s.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="font-semibold mb-4">Демография аудитории</h3>
          <div className="space-y-2">
            {DEMOGRAPHICS_AGE.map(d => (
              <div key={d.age} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-12">{d.age}</span>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${d.pct}%` }}
                    transition={{ duration: 0.8, delay: 0.1 }}
                    className="h-full bg-primary rounded-full"
                  />
                </div>
                <span className="text-xs font-semibold w-8 text-right">{d.pct}%</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-4">
            <div className="text-center">
              <p className="text-lg font-bold">58%</p>
              <p className="text-xs text-muted-foreground">Женщины</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">42%</p>
              <p className="text-xs text-muted-foreground">Мужчины</p>
            </div>
            <div className="text-center ml-auto">
              <p className="text-sm font-semibold">🇷🇺 45%</p>
              <p className="text-sm font-semibold">🇺🇦 18%</p>
              <p className="text-sm font-semibold">🇧🇾 12%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Activity heatmap */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <h3 className="font-semibold mb-4">Активность аудитории по часам</h3>
        <div className="overflow-x-auto">
          <div className="min-w-[400px]">
            {/* Hour labels */}
            <div className="flex gap-0.5 mb-1 pl-8">
              {HOURS.filter(h => h % 3 === 0).map(h => (
                <div key={h} className="text-[10px] text-muted-foreground" style={{ width: `${100 / 8}%` }}>
                  {h}:00
                </div>
              ))}
            </div>
            {HEATMAP_DATA.map(row => (
              <div key={row.day} className="flex items-center gap-0.5 mb-0.5">
                <span className="text-[10px] text-muted-foreground w-7 flex-shrink-0">{row.day}</span>
                {row.hours.map(cell => (
                  <div
                    key={cell.hour}
                    className={`flex-1 h-4 rounded-[2px] ${getHeatColor(cell.activity)}`}
                    title={`${row.day} ${cell.hour}:00 — ${Math.round(cell.activity)}%`}
                  />
                ))}
              </div>
            ))}
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[10px] text-muted-foreground">Меньше</span>
              {['bg-muted', 'bg-primary/20', 'bg-primary/40', 'bg-primary/70', 'bg-primary'].map(c => (
                <div key={c} className={`w-4 h-4 rounded-[2px] ${c}`} />
              ))}
              <span className="text-[10px] text-muted-foreground">Больше</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content type breakdown */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <h3 className="font-semibold mb-4">По типу контента</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { type: 'Reels', icon: '🎬', reach: '78K', engagement: '9.2%', posts: 12 },
            { type: 'Фото', icon: '📷', reach: '42K', engagement: '6.8%', posts: 28 },
            { type: 'Stories', icon: '⚡', reach: '22K', engagement: '5.1%', posts: 56 },
          ].map(ct => (
            <div key={ct.type} className="bg-muted/50 rounded-xl p-3 text-center">
              <div className="text-2xl mb-1">{ct.icon}</div>
              <p className="font-semibold text-sm">{ct.type}</p>
              <p className="text-xs text-muted-foreground mt-1">Охват</p>
              <p className="text-sm font-bold text-primary">{ct.reach}</p>
              <p className="text-xs text-muted-foreground mt-1">ER: {ct.engagement}</p>
              <p className="text-xs text-muted-foreground">{ct.posts} публ.</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
