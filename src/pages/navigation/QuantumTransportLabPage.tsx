import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, Gauge, Sparkles, Activity, RefreshCw, Play, Microscope } from 'lucide-react';
import { cn } from '@/lib/utils';
import { quantumTransportService } from '@/lib/navigation/quantumTransportService';
import { supabase } from '@/lib/supabase';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { getNavigationLocale, navText } from '@/lib/navigation/navigationUi';
import type { ScenarioResult, SimulationSnapshot, TimeAccount, WhatIfScenario, SystemSelfReport } from '@/types/quantum-transport';

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{hint}</div>
    </div>
  );
}

export default function QuantumTransportLabPage() {
  const navigate = useNavigate();
  const { settings } = useUserSettings();
  const languageCode = settings?.language_code ?? null;
  const locale = getNavigationLocale(languageCode);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [scenarios, setScenarios] = useState<WhatIfScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [observation, setObservation] = useState(navText('Вечером растут задержки на ключевых маршрутах', 'Delays rise on key routes in the evening', languageCode));
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof quantumTransportService.explainObservation>> | null>(null);
  const [timeAccount, setTimeAccount] = useState<TimeAccount | null>(null);
  const [timeSummary, setTimeSummary] = useState('');
  const [selfReport, setSelfReport] = useState<SystemSelfReport | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      setUserId(user.id);
      const [labState, initialAnalysis] = await Promise.all([
        quantumTransportService.getLabState(user.id),
        quantumTransportService.explainObservation(navText('Вечером растут задержки на ключевых маршрутах', 'Delays rise on key routes in the evening', languageCode), user.id),
      ]);
      if (cancelled) return;

      setSnapshot(labState.snapshot);
      setScenarios(labState.scenarios);
      setSelectedScenarioId(labState.scenarios[0]?.id ?? null);
      setSelfReport(labState.selfReport);
      setTimeAccount(labState.timeAccount);
      setTimeSummary(labState.timeSummary);
      setAnalysis(initialAnalysis);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null,
    [scenarios, selectedScenarioId],
  );

  const refreshSnapshot = () => {
    if (!userId) return;
    setLoading(true);
    void (async () => {
      const labState = await quantumTransportService.getLabState(userId);
      setSnapshot(labState.snapshot);
      setScenarios(labState.scenarios);
      setSelfReport(labState.selfReport);
      setTimeAccount(labState.timeAccount);
      setTimeSummary(labState.timeSummary);
      setLoading(false);
    })();
  };

  const runScenario = () => {
    if (!selectedScenario || !userId) return;
    setLoading(true);
    void (async () => {
      const nextResult = await quantumTransportService.runScenario(selectedScenario, minutes);
      const labState = await quantumTransportService.getLabState(userId);
      setResult(nextResult);
      setSnapshot(labState.snapshot);
      setSelfReport(labState.selfReport);
      setTimeAccount(labState.timeAccount);
      setTimeSummary(labState.timeSummary);
      setLoading(false);
    })();
  };

  const analyzeObservation = () => {
    if (!userId) return;
    void quantumTransportService.explainObservation(observation, userId).then(setAnalysis);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-gray-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <button onClick={() => navigate(-1)} className="rounded-xl p-2 hover:bg-white/5" aria-label={navText('Назад', 'Back', languageCode)}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="text-sm text-cyan-300">Quantum Transport Lab</div>
            <h1 className="text-lg font-semibold">{navText('Городское моделирование и What-If сценарии', 'City Simulation & What-If Scenarios', languageCode)}</h1>
          </div>
          <button onClick={refreshSnapshot} className="ml-auto rounded-xl border border-white/10 bg-white/[0.04] p-2 hover:bg-white/[0.08]" aria-label={navText('Обновить', 'Refresh', languageCode)}>
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1.2fr,0.8fr]">
        <section className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label={navText('Агенты', 'Agents', languageCode)} value={String(snapshot?.metrics.totalAgents ?? 0)} hint={navText('активные участники модели', 'active simulation participants', languageCode)} />
            <MetricCard label={navText('Средняя скорость', 'Average speed', languageCode)} value={`${snapshot?.metrics.avgSpeed ?? 0} ${navText('км/ч', 'km/h', languageCode)}`} hint={navText('по движущимся агентам', 'for moving agents', languageCode)} />
            <MetricCard label={navText('Пробочный индекс', 'Congestion index', languageCode)} value={`${snapshot?.metrics.congestionIndex ?? 0}/10`} hint={navText('сводная загрузка сети', 'aggregate network load', languageCode)} />
            <MetricCard label="CO2 / h" value={`${snapshot?.metrics.co2TonsPerHour ?? 0} ${navText('т', 't', languageCode)}`} hint={navText('оценка для текущего среза', 'estimate for the current snapshot', languageCode)} />
          </div>

          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-white/[0.03] to-emerald-500/10 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              <h2 className="text-base font-semibold">{navText('What-If сценарии', 'What-If scenarios', languageCode)}</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => setSelectedScenarioId(scenario.id)}
                  className={cn(
                    'rounded-2xl border p-4 text-left transition-colors',
                    selectedScenarioId === scenario.id
                      ? 'border-cyan-400/50 bg-cyan-400/10'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]',
                  )}
                >
                  <div className="text-sm font-semibold text-white">{scenario.name}</div>
                  <div className="mt-1 text-sm text-gray-400">{scenario.description}</div>
                  <div className="mt-3 text-xs text-gray-500">{navText('Изменений', 'Modifications', languageCode)}: {scenario.modifications.length}</div>
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="text-sm text-gray-400">
                {navText('Горизонт моделирования', 'Simulation horizon', languageCode)}
                <select
                  value={minutes}
                  onChange={(event) => setMinutes(Number(event.target.value))}
                  className="ml-2 rounded-lg border border-white/10 bg-gray-900 px-3 py-2 text-white"
                >
                  <option value={30}>30 {navText('мин', 'min', languageCode)}</option>
                  <option value={60}>60 {navText('мин', 'min', languageCode)}</option>
                  <option value={120}>120 {navText('мин', 'min', languageCode)}</option>
                </select>
              </label>
              <button
                onClick={runScenario}
                disabled={!selectedScenario || loading}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-gray-950 transition-colors hover:bg-cyan-400 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {navText('Прогнать сценарий', 'Run scenario', languageCode)}
              </button>
            </div>

            {result && (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-emerald-300" />
                  <div className="text-sm font-semibold">{navText('Результат моделирования', 'Simulation result', languageCode)}</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricCard label={navText('Δ средняя поездка', 'Δ average trip', languageCode)} value={`${result.delta.avgCommuteChange.toFixed(1)} ${navText('мин', 'min', languageCode)}`} hint={navText('изменение против baseline', 'change versus baseline', languageCode)} />
                  <MetricCard label="Δ congestion" value={`${result.delta.congestionChange.toFixed(1)}%`} hint={navText('нагрузка дорожной сети', 'road network load', languageCode)} />
                  <MetricCard label="Δ CO2" value={`${result.delta.co2Change.toFixed(1)}%`} hint={navText('экологический эффект', 'environmental effect', languageCode)} />
                  <MetricCard label={navText('Эффект', 'Impact', languageCode)} value={`${Math.round(result.delta.costBenefit).toLocaleString(locale)} ₽`} hint={`confidence ${Math.round(result.confidence * 100)}%`} />
                </div>
                <div className="mt-4 whitespace-pre-line rounded-xl border border-emerald-400/10 bg-emerald-400/5 p-4 text-sm text-emerald-50/90">
                  {result.recommendation}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              <h2 className="text-base font-semibold">{navText('Банк времени', 'Time Bank', languageCode)}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label={navText('Баланс', 'Balance', languageCode)} value={`${timeAccount?.balanceMinutes ?? 0} ${navText('мин', 'min', languageCode)}`} hint={navText('доступный временной капитал', 'available time capital', languageCode)} />
              <MetricCard label={navText('Месячный тренд', 'Monthly trend', languageCode)} value={`${timeAccount?.monthlyTrend ?? 0} ${navText('мин', 'min', languageCode)}`} hint={navText('динамика за последние 30 дней', 'change over the last 30 days', languageCode)} />
            </div>
            <div className="mt-4 rounded-2xl border border-cyan-400/10 bg-cyan-400/5 p-4 text-sm text-cyan-50/90">
              {timeSummary || navText('Нет накопленных транзакций времени.', 'No accumulated time transactions yet.', languageCode)}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-fuchsia-300" />
              <h2 className="text-base font-semibold">{navText('Мета-когниция', 'Meta-Cognition', languageCode)}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label={navText('Построено маршрутов', 'Routes built', languageCode)} value={String(selfReport?.stats.routesBuilt ?? 0)} hint={navText('за период self-report', 'during the self-report window', languageCode)} />
              <MetricCard label="Latency" value={`${Math.round(selfReport?.stats.avgLatencyMs ?? 0)} ${navText('мс', 'ms', languageCode)}`} hint={navText('среднее время ответа', 'average response time', languageCode)} />
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-semibold text-white">{navText('Ключевые root causes', 'Key root causes', languageCode)}</div>
              <div className="mt-3 space-y-3">
                {(selfReport?.rootCauses ?? []).slice(0, 3).map((cause) => (
                  <div key={cause.symptom} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="text-sm font-medium text-white">{cause.symptom}</div>
                    <div className="mt-1 text-sm text-gray-400">{cause.rootCause}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Microscope className="h-4 w-4 text-amber-300" />
              <h2 className="text-base font-semibold">{navText('Абдуктивный анализ', 'Abductive Analysis', languageCode)}</h2>
            </div>
            <textarea
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              className="h-24 w-full rounded-2xl border border-white/10 bg-gray-900 p-3 text-sm text-white outline-none"
            />
            <button onClick={analyzeObservation} className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium hover:bg-white/[0.08]">
              {navText('Объяснить наблюдение', 'Explain observation', languageCode)}
            </button>
            <div className="mt-4 rounded-2xl border border-amber-400/10 bg-amber-400/5 p-4">
              <div className="text-sm font-semibold text-amber-100">{analysis?.bestHypothesis ?? navText('Нет данных', 'No data', languageCode)}</div>
              <div className="mt-2 text-sm text-amber-50/80">{analysis?.conclusion ?? navText('Соберите больше наблюдений для abductive analysis.', 'Collect more observations for abductive analysis.', languageCode)}</div>
              <div className="mt-3 space-y-2 text-xs text-amber-50/60">
                {(analysis?.hypotheses ?? []).slice(0, 3).map((hypothesis) => (
                  <div key={hypothesis.hypothesis}>
                    {hypothesis.hypothesis} · {Math.round(hypothesis.confidence * 100)}%
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-300" />
              <h2 className="text-base font-semibold">{navText('Текущее состояние twin-city', 'Current twin-city state', languageCode)}</h2>
            </div>
            <div className="space-y-2 text-sm text-gray-300">
              <div>Links: {snapshot?.links.length ?? 0}</div>
              <div>Agents: {snapshot?.agents.length ?? 0}</div>
              <div>Transit load: {Math.round((snapshot?.metrics.publicTransitLoad ?? 0) * 100)}%</div>
              <div>Avg commute: {snapshot?.metrics.avgCommuteMinutes ?? 0} {navText('мин', 'min', languageCode)}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}