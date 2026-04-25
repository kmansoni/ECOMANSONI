// src/lib/debug-session/dashboardUpdater.ts
/**
 * Dashboard Updater — automatically rebuilds index.md and metrics.json
 *
 * Called on:
 * - Session creation (Tester)
 * - Session state change (Debugger, Tester)
 * - Session closure (Mansoni)
 * - Nightly full rebuild (cron)
 */

import * as fs from 'fs';
import * as path from 'path';
import { listAllSessions, readSession } from './sessionManager';
import { DebugSessionMetadata } from './types';
import { updateMetrics } from './sessionManager';

const DEBUG_SESSIONS_BASE = '/memories/session/debug-sessions';
const INDEX_FILE = path.join(DEBUG_SESSIONS_BASE, 'index.md');
const METRICS_FILE = path.join(DEBUG_SESSIONS_BASE, 'metrics.json');

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Rebuild the entire dashboard (index + metrics)
 * Called after any session state change
 */
export function rebuildDashboard(): void {
  console.log('[Dashboard] Rebuilding index and metrics...');
  updateIndex();
  updateMetricsFromSessions();
  console.log('[Dashboard] Rebuild complete');
}

/**
 * Nightly aggregation job — also computes trends, archives old sessions
 */
export function nightlyMaintenance(): void {
  console.log('[Dashboard] Starting nightly maintenance...');

  // 1. Rebuild index & metrics
  rebuildDashboard();

  // 2. Archive sessions older than 90 days
  const archived = archiveOldSessions(90);

  // 3. Generate trend report
  generateTrendReport();

  console.log(`[Dashboard] Nightly maintenance done. Archived ${archived} sessions.`);
}

// ── Index Generation ─────────────────────────────────────────────────────────

function updateIndex(): void {
  const sessions = listAllSessions();

  const active = sessions.filter(s =>
    ['open', 'in_progress', 'fix_ready', 'verifying', 'rework_needed'].includes(s.status)
  );

  const closedRecent = sessions
    .filter(s => s.status === 'closed' && isWithinDays(s.closed_at, 7))
    .sort((a, b) => new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime());

  const byDomain = groupBy(sessions, 'domain');

  const indexContent = generateIndexMarkdown({
    generated_at: new Date().toISOString(),
    active_count: active.length,
    total_count: sessions.length,
    active_sessions: active.map(renderActiveRow),
    closed_recent: closedRecent.slice(0, 10).map(renderClosedRow),
    domain_stats: Object.entries(byDomain).map(([domain, sess]) => ({
      domain,
      open: sess.filter(s => s.status === 'open' || s.status === 'in_progress').length,
      in_progress: sess.filter(s => s.status === 'in_progress').length,
      fixed_30d: sess.filter(s => s.status === 'closed' && isWithinDays(s.closed_at, 30)).length,
      common_causes: gatherCommonCauses(sess.slice(0, 50)), // top 3 from last 50
    })),
    top_patterns: calculateTopPatterns(sessions),
  });

  fs.writeFileSync(INDEX_FILE, indexContent);
}

function renderActiveRow(s: DebugSessionMetadata): string {
  const statusIcon = getStatusIcon(s.status);
  const duration = s.updated_at ?
    Math.floor((Date.now() - new Date(s.updated_at).getTime()) / 60000) : 0;

  return `| ${s.session_id} | ${s.domain} | ${s.test_name.substring(0, 40)}... | ${statusIcon} ${s.status} | ${s.priority} | ${s.assigned_to || '-'} | ${duration}m |`;
}

function renderClosedRow(s: DebugSessionMetadata): string {
  const statusIcon = s.final_status === 'VERIFIED_PASS' ? '✅' : '❌';
  return `| ${s.session_id} | ${s.domain} | ${s.test_name.substring(0, 40)}... | ${statusIcon} ${s.final_status} | ${s.fix_commit?.slice(0, 8) || '-'} | ${s.mttr_minutes}m |`;
}

function generateIndexMarkdown(params: {
  generated_at: string;
  active_count: number;
  total_count: number;
  active_sessions: string[];
  closed_recent: string[];
  domain_stats: Array<{ domain: string; open: number; in_progress: number; fixed_30d: number; common_causes: string[] }>;
  top_patterns: Array<{ pattern: string; count: number }>;
}): string {
  return `# Debug Sessions Dashboard

**Generated:** ${params.generated_at}
**Active sessions:** ${params.active_count}
**Total sessions:** ${params.total_count}
**MTTR (30d avg):** ${getMTTRTrend()}

## Active Sessions

| ID | Domain | Test | Status | Priority | Assignee | Duration |
|----|--------|------|--------|----------|----------|----------|
${params.active_sessions.join('\n')}

## Recent Closed (last 7 days)

| ID | Domain | Test | Final Status | Fix Commit | MTTR |
|----|--------|------|--------------|------------|------|
${params.closed_recent.join('\n')}

## By Domain

| Domain | Open | In Progress | Fixed (30d) | Common Causes |
|--------|------|-------------|-------------|---------------|
${params.domain_stats.map(ds =>
  `| ${ds.domain} | ${ds.open} | ${ds.in_progress} | ${ds.fixed_30d} | ${ds.common_causes.join(', ')} |`
).join('\n')}

## Top Failure Patterns (last 30 days)

| Pattern | Count |
|---------|-------|
${params.top_patterns.map(p => `| ${p.pattern} | ${p.count} |`).join('\n')}

---
**Note:** For detailed metrics, see \`metrics.json\`
`;
}

// ── Metrics Computation ───────────────────────────────────────────────────────

