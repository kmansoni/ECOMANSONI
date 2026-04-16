/**
 * src/pages/settings/SettingsStatisticsSection.tsx
 *
 * Self-contained statistics section extracted from SettingsPage.
 * Handles screens: statistics, stats_recommendations, stats_overview,
 * stats_content, stats_followers.
 *
 * Owns all statistics-related state (creatorInsights, reels, filters)
 * and data-fetching callbacks.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  BadgeCheck,
  ChevronRight,
  FileText,
  Globe,
  Info,
  RefreshCw,
  Users,
  Video,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Bar, BarChart, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { cn, getErrorMessage } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  getCreatorInsights,
  type CreatorInsights,
} from "@/lib/user-settings";
import { formatCompact, dayLabel } from "./formatters";
import { SettingsHeader, SettingsMenuItem } from "./helpers";
import type { Screen, SectionProps } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReelStats = {
  id: string;
  description: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  created_at: string;
  views_count: number | null;
  likes_count: number | null;
  comments_count: number | null;
  saves_count: number | null;
  shares_count: number | null;
};

export interface SettingsStatisticsProps extends SectionProps {
  currentScreen: Screen;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsStatisticsSection({
  isDark,
  onNavigate,
  onBack,
  currentScreen,
}: SettingsStatisticsProps) {
  const { user } = useAuth();
  const isAuthed = !!user;

  // Creator analytics
  const [creatorInsights, setCreatorInsights] = useState<CreatorInsights | null>(null);
  const [creatorInsightsLoading, setCreatorInsightsLoading] = useState(false);
  const insightsLoadingRef = useRef(false);

  // Reels / content
  const [reels, setReels] = useState<ReelStats[]>([]);
  const [reelsLoading, setReelsLoading] = useState(false);
  const [statsContentFilter, setStatsContentFilter] = useState<"all" | "30d">("all");

  // Followers gender
  const [followersGenderLoading, setFollowersGenderLoading] = useState(false);

  // -----------------------------------------------------------------------
  // Data loaders
  // -----------------------------------------------------------------------

  const loadCreatorInsights = useCallback(async (force = false) => {
    if (!isAuthed) return;
    if (insightsLoadingRef.current) return;
    if (creatorInsights && !force) return;
    insightsLoadingRef.current = true;
    setCreatorInsights(null);
    setCreatorInsightsLoading(true);
    try {
      const data = await getCreatorInsights(30);
      setCreatorInsights(data);
    } catch (e) {
      toast({ title: "Статистика", description: getErrorMessage(e) });
    } finally {
      insightsLoadingRef.current = false;
      setCreatorInsightsLoading(false);
    }
  }, [isAuthed, creatorInsights]);

  const loadReels = useCallback(async (filter: "all" | "30d") => {
    if (!isAuthed || !user?.id) return;
    setStatsContentFilter(filter);
    setReelsLoading(true);
    try {
      let q = supabase
        .from("reels")
        .select("id, description, thumbnail_url, video_url, created_at, views_count, likes_count, comments_count, saves_count, shares_count")
        .eq("author_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (filter === "30d") {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        q = q.gte("created_at", since);
      }
      const { data, error } = await q;
      if (error) throw error;
      setReels((data ?? []).map(r => ({ ...r, created_at: r.created_at ?? new Date().toISOString() })));
    } catch (e) {
      toast({ title: "Контент", description: getErrorMessage(e) });
    } finally {
      setReelsLoading(false);
    }
  }, [isAuthed, user?.id]);

  // Auto-load insights when entering overview / followers screens
  useEffect(() => {
    if (currentScreen !== "stats_overview" && currentScreen !== "stats_followers") return;
    void loadCreatorInsights(false);
  }, [currentScreen, loadCreatorInsights]);

  // -----------------------------------------------------------------------
  // Render helpers (local to avoid prop-drilling renderMenuItem)
  // -----------------------------------------------------------------------

  const renderHeader = (title: string) => (
    <SettingsHeader
      title={title}
      isDark={isDark}
      currentScreen={currentScreen}
      onBack={onBack}
      onClose={onBack}
    />
  );

  const renderMenuItem = (
    icon: React.ReactNode,
    label: string,
    onClick?: () => void,
    value?: string,
  ) => (
    <SettingsMenuItem
      icon={icon}
      label={label}
      isDark={isDark}
      onClick={onClick}
      value={value}
    />
  );

  // -----------------------------------------------------------------------
  // Screen: statistics (menu)
  // -----------------------------------------------------------------------

  if (currentScreen === "statistics") {
    return (
      <>
        {renderHeader("Статистика")}
        <div className="flex-1 pb-8">
          <div className={cn(
            "mx-4 backdrop-blur-xl rounded-2xl border overflow-hidden",
            isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
          )}>
            {renderMenuItem(
              <BarChart3 className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
              "Обзор",
              async () => {
                onNavigate("stats_overview");
                if (!creatorInsights && isAuthed) {
                  setCreatorInsightsLoading(true);
                  try {
                    const data = await getCreatorInsights(30);
                    setCreatorInsights(data);
                  } catch (e) {
                    toast({ title: "Статистика", description: getErrorMessage(e) });
                  } finally {
                    setCreatorInsightsLoading(false);
                  }
                }
              },
            )}
            {renderMenuItem(
              <Globe className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
              "Рекомендации",
              () => onNavigate("stats_recommendations"),
            )}
            {renderMenuItem(
              <FileText className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
              "Контент",
              async () => {
                onNavigate("stats_content");
                await loadReels("all");
              },
            )}
            {renderMenuItem(
              <Users className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
              "Подписчики",
              async () => {
                onNavigate("stats_followers");
                if (!creatorInsights && isAuthed) {
                  setFollowersGenderLoading(true);
                  try {
                    const data = await getCreatorInsights(30);
                    setCreatorInsights(data);
                  } catch (e) {
                    toast({ title: "Подписчики", description: getErrorMessage(e) });
                  } finally {
                    setFollowersGenderLoading(false);
                  }
                }
              },
            )}
            {renderMenuItem(
              <BadgeCheck className={cn("w-5 h-5", isDark ? "text-white/60" : "text-muted-foreground")} />,
              "Брендированный контент",
              () => onNavigate("branded_content"),
            )}
          </div>
        </div>
      </>
    );
  }

  // -----------------------------------------------------------------------
  // Screen: stats_recommendations
  // -----------------------------------------------------------------------

  if (currentScreen === "stats_recommendations") {
    return (
      <>
        {renderHeader("Рекомендации")}
        <div className="flex-1 pb-8">
          <div className="px-5 pt-2 pb-4">
            <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>
              Посмотрите рекомендации прямо из первоисточника, которые помогут вам творить, развиваться и процветать.
            </p>
          </div>
          <div className="px-4 grid gap-3">
            {[
              { title: "Создание", count: "14 видео" },
              { title: "Вовлеченность", count: "7 видео" },
              { title: "Охват", count: "6 видео" },
              { title: "Монетизация", count: "4 видео" },
              { title: "Руководство", count: "" },
            ].map((item) => (
              <div
                key={item.title}
                className={cn(
                  "backdrop-blur-xl rounded-2xl border px-5 py-4 flex items-center justify-between",
                  isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                )}
              >
                <div>
                  <p className="text-lg font-semibold">{item.title}</p>
                  {item.count ? (
                    <p className={cn("text-sm", isDark ? "text-white/60" : "text-muted-foreground")}>{item.count}</p>
                  ) : null}
                </div>
                <ChevronRight className={cn("w-5 h-5", isDark ? "text-white/40" : "text-muted-foreground")} />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  // -----------------------------------------------------------------------
  // Screen: stats_overview
  // -----------------------------------------------------------------------

  if (currentScreen === "stats_overview") {
    const viewsByDay = (creatorInsights?.views_by_day ?? []).map((p) => ({
      day: dayLabel(p.day),
      views: p.views,
    }));
    const viewsByHour = (creatorInsights?.views_by_hour ?? []).map((p) => ({
      hour: `${p.hour}`,
      views: p.views,
    }));

    return (
      <>
        <div className="flex items-center">
          <div className="flex-1">{renderHeader("Обзор")}</div>
          <button
            type="button"
            disabled={creatorInsightsLoading}
            onClick={() => void loadCreatorInsights(true)}
            className={cn(
              "mr-4 w-9 h-9 rounded-full flex items-center justify-center transition-colors",
              isDark ? "settings-dark-pill hover:opacity-90" : "bg-card/80 border border-border hover:bg-muted/50",
            )}
            title="Обновить"
          >
            <RefreshCw className={cn("w-4 h-4", creatorInsightsLoading && "animate-spin")} />
          </button>
        </div>
        <div className="flex-1 pb-10">
          <div className="px-5 pt-2 pb-4">
            <p className={cn("text-2xl font-semibold", isDark ? "text-white" : "text-white")}>У вас был удачный период!</p>
            <p className={cn("text-sm mt-2", isDark ? "text-white/60" : "text-white/70")}>
              Показатели за последние 30 дней.
            </p>
          </div>

          <div className="px-4 grid gap-3">
            {/* KPI summary card */}
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border px-5 py-5",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              {creatorInsightsLoading ? (
                <p className={cn("text-sm", isDark ? "text-white/60" : "text-muted-foreground")}>Загрузка…</p>
              ) : (
                <div className="grid gap-6">
                  <div>
                    <p className={cn("text-4xl font-bold", isDark ? "text-white" : "text-white")}>{formatCompact(creatorInsights?.views_total ?? 0)}</p>
                    <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Просмотры</p>
                  </div>
                  <div>
                    <p className={cn("text-4xl font-bold", isDark ? "text-white" : "text-white")}>{Math.round(creatorInsights?.views_non_followers_pct ?? 0)}%</p>
                    <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Просмотры от неподписчиков</p>
                  </div>
                  <div>
                    <p className={cn("text-4xl font-bold", isDark ? "text-white" : "text-white")}>{formatCompact(creatorInsights?.likes_total ?? 0)}</p>
                    <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Лайки</p>
                  </div>
                  <div>
                    <p className={cn("text-4xl font-bold", isDark ? "text-white" : "text-white")}>{formatCompact(creatorInsights?.comments_total ?? 0)}</p>
                    <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Комментарии</p>
                  </div>
                  <div>
                    <p className={cn("text-4xl font-bold", isDark ? "text-white" : "text-white")}>{formatCompact(creatorInsights?.followers_total ?? 0)}</p>
                    <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Подписчики</p>
                  </div>
                </div>
              )}
            </div>

            {/* Top content card */}
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border px-5 py-4",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              <p className="font-semibold mb-3">Лучший контент</p>
              {creatorInsightsLoading ? (
                <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
              ) : (creatorInsights?.top_reels?.length ?? 0) === 0 ? (
                <p className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Пока нет данных.</p>
              ) : (
                <div className="grid gap-3">
                  {(creatorInsights?.top_reels ?? []).slice(0, 3).map((t) => (
                    <div key={t.reel_id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className={cn("font-medium truncate", isDark ? "text-white" : "text-white")}>
                          {(t.description ?? "Reel").toString().slice(0, 60) || "Reel"}
                        </p>
                        <p className={cn("text-xs", isDark ? "text-white/60" : "text-white/70")}>
                          Просмотры: {formatCompact(t.views)} · Лайки: {formatCompact(t.likes_count)} · Комменты: {formatCompact(t.comments_count)}
                        </p>
                      </div>
                      <ChevronRight className={cn("w-5 h-5", isDark ? "text-white/40" : "text-muted-foreground")} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Views trend chart */}
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border px-4 py-4",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              <p className="font-semibold mb-3">Динамика просмотров</p>
              <ChartContainer
                className="h-[220px]"
                config={{
                  views: {
                    label: "Просмотры",
                    color: "hsl(var(--primary))",
                  },
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={viewsByDay} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={32} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="views" stroke="var(--color-views)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>

            {/* Hourly activity chart */}
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border px-4 py-4",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              <p className="font-semibold mb-3">Активность (по часам)</p>
              <ChartContainer
                className="h-[220px]"
                config={{
                  views: {
                    label: "Просмотры",
                    color: "hsl(var(--primary))",
                  },
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={viewsByHour} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="hour" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={32} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="views" fill="var(--color-views)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </div>
        </div>
      </>
    );
  }

  // -----------------------------------------------------------------------
  // Screen: stats_content
  // -----------------------------------------------------------------------

  if (currentScreen === "stats_content") {
    return (
      <>
        {renderHeader("Контент")}
        <div className="flex-1 pb-8">
          {/* Content filter pills */}
          <div className="px-4 pt-2 pb-3 flex gap-2">
            {(["all", "30d"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  if (statsContentFilter === f) return;
                  void loadReels(f);
                }}
                className={cn(
                  "px-4 py-2 rounded-full text-sm transition-colors",
                  statsContentFilter === f
                    ? isDark ? "settings-dark-pill settings-dark-pill-active" : "bg-primary text-primary-foreground"
                    : isDark ? "settings-dark-pill" : "bg-card/80 border border-white/20",
                )}
              >
                {f === "all" ? "Все" : "За последние 30 дней"}
              </button>
            ))}
          </div>

          {reelsLoading ? (
            <p className={cn("px-5 text-sm", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
          ) : reels.length === 0 ? (
            <div className="px-4">
              <div className={cn(
                "backdrop-blur-xl rounded-2xl border px-5 py-10 text-center",
                isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
              )}>
                <div className={cn(
                  "w-16 h-16 mx-auto rounded-full border flex items-center justify-center",
                  isDark ? "border-white/20" : "border-white/30",
                )}>
                  <FileText className={cn("w-7 h-7", isDark ? "text-white/60" : "text-white/70")} />
                </div>
                <p className={cn("mt-4 text-lg font-semibold", isDark ? "text-white" : "text-white")}>Контент не найден</p>
                <p className={cn("mt-1 text-sm", isDark ? "text-white/60" : "text-white/70")}>
                  За это время вы не опубликовали ни одного видео.
                </p>
              </div>
            </div>
          ) : (
            <div className="px-4 grid gap-3">
              {reels.map((r) => (
                <div
                  key={r.id}
                  className={cn(
                    "backdrop-blur-xl rounded-2xl border overflow-hidden",
                    isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
                  )}
                >
                  {/* Thumbnail + title row */}
                  <div className="flex items-start gap-3 px-4 pt-4 pb-3">
                    {r.thumbnail_url ? (
                      <img loading="lazy"
                        src={r.thumbnail_url}
                        alt=""
                        className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-black/20"
                      />
                    ) : (
                      <div className={cn(
                        "w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center",
                        isDark ? "bg-white/10" : "bg-black/10",
                      )}>
                        <Video className={cn("w-6 h-6", isDark ? "text-white/40" : "text-black/30")} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={cn("font-semibold truncate text-sm", isDark ? "text-white" : "text-white")}>
                        {(r.description ?? "").toString().slice(0, 80) || "Reel"}
                      </p>
                      <p className={cn("text-xs mt-1", isDark ? "text-white/50" : "text-white/60")}>
                        {new Date(r.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                  </div>

                  {/* Metrics grid */}
                  <div className={cn(
                    "grid grid-cols-4 divide-x border-t",
                    isDark ? "border-white/10 divide-white/10" : "border-white/20 divide-white/20",
                  )}>
                    {([
                      { label: "Просм.", value: r.views_count ?? 0 },
                      { label: "Лайки", value: r.likes_count ?? 0 },
                      { label: "Сохр.", value: r.saves_count ?? 0 },
                      { label: "Репост", value: r.shares_count ?? 0 },
                    ] as const).map((m) => (
                      <div key={m.label} className="flex flex-col items-center py-3 gap-0.5">
                        <span className={cn("text-sm font-semibold", isDark ? "text-white" : "text-white")}>
                          {formatCompact(m.value)}
                        </span>
                        <span className={cn("text-[10px]", isDark ? "text-white/50" : "text-white/60")}>
                          {m.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  // -----------------------------------------------------------------------
  // Screen: stats_followers
  // -----------------------------------------------------------------------

  if (currentScreen === "stats_followers") {
    const gender = creatorInsights?.followers_gender ?? { male: 0, female: 0, unknown: 0 };
    const total = (gender.male ?? 0) + (gender.female ?? 0) + (gender.unknown ?? 0);
    const malePct = total ? Math.round(((gender.male ?? 0) * 100) / total) : 0;
    const femalePct = total ? Math.round(((gender.female ?? 0) * 100) / total) : 0;

    return (
      <>
        <div className="flex items-center">
          <div className="flex-1">{renderHeader("Подписчики")}</div>
          <button
            type="button"
            disabled={creatorInsightsLoading}
            onClick={() => void loadCreatorInsights(true)}
            className={cn(
              "mr-4 w-9 h-9 rounded-full flex items-center justify-center transition-colors",
              isDark ? "settings-dark-pill hover:opacity-90" : "bg-card/80 border border-border hover:bg-muted/50",
            )}
            title="Обновить"
          >
            <RefreshCw className={cn("w-4 h-4", creatorInsightsLoading && "animate-spin")} />
          </button>
        </div>
        <div className="flex-1 pb-8">
          <div className="px-4 pt-2 pb-3 flex items-center justify-between">
            <div className={cn(
              "px-4 py-2 rounded-full text-sm",
              isDark ? "settings-dark-pill" : "bg-card/80 border border-white/20",
            )}>
              Последние 30 дней
            </div>
            <Info className={cn("w-5 h-5", isDark ? "text-white/60" : "text-white/70")} />
          </div>

          <div className="px-4 grid gap-3">
            {/* Gender breakdown */}
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border px-5 py-4",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              <p className="text-lg font-semibold">Пол</p>
              {followersGenderLoading ? (
                <p className={cn("text-sm mt-2", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</p>
              ) : (
                <div className="mt-3 grid gap-3">
                  <div className="flex items-center justify-between">
                    <p>Мужчины</p>
                    <p className={cn("text-sm", isDark ? "text-white/70" : "text-white/80")}>{malePct}%</p>
                  </div>
                  <div className={cn("h-2 rounded-full overflow-hidden", isDark ? "bg-white/10" : "bg-white/15")}>
                    <div className="h-full bg-primary" style={{ width: `${malePct}%` }} />
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <p>Женщины</p>
                    <p className={cn("text-sm", isDark ? "text-white/70" : "text-white/80")}>{femalePct}%</p>
                  </div>
                  <div className={cn("h-2 rounded-full overflow-hidden", isDark ? "bg-white/10" : "bg-white/15")}>
                    <div className="h-full bg-primary" style={{ width: `${femalePct}%` }} />
                  </div>
                </div>
              )}
            </div>

            {/* Hourly activity chart */}
            <div className={cn(
              "backdrop-blur-xl rounded-2xl border px-5 py-4",
              isDark ? "settings-dark-card" : "bg-card/80 border-white/20",
            )}>
              <p className="text-lg font-semibold">Периоды наибольшей активности</p>
              <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>
                По просмотрам ваших Reels (приближение к активности аудитории).
              </p>
              <div className="mt-4">
                <ChartContainer
                  className="h-[220px]"
                  config={{
                    views: {
                      label: "Просмотры",
                      color: "hsl(var(--primary))",
                    },
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(creatorInsights?.views_by_hour ?? []).map((p) => ({ hour: `${p.hour}`, views: p.views }))}
                      margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="hour" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} width={32} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="views" fill="var(--color-views)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Fallback — should never be reached when currentScreen is a stats screen
  return null;
}
