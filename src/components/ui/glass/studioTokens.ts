/**
 * Creator Studio — Liquid Intelligence Design System
 * "The command center for digital empires"
 */
import { type GlassTheme } from "./glassTokens";

export type StudioTheme = "dark" | "light";

export interface StudioTokens {
  // Core surfaces
  bgDeep: string;         // Deepest background layer
  bgSurface: string;      // Main surface
  bgElevated: string;     // Elevated panels
  bgPanel: string;         // Side panels

  // Brand accents
  accentBlue: string;
  accentViolet: string;
  accentCyan: string;

  // Status colors
  success: string;
  warning: string;
  error: string;

  // Text hierarchy
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;

  // Studio-specific surfaces
  commandBar: string;
  metricCard: string;
  contentCard: string;
  aiPanel: string;
  navItem: string;
  navItemActive: string;

  // Glow effects
  glowBlue: string;
  glowViolet: string;
  glowSuccess: string;

  // Gradients
  heroGradient: string;
  metricGlow: string;
  surfaceGlow: string;

  // Typography
  headingFont: string;
  monoFont: string;
}

const STUDIO_DARK = {
  bgDeep: "#05050A",
  bgSurface: "#0B0C12",
  bgElevated: "#11131A",
  bgPanel: "#161923",

  accentBlue: "#1E5EFF",
  accentViolet: "#6A36FF",
  accentCyan: "#00D4FF",

  success: "#00D26A",
  warning: "#FFB547",
  error: "#FF4D5E",

  textPrimary: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.70)",
  textMuted: "rgba(255,255,255,0.45)",
  textFaint: "rgba(255,255,255,0.25)",

  commandBar: "rgba(11,12,18,0.85)",
  metricCard: "rgba(17,19,26,0.80)",
  contentCard: "rgba(22,25,35,0.85)",
  aiPanel: "rgba(22,25,35,0.90)",
  navItem: "rgba(255,255,255,0.06)",
  navItemActive: "rgba(30,94,255,0.18)",

  glowBlue: "0 0 40px rgba(30,94,255,0.35)",
  glowViolet: "0 0 40px rgba(106,54,255,0.35)",
  glowSuccess: "0 0 30px rgba(0,210,106,0.30)",

  heroGradient: "linear-gradient(135deg, #1E5EFF 0%, #6A36FF 50%, #00D4FF 100%)",
  metricGlow: "linear-gradient(180deg, rgba(30,94,255,0.15) 0%, transparent 100%)",
  surfaceGlow: "linear-gradient(135deg, rgba(30,94,255,0.08) 0%, rgba(106,54,255,0.04) 100%)",
} as const;

const STUDIO_LIGHT = {
  bgDeep: "#F0F4FF",
  bgSurface: "#FFFFFF",
  bgElevated: "#F8FAFF",
  bgPanel: "#EEF2FF",

  accentBlue: "#1E5EFF",
  accentViolet: "#6A36FF",
  accentCyan: "#0096CC",

  success: "#00B368",
  warning: "#E07B00",
  error: "#E0244A",

  textPrimary: "#0A0D1A",
  textSecondary: "rgba(10,13,26,0.70)",
  textMuted: "rgba(10,13,26,0.45)",
  textFaint: "rgba(10,13,26,0.25)",

  commandBar: "rgba(255,255,255,0.90)",
  metricCard: "rgba(255,255,255,0.85)",
  contentCard: "rgba(255,255,255,0.90)",
  aiPanel: "rgba(255,255,255,0.95)",
  navItem: "rgba(0,0,0,0.04)",
  navItemActive: "rgba(30,94,255,0.12)",

  glowBlue: "0 0 30px rgba(30,94,255,0.20)",
  glowViolet: "0 0 30px rgba(106,54,255,0.20)",
  glowSuccess: "0 0 25px rgba(0,178,104,0.20)",

  heroGradient: "linear-gradient(135deg, #1E5EFF 0%, #6A36FF 50%, #0096CC 100%)",
  metricGlow: "linear-gradient(180deg, rgba(30,94,255,0.08) 0%, transparent 100%)",
  surfaceGlow: "linear-gradient(135deg, rgba(30,94,255,0.05) 0%, rgba(106,54,255,0.03) 100%)",
} as const;

/**
 * Studio Design System — singleton hook
 */