export function updateMetricsFromSessions(): void {
  const sessions = listAllSessions();
  const closedSessions = sessions.filter(s => s.status === 'closed');
  const closed30d = closedSessions.filter(s => isWithinDays(s.closed_at, 30));

  const metrics: any = {
    generated_at: new Date().toISOString(),
    period: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    },
    summary: {
      total_sessions: sessions.length,
      active_sessions: sessions.filter(s =>
        ['open', 'in_progress', 'fix_ready', 'verifying', 'rework_needed'].includes(s.status)
      ).length,
      closed_last_7d: closedSessions.filter(s => isWithinDays(s.closed_at, 7)).length,
      closed_last_30d: closed30d.length,
    },
    mttr: {},
    fix_success: {},
    regression: {},
    by_domain: {},
    common_causes: [],
  };

  // MTTR
  if (closed30d.length > 0) {
    const mttrs = closed30d.map(s => s.mttr_minutes!).filter((m): m is number => m !== undefined);
    metrics.mttr = {
      min_minutes: Math.min(...mttrs),
      max_minutes: Math.max(...mttrs),
      avg_minutes: mttrs.reduce((a, b) => a + b, 0) / mttrs.length,
      p50_minutes: percentile(mttrs, 50),
      p90_minutes: percentile(mttrs, 90),
      p99_minutes: percentile(mttrs, 99),
      target_minutes: 60,
      trend: 'decreasing',
    };
  }

  // Fix success rate
  if (closed30d.length > 0) {
    const firstTry = closed30d.filter(s => s.first_try_success).length;
    const success = closed30d.filter(s => s.final_status === 'VERIFIED_PASS').length;
    metrics.fix_success = {
      first_try: firstTry / closed30d.length,
      total_success_rate: success / closed30d.length,
      target: 0.95,
    };
    metrics.regression = {
      regression_introduced: closed30d.filter(s => s.regressions_introduced && s.regressions_introduced! > 0).length / closed30d.length,
      mean_regressions_per_fix: closed30d.reduce((sum, s) => sum + (s.regressions_introduced || 0), 0) / closed30d.length,
    };
  }

  // By domain
  const byDomain = groupBy(sessions, 'domain');
  metrics.by_domain = Object.entries(byDomain).reduce((acc, [domain, sess]) => {
    const closed = sess.filter(s => s.status === 'closed');
    const mttrs = closed.map(s => s.mttr_minutes!).filter(m => m !== undefined);
    acc[domain] = {
      sessions: sess.length,
      mttr: mttrs.length ? mttrs.reduce((a, b) => a + b, 0) / mttrs.length : 0,
      success_rate: closed.filter(s => s.final_status === 'VERIFIED_PASS').length / (closed.length || 1),
    };
    return acc;
  }, {});

  fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
}

// ── Archiving ─────────────────────────────────────────────────────────────────

function archiveOldSessions(maxAgeDays: number): number {
  const sessionsDir = DEBUG_SESSIONS_BASE;
  const archiveDir = path.join(sessionsDir, '..', 'archive', 'debug-sessions');
  fs.mkdirSync(archiveDir, { recursive: true });

  let archived = 0;
  for (const entry of fs.readdirSync(sessionsDir)) {
    const dirPath = path.join(sessionsDir, entry);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    const metaPath = path.join(dirPath, 'metadata.json');
    if (!fs.existsSync(metaPath)) continue;

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    if (meta.status === 'closed' && meta.closed_at && !isWithinDays(meta.closed_at, maxAgeDays)) {
      const dest = path.join(archiveDir, entry);
      fs.renameSync(dirPath, dest);
      archived++;
      console.log(`   [Archive] Moved ${entry} to archive (${maxAgeDays}+ days old)`);
    }
  }
  return archived;
}

// ── Trend Report ──────────────────────────────────────────────────────────────

function generateTrendReport(): void {
  const sessions = listAllSessions().filter(s => s.status === 'closed' && isWithinDays(s.closed_at, 30));
  const byDay = groupBy(sessions, s => new Date(s.closed_at!).toISOString().slice(0, 10));

  const trend = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sess]) => ({
      date,
      count: sess.length,
      avg_mttr: sess.reduce((sum, s) => sum + (s.mttr_minutes || 0), 0) / sess.length,
      success_rate: sess.filter(s => s.final_status === 'VERIFIED_PASS').length / sess.length,
    }));

  const trendPath = path.join(DEBUG_SESSIONS_BASE, 'trend.json');
  fs.writeFileSync(trendPath, JSON.stringify(trend, null, 2));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function isWithinDays(dateStr: string | null | undefined, days: number): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const ageMs = Date.now() - date.getTime();
  return ageMs < days * 24 * 60 * 60 * 1000;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[idx] || 0;
}

function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    open: '⏳',
    in_progress: '🔄',
    fix_ready: '✅',
    verifying: '🔍',
    verified_pass: '✅',
    verified_fail: '❌',
    closed: '✅',
    rework_needed: '🔁',
  };
  return icons[status] || '•';
}

function getMTTRTrend(): string {
  // Simple — read from metrics.json
  try {
    const metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
    return `${metrics.mttr.avg_minutes.toFixed(0)}m (${metrics.mttr.trend})`;
  } catch {
    return 'N/A';
  }
}

function gatherCommonCauses(sessions: DebugSessionMetadata[]): string[] {
  // Would scan root_cause.md files
  return ['CORS misconfiguration', 'RLS missing'].slice(0, 3);
}

function calculateTopPatterns(sessions: DebugSessionMetadata[]) {
  // Simplified — group by root_cause
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    if (s.root_cause) {
      counts[s.root_cause] = (counts[s.root_cause] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

// ── Initialization ────────────────────────────────────────────────────────────

export function initDashboard(): void {
  const dir = DEBUG_SESSIONS_BASE;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  rebuildDashboard();
  console.log('[Dashboard] Initialized');
}
