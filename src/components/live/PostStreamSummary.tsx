import React from 'react';
import { Share2, Video, Radio, Clock, Eye, Users, MessageCircle, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { StreamAnalytics } from '@/types/livestream';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}ч ${m}м ${s}с`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}

interface StatItemProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  iconClass?: string;
}

function StatItem({ icon: Icon, label, value, iconClass }: StatItemProps) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Icon className={cn('h-5 w-5', iconClass ?? 'text-zinc-400')} aria-hidden />
      <span className="text-lg font-bold text-white">{value}</span>
      <span className="text-xs text-zinc-400">{label}</span>
    </div>
  );
}

interface PostStreamSummaryProps {
  analytics: StreamAnalytics;
  durationSec: number;
  hasRecording?: boolean;
  onGoToRecording?: () => void;
  onShare?: () => void;
  onNewStream?: () => void;
  className?: string;
}

/**
 * Post-stream summary card shown after the broadcast ends.
 * Displays stats, mini retention chart, and action buttons.
 */
export function PostStreamSummary({
  analytics,
  durationSec,
  hasRecording = false,
  onGoToRecording,
  onShare,
  onNewStream,
  className,
}: PostStreamSummaryProps) {
  const maxViewers = Math.max(
    ...analytics.viewer_retention_curve.map((p) => p.viewers),
    1,
  );

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <h2 className="text-xl font-bold text-white">Эфир завершён 🎉</h2>

      {/* Stats grid */}
      <Card className="bg-zinc-800 border-zinc-700">
        <CardContent className="pt-4">
          <div className="grid grid-cols-3 gap-4">
            <StatItem
              icon={Clock}
              label="Длительность"
              value={formatDuration(durationSec)}
              iconClass="text-blue-400"
            />
            <StatItem
              icon={Eye}
              label="Пик зрителей"
              value={analytics.peak_viewers.toLocaleString()}
              iconClass="text-green-400"
            />
            <StatItem
              icon={Users}
              label="Всего зрителей"
              value={analytics.total_unique_viewers.toLocaleString()}
              iconClass="text-purple-400"
            />
            <StatItem
              icon={MessageCircle}
              label="Сообщений"
              value={analytics.total_chat_messages.toLocaleString()}
              iconClass="text-yellow-400"
            />
            <StatItem
              icon={Heart}
              label="Реакций"
              value={analytics.total_reactions.toLocaleString()}
              iconClass="text-pink-400"
            />
            <StatItem
              icon={Users}
              label="Новых подписчиков"
              value={analytics.new_followers_during_stream.toLocaleString()}
              iconClass="text-cyan-400"
            />
          </div>
        </CardContent>
      </Card>

      {/* Viewer retention mini-chart */}
      {analytics.viewer_retention_curve.length > 1 && (
        <Card className="bg-zinc-800 border-zinc-700">
          <CardContent className="pt-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
              Удержание аудитории
            </h3>
            <div className="flex items-end gap-0.5 h-16" aria-label="Viewer retention chart">
              {analytics.viewer_retention_curve.map((point) => (
                <div
                  key={point.minute}
                  className="flex-1 bg-red-600/70 rounded-t-sm min-w-0"
                  style={{
                    height: `${Math.round((point.viewers / maxViewers) * 100)}%`,
                  }}
                  title={`Минута ${point.minute}: ${point.viewers} зрителей`}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-zinc-500">
              <span>0 мин</span>
              <span>{analytics.viewer_retention_curve.at(-1)?.minute ?? 0} мин</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        {hasRecording && (
          <Button
            onClick={onGoToRecording}
            variant="outline"
            className="border-zinc-600 text-white hover:bg-zinc-700"
          >
            <Video className="h-4 w-4 mr-2" />
            Смотреть запись
          </Button>
        )}
        <Button
          onClick={onShare}
          variant="outline"
          className="border-zinc-600 text-white hover:bg-zinc-700"
        >
          <Share2 className="h-4 w-4 mr-2" />
          Поделиться статистикой
        </Button>
        <Button
          onClick={onNewStream}
          className="bg-red-600 hover:bg-red-500 text-white font-semibold"
        >
          <Radio className="h-4 w-4 mr-2" />
          Начать новый эфир
        </Button>
      </div>
    </div>
  );
}
