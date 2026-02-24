import { Card } from "@/components/ui/card";
import { AlertCircle, Sparkles, BarChart3, TrendingUp } from "lucide-react";

export interface RankingExplanationProps {
  algorithm_version?: string;
  final_score?: number;
  ranking_reason?: string;
  source_pool?: string;
  feed_position?: number;
}

export function RankingExplanation({
  algorithm_version,
  final_score,
  ranking_reason,
  source_pool,
  feed_position,
}: RankingExplanationProps) {
  // Don't render if no ranking data is present
  if (!algorithm_version && !ranking_reason && !source_pool) {
    return null;
  }

  const getAlgorithmLabel = (version?: string): string => {
    if (!version) return "Standard Algorithm";
    if (version.includes("diversity")) return "Diversity-Enhanced Algorithm";
    if (version.includes("trending")) return "Trending-Boosted Algorithm";
    if (version.includes("personalized")) return "Personalized Algorithm";
    return version;
  };

  const getSourcePoolLabel = (pool?: string): string => {
    if (!pool) return "Mixed sources";
    const poolLower = String(pool).toLowerCase();
    if (poolLower.includes("following")) return "Following";
    if (poolLower.includes("trending")) return "Trending";
    if (poolLower.includes("recommended")) return "Recommended";
    if (poolLower.includes("discovery")) return "Discovery";
    return pool;
  };

  const getScoreColor = (score?: number): string => {
    if (!score) return "text-muted-foreground";
    if (score >= 0.8) return "text-green-500";
    if (score >= 0.6) return "text-amber-500";
    return "text-orange-500";
  };

  const getReasonIcon = (reason?: string): React.ReactNode => {
    if (!reason) return null;
    const reasonLower = String(reason).toLowerCase();
    if (reasonLower.includes("trending") || reasonLower.includes("popular")) {
      return <TrendingUp className="w-4 h-4" />;
    }
    if (reasonLower.includes("diverse")) {
      return <Sparkles className="w-4 h-4" />;
    }
    if (reasonLower.includes("relevant")) {
      return <BarChart3 className="w-4 h-4" />;
    }
    return <AlertCircle className="w-4 h-4" />;
  };

  return (
    <Card className="p-3 bg-muted/50 border-dashed border-muted-foreground/30 mt-3">
      <div className="space-y-2 text-xs">
        <div className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-foreground">Why this content?</p>
            <p className="text-muted-foreground mt-0.5">
              {algorithm_version ? getAlgorithmLabel(algorithm_version) : "AI selection"}
            </p>
          </div>
        </div>

        {ranking_reason && (
          <div className="flex items-start gap-2 pl-6">
            {getReasonIcon(ranking_reason)}
            <div className="flex-1">
              <p className="text-muted-foreground">{ranking_reason}</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-muted-foreground pl-6 pt-1">
          <div className="flex items-center gap-4">
            {source_pool && (
              <span className="inline-block px-2 py-1 rounded bg-background text-xs font-medium">
                {getSourcePoolLabel(source_pool)}
              </span>
            )}
            {final_score !== undefined && (
              <span className={`font-semibold ${getScoreColor(final_score)}`}>
                {(final_score * 100).toFixed(0)}% match
              </span>
            )}
          </div>
          {feed_position && (
            <span className="text-xs text-muted-foreground">
              #{feed_position}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
