/**
 * Mansoni Creator Studio — Liquid Intelligence Command Center
 * "The operating system for digital empires"
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Grid, TrendingUp, TrendingDown, Film, Sparkles, Users, DollarSign,
  Heart, Target, MessageSquare, Zap, Palette, Settings,
  ChevronRight, Minus,
  Eye, Heart as HeartIcon, MessageCircle, Share2, Bookmark,
  Play, AlertCircle, Search, Bell, Plus,
  BarChart3, Bot, Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudioTokens, STUDIO_SECTIONS, DEMO_STUDIO_METRICS, DEMO_CONTENT_ITEMS, type StudioSection, type MetricVariant, METRIC_COLORS } from "./studioTokens";

// ─── Animated Background ───────────────────────────────────────────────────────

function StudioBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* Deep space base */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(120% 100% at 50% -10%, #0B0C12 0%, #05050A 60%, #020207 100%)",
        }}
      />

      {/* Grid lines — subtle architecture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(30,94,255,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(30,94,255,0.3) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />

      {/* Volumetric light blobs */}
      {[
        { x: "-10%", y: "-15%", w: 700, c1: "#1E5EFF", c2: "#6A36FF", d: 20, delay: 0 },
        { x: "65%", y: "5%", w: 600, c1: "#6A36FF", c2: "#00D4FF", d: 24, delay: 4 },
        { x: "25%", y: "75%", w: 650, c1: "#1E5EFF", c2: "#00D4FF", d: 28, delay: 8 },
      ].map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-3xl mix-blend-screen"
          animate={{ opacity: [0.3, 0.5, 0.3], scale: [1, 1.1, 1] }}
          transition={{ duration: b.d, delay: b.delay, repeat: Infinity, ease: "easeInOut" }}
          style={{
            left: b.x, top: b.y, width: b.w, height: b.w,
            background: `radial-gradient(circle, ${b.c1}44, ${b.c2}22 60%, transparent 70%)`,
          }}
        />
      ))}

      {/* Noise overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}

// ─── Number Animation Hook ─────────────────────────────────────────────────────

function useCountUp(target: number, duration = 2000) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setValue(target); clearInterval(timer); }
      else setValue(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Metric Card ───────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: number;
  change?: number;
  variant: MetricVariant;
  subtitle?: string;
  compact?: boolean;
}

function MetricCard({ label, value, change, variant, subtitle, compact }: MetricCardProps) {
  const color = METRIC_COLORS[variant];
  const animated = useCountUp(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border backdrop-blur-xl transition-all duration-300",
        "hover:border-white/30 hover:scale-[1.02] cursor-pointer group",
        compact ? "p-4" : "p-5",
      )}
      style={{
        background: `linear-gradient(145deg, rgba(17,19,26,0.85), rgba(22,25,35,0.70))`,
        borderColor: `${color.accent}30`,
        boxShadow: `0 20px 60px -20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)`,
      }}
    >
      {/* Glow accent */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${color.accent}60, transparent)` }}
      />

      {/* Metric glow top */}
      <div
        className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
        style={{ background: `linear-gradient(180deg, ${color.glow} 0%, transparent 100%)` }}
      />

      <div className="relative z-10">
        <p className="text-xs font-medium uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>
          {label}
        </p>

        <div className="flex items-end gap-3">
          <motion.span
            className={cn("font-bold tracking-tight", compact ? "text-2xl" : "text-3xl")}
            style={{ color: "#FFFFFF", fontFamily: "Manrope, system-ui, sans-serif" }}
          >
            {formatNumber(animated)}
          </motion.span>

          {change !== undefined && (
            <div className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full mb-1",
              change > 0 ? "text-emerald-400" : change < 0 ? "text-red-400" : "text-white/40"
            )}
            style={{
              background: change > 0 ? "rgba(0,210,106,0.12)" : change < 0 ? "rgba(255,77,94,0.12)" : "rgba(255,255,255,0.06)",
            }}
            >
              {change > 0 ? <TrendingUp className="w-3 h-3" /> :
               change < 0 ? <TrendingDown className="w-3 h-3" /> :
               <Minus className="w-3 h-3" />}
              {Math.abs(change)}%
            </div>
          )}
        </div>

        {subtitle && (
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{subtitle}</p>
        )}
      </div>

      {/* Bottom accent line */}
      <div
        className="absolute bottom-0 left-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `linear-gradient(90deg, transparent, ${color.accent}80, transparent)` }}
      />
    </motion.div>
  );
}

// ─── AI Opportunity Card ──────────────────────────────────────────────────────

interface AIOpportunity {
  type: string;
  title: string;
  priority: "high" | "medium" | "low";
  impact: string;
}

function AIOpportunityCard({ item }: { item: AIOpportunity }) {
  const priorityColors = {
    high: { bg: "rgba(255,77,94,0.12)", border: "rgba(255,77,94,0.3)", text: "#FF4D5E" },
    medium: { bg: "rgba(255,181,71,0.12)", border: "rgba(255,181,71,0.3)", text: "#FFB547" },
    low: { bg: "rgba(0,210,106,0.12)", border: "rgba(0,210,106,0.3)", text: "#00D26A" },
  };
  const c = priorityColors[item.priority];

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer hover:scale-[1.01]"
      style={{
        background: c.bg,
        borderColor: c.border,
      }}
    >
      <div className="mt-0.5">
        <AlertCircle className="w-4 h-4" style={{ color: c.text }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white leading-snug">{item.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: c.border, color: c.text }}>
            {item.priority}
          </span>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{item.impact}</span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-white/20 mt-1 flex-shrink-0" />
    </motion.div>
  );
}

// ─── Content Card ──────────────────────────────────────────────────────────────

interface ContentItem {
  id: string;
  type: string;
  thumbnail: string;
  title: string;
  views: number;
  engagement: number;
  revenue: number;
  reach: number;
  publishedAt: string;
  status: string;
}

function ContentCard({ item }: { item: ContentItem }) {
  const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
    viral: { bg: "rgba(0,210,106,0.12)", text: "#00D26A", dot: "#00D26A" },
    active: { bg: "rgba(30,94,255,0.12)", text: "#1E5EFF", dot: "#1E5EFF" },
    stable: { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.5)", dot: "rgba(255,255,255,0.3)" },
  };
  const sc = statusColors[item.status] || statusColors.stable;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 transition-all duration-300 hover:border-white/25 cursor-pointer"
      style={{ background: "rgba(22,25,35,0.85)" }}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/5] overflow-hidden">
        <img
          src={item.thumbnail}
          alt={item.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-xl flex items-center justify-center">
            <Play className="w-6 h-6 text-white ml-1" />
          </div>
        </div>

        {/* Status badge */}
        <div
          className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: sc.bg, color: sc.text }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
          {item.status}
        </div>

        {/* Type badge */}
        <div className="absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium bg-black/40 text-white/70 backdrop-blur-sm">
          {item.type}
        </div>

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="text-sm font-semibold text-white leading-tight line-clamp-2">{item.title}</p>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>{item.publishedAt}</p>
        </div>
      </div>

      {/* Metrics row */}
      <div className="p-4 grid grid-cols-3 gap-2">
        <div className="text-center">
          <Eye className="w-3.5 h-3.5 mx-auto mb-1" style={{ color: "rgba(255,255,255,0.4)" }} />
          <p className="text-sm font-bold text-white">{formatNumber(item.views)}</p>
          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>views</p>
        </div>
        <div className="text-center border-x border-white/5">
          <HeartIcon className="w-3.5 h-3.5 mx-auto mb-1" style={{ color: "rgba(255,255,255,0.4)" }} />
          <p className="text-sm font-bold text-white">{item.engagement}%</p>
          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>engaged</p>
        </div>
        <div className="text-center">
          <DollarSign className="w-3.5 h-3.5 mx-auto mb-1" style={{ color: "rgba(0,210,106,0.6)" }} />
          <p className="text-sm font-bold" style={{ color: "#00D26A" }}>
            {item.revenue > 0 ? `$${item.revenue}` : "—"}
          </p>
          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>revenue</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Mini Chart (SVG sparkline) ────────────────────────────────────────────────

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120, h = 32;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
      <circle
        cx={(w - 1)}
        cy={h - ((data[data.length - 1] - min) / range) * (h - 4) - 2}
        r="3"
        fill={color}
      />
    </svg>
  );
}

// ─── Command Bar Navigation ────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Grid, TrendingUp, Film, Sparkles, Users, DollarSign,
  Heart, Target, MessageSquare, Zap, Palette, Settings,
};

interface CommandBarProps {
  active: StudioSection;
  onChange: (section: StudioSection) => void;
}

function CommandBar({ active, onChange }: CommandBarProps) {
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center gap-4 px-6 h-16 border-b backdrop-blur-2xl"
      style={{
        background: "rgba(5,5,10,0.85)",
        borderColor: "rgba(255,255,255,0.06)",
        backdropFilter: "blur(40px) saturate(150%)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #1E5EFF, #6A36FF)",
            boxShadow: "0 0 20px rgba(30,94,255,0.4)",
          }}
        >
          <span className="text-white font-bold text-sm">M</span>
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-none">Creator Studio</p>
          <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Liquid Intelligence</p>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-8 flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />

      {/* Search */}
      <div
        className={cn(
          "flex items-center gap-2 h-9 px-3 rounded-xl border transition-all duration-200 flex-1 max-w-md",
          searchFocused ? "border-blue-500/50" : "border-white/10"
        )}
        style={{ background: "rgba(255,255,255,0.05)" }}
      >
        <Search className="w-4 h-4 flex-shrink-0" style={{ color: "rgba(255,255,255,0.35)" }} />
        <input
          type="text"
          placeholder="Search content, analytics, AI..."
          className="bg-transparent text-sm text-white placeholder:text-white/25 outline-none w-full"
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
        <kbd className="hidden sm:flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border" style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.3)" }}>
          ⌘K
        </kbd>
      </div>

      {/* Nav items */}
      <nav className="hidden lg:flex items-center gap-1">
        {STUDIO_SECTIONS.slice(0, 8).map((section) => {
          const Icon = ICON_MAP[section.icon];
          const isActive = active === section.id;
          return (
            <button
              key={section.id}
              onClick={() => onChange(section.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                isActive
                  ? "text-white"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5"
              )}
              style={isActive ? {
                background: "rgba(30,94,255,0.15)",
                border: "1px solid rgba(30,94,255,0.3)",
              } : {}}
            >
              {Icon && <Icon className="w-4 h-4" />}
              {section.label}
            </button>
          );
        })}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          className="flex items-center gap-2 px-3 h-9 rounded-xl text-sm font-medium text-white transition-all duration-200"
          style={{ background: "linear-gradient(135deg, #1E5EFF, #6A36FF)", boxShadow: "0 0 20px rgba(30,94,255,0.3)" }}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Create</span>
        </button>
        <button className="relative w-9 h-9 flex items-center justify-center rounded-xl border transition-all duration-200 hover:bg-white/5" style={{ borderColor: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)" }}>
          <Bell className="w-4 h-4 text-white/60" />
          <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
        </button>
      </div>
    </div>
  );
}

// ─── AI Copilot Sidebar ────────────────────────────────────────────────────────

function AICopilotSidebar() {
  const [minimized, setMinimized] = useState(false);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="fixed right-6 top-24 w-80 z-40"
      >
        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            background: "rgba(22,25,35,0.92)",
            borderColor: "rgba(106,54,255,0.2)",
            boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6), 0 0 40px rgba(106,54,255,0.08)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #6A36FF, #FF4D5E)" }}
              >
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">AI Co-Pilot</p>
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>3 opportunities found</p>
              </div>
            </div>
            <button
              onClick={() => setMinimized(!minimized)}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-white/5"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              <ChevronRight className={cn("w-4 h-4 transition-transform", !minimized && "rotate-90")} />
            </button>
          </div>

          {!minimized && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              className="p-3 space-y-2"
            >
              {/* AI quick stats */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="p-2.5 rounded-xl text-center" style={{ background: "rgba(30,94,255,0.10)", border: "1px solid rgba(30,94,255,0.2)" }}>
                  <p className="text-lg font-bold text-white">+34%</p>
                  <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Potential reach</p>
                </div>
                <div className="p-2.5 rounded-xl text-center" style={{ background: "rgba(0,210,106,0.10)", border: "1px solid rgba(0,210,106,0.2)" }}>
                  <p className="text-lg font-bold" style={{ color: "#00D26A" }}>2.4K</p>
                  <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>New followers</p>
                </div>
              </div>

              {/* Opportunities */}
              <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                Opportunities
              </p>
              {DEMO_STUDIO_METRICS.aiOpportunities.map((opp, i) => (
                <AIOpportunityCard key={i} item={opp} />
              ))}

              {/* AI Actions */}
              <div className="pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <button
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-white transition-all duration-200 hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, rgba(106,54,255,0.3), rgba(255,77,94,0.2))", border: "1px solid rgba(106,54,255,0.3)" }}
                >
                  <Lightbulb className="w-4 h-4" />
                  Ask AI for insights
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Main Content Area ─────────────────────────────────────────────────────────

function MetricsOverview() {
  const metrics = DEMO_STUDIO_METRICS;

  return (
    <div className="space-y-6">
      {/* Hero metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Audience"
          value={metrics.totalAudience}
          change={12.4}
          variant="audience"
          subtitle="Followers + subscribers"
        />
        <MetricCard
          label="Revenue This Month"
          value={metrics.revenueMonth}
          change={8.7}
          variant="revenue"
          subtitle="Earnings + subscriptions"
        />
        <MetricCard
          label="Engagement Rate"
          value={metrics.engagementRate}
          change={2.1}
          variant="engagement"
          subtitle="Global engagement score"
        />
        <MetricCard
          label="Growth Velocity"
          value={metrics.growthVelocity}
          change={-1.2}
          variant="growth"
          subtitle="Followers per day"
        />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <MetricCard label="Active Now" value={metrics.activeAudience} variant="audience" compact />
        <MetricCard label="Weekly Reach" value={metrics.reachWeek} variant="content" compact />
        <MetricCard label="Impressions" value={metrics.impressionsWeek} variant="content" compact />
        <MetricCard label="Revenue Today" value={metrics.revenueToday} variant="revenue" compact />
        <MetricCard label="Engagement" value={metrics.engagementRate * 1000} variant="engagement" compact />
        <MetricCard label="Growth" value={metrics.growthVelocity * 100} variant="growth" compact />
      </div>
    </div>
  );
}

function ContentSection() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Content Performance</h2>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>Your top performing content</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
            All types
          </button>
          <button className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: "rgba(30,94,255,0.15)", color: "white", border: "1px solid rgba(30,94,255,0.3)" }}>
            Reels
          </button>
          <button className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
            Posts
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {DEMO_CONTENT_ITEMS.map((item) => (
          <ContentCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function AnalyticsSection() {
  const sparkData = [12, 18, 15, 22, 19, 28, 24, 31, 29, 35, 33, 38];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Live Analytics</h2>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>Real-time performance metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "rgba(0,210,106,0.12)", border: "1px solid rgba(0,210,106,0.3)" }}>
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#00D26A" }} />
            <span className="text-xs font-medium" style={{ color: "#00D26A" }}>Live</span>
          </div>
        </div>
      </div>

      {/* Main chart card */}
      <div
        className="rounded-2xl border p-6"
        style={{
          background: "rgba(17,19,26,0.80)",
          borderColor: "rgba(255,255,255,0.08)",
          boxShadow: "0 20px 60px -20px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm font-semibold text-white">Weekly Impressions</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Last 7 days performance</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xl font-bold text-white">12.8M</p>
              <p className="text-xs" style={{ color: "rgba(0,210,106,0.7)" }}>+18.4% vs last week</p>
            </div>
            <MiniSparkline data={sparkData} color="#1E5EFF" />
          </div>
        </div>

        {/* Chart bars */}
        <div className="flex items-end gap-2 h-32">
          {[45, 62, 58, 78, 65, 89, 72, 95, 88, 102, 94, 108].map((h, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ duration: 0.6, delay: i * 0.05 }}
              className="flex-1 rounded-t-lg"
              style={{
                background: i === 11
                  ? "linear-gradient(180deg, #1E5EFF, #6A36FF)"
                  : "linear-gradient(180deg, rgba(30,94,255,0.4), rgba(30,94,255,0.15))",
                boxShadow: i === 11 ? "0 0 20px rgba(30,94,255,0.4)" : "none",
              }}
            />
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => (
            <span key={i} className="flex-1 text-center text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{d}</span>
          ))}
        </div>
      </div>

      {/* Audience chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          className="rounded-2xl border p-5"
          style={{
            background: "rgba(17,19,26,0.80)",
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-sm font-semibold text-white mb-4">Audience Growth</p>
          <div className="flex items-center gap-4">
            <MiniSparkline data={[10, 12, 11, 14, 13, 16, 15, 18, 17, 20, 19, 22]} color="#00D26A" />
            <div>
              <p className="text-2xl font-bold text-white">+2.8M</p>
              <p className="text-xs" style={{ color: "rgba(0,210,106,0.7)" }}>This month</p>
            </div>
          </div>
        </div>

        <div
          className="rounded-2xl border p-5"
          style={{
            background: "rgba(17,19,26,0.80)",
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-sm font-semibold text-white mb-4">Revenue Trend</p>
          <div className="flex items-center gap-4">
            <MiniSparkline data={[8, 9, 7, 11, 10, 13, 12, 15, 14, 16, 15, 18]} color="#FFB547" />
            <div>
              <p className="text-2xl font-bold text-white">$89.4K</p>
              <p className="text-xs" style={{ color: "rgba(255,181,71,0.7)" }}>This month</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page Component ─────────────────────────────────────────────────────────────

export function CreatorStudioPage() {
  const [activeSection, setActiveSection] = useState<StudioSection>("home");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen" style={{ background: "#05050A" }}>
      <StudioBackground />
      <CommandBar active={activeSection} onChange={setActiveSection} />
      <AICopilotSidebar />

      {/* Main content */}
      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 pt-24 pb-16 px-6 max-w-[1400px] mx-auto"
        style={{ paddingTop: "calc(64px + 1.5rem)" }}
      >
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#00D26A" }} />
            <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>
              Live dashboard
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Command Center
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
            Your digital empire at a glance — real-time metrics, AI insights, and content intelligence.
          </p>
        </div>

        {/* Section content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            {activeSection === "home" && <MetricsOverview />}
            {activeSection === "analytics" && <AnalyticsSection />}
            {activeSection === "content" && <ContentSection />}
            {(activeSection === "ai" || activeSection === "home") && (
              <div className="mt-6">
                <ContentSection />
              </div>
            )}
            {["audience", "revenue", "community", "campaigns", "messages", "automation", "brand", "settings"].includes(activeSection) && (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div
                    className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: "rgba(30,94,255,0.12)", border: "1px solid rgba(30,94,255,0.2)" }}
                  >
                    {(() => {
                      const section = STUDIO_SECTIONS.find(s => s.id === activeSection);
                      const Icon = section ? ICON_MAP[section.icon] : null;
                      return Icon ? <Icon className="w-8 h-8" style={{ color: "#1E5EFF" }} /> : null;
                    })()}
                  </div>
                  <p className="text-lg font-semibold text-white">
                    {STUDIO_SECTIONS.find(s => s.id === activeSection)?.label}
                  </p>
                  <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Coming soon — building your command center
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.main>
    </div>
  );
}