export function useStudioTokens(theme: StudioTheme): StudioTokens {
  const t = theme === "dark" ? STUDIO_DARK : STUDIO_LIGHT;
  return {
    bgDeep: t.bgDeep,
    bgSurface: t.bgSurface,
    bgElevated: t.bgElevated,
    bgPanel: t.bgPanel,

    accentBlue: t.accentBlue,
    accentViolet: t.accentViolet,
    accentCyan: t.accentCyan,

    success: t.success,
    warning: t.warning,
    error: t.error,

    textPrimary: t.textPrimary,
    textSecondary: t.textSecondary,
    textMuted: t.textMuted,
    textFaint: t.textFaint,

    commandBar: t.commandBar,
    metricCard: t.metricCard,
    contentCard: t.contentCard,
    aiPanel: t.aiPanel,
    navItem: t.navItem,
    navItemActive: t.navItemActive,

    glowBlue: t.glowBlue,
    glowViolet: t.glowViolet,
    glowSuccess: t.glowSuccess,

    heroGradient: t.heroGradient,
    metricGlow: t.metricGlow,
    surfaceGlow: t.surfaceGlow,

    headingFont: "font-[Manrope,system-ui,sans-serif]",
    monoFont: "font-[JetBrains_Mono,ui-monospace,monospace]",
  };
}

/**
 * Studio metrics card variants by type
 */
export type MetricVariant = "audience" | "revenue" | "engagement" | "growth" | "content" | "ai";

export const METRIC_COLORS: Record<MetricVariant, { accent: string; glow: string; label: string }> = {
  audience: { accent: "#1E5EFF", glow: "rgba(30,94,255,0.25)", label: "Audience" },
  revenue: { accent: "#00D26A", glow: "rgba(0,210,106,0.25)", label: "Revenue" },
  engagement: { accent: "#6A36FF", glow: "rgba(106,54,255,0.25)", label: "Engagement" },
  growth: { accent: "#00D4FF", glow: "rgba(0,212,255,0.25)", label: "Growth" },
  content: { accent: "#FFB547", glow: "rgba(255,181,71,0.25)", label: "Content" },
  ai: { accent: "#FF4D5E", glow: "rgba(255,77,94,0.25)", label: "AI Insights" },
};

/**
 * Navigation command bar items
 */
export const STUDIO_SECTIONS = [
  { id: "home", label: "Home", icon: "Grid" },
  { id: "analytics", label: "Analytics", icon: "TrendingUp" },
  { id: "content", label: "Content", icon: "Film" },
  { id: "ai", label: "AI Studio", icon: "Sparkles" },
  { id: "audience", label: "Audience", icon: "Users" },
  { id: "revenue", label: "Revenue", icon: "DollarSign" },
  { id: "community", label: "Community", icon: "Heart" },
  { id: "campaigns", label: "Campaigns", icon: "Target" },
  { id: "messages", label: "Messages", icon: "MessageSquare" },
  { id: "automation", label: "Automation", icon: "Zap" },
  { id: "brand", label: "Brand Assets", icon: "Palette" },
  { id: "settings", label: "Settings", icon: "Settings" },
] as const;

export type StudioSection = typeof STUDIO_SECTIONS[number]["id"];

// Sample data for demo
export const DEMO_STUDIO_METRICS = {
  totalAudience: 2847392,
  activeAudience: 12453,
  growthVelocity: 8.4,
  revenueToday: 12847,
  revenueMonth: 89432,
  engagementRate: 7.2,
  reachWeek: 3892451,
  impressionsWeek: 12893471,
  topContent: { title: "Morning routine that changed everything", views: 892451, engagement: 12.4 },
  aiOpportunities: [
    { type: "viral-hook", title: "Your hook rate drops at 0:03", priority: "high" as const, impact: "+34% reach" },
    { type: "posting-time", title: "Best posting window: 19:00-21:00", priority: "medium" as const, impact: "+18% impressions" },
    { type: "trend-catch", title: "Trending: #ProductivityHacks", priority: "high" as const, impact: "+52% discovery" },
  ],
};

export const DEMO_CONTENT_ITEMS = [
  {
    id: "1",
    type: "reel",
    thumbnail: "https://picsum.photos/seed/reel1/400/600",
    title: "Morning routine that changed everything",
    views: 892451,
    engagement: 12.4,
    revenue: 2340,
    reach: 445123,
    publishedAt: "2 days ago",
    status: "viral",
  },
  {
    id: "2",
    type: "reel",
    thumbnail: "https://picsum.photos/seed/reel2/400/600",
    title: "5 mistakes killing your productivity",
    views: 234891,
    engagement: 9.1,
    revenue: 890,
    reach: 178234,
    publishedAt: "5 days ago",
    status: "active",
  },
  {
    id: "3",
    type: "post",
    thumbnail: "https://picsum.photos/seed/reel3/400/600",
    title: "Thread: Building in public",
    views: 45123,
    engagement: 6.8,
    revenue: 0,
    reach: 34567,
    publishedAt: "1 week ago",
    status: "stable",
  },
  {
    id: "4",
    type: "reel",
    thumbnail: "https://picsum.photos/seed/reel4/400/600",
    title: "My $10K/month setup revealed",
    views: 567891,
    engagement: 14.2,
    revenue: 4560,
    reach: 389123,
    publishedAt: "1 week ago",
    status: "viral",
  },
];
