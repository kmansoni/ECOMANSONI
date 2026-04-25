// src/lib/debug-session/escalationMonitor.ts
/**
 * Escalation Monitor — background job that checks active sessions
 * and escalates those exceeding time thresholds.
 *
 * Runs every 5 minutes via setInterval.
 */

import * as fs from 'fs';
import * as path from 'path';
import { listAllSessions, updateSession } from './sessionManager';
import { DebugSessionMetadata, ESCALATION_RULES } from './types';

let monitorInterval: NodeJS.Timeout | null = null;
let isRunning = false;

// ── Start/Stop ────────────────────────────────────────────────────────────────

export function startEscalationMonitor(intervalMs = 5 * 60 * 1000): void {
  if (isRunning) {
    console.warn('[EscalationMonitor] Already running');
    return;
  }

  console.log(`[EscalationMonitor] Starting (interval: ${intervalMs / 60000}min)`);
  isRunning = true;

  // Run immediately on start
  runCheck();

  // Then schedule
  monitorInterval = setInterval(runCheck, intervalMs);
}

export function stopEscalationMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    isRunning = false;
    console.log('[EscalationMonitor] Stopped');
  }
}

// ── Core Check ─────────────────────────────────────────────────────────────────

function runCheck(): void {
  try {
    const sessions = listAllSessions().filter(s =>
      ['open', 'in_progress', 'fix_ready', 'verifying', 'rework_needed'].includes(s.status)
    );

    let escalated = 0;
    for (const session of sessions) {
      const escalation = findEscalation(session);
      if (escalation) {
        console.warn(
          `[ESCALATION] ${session.session_id} → ${escalation.to}: ${escalation.reason}`
        );
        executeEscalation(session, escalation);
        escalated++;
      }
    }

    if (escalated > 0) {
      console.log(`[EscalationMonitor] Escalated ${escalated} session(s)`);
    }
  } catch (err) {
    console.error('[EscalationMonitor] Error during check:', err);
  }
}

function findEscalation(session: DebugSessionMetadata) {
  for (const rule of ESCALATION_RULES) {
    if (rule.condition(session)) {
      return rule;
    }
  }
  return null;
}

async function executeEscalation(
  session: DebugSessionMetadata,
  escalation: { to: string; reason: string }
): Promise<void> {
  // 1. Update session with escalation note
  const notes = (session.verification?.feedback || '').split('; ');
  notes.push(`Escalated to ${escalation.to}: ${escalation.reason}`);
  updateSession(session.session_id, {
    status: 'rework_needed',
    verification: {
      ...session.verification,
      feedback: notes.join('; '),
    },
  });

  // 2. Notify escalation target agent (via Mansoni)
  // In real runtime: await mansoni.agents.escalate({
  //   target: escalation.to,
  //   session_id: session.session_id,
  //   reason: escalation.reason,
  //   context: readSession(session.session_id),
  // });

  console.log(`   → Sent escalation notification to ${escalation.to}`);
}

// ── Helper: minutes since ────────────────────────────────────────────────────

function minutesSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

// ── Export ────────────────────────────────────────────────────────────────────

export const escalationMonitor = {
  start: startEscalationMonitor,
  stop: stopEscalationMonitor,
};
