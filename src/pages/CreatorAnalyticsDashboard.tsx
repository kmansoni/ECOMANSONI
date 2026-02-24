import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, TrendingUp, Eye, Play, Heart, MessageSquare, AlertCircle, Lightbulb, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface CreatorMetrics {
  total_reels: number;
  total_views: number;
  total_watches: number;
  avg_watch_rate: number;
  total_reach: number;
  avg_views_per_reel: number;
  avg_watches_per_reel: number;
  strong_reels_count: number;
}

interface ReelInsight {
  reel_id: string;
  watched_rate: number;
  view_start_rate: number;
  report_rate: number;
  insight_type: "retention" | "hook" | "safety";
  hint: string;
  status: "low" | "warning" | "critical";
}

interface RecommendedAction {
  rank: number;
  recommendation: string;
  impact: "high" | "medium" | "low";
  reels_affected: number;
}

export function CreatorAnalyticsDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [metrics, setMetrics] = useState<CreatorMetrics | null>(null);
  const [insights, setInsights] = useState<ReelInsight[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendedAction[]>([]);
  const [topReels, setTopReels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    let mounted = true;
    const loadData = async () => {
      try {
        setLoading(true);

        // Get creator dashboard metrics
        const { data: dashboardData, error: dashboardError } = await (supabase as any).rpc(
          "get_creator_dashboard_v1",
          { p_creator_id: user.id }
        );
        if (dashboardError) throw dashboardError;
        if (mounted && dashboardData) {
          setMetrics(dashboardData);
        }

        // Get creator recommendations
        const { data: recommendationsData, error: recommendationsError } = await (supabase as any).rpc(
          "get_creator_recommendations_v1",
          { p_creator_id: user.id, p_limit: 5 }
        );
        if (recommendationsError) throw recommendationsError;
        if (mounted && recommendationsData) {
          setRecommendations(recommendationsData);
        }

        // Get growth trends
        const { data: growthData, error: growthError } = await (supabase as any).rpc(
          "get_creator_growth_v1",
          { p_creator_id: user.id, p_days: 7 }
        );
        if (growthError) throw growthError;
        // Store growth data if needed for charts later

      } catch (error: any) {
        console.error("Failed to load analytics:", error);
        if (mounted) {
          toast.error(`Ошибка загрузки аналитики: ${error.message}`);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadData();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border safe-area-top">
        <div className="flex items-center h-12 px-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-10 h-10 -ml-2 rounded-full hover:bg-muted transition-colors"
            aria-label="Назад"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="font-semibold text-lg ml-2">Аналитика</h1>
        </div>
      </header>

      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            {/* Key Metrics */}
            {metrics && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold mb-4">Основные метрики</h2>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {/* Total Reels */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Всего Reels</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{metrics.total_reels}</div>
                    </CardContent>
                  </Card>

                  {/* Total Views */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                        <Eye className="w-4 h-4" /> Просмотры
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {metrics.total_views >= 1000
                          ? `${(metrics.total_views / 1000).toFixed(1)}K`
                          : metrics.total_views}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        ∅ {metrics.avg_views_per_reel.toFixed(0)} на Reel
                      </p>
                    </CardContent>
                  </Card>

                  {/* Total Watches */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                        <Play className="w-4 h-4" /> Просмотры полностью
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {metrics.total_watches >= 1000
                          ? `${(metrics.total_watches / 1000).toFixed(1)}K`
                          : metrics.total_watches}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(metrics.avg_watch_rate * 100).toFixed(1)}% в среднем
                      </p>
                    </CardContent>
                  </Card>

                  {/* Reach */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Охват</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {metrics.total_reach >= 1000
                          ? `${(metrics.total_reach / 1000).toFixed(1)}K`
                          : metrics.total_reach}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Strong Reels */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Успешные Reels
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{metrics.strong_reels_count}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {metrics.total_reels > 0
                          ? ((metrics.strong_reels_count / metrics.total_reels) * 100).toFixed(0)
                          : 0}
                        %
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </section>
            )}

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-yellow-500" />
                    Рекомендации
                  </h2>
                </div>

                <div className="space-y-3">
                  {recommendations.map((rec, idx) => (
                    <Card key={idx}>
                      <CardContent className="pt-6">
                        <div className="flex gap-3">
                          <Target className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="font-medium text-sm">{rec.recommendation}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Может повлиять на {rec.reels_affected} Reels • Влияние:{" "}
                              <span
                                className={
                                  rec.impact === "high"
                                    ? "text-red-500 font-medium"
                                    : rec.impact === "medium"
                                      ? "text-yellow-500 font-medium"
                                      : "text-green-500 font-medium"
                                }
                              >
                                {rec.impact === "high"
                                  ? "Высокое"
                                  : rec.impact === "medium"
                                    ? "Среднее"
                                    : "Низкое"}
                              </span>
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* No Data */}
            {!loading && !metrics && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mb-3" />
                    <p>Недостаточно данных для отображения аналитики</p>
                    <p className="text-sm mt-2">Загрузите несколько Reels, чтобы видеть статистику</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CreatorAnalyticsDashboard;
