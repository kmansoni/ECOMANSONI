import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, Eye, Heart, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { dbLoose } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// --- Types ---
interface OverviewMetrics {
  total_views: number;
  total_reactions: number;
  total_shares: number;
  total_reach: number;
  er: number;
  views_growth: number;
  reacts_growth: number;
  shares_growth: number;
  reach_growth: number;
}

interface TopPost {
  post_id: string;
  type: string;
  title: string;
  likes: number;
  comments: number;
  reach: number;
  engagement: number;
}

interface TrafficSource {
  name: string;
  value: number;
  color: string;
}

interface Demographic {
  age: string;
  pct: number;
}

interface ActivityHour {
  day: string;
  hour: number;
  activity: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// --- Stat Card ---
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  change?: string;
  positive?: boolean;
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
        {change && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            positive ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-500'
          }`}>
            {change}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </motion.div>
  );
}

// --- Line Chart (SVG) ---
function LineChart({ data, labels, color = "#8b5cf6", height = 80 }: { data: number[]; labels: string[]; color?: string; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 500;
  const toY = (v: number) => height - ((v - min) / range) * (height - 10) - 5;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${toY(v)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height: `${height}px` }}>
      <defs>
        <linearGradient id={`grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts} ${W},${height}`} fill={`url(#grad-${color.replace('#','')})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

// --- Main Component ---
const PERIODS = ['7 дней', '30 дней', '90 дней'] as const;
type Period = typeof PERIODS[number];

export function AdvancedAnalytics() {
  const [period, setPeriod] = useState<Period>('30 дней');
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [trafficSources, setTrafficSources] = useState<TrafficSource[]>([]);
  const [demographics, setDemographics] = useState<Demographic[]>([]);
  const [activityHours, setActivityHours] = useState<ActivityHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Get current user
    const getUser = async () => {
      const { data: { user } } = await dbLoose.auth.getUser();
      if (user) setUserId(user.id);
    };
    getUser();
  }, []);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    
    (async () => {
      try {
        // TODO: Replace with actual RPC calls when backend metrics are ready
        // For now, fetch real data from available tables
        const [{ data: metrics }, { data: posts }] = await Promise.all([
          dbLoose.rpc("get_creator_dashboard_v1", { p_creator_id: userId }),
          dbLoose.rpc("get_creator_growth_v1", { p_creator_id: userId, p_days: 30 }),
        ]);
        
        if (metrics) {
          const m = Array.isArray(metrics) ? metrics[0] : metrics;
          setOverview({
            total_views: m?.totals?.impressions ?? 0,
            total_reactions: m?.totals?.likes ?? 0,
            total_shares: m?.totals?.shares ?? 0,
            total_reach: m?.totals?.unique_viewers ?? 0,
            er: m?.averages?.watched_rate ?? 0,
            views_growth: 0,
            reacts_growth: 0,
            shares_growth: 0,
            reach_growth: 0,
          });
        }
        
        // TODO: Get top posts from real RPC
        setTopPosts([]);
        setTrafficSources([]);
        setDemographics([]);
        setActivityHours([]);
      } catch (err) {
        logger.error("[AdvancedAnalytics] load failed", { err });
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, period]);

  const handleExport = () => {
    const exportData = {
      period,
      overview,
      topPosts,
      trafficSources,
      demographics,
      activityHours,
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

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl h-20 animate-pulse" />
          ))}
        </div>
      ) : overview ? (
        <>
          {/* Stats overview */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<Users className="w-4 h-4" />} label="Подписчики" value={fmt(overview.total_reach)} change={overview.reach_growth !== 0 ? `${overview.reach_growth > 0 ? '+' : ''}${overview.reach_growth}%` : undefined} positive={overview.reach_growth >= 0} />
            <StatCard icon={<Eye className="w-4 h-4" />} label="Охват" value={fmt(overview.total_reach)} change={overview.reach_growth !== 0 ? `${overview.reach_growth > 0 ? '+' : ''}${overview.reach_growth}%` : undefined} positive={overview.reach_growth >= 0} />
            <StatCard icon={<Heart className="w-4 h-4" />} label="Вовлечённость" value={`${overview.er}%`} change={overview.reacts_growth !== 0 ? `${overview.reacts_growth > 0 ? '+' : ''}${overview.reacts_growth}%` : undefined} positive={overview.reacts_growth >= 0} />
            <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Просмотры" value={fmt(overview.total_views)} change={overview.views_growth !== 0 ? `${overview.views_growth > 0 ? '+' : ''}${overview.views_growth}%` : undefined} positive={overview.views_growth >= 0} />
          </div>

          {/* Top content */}
          {topPosts.length > 0 ? (
            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="font-semibold mb-4">Топ-контент</h3>
              <div className="space-y-3">
                {topPosts.map((post, i) => (
                  <div key={post.post_id} className="flex items-center gap-3">
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
          ) : (
            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="font-semibold mb-4">Топ-контент</h3>
              <p className="text-sm text-muted-foreground">Нет данных за выбранный период</p>
            </div>
          )}

          {/* Traffic sources и Demographics - пока пустые, ждём backend */}
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="font-semibold mb-4">Источники трафика</h3>
              <p className="text-sm text-muted-foreground">Данные недоступны — реализуется в backend</p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="font-semibold mb-4">Демография аудитории</h3>
              <p className="text-sm text-muted-foreground">Данные недоступны — реализуется в backend</p>
            </div>
          </div>

          {/* Content type breakdown */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="font-semibold mb-4">По типу контента</h3>
            <p className="text-sm text-muted-foreground">Данные недоступны — реализуется в backend</p>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <Users className="w-8 h-8" />
          <p className="text-sm">Нет данных для отображения</p>
        </div>
      )}
    </div>
  );
}