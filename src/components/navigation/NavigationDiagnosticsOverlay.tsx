import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { getNavigationKpiSnapshot, subscribeNavigationKpi } from '@/lib/navigation/navigationKpi';

interface NavigationDiagnosticsOverlayProps {
  className?: string;
}

function formatMs(value: number | null): string {
  if (value == null) return 'n/a';
  return `${Math.round(value)}ms`;
}

function formatPct(value: number | null): string {
  if (value == null) return 'n/a';
  return `${Math.round(value * 100)}%`;
}

export function NavigationDiagnosticsOverlay({ className }: NavigationDiagnosticsOverlayProps) {
  const [snapshot, setSnapshot] = useState(() => getNavigationKpiSnapshot());

  useEffect(() => {
    return subscribeNavigationKpi(() => {
      setSnapshot(getNavigationKpiSnapshot());
    });
  }, []);

  return (
    <div
      className={cn(
        'pointer-events-none absolute left-3 bottom-[7rem] z-[870] w-[min(92vw,360px)] rounded-2xl border border-cyan-300/15 bg-slate-950/78 p-3 text-[11px] text-slate-100 backdrop-blur-lg',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-cyan-100">Navigation Diagnostics</span>
        <span className="text-slate-300">{new Date(snapshot.updatedAt).toLocaleTimeString()}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-slate-200">
        <span>Route p95</span>
        <span>{formatMs(snapshot.routeBuild.p95Ms)} / gate {snapshot.routeBuild.gateMs}ms</span>
        <span>Reroute p95</span>
        <span>{formatMs(snapshot.reroute.p95Ms)} / gate {snapshot.reroute.gateMs}ms</span>
        <span>Confidence</span>
        <span>{formatPct(snapshot.confidence.avg)} / gate {formatPct(snapshot.confidence.gate)}</span>
        <span>Route source</span>
        <span>{snapshot.routeBuild.source ?? 'n/a'}</span>
        <span>Reroute source</span>
        <span>{snapshot.reroute.source ?? 'n/a'}</span>
      </div>
      <div className="mt-2 border-t border-white/10 pt-2 text-slate-300">
        <div>Fallbacks: routing {snapshot.fallback.routing}, traffic {snapshot.fallback.traffic}, pipeline {snapshot.fallback.pipeline}</div>
        <div>Backends: routing {snapshot.backends.routing.status}, traffic {snapshot.backends.traffic.status}</div>
      </div>
    </div>
  );
}
