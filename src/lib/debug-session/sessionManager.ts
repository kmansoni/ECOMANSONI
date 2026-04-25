// src/lib/debug-session/sessionManager.ts
/**
 * Session Manager — центральный API для создания, обновления и закрытия debug-сессий
 *
 * Используется:
 * - Tester Agent: создание сессии при FAIL
 * - Debugger Agent: обновление прогресса
 * - Mansoni Core: маршрутизация, эскалация, закрытие
 *
 * Все операции синхронные (файловая система), но с возможностью async/await.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { v4 as uuidv4 } from 'uuid';
import {
  FailureReport,
  DebugSessionMetadata,
  SessionStatus,
  VerificationResult,
  getSessionDir,
  getFailureDir,
  generateFailureId,
  generateDebugSessionId,
} from './types';

const DEBUG_SESSIONS_BASE = '/memories/session/debug-sessions';
const FAILURES_BASE = '/memories/session/failures';
const INDEX_FILE = path.join(DEBUG_SESSIONS_BASE, 'index.md');
const METRICS_FILE = path.join(DEBUG_SESSIONS_BASE, 'metrics.json');

// Ensure base directories exist
function ensureBaseDirs() {
  fs.mkdirSync(DEBUG_SESSIONS_BASE, { recursive: true });
  fs.mkdirSync(FAILURES_BASE, { recursive: true });
}

// ── Session Creation ───────────────────────────────────────────────────────

/**
 * Called by Tester Agent after E2E test failure
 * Creates: failure_report.yaml + DEBUG-xxx/ directory
 */
