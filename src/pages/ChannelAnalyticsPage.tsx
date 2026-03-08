/**
 * ChannelAnalyticsPage — Telegram-style дашборд аналитики канала.
 *
 * SVG Line Chart без тяжёлых библиотек:
 *  - Нормализует данные в viewport 0..100
 *  - Рисует polyline + area gradient
 *  - Интерактивный tooltip по mousemove
 *
 * Безопасность: channelId берётся из useParams — серверная RLS проверяет admin-доступ.
 */

import { useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown, Eye, Share2, Heart, Users, RefreshCw, Loader2 } from "lucide-react";
import { useChannelAnalytics, type DailyStat, type AnalyticsPeriod } from "@/hooks/useChannelAnalytics";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// SVG Line Chart
// ---------------------------------------------------------------------------

interface LineChartProps {
  data: number[];
  labels: string[];
  color?: string;
  height?: number;
}

function LineChart({ data, labels, color = "#3b82f6", height = 80 }: LineChartProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; value: number; label: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const WIDTH = 500;

  // Compute derived values unconditionally (hooks must precede early returns)
  const hasSufficientData = data.length >= 2;
  const min = hasSufficientData ? Math.min(...data) : 0;
  const max = hasSufficientData ? Math.max(...data) : 1;
  const range = max - min || 1;

  const points = hasSufficientData
    ? data.map((v, i) => ({
        x: (i / (data.length - 1)) * WIDTH,
        y: height - ((v - min) / range) * (height - 10) - 5,
        v,
      }))
    : [];

  // useCallback must be called before any early return (Rules of Hooks)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!points.length) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
      let closest = points[0];
      for (const p of points) {
        if (Math.abs(p.x - relX) < Math.abs(closest.x - relX)) closest = p;
      }
      const idx = points.indexOf(closest);
      setTooltip({
        x: e.clientX - rect.left,
        y: (closest.y / height) * rect.height,
        value: closest.v,
        label: labels[idx] ?? "",
      });
    },
    [points, labels, height],
  );

  if (!hasSufficientData) {
    return (
      <div className="flex items-center justify-center h-20 text-zinc-600 text-xs">
        Недостаточно данных
      </div>
    );
  }

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(" ");
  const areaPoints = [
    `0,${height}`,
    ...points.map(p => `${p.x},${p.y}`),
    `${WIDTH},${height}`,
  ].join(" ");

  const gradientId = `grad-${color.replace("#", "")}`;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: `${height}px` }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Area */}
        <polygon points={areaPoints} fill={`url(#${gradientId})`} />
        {/* Line */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Active dot */}
        {tooltip && points.find(p => Math.abs(p.x - (tooltip.x / (svgRef.current?.getBoundingClientRect().width ?? 1)) * WIDTH) < 15) && (() => {
          const pt = points.reduce((a, b) =>
            Math.abs(a.x - (tooltip.x / (svgRef.current?.getBoundingClientRect().width ?? 1)) * WIDTH) <
            Math.abs(b.x - (tooltip.x / (svgRef.current?.getBoundingClientRect().width ?? 1)) * WIDTH)
              ? a : b,
          );
          return <circle cx={pt.x} cy={pt.y} r="4" fill={color} />;
        })()}
      </svg>
      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none bg-zinc-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10"
          style={{ left: Math.min(tooltip.x, 200), top: -28, transform: "translateX(-50%)" }}
        >
          {tooltip.label}: {tooltip.value.toLocaleString()}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({
  icon,
  label,
  value,
  growth,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  growth?: number;
}) {
  const isPositive = (growth ?? 0) >= 0;
  return (
    <div className="bg-zinc-800/60 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-zinc-400">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-white text-2xl font-bold">{value.toLocaleString()}</span>
        {growth !== undefined && (
          <span className={cn("text-xs font-medium mb-0.5 flex items-center gap-0.5", isPositive ? "text-green-400" : "text-red-400")}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(growth)}%
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Period selector
// ---------------------------------------------------------------------------

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "7d", label: "7д" },
  { value: "30d", label: "30д" },
  { value: "90d", label: "90д" },
  { value: "all", label: "Всё" },
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function ChannelAnalyticsPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const {
    overview,
    dailyStats,
    topPosts,
    period,
    setPeriod,
    isLoading,
    error,
    reload,
  } = useChannelAnalytics(channelId ?? "");

  if (!channelId) {
    return (
      <div className="flex items-center justify-center h-screen text-zinc-400">
        Канал не найден
      </div>
    );
  }

  // Данные для графиков
  const viewsData = dailyStats.map(d => d.views_count);
  const subscribersData = dailyStats.map(d => d.subscribers_count);
  const reactionsData = dailyStats.map(d => d.reactions_count + d.shares_count);
  const dateLabels = dailyStats.map(d => {
    const dt = new Date(d.date);
    return `${dt.getDate()}.${dt.getMonth() + 1}`;
  });

  // Рост подписчиков за период в %
  const subscriberGrowth =
    overview && overview.latest_subscribers > 0
      ? Math.round(
          ((overview.subscribers_gained - overview.subscribers_lost) /
            Math.max(overview.latest_subscribers - overview.subscribers_gained + overview.subscribers_lost, 1)) *
            100,
        )
      : 0;

  return (
    <div className="min-h-screen bg-zinc-900 text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur-sm px-4 py-3 flex items-center gap-3 border-b border-zinc-800">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-lg">Аналитика канала</h1>
        <div className="ml-auto">
          <button
            onClick={reload}
            disabled={isLoading}
            className="p-2 rounded-full hover:bg-zinc-800 transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            ) : (
              <RefreshCw className="w-4 h-4 text-zinc-400" />
            )}
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* Period selector */}
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                period === p.value
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Overview cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-zinc-800/40 rounded-xl h-20 animate-pulse" />
            ))}
          </div>
        ) : overview ? (
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Users className="w-4 h-4" />}
              label="Подписчики"
              value={overview.latest_subscribers}
              growth={subscriberGrowth}
            />
            <StatCard
              icon={<Eye className="w-4 h-4" />}
              label="Просмотры"
              value={overview.total_views}
            />
            <StatCard
              icon={<Share2 className="w-4 h-4" />}
              label="Репосты"
              value={overview.total_shares}
            />
            <StatCard
              icon={<Heart className="w-4 h-4" />}
              label="Реакции"
              value={overview.total_reactions}
            />
          </div>
        ) : null}

        {/* Chart: Подписчики */}
        {subscribersData.length > 1 && (
          <div className="bg-zinc-800/40 rounded-xl p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Подписчики</h3>
            <LineChart data={subscribersData} labels={dateLabels} color="#3b82f6" height={80} />
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>{dateLabels[0]}</span>
              <span>{dateLabels[dateLabels.length - 1]}</span>
            </div>
          </div>
        )}

        {/* Chart: Просмотры */}
        {viewsData.length > 1 && (
          <div className="bg-zinc-800/40 rounded-xl p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Просмотры</h3>
            <LineChart data={viewsData} labels={dateLabels} color="#10b981" height={80} />
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>{dateLabels[0]}</span>
              <span>{dateLabels[dateLabels.length - 1]}</span>
            </div>
          </div>
        )}

        {/* Chart: Реакции + шейры */}
        {reactionsData.length > 1 && (
          <div className="bg-zinc-800/40 rounded-xl p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Реакции & репосты</h3>
            <LineChart data={reactionsData} labels={dateLabels} color="#a855f7" height={80} />
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>{dateLabels[0]}</span>
              <span>{dateLabels[dateLabels.length - 1]}</span>
            </div>
          </div>
        )}

        {/* Top posts */}
        {topPosts.length > 0 && (
          <div className="bg-zinc-800/40 rounded-xl p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Топ публикации</h3>
            <div className="space-y-3">
              {topPosts.map((post, idx) => {
                const totalReactions = Object.values(post.reactions).reduce((a, b) => a + b, 0);
                return (
                  <div key={post.post_id} className="flex items-center gap-3">
                    <span className="text-zinc-600 text-sm w-5">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 text-xs text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {post.views.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Share2 className="w-3 h-3" />
                          {post.forwards}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3" />
                          {totalReactions}
                        </span>
                      </div>
                      {/* Views bar */}
                      <div className="mt-1 h-1 bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{
                            width: `${Math.min((post.views / (topPosts[0]?.views || 1)) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isLoading && !error && dailyStats.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Данные за выбранный период отсутствуют</p>
          </div>
        )}
      </div>
    </div>
  );
}
