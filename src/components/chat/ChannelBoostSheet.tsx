/**
 * ChannelBoostSheet — Channel Boost UI
 *
 * Displays:
 *  - Current channel boost level with progress bar to next level
 *  - Star amount selector (50 / 100 / 200 / 500 / 1000)
 *  - "Boost" button with loading state
 *  - Top boosters list
 *
 * Usage:
 *  <ChannelBoostSheet channelId="..." open={open} onOpenChange={setOpen} />
 */

import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Star, Zap, Trophy } from "lucide-react";
import { useChannelBoost, type ChannelBoostLevel, type TopBooster } from "@/hooks/useChannelBoost";
import { useAuth } from "@/hooks/useAuth";

// ─── Level config ─────────────────────────────────────────────────────────────

interface LevelConfig {
  level: number;
  label: string;
  requiredBoosts: number;
  color: string;
}

const LEVEL_CONFIG: LevelConfig[] = [
  { level: 1, label: "Уровень 1", requiredBoosts: 5, color: "bg-blue-400" },
  { level: 2, label: "Уровень 2", requiredBoosts: 15, color: "bg-purple-400" },
  { level: 3, label: "Уровень 3", requiredBoosts: 30, color: "bg-yellow-400" },
  { level: 4, label: "Уровень 4", requiredBoosts: 60, color: "bg-orange-400" },
  { level: 5, label: "Уровень 5", requiredBoosts: 100, color: "bg-red-400" },
];

const STAR_OPTIONS = [50, 100, 200, 500, 1000];

function getProgressToNextLevel(boostersCount: number, currentLevel: number): number {
  const current = LEVEL_CONFIG.find((l) => l.level === currentLevel);
  const next = LEVEL_CONFIG.find((l) => l.level === currentLevel + 1);
  if (!next) return 100; // max level
  const prevRequired = current?.requiredBoosts ?? 0;
  const range = next.requiredBoosts - prevRequired;
  const progress = boostersCount - prevRequired;
  return Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function LevelBadge({ level }: { level: number }) {
  const config = LEVEL_CONFIG.find((l) => l.level === level);
  return (
    <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-white text-sm font-semibold ${config?.color ?? "bg-gray-400"}`}>
      <Zap className="w-3 h-3" />
      {config?.label ?? `Уровень ${level}`}
    </div>
  );
}

function BoosterRow({ booster, rank }: { booster: TopBooster; rank: number }) {
  const initials = booster.userId.slice(0, 2).toUpperCase();
  const expiresDate = new Date(booster.expiresAt).toLocaleDateString("ru-RU");

  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-xs text-muted-foreground w-5 text-center">{rank}</span>
      <Avatar className="w-8 h-8">
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{booster.userId.slice(0, 8)}…</p>
        <p className="text-xs text-muted-foreground">до {expiresDate}</p>
      </div>
      <div className="flex items-center gap-1 text-yellow-500">
        <Star className="w-3 h-3 fill-current" />
        <span className="text-xs font-semibold">{booster.starsSpent}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ChannelBoostSheetProps {
  channelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChannelBoostSheet({ channelId, open, onOpenChange }: ChannelBoostSheetProps) {
  const { user } = useAuth();
  const { boostChannel, getBoostLevel, getMyBoost, topBoosters, loading, error } = useChannelBoost();

  const [boostLevel, setBoostLevel] = useState<ChannelBoostLevel | null>(null);
  const [boosters, setBoosters] = useState<TopBooster[]>([]);
  const [myBoost, setMyBoost] = useState<{ starsSpent: number } | null>(null);
  const [selectedStars, setSelectedStars] = useState(100);
  const [boosting, setBoosting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!channelId) return;
    const [level, top, mine] = await Promise.all([
      getBoostLevel(channelId),
      topBoosters(channelId, 10),
      getMyBoost(channelId),
    ]);
    setBoostLevel(level);
    setBoosters(top);
    setMyBoost(mine ? { starsSpent: mine.starsSpent } : null);
  }, [channelId, getBoostLevel, topBoosters, getMyBoost]);

  useEffect(() => {
    if (open) {
      loadData();
      setSuccessMsg(null);
    }
  }, [open, loadData]);

  const handleBoost = async () => {
    setBoosting(true);
    setSuccessMsg(null);
    const result = await boostChannel(channelId, selectedStars);
    if (result.ok) {
      setSuccessMsg(`Канал успешно забустован на ${selectedStars} ⭐`);
      await loadData();
    }
    setBoosting(false);
  };

  const progress = boostLevel
    ? getProgressToNextLevel(boostLevel.boostersCount, boostLevel.currentLevel)
    : 0;
  const nextLevel = (boostLevel?.currentLevel ?? 0) + 1;
  const nextConfig = LEVEL_CONFIG.find((l) => l.level === nextLevel);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Буст канала
          </SheetTitle>
          <SheetDescription>
            Трать Stars, чтобы поднять уровень канала и открыть перки
          </SheetDescription>
        </SheetHeader>

        {/* Current level */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between">
            {boostLevel !== null && <LevelBadge level={boostLevel.currentLevel} />}
            <span className="text-sm text-muted-foreground">
              {boostLevel?.boostersCount ?? 0} бустеров
            </span>
          </div>

          {nextConfig && (
            <>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">
                {progress}% до {nextConfig.label}
              </p>
            </>
          )}

          {!nextConfig && boostLevel && boostLevel.currentLevel >= 5 && (
            <p className="text-sm text-yellow-500 font-semibold">🏆 Максимальный уровень достигнут!</p>
          )}
        </div>

        {/* My current boost */}
        {myBoost && (
          <div className="bg-muted rounded-xl p-3 mb-4 flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-500 fill-current" />
            <span className="text-sm">
              Ваш буст: <strong>{myBoost.starsSpent} Stars</strong>
            </span>
          </div>
        )}

        {/* Star selector */}
        {user && (
          <div className="space-y-3 mb-6">
            <p className="text-sm font-medium">Выбери количество Stars:</p>
            <div className="grid grid-cols-5 gap-2">
              {STAR_OPTIONS.map((amount) => (
                <button
                  key={amount}
                  onClick={() => setSelectedStars(amount)}
                  className={`
                    flex flex-col items-center py-2 px-1 rounded-xl border text-sm font-semibold transition-colors
                    ${selectedStars === amount
                      ? "border-yellow-500 bg-yellow-500/10 text-yellow-600"
                      : "border-border hover:border-yellow-400"}
                  `}
                >
                  <Star className="w-4 h-4 mb-1 fill-current" />
                  {amount}
                </button>
              ))}
            </div>

            {/* Error / success messages */}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {successMsg && <p className="text-sm text-green-600">{successMsg}</p>}

            <Button
              onClick={handleBoost}
              disabled={boosting || loading}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-white"
            >
              {boosting ? "Бустим…" : `Буст за ${selectedStars} ⭐`}
            </Button>
          </div>
        )}

        {/* Top boosters */}
        {boosters.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <p className="text-sm font-semibold">Топ бустеры</p>
            </div>
            <div className="divide-y divide-border">
              {boosters.map((b, idx) => (
                <BoosterRow key={b.userId} booster={b} rank={idx + 1} />
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
