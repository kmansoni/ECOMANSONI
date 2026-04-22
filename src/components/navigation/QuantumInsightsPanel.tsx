import { Brain, Sparkles, Users, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  RouteSuperposition,
  TwinSimulationResult,
  SwarmRecommendation,
  TimeAccount,
} from '@/types/quantum-transport';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { navText } from '@/lib/navigation/navigationUi';

interface QuantumInsightsPanelProps {
  superposition: RouteSuperposition | null;
  twinSimulation: TwinSimulationResult | null;
  swarmRecommendation: SwarmRecommendation | null;
  timeAccount: TimeAccount | null;
  compact?: boolean;
  className?: string;
}

export function QuantumInsightsPanel({
  superposition,
  twinSimulation,
  swarmRecommendation,
  timeAccount,
  compact = false,
  className,
}: QuantumInsightsPanelProps) {
  const { settings } = useUserSettings();
  const languageCode = settings?.language_code ?? null;
  if (!superposition && !twinSimulation && !swarmRecommendation && !timeAccount) {
    return null;
  }

  const items = [
    superposition
      ? {
          key: 'superposition',
          icon: Sparkles,
          title: navText('Квантовый фронт', 'Quantum frontier', languageCode),
          value: `${superposition.paretoFront.filter((point) => point.rank === 0).length} ${navText('недоминир.', 'non-dominated', languageCode)}`,
          note: `${superposition.waveFunctions.length} ${navText('вариантов', 'variants', languageCode)}`,
        }
      : null,
    twinSimulation
      ? {
          key: 'twin',
          icon: Brain,
          title: navText('Цифровой двойник', 'Digital twin', languageCode),
          value: `${Math.round(twinSimulation.completionProbability * 100)}%`,
          note: `${navText('стресс', 'stress', languageCode)} ${Math.round(twinSimulation.predictedState.stress * 100)}%`,
        }
      : null,
    swarmRecommendation
      ? {
          key: 'swarm',
          icon: Users,
          title: navText('Роевой совет', 'Swarm advice', languageCode),
          value: swarmRecommendation.suggestedMode,
          note: `${Math.round(swarmRecommendation.collectiveBenefit.trafficReductionPercent)}% ${navText('меньше трафика', 'less traffic', languageCode)}`,
        }
      : null,
    timeAccount
      ? {
          key: 'time',
          icon: Wallet,
          title: navText('Банк времени', 'Time bank', languageCode),
          value: `${timeAccount.balanceMinutes} ${navText('мин', 'min', languageCode)}`,
          note: `${navText('тренд', 'trend', languageCode)} ${timeAccount.monthlyTrend >= 0 ? '+' : ''}${timeAccount.monthlyTrend} ${navText('мин/мес', 'min/month', languageCode)}`,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-gray-900/80 backdrop-blur-md shadow-lg shadow-black/20',
        compact ? 'p-3' : 'p-4',
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-cyan-400" />
        <span className="text-sm font-semibold text-white">{navText('Квантовый транспорт', 'Quantum Transport', languageCode)}</span>
      </div>

      <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-1')}>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2"
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
                <Icon className="h-3.5 w-3.5 text-cyan-300" />
                <span>{item.title}</span>
              </div>
              <div className="text-sm font-semibold text-white">{item.value}</div>
              <div className="text-xs text-gray-500">{item.note}</div>
            </div>
          );
        })}
      </div>

      {twinSimulation?.recommendation && !compact && (
        <div className="mt-3 rounded-xl border border-amber-400/10 bg-amber-400/5 px-3 py-2 text-xs text-amber-100/90">
          {twinSimulation.recommendation}
        </div>
      )}
    </div>
  );
}
