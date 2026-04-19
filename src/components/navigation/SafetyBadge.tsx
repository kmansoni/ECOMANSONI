import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { SafetyAssessment } from '@/lib/navigation/safetyScore';

interface SafetyBadgeProps {
  assessment: SafetyAssessment;
  compact?: boolean;
  className?: string;
}

const LABELS: Record<SafetyAssessment['label'], string> = {
  safe: 'Безопасно',
  moderate: 'Умеренно',
  caution: 'Осторожно',
  unsafe: 'Небезопасно',
};

export const SafetyBadge = memo(function SafetyBadge({
  assessment,
  compact = false,
  className,
}: SafetyBadgeProps) {
  const pct = Math.round(assessment.overallScore * 100);

  if (compact) {
    return (
      <div
        className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', className)}
        style={{ backgroundColor: `${assessment.color}20`, color: assessment.color }}
      >
        🛡️ {pct}%
      </div>
    );
  }

  return (
    <div className={cn('p-3 rounded-xl border', className)}
      style={{ borderColor: `${assessment.color}30`, backgroundColor: `${assessment.color}08` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">🛡️</span>
          <span className="text-sm font-medium" style={{ color: assessment.color }}>
            Безопасность: {pct}%
          </span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${assessment.color}20`, color: assessment.color }}
        >
          {LABELS[assessment.label]}
        </span>
      </div>

      {/* Factors */}
      <div className="space-y-1.5">
        {assessment.factors.map(f => (
          <div key={f.name} className="flex items-center gap-2">
            <span className="text-xs w-4">{f.icon}</span>
            <span className="text-xs text-gray-400 flex-1">{f.detail}</span>
            <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${f.score * 100}%`,
                  backgroundColor: f.score > 0.7 ? '#22c55e' : f.score > 0.4 ? '#eab308' : '#ef4444',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      {assessment.recommendations.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/5">
          {assessment.recommendations.map((rec, i) => (
            <p key={i} className="text-xs text-gray-500 flex items-start gap-1">
              <span className="text-amber-500 mt-0.5">⚠</span>
              {rec}
            </p>
          ))}
        </div>
      )}
    </div>
  );
});
