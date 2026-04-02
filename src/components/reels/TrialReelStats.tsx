import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Eye, Heart, MessageCircle, Share2, Clock, Loader2, Globe, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTrialReels } from '@/hooks/useTrialReels';
import type { TrialStats } from '@/hooks/useTrialReels';

interface TrialReelStatsProps {
  postId: string;
  onPublish?: () => void;
  onDelete?: () => void;
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-card">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function TrialReelStats({ postId, onPublish, onDelete }: TrialReelStatsProps) {
  const { getTrialStats, endTrial, loading } = useTrialReels();
  const [stats, setStats] = useState<TrialStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const s = await getTrialStats(postId);
      setStats(s);
    } finally {
      setLoadingStats(false);
    }
  }, [postId, getTrialStats]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const handlePublish = useCallback(async () => {
    await endTrial(postId, true);
    onPublish?.();
  }, [postId, endTrial, onPublish]);

  const handleRemove = useCallback(async () => {
    await endTrial(postId, false);
    onDelete?.();
  }, [postId, endTrial, onDelete]);

  if (loadingStats || !stats) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}с`;
    return `${Math.floor(seconds / 60)}м ${Math.round(seconds % 60)}с`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 p-4"
    >
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Статистика пробного Reel</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={Eye} label="Просмотры" value={stats.views.toLocaleString('ru-RU')} />
        <StatCard icon={Heart} label="Лайки" value={stats.likes.toLocaleString('ru-RU')} />
        <StatCard icon={MessageCircle} label="Комментарии" value={stats.comments.toLocaleString('ru-RU')} />
        <StatCard icon={Share2} label="Поделились" value={stats.shares.toLocaleString('ru-RU')} />
        <StatCard icon={Clock} label="Среднее время" value={formatTime(stats.avgWatchTime)} />
        <StatCard icon={BarChart3} label="Досмотры" value={`${Math.round(stats.completionRate * 100)}%`} />
      </div>

      {/* Решение */}
      <div className="flex gap-2 pt-2">
        <Button
          variant="default"
          className="flex-1 min-h-[44px]"
          onClick={handlePublish}
          disabled={loading}
          aria-label="Опубликовать для всех"
        >
          <Globe className="w-4 h-4 mr-2" />
          Опубликовать для всех
        </Button>
        <Button
          variant="destructive"
          className="min-h-[44px]"
          onClick={handleRemove}
          disabled={loading}
          aria-label="Удалить пробный Reel"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
}