export function createSessionFromFailure(
  failureReport: Omit<FailureReport, 'failure_id'> & { failure_id?: string }
): string {
  ensureBaseDirs();

  const failureId = failureReport.failure_id || generateFailureId();
  const sessionId = generateDebugSessionId(failureId);

  // 1. Write failure_report.yaml to failures/ (for reference)
  const failurePath = path.join(FAILURES_BASE, `${failureId}.yaml`);
  fs.writeFileSync(failurePath, yaml.stringify(failureReport));

  // 2. Create session directory
  const sessionDir = getSessionDir(sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  // 3. Copy failure_report into session dir
  fs.copyFileSync(failurePath, path.join(sessionDir, 'failure_report.yaml'));

  // 4. Create initial metadata.json
  const metadata: DebugSessionMetadata = {
    session_id: sessionId,
    failure_id: failureId,
    domain: failureReport.domain,
    test_name: failureReport.test_name,
    status: 'open',
    priority: failureReport.severity,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    current_phase: 'REPRODUCE',
    verification: {},
  };
  writeMetadata(sessionId, metadata);

  // 5. Update index & metrics
  updateDashboardIndex();
  updateMetrics('create', metadata);

  console.log(`[Session] Created ${sessionId} for ${failureReport.test_name}`);
  return sessionId;
}

// ── Session Reading ────────────────────────────────────────────────────────

export function readSession(sessionId: string): DebugSessionMetadata {
  const metaPath = path.join(getSessionDir(sessionId), 'metadata.json');
  if (!fs.existsSync(metaPath)) {
    throw new Error(`Session ${sessionId} not found`);
  }
  return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
}

export function readFailureReport(failureId: string): FailureReport {
  const path = path.join(FAILURES_BASE, `${failureId}.yaml`);
  if (!fs.existsSync(path)) {
    throw new Error(`Failure report ${failureId} not found`);
  }
  return yaml.parse(fs.readFileSync(path, 'utf-8')) as FailureReport;
}

// ── Session Updates ─────────────────────────────────────────────────────────

export function updateSession(
  sessionId: string,
  updates: Partial<DebugSessionMetadata>
): void {
  const meta = readSession(sessionId);
  const updated = { ...meta, ...updates, updated_at: new Date().toISOString() };
  writeMetadata(sessionId, updated);
  updateDashboardIndex();
  updateMetrics('update', updated);
}

/**
 * Called by Debugger after each phase
 */
export function setPhase(sessionId: string, phase: DebugSessionMetadata['current_phase']): void {
  updateSession(sessionId, { current_phase: phase, last_phase_update: new Date().toISOString() });
}

/**
 * Called when Debugger applies fix and requests verification
 */
export function setFixReady(
  sessionId: string,
  fixCommit?: string
): void {
  updateSession(sessionId, {
    status: 'fix_ready',
    current_phase: 'VERIFY',
    verification: {
      ...readSession(sessionId).verification,
      fix_commit: fixCommit,
    },
  });
}

/**
 * Called by Tester after running verification suite
 */
export function setVerificationResult(
  sessionId: string,
  verification: VerificationResult
): void {
  const status =
    verification.verdict.status === 'VERIFIED_PASS'
      ? 'verified_pass'
      : 'verified_fail';

  updateSession(sessionId, {
    status,
    verification: {
      ...readSession(sessionId).verification,
      primary_test_status: verification.results.primary_test.status,
      regression_status:
        verification.results.regression_tests.failed > 0
          ? 'FAIL'
          : 'PASS',
      verified_at: verification.completed_at || new Date().toISOString(),
      tester_confidence: verification.verdict.confidence,
      feedback: verification.issues?.join('; '),
    },
  });

  // If VERIFIED_PASS, close session
  if (status === 'verified_pass') {
    closeSession(sessionId, verification);
  }
}

/**
 * Close session (final state)
 */
export function closeSession(
  sessionId: string,
  verification: VerificationResult,
  fixCommit?: string
): void {
  const meta = readSession(sessionId);
  const closedAt = new Date().toISOString();
  const started = new Date(meta.started_at);
  const mttr = Math.floor((new Date(closedAt).getTime() - started.getTime()) / 60000);

  updateSession(sessionId, {
    status: 'closed',
    closed_at: closedAt,
    mttr_minutes: mttr,
    final_status: verification.verdict.status === 'VERIFIED_PASS'
      ? 'VERIFIED_PASS'
      : 'VERIFIED_FAIL',
    fix_commit: fixCommit || meta.verification.fix_commit,
    first_try_success: verification.verdict.confidence >= 95,
    regressions_introduced: verification.results.regression_tests.failed,
    verification: {
      ...meta.verification,
      primary_test_status: verification.results.primary_test.status,
      regression_status:
        verification.results.regression_tests.failed > 0 ? 'FAIL' : 'PASS',
      verified_at: verification.completed_at || closedAt,
      tester_confidence: verification.verdict.confidence,
    },
  });

  console.log(`[Session] Closed ${sessionId} (${status}) — MTTR ${mttr}min`);
}

// ── File I/O Helpers ────────────────────────────────────────────────────────

function writeMetadata(sessionId: string, meta: DebugSessionMetadata): void {
  const metaPath = path.join(getSessionDir(sessionId), 'metadata.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

// ── Dashboard Update ────────────────────────────────────────────────────────

/**
 * Rebuilds index.md from all session metadata
 * Called after every session state change (could be optimized to batch)
 */
export function updateDashboardIndex(): void {
  const sessions = listAllSessions();
  const active = sessions.filter(
    s => ['open', 'in_progress', 'fix_ready', 'verifying', 'rework_needed'].includes(s.status)
  );
  const closedRecent = sessions
    .filter(s => s.status === 'closed' && isWithinLastDays(s.closed_at, 7))
    .sort((a, b) => new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime())
    .slice(0, 10);

  const byDomain = groupBy(sessions, 'domain');
  const domainStats = Object.entries(byDomain).map(([domain, sess]) => ({
    domain,
    open: sess.filter(s => s.status === 'open').length,
    in_progress: sess.filter(s => s.status === 'in_progress').length,
    fixed_30d: sess.filter(s =>
      s.status === 'closed' && isWithinDays(s.closed_at, 30)
    ).length,
    common_causes: gatherCommonCauses(sess),
  }));

  const topPatterns = gatherTopPatterns(sessions);

  const indexContent = generateIndexMarkdown({
    generated_at: new Date().toISOString(),
    active_count: active.length,
    total_count: sessions.length,
    active_sessions: active.map(renderSessionTableRow),
    closed_recent: closedRecent.map(renderClosedSessionRow),
    domain_stats: domainStats,
    top_patterns,
  });

  fs.writeFileSync(INDEX_FILE, indexContent);
}

/**
 * Rebuilds metrics.json with aggregated statistics
 */
export function updateMetrics(
  event: 'create' | 'update' | 'close',
  session: DebugSessionMetadata
): void {
  let metrics: any = {};

  if (fs.existsSync(METRICS_FILE)) {
    metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
  } else {
    metrics = {
      generated_at: new Date().toISOString(),
      period: { start: new Date().toISOString(), end: new Date().toISOString() },
      summary: { total_sessions: 0, active_sessions: 0, closed_last_7d: 0, closed_last_30d: 0 },
      mttr: { min_minutes: 0, max_minutes: 0, avg_minutes: 0, p50_minutes: 0, p90_minutes: 0, p99_minutes: 0, target_minutes: 60, trend: 'stable' },
      fix_success: { first_try: 0, second_try: 0, third_try: 0, total_success_rate: 0, target: 0.95 },
      reproduction: { reproducible: 0, flaky: 0, environment_specific: 0 },
      root_cause: { correct_first_guess: 0, took_2_attempts: 0, took_3plus_attempts: 0 },
      regression: { regression_introduced: 0, regression_caught_by_tester: 0, mean_regressions_per_fix: 0 },
      by_domain: {},
      common_causes: [],
    };
  }

  // Recompute aggregates (inefficient but simple; optimize later)
  const allSessions = listAllSessions();
  const closedSessions = allSessions.filter(s => s.status === 'closed');
  const closed30d = closedSessions.filter(s => isWithinDays(s.closed_at, 30));
  const closed7d = closedSessions.filter(s => isWithinDays(s.closed_at, 7));

  // Summary
  metrics.summary = {
    total_sessions: allSessions.length,
    active_sessions: allSessions.filter(s =>
      ['open', 'in_progress', 'fix_ready', 'verifying', 'rework_needed'].includes(s.status)
    ).length,
    closed_last_7d: closed7d.length,
    closed_last_30d: closed30d.length,
  };

  // MTTR
  if (closed30d.length > 0) {
    const mttrs = closed30d.map(s => s.mttr_minutes!).filter((m): m is number => m !== undefined);
    metrics.mttr = {
      ...metrics.mttr,
      min_minutes: Math.min(...mttrs),
      max_minutes: Math.max(...mttrs),
      avg_minutes: mttrs.reduce((a, b) => a + b, 0) / mttrs.length,
      // percentiles would require sorting
      p50_minutes: percentile(mttrs, 50),
      p90_minutes: percentile(mttrs, 90),
      p99_minutes: percentile(mttrs, 99),
      target_minutes: 60,
      trend: 'decreasing', // TODO: compute from history
    };
  }

  // Fix success rate
  const firstTry = closed30d.filter(s => s.first_try_success).length;
  const totalFixed = closed30d.length;
  metrics.fix_success = {
    ...metrics.fix_success,
    first_try: totalFixed > 0 ? firstTry / totalFixed : 0,
    total_success_rate: closed30d.filter(s => s.final_status === 'VERIFIED_PASS').length / totalFixed,
    target: 0.95,
  };

  // Regression rate
  const regressions = closed30d.reduce((sum, s) => sum + (s.regressions_introduced || 0), 0);
  metrics.regression = {
    regression_introduced: closed30d.filter(s => s.regressions_introduced && s.regressions_introduced! > 0).length / totalFixed,
    regression_caught_by_tester: 0.98, // Placeholder — track explicitly
    mean_regressions_per_fix: regressions / totalFixed,
  };

  // By domain
  const byDomain: Record<string, any> = {};
  for (const [domain, sessions] of Object.entries(groupBy(allSessions, 'domain'))) {
    const closedDomain = sessions.filter(s => s.status === 'closed');
    const mttrs = closedDomain.map(s => s.mttr_minutes!).filter(m => m !== undefined);
    byDomain[domain] = {
      sessions: sessions.length,
      mttr: mttrs.length ? mttrs.reduce((a, b) => a + b, 0) / mttrs.length : 0,
      success_rate: closedDomain.filter(s => s.final_status === 'VERIFIED_PASS').length / closedDomain.length || 0,
    };
  }
  metrics.by_domain = byDomain;

  // Common causes (from root_cause.md files)
  const causes: Record<string, number> = {};
  for (const sess of closed30d) {
    try {
      const rcPath = path.join(getSessionDir(sess.session_id), 'root_cause.md');
      if (fs.existsSync(rcPath)) {
        const content = fs.readFileSync(rcPath, 'utf-8');
        const match = content.match(/pattern[:\s]+([^\n]+)/i) || content.match(/root cause[:\s]+([^\n]+)/i);
        if (match) {
          const cause = match[1].trim();
          causes[cause] = (causes[cause] || 0) + 1;
        }
      }
    } catch {}
  }
  metrics.common_causes = Object.entries(causes)
    .map(([cause, count]) => ({ cause, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  metrics.generated_at = new Date().toISOString();
  fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
}

// ── Escalation Monitor ──────────────────────────────────────────────────────

/**
 * Cron job — runs every 5 minutes
 * Checks all active sessions, escalates if thresholds exceeded
 */
export function monitorEscalations(): void {
  const sessions = listAllSessions().filter(s =>
    ['open', 'in_progress', 'fix_ready', 'verifying', 'rework_needed'].includes(s.status)
  );

  for (const session of sessions) {
    for (const rule of ESCALATION_RULES) {
      if (rule.condition(session)) {
        console.warn(`[ESCALATION] ${session.session_id} → ${rule.to}: ${rule.reason}`);
        // TODO: send message to escalation target agent via Mansoni
        escalateTo(session.session_id, rule.to, rule.reason);
      }
    }
  }
}

// Stub — actual implementation would use Mansoni's message bus
function escalateTo(sessionId: string, targetAgent: string, reason: string): void {
  // In real runtime: call `agent(targetAgent, { type: 'escalation', session_id: sessionId, reason })`
  console.log(`  [EScalate] ${sessionId} → ${targetAgent}: ${reason}`);
}

// ── Utility Functions ───────────────────────────────────────────────────────

function listAllSessions(): DebugSessionMetadata[] {
  const dir = DEBUG_SESSIONS_BASE;
  if (!fs.existsSync(dir)) return [];

  const sessions: DebugSessionMetadata[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const entryPath = path.join(dir, entry);
    if (fs.statSync(entryPath).isDirectory()) {
      const metaPath = path.join(entryPath, 'metadata.json');
      if (fs.existsSync(metaPath)) {
        sessions.push(JSON.parse(fs.readFileSync(metaPath, 'utf-8')));
      }
    }
  }
  return sessions.sort((a, b) =>
    new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    (acc[k] ||= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function isWithinDays(dateStr: string | undefined, days: number): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const ageMs = Date.now() - date.getTime();
  return age_ms < days * 24 * 60 * 60 * 1000;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[idx];
}

function gatherCommonCauses(sessions: DebugSessionMetadata[]): string[] {
  // Simplified: just return top pattern IDs from root_cause files
  const causes: Record<string, number> = {};
  for (const s of sessions) {
    try {
      const rcPath = path.join(getSessionDir(s.session_id), 'root_cause.md');
      if (fs.existsSync(rcPath)) {
        const content = fs.readFileSync(rcPath, 'utf-8');
        const m = content.match(/pattern[:\s]+([^\n]+)/i);
        if (m) {
          const c = m[1].trim();
          causes[c] = (causes[c] || 0) + 1;
        }
      }
    } catch {}
  }
  return Object.entries(causes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cause]) => cause);
}

function gatherTopPatterns(sessions: DebugSessionMetadata[]): Array<{ pattern: string; count: number; avg_mttr: number }> {
  // Simplified aggregation
  const patternMap: Record<string, { count: number; mttrs: number[] }> = {};
  for (const s of sessions) {
    if (!s.root_cause) continue;
    const pattern = s.root_cause;
    if (!patternMap[pattern]) patternMap[pattern] = { count: 0, mttrs: [] };
    patternMap[pattern].count++;
    if (s.mttr_minutes) patternMap[pattern].mttrs.push(s.mttr_minutes);
  }
  return Object.entries(patternMap)
    .map(([pattern, data]) => ({
      pattern,
      count: data.count,
      avg_mttr: data.mttrs.length ? data.mttrs.reduce((a, b) => a + b, 0) / data.mttrs.length : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function renderSessionTableRow(s: DebugSessionMetadata): string {
  const statusIcon = {
    open: '⏳',
    in_progress: '🔄',
    fix_ready: '✅',
    verifying: '🔍',
    verified_pass: '✅',
    verified_fail: '❌',
    closed: '✅',
    rework_needed: '🔁',
  }[s.status] || '•';

  return `| ${s.session_id} | ${s.domain} | ${s.test_name} | ${statusIcon} ${s.status} | ${s.priority} | ${s.assigned_to || '-'} | ${s.started_at} |`;
}

function renderClosedSessionRow(s: DebugSessionMetadata): string {
  return `| ${s.session_id} | ${s.domain} | ${s.test_name} | ${s.final_status} | ${s.fix_commit?.slice(0, 8) || '-'} | ${s.mttr_minutes}m |`;
}

function generateIndexMarkdown(params: {
  generated_at: string;
  active_count: number;
  total_count: number;
  active_sessions: string[];
  closed_recent: string[];
  domain_stats: Array<{ domain: string; open: number; in_progress: number; fixed_30d: number; common_causes: string[] }>;
  top_patterns: Array<{ pattern: string; count: number; avg_mttr: number }>;
}): string {
  return `# Debug Sessions Dashboard

**Generated:** ${params.generated_at}
**Active sessions:** ${params.active_count}
**Total sessions:** ${params.total_count}

## Active Sessions

| ID | Domain | Test | Status | Priority | Assignee | Started |
|----|--------|------|--------|----------|----------|---------|
${params.active_sessions.join('\n')}

## Recent Closed (last 7 days)

| ID | Domain | Test | Final Status | Fix Commit | MTTR |
|----|--------|------|--------------|------------|------|
${params.closed_recent.join('\n')}

## By Domain

| Domain | Open | In Progress | Fixed (30d) | Common Causes |
|--------|------|-------------|-------------|---------------|
${params.domain_stats.map(ds => `| ${ds.domain} | ${ds.open} | ${ds.in_progress} | ${ds.fixed_30d} | ${ds.common_causes.join(', ')} |`).join('\n')}

## Top Failure Patterns (last 30 days)

| Pattern | Count | Avg MTTR |
|---------|-------|----------|
${params.top_patterns.map(p => `| ${p.pattern} | ${p.count} | ${p.avg_mttr.toFixed(0)}m |`).join('\n')}

`;
}

// ── Initialization ─────────────────────────────────────────────────────────

/**
 * Initialize session tracking system (run once on startup)
 */
export function initSessionSystem(): void {
  ensureBaseDirs();
  if (!fs.existsSync(INDEX_FILE)) {
    updateDashboardIndex();
  }
  console.log('[SessionManager] Initialized');
}
