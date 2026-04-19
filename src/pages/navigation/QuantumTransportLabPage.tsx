import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, Gauge, Sparkles, Activity, RefreshCw, Play, Microscope } from 'lucide-react';
import { cn } from '@/lib/utils';
import { quantumTransportService } from '@/lib/navigation/quantumTransportService';
import { supabase } from '@/lib/supabase';
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
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [scenarios, setScenarios] = useState<WhatIfScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [observation, setObservation] = useState('Вечером растут задержки на ключевых маршрутах');
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
        quantumTransportService.explainObservation('Вечером растут задержки на ключевых маршрутах', user.id),
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
          <button onClick={() => navigate(-1)} className="rounded-xl p-2 hover:bg-white/5" aria-label="Назад">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="text-sm text-cyan-300">Quantum Transport Lab</div>
            <h1 className="text-lg font-semibold">City Simulation & What-If Scenarios</h1>
          </div>
          <button onClick={refreshSnapshot} className="ml-auto rounded-xl border border-white/10 bg-white/[0.04] p-2 hover:bg-white/[0.08]" aria-label="Обновить">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1.2fr,0.8fr]">
        <section className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Агенты" value={String(snapshot?.metrics.totalAgents ?? 0)} hint="активные участники модели" />
            <MetricCard label="Средняя скорость" value={`${snapshot?.metrics.avgSpeed ?? 0} км/ч`} hint="по движущимся агентам" />
            <MetricCard label="Пробочный индекс" value={`${snapshot?.metrics.congestionIndex ?? 0}/10`} hint="сводная загрузка сети" />
            <MetricCard label="CO2 / час" value={`${snapshot?.metrics.co2TonsPerHour ?? 0} т`} hint="оценка для текущего среза" />
          </div>

          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-white/[0.03] to-emerald-500/10 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              <h2 className="text-base font-semibold">What-If сценарии</h2>
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
                  <div className="mt-3 text-xs text-gray-500">Изменений: {scenario.modifications.length}</div>
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="text-sm text-gray-400">
                Горизонт моделирования
                <select
                  value={minutes}
                  onChange={(event) => setMinutes(Number(event.target.value))}
                  className="ml-2 rounded-lg border border-white/10 bg-gray-900 px-3 py-2 text-white"
                >
                  <option value={30}>30 мин</option>
                  <option value={60}>60 мин</option>
                  <option value={120}>120 мин</option>
                </select>
              </label>
              <button
                onClick={runScenario}
                disabled={!selectedScenario || loading}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-gray-950 transition-colors hover:bg-cyan-400 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                Прогнать сценарий
              </button>
            </div>

            {result && (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-emerald-300" />
                  <div className="text-sm font-semibold">Результат моделирования</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricCard label="Δ средняя поездка" value={`${result.delta.avgCommuteChange.toFixed(1)} мин`} hint="изменение против baseline" />
                  <MetricCard label="Δ congestion" value={`${result.delta.congestionChange.toFixed(1)}%`} hint="нагрузка дорожной сети" />
                  <MetricCard label="Δ CO2" value={`${result.delta.co2Change.toFixed(1)}%`} hint="экологический эффект" />
                  <MetricCard label="Эффект" value={`${Math.round(result.delta.costBenefit).toLocaleString('ru-RU')} ₽`} hint={`confidence ${Math.round(result.confidence * 100)}%`} />
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
              <h2 className="text-base font-semibold">Time Bank</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Баланс" value={`${timeAccount?.balanceMinutes ?? 0} мин`} hint="доступный временной капитал" />
              <MetricCard label="Monthly trend" value={`${timeAccount?.monthlyTrend ?? 0} мин`} hint="динамика за последние 30 дней" />
            </div>
            <div className="mt-4 rounded-2xl border border-cyan-400/10 bg-cyan-400/5 p-4 text-sm text-cyan-50/90">
              {timeSummary || 'Нет накопленных транзакций времени.'}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-fuchsia-300" />
              <h2 className="text-base font-semibold">Meta-Cognition</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Построено маршрутов" value={String(selfReport?.stats.routesBuilt ?? 0)} hint="за период self-report" />
              <MetricCard label="Latency" value={`${Math.round(selfReport?.stats.avgLatencyMs ?? 0)} мс`} hint="среднее время ответа" />
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-semibold text-white">Ключевые root causes</div>
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
              <h2 className="text-base font-semibold">Abductive Analysis</h2>
            </div>
            <textarea
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              className="h-24 w-full rounded-2xl border border-white/10 bg-gray-900 p-3 text-sm text-white outline-none"
            />
            <button onClick={analyzeObservation} className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium hover:bg-white/[0.08]">
              Объяснить наблюдение
            </button>
            <div className="mt-4 rounded-2xl border border-amber-400/10 bg-amber-400/5 p-4">
              <div className="text-sm font-semibold text-amber-100">{analysis?.bestHypothesis ?? 'Нет данных'}</div>
              <div className="mt-2 text-sm text-amber-50/80">{analysis?.conclusion ?? 'Соберите больше наблюдений для abductive analysis.'}</div>
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
              <h2 className="text-base font-semibold">Текущее состояние twin-city</h2>
            </div>
            <div className="space-y-2 text-sm text-gray-300">
              <div>Links: {snapshot?.links.length ?? 0}</div>
              <div>Agents: {snapshot?.agents.length ?? 0}</div>
              <div>Transit load: {Math.round((snapshot?.metrics.publicTransitLoad ?? 0) * 100)}%</div>
              <div>Avg commute: {snapshot?.metrics.avgCommuteMinutes ?? 0} мин</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}