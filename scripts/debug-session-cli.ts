// scripts/debug-session-cli.ts
#!/usr/bin/env node
/**
 * Debug Session CLI — command-line tools for Debugger-Tester integration
 *
 * Usage:
 *   npm run debug:create -- --domain navigator --test "test_route_calculation" --error "TimeoutError"
 *   npm run debug:list
 *   npm run debug:status DEBUG-20260425-001
 *   npm run debug:escalate CHECK_STALE
 */

import * as fs from 'fs';
import * as path from 'path';
import yaml from 'yaml';
import { v4 as uuidv4 } from 'uuid';
import { DebugSessionMetadata, FailureReport, getSessionDir } from '../src/lib/debug-session/types';

// ── Commands ──────────────────────────────────────────────────────────────────

const commands: Record<string, (args: any) => void> = {
  create: createSession,
  list: listSessions,
  status: getSessionStatus,
  escalate: checkEscalations,
  metrics: showMetrics,
  archive: archiveOldSessions,
};

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

if (!command || !commands[command]) {
  printUsage();
  process.exit(1);
}

commands[command](args);

// ── Command Implementations ───────────────────────────────────────────────────

function createSession(args: any): void {
  const failureReport: Omit<FailureReport, 'failure_id'> = {
    source: 'mansoni-tester',
    domain: args.domain,
    test_name: args.test,
    status: 'FAIL',
    severity: args.priority || 'P1',
    timestamp: new Date().toISOString(),
    error: {
      type: args.errorType || 'Error',
      message: args.error,
      stack: args.stack || `${args.test} failed`,
    },
    evidence: {
      network_logs: [],
      console_errors: [args.error],
      traced_actions: [],
      screenshots: [],
    },
    reproduction_steps: args.steps ? args.steps.split('|') : ['Run test'],
    expected: args.expected || 'Test passes',
    actual: args.actual || args.error,
    environment: {
      browser: args.browser || 'unknown',
      viewport: args.viewport || 'unknown',
      network: 'online',
      auth: { user_id: 'cli', role: 'developer' },
      platform: process.platform,
    },
    related_files: args.files ? args.files.split(',') : [],
    priority: (args.priority as any) || 'P1',
    ticket_url: args.ticket,
  };

  const { createSessionFromFailure } = require('../src/lib/debug-session/sessionManager');
  const sessionId = createSessionFromFailure(failureReport);
  console.log(`✅ Created session ${sessionId}`);
  console.log(`   Dir: /memories/session/debug-sessions/${sessionId}`);
}

function listSessions(): void {
  const { listAllSessions } = require('../src/lib/debug-session/sessionManager');
  const sessions = listAllSessions();

  console.log(`\n📋 All Sessions (${sessions.length})\n`);
  console.log('ID                              | Domain   | Status        | Pri | Age');
  console.log('--------------------------------|----------|---------------|-----|---------');

  for (const s of sessions.slice(0, 20)) {
    const age = Math.floor((Date.now() - new Date(s.started_at).getTime()) / 60000);
    console.log(
      `${s.session_id.slice(0, 32)} | ${s.domain.padEnd(8)} | ${s.status.padEnd(13)} | ${s.priority} | ${age}m`
    );
  }
}

function getSessionStatus(args: { _: string[] }): void {
  const sessionId = args._[0];
  if (!sessionId) {
    console.error('Usage: npm run debug:status <session-id>');
    process.exit(1);
  }

  const { readSession } = require('../src/lib/debug-session/sessionManager');
  const meta = readSession(sessionId);

  console.log(`\n📊 Session: ${sessionId}\n`);
  console.log(`Domain:     ${meta.domain}`);
  console.log(`Test:       ${meta.test_name}`);
  console.log(`Status:     ${meta.status}`);
  console.log(`Priority:   ${meta.priority}`);
  console.log(`Started:    ${meta.started_at}`);
  console.log(`Phase:      ${meta.current_phase || 'N/A'}`);
  console.log(`MTTR:       ${meta.mttr_minutes ?? 'N/A'} min`);

  if (meta.status === 'closed') {
    console.log(`Outcome:    ${meta.final_status}`);
    console.log(`Commit:     ${meta.fix_commit?.slice(0, 8) || 'N/A'}`);
  }
}

function checkEscalations(): void {
  const { monitorEscalations } = require('../src/lib/debug-session/escalationMonitor');
  monitorEscalations();
}

function showMetrics(): void {
  const metricsPath = '/memories/session/debug-sessions/metrics.json';
  if (!fs.existsSync(metricsPath)) {
    console.log('No metrics yet — sessions required.');
    return;
  }
  const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
  console.log('\n📈 Metrics\n');
  console.log(`Total sessions:   ${metrics.summary.total_sessions}`);
  console.log(`Active:           ${metrics.summary.active_sessions}`);
  console.log(`Closed (30d):     ${metrics.summary.closed_last_30d}`);
  console.log(`MTTR avg:         ${metrics.mttr.avg_minutes.toFixed(1)} min`);
  console.log(`Fix success rate: ${(metrics.fix_success.total_success_rate * 100).toFixed(1)}%`);
  console.log(`Regression rate:  ${(metrics.regression.regression_introduced * 100).toFixed(1)}%`);
}

function archiveOldSessions(args: { days?: string }): void {
  const { archiveOldSessions } = require('../src/lib/debug-session/dashboardUpdater');
  const days = parseInt(args.days || '90', 10);
  const count = archiveOldSessions(days);
  console.log(`📦 Archived ${count} session(s) older than ${days} days`);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1] || 'true';
      if (value.startsWith('--')) {
        args[key] = 'true';
      } else {
        args[key] = value;
        i++;
      }
    } else {
      args._ = args._ || [];
      args._.push(arg);
    }
  }
  return args;
}

function printUsage(): void {
  console.log(`
🔧 Debug Session CLI

Commands:
  create    Create a debug session manually (for ad-hoc debugging)
  list      List all debug sessions
  status    Show detailed status of a session
  escalate  Check escalation rules and escalate stale sessions
  metrics   Show aggregated metrics
  archive   Archive old sessions (default >90 days)

Examples:
  npm run debug:create -- --domain navigator --test "test_route" --error "TimeoutError" --priority P1
  npm run debug:list
  npm run debug:status DEBUG-20260425-001
  npm run debug:metrics

  `);
}

// ── Run if executed directly ──────────────────────────────────────────────────

if (require.main === module) {
  // Already invoked via command above
}
