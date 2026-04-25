// src/lib/debug-session/types.ts
/**
 * TypeScript types for Debugger-Tester Integration protocol
 * All YAML/JSON structures defined here for type safety
 */

export type SoundMode = 'all' | 'cameras' | 'turns' | 'police' | 'signs' | 'mute';

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export type SessionStatus =
  | 'open'           // Tester created failure_report, awaiting assignment
  | 'in_progress'    // Debugger is working
  | 'fix_ready'      // Fix applied, local verification passed, awaiting Tester
  | 'verifying'      // Tester running verification tests
  | 'verified_pass'  // Tester confirmed PASS
  | 'verified_fail'  // Tester confirmed FAIL, needs rework
  | 'closed'         // Session complete
  | 'rework_needed'; // Back to Debugger

export type FailureSeverity = 'P0' | 'P1' | 'P2' | 'P3';

// ── Failure Report (Tester → Debugger) ────────────────────────────────────

export interface FailureEvidence {
  screenshots?: string[];      // paths to PNG files
  video?: string;              // path to WebM video
  network_logs: NetworkLog[];
  console_errors: string[];
  browser_logs?: string[];
  traced_actions: TracedAction[];
}

export interface NetworkLog {
  request: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    status?: number;
    duration?: number; // ms
    request_body?: string;
    response_body?: string;
  };
}

export interface TracedAction {
  timestamp: string; // ISO 8601
  event: string;     // e.g., "click button[data-testid='send']"
}

export interface FailureReport {
  failure_id: string;           // TEST-YYYYMMDD-SEQ
  source: 'mansoni-tester';
  domain: string;               // messenger, calls, navigator, shop, taxi, insurance
  test_name: string;            // full test identifier: path::title
  status: 'FAIL';
  severity: FailureSeverity;
  timestamp: string;            // ISO 8601

  error: {
    type: string;               // Error.name
    message: string;
    stack: string;
  };

  evidence: FailureEvidence;

  reproduction_steps: string[]; // ordered list
  expected: string;
  actual: string;

  environment: {
    browser: string;            // "Chrome 125.0.6422.141"
    viewport: string;           // "1920x1080"
    network: string;            // "online" | "offline" | "3g" | "4g"
    auth: {
      user_id: string;
      role: string;
    };
    platform: string;           // "Windows 10", "macOS 14.4"
  };

  related_files: string[];      // ["src/components/ChatInput.tsx:88", ...]
  related_tests: string[];      // other tests in same feature

  previous_runs?: {
    run_id: string;
    status: 'PASS' | 'FAIL';
    date: string;
  }[];

  priority: Priority;
  ticket_url?: string;
}

// ── Verification Request/Result (Tester ←→ Debugger) ──────────────────────

export interface VerificationResult {
  verification_id: string;       // VERIFY-YYYYMMDD-SEQ
  related_failure: string;       // TEST-xxx
  fix_id: string;                // DEBUG-xxx
  requested_by: 'mansoni-tester';
  requested_at: string;          // ISO 8601
  completed_at?: string;         // ISO 8601

  test_plan: {
    primary_test: string;        // exact test that failed
    regression_scope: string;    // "all messenger tests"
    command: string;             // e.g., "npm test -- messenger --coverage"
    expected_outcome: string;
    timeout_minutes: number;
  };

  results: {
    primary_test: {
      status: 'PASS' | 'FAIL' | 'ERROR' | 'SKIP';
      duration_seconds: number;
      details?: string;
    };
    regression_tests: {
      total: number;
      passed: number;
      failed: number;
      skipped: number;
      failed_tests?: string[];
    };
  };

  artifacts?: {
    screenshots?: string[];
    video?: string;
    logs?: string;
    coverage?: string;
  };

  verdict: {
    status: 'VERIFIED_PASS' | 'VERIFIED_FAIL' | 'ERROR';
    confidence: number; // 0-100
  };

  issues?: string[]; // if VERIFIED_FAIL, what's still broken

  next_action?: string[]; // what Mansoni should do next
}

// ── Session Metadata (internal) ───────────────────────────────────────────

export interface DebugSessionMetadata {
  session_id: string;            // DEBUG-YYYYMMDD-SEQ
  failure_id: string;            // TEST-YYYYMMDD-SEQ
  domain: string;
  test_name: string;
  status: SessionStatus;
  priority: Priority;

  assigned_to?: 'mansoni-debugger';
  started_at: string;            // ISO 8601
  updated_at: string;            // ISO 8601

  // Phase tracking
  current_phase?: 'REPRODUCE' | 'ISOLATE' | 'ROOT_CAUSE' | 'FIX' | 'VERIFY';
  last_phase_update?: string;

  // Timing
  closed_at?: string;
  mttr_minutes?: number; // (closed_at - started_at) / 60

  // Outcome
  final_status?: 'VERIFIED_PASS' | 'VERIFIED_FAIL' | 'ESCALATED';
  fix_commit?: string;           // Git SHA
  first_try_success?: boolean;
  regressions_introduced?: number;
  root_cause?: string;           // short summary
  pattern_id?: string;           // if known pattern

  // Tester verification
  verification: {
    primary_test_status?: 'PASS' | 'FAIL';
    regression_status?: 'PASS' | 'FAIL';
    verified_at?: string;
    tester_confidence?: number;
    feedback?: string;
  };
}

// ── Dashboard Metrics ──────────────────────────────────────────────────────

export interface DebugMetrics {
  generated_at: string; // ISO 8601

  period: {
    start: string;
    end: string;
  };

  summary: {
    total_sessions: number;
    active_sessions: number;
    closed_last_7d: number;
    closed_last_30d: number;
  };

  mttr: {
    min_minutes: number;
    max_minutes: number;
    avg_minutes: number;
    p50_minutes: number;
    p90_minutes: number;
    p99_minutes: number;
    target_minutes: number;
    trend: 'decreasing' | 'increasing' | 'stable';
  };

  fix_success: {
    first_try: number;      // 0-1
    second_try: number;
    third_try: number;
    total_success_rate: number;
    target: number;
  };

  reproduction: {
    reproducible: number;
    flaky: number;
    environment_specific: number;
  };

  root_cause: {
    correct_first_guess: number;
    took_2_attempts: number;
    took_3plus_attempts: number;
  };

  regression: {
    regression_introduced: number; // fraction of fixes that broke something
    regression_caught_by_tester: number;
    mean_regressions_per_fix: number;
  };

  by_domain: Record<
    string, // domain
    {
      sessions: number;
      mttr: number;
      success_rate: number;
    }
  >;

  common_causes: Array<{
    cause: string;
    count: number;
    domain?: string;
  }>;
}

// ── Debugger Notes Template ────────────────────────────────────────────────

export interface DebuggerNotes {
  session_id: string;
  failure_id: string;
  domain: string;
  priority: Priority;
  started_at: string;
  debugger: 'mansoni-debugger';

  analysis_timeline: Array<{
    timestamp: string;
    phase: 'INITIAL' | 'REPRODUCE' | 'ISOLATE' | 'ROOT_CAUSE' | 'FIX';
    note: string;
  }>;

  root_cause_summary?: string;
  fix_description?: string;
  files_modified: string[];

  questions?: string[];
  uncertainties?: string[];

  next_steps?: string[];

  patterns_discovered?: Array<{
    pattern_name: string;
    category: string;
    fix_template: string;
  }>;

  status: 'in_progress' | 'fix_ready' | 'blocked';
}

// ── Root Cause Analysis Template ─────────────────────────────────────────

export interface RootCauseAnalysis {
  session_id: string;
  problem_statement: string;

  evidence_chain: Array<{
    name: string;
    description: string;
    code_block?: string;
    file_path?: string;
    line_number?: number;
  }>;

  root_cause: {
    description: string;
    location: string; // file:line
    confidence: number; // 0-100

    why_not_caught_earlier: string[];

    fix_applied: {
      file: string;
      line: number;
      before: string;
      after: string;
      reason: string;
    }[];

    validation: {
      local_manual_test: string;
      unit_tests: string;
      e2e_test: string;
      regression_suite: string;
    };

    prevention: {
      detection_rule: string;
      new_test: string;
      skill_update: string;
    };

    related_patterns?: string[]; // paths to pattern docs
  };

  rca_type: 'configuration' | 'logic' | 'integration' | 'race-condition' | 'data' | 'environment';
  impact: Priority;
  impact_description: string;

  confidence: number; // overall 0-100
}

// ── Helper Functions ───────────────────────────────────────────────────────

export function generateFailureId(): string {
  const date = new Date();
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = getNextSequence(); // TODO: implement atomic counter
  return `TEST-${yyyymmdd}-${String(seq).padStart(3, '0')}`;
}

export function generateDebugSessionId(failureId: string): string {
  return failureId.replace('TEST', 'DEBUG');
}

export function getSessionDir(sessionId: string): string {
  return `/memories/session/debug-sessions/${sessionId}`;
}

export function getFailureDir(failureId: string): string {
  return `/memories/session/failures`;
}

// ── Constants ──────────────────────────────────────────────────────────────

export const SESSION_STATUS_TRANSITIONS: Record<
  SessionStatus,
  SessionStatus[]
> = {
  open: ['in_progress', 'closed'],
  in_progress: ['fix_ready', 'closed', 'rework_needed'],
  fix_ready: ['verifying', 'closed'],
  verifying: ['verified_pass', 'verified_fail', 'closed'],
  verified_pass: ['closed'],
  verified_fail: ['in_progress', 'closed'],
  closed: [], // terminal
  rework_needed: ['in_progress', 'closed'],
};

export const ESCALATION_RULES = [
  {
    condition: (s: DebugSessionMetadata) =>
      s.status === 'in_progress' &&
      minutesSince(s.started_at) > 30,
    to: 'mansoni-architect',
    reason: 'No root cause identified after 30min',
  },
  {
    condition: (s: DebugSessionMetadata) =>
      s.status === 'fix_ready' &&
      minutesSince(s.updated_at) > 60,
    to: 'mansoni-reviewer',
    reason: 'Fix ready but awaiting verification >1h',
  },
  {
    condition: (s: DebugSessionMetadata) =>
      s.status === 'verifying' &&
      minutesSince(s.updated_at) > 10,
    to: 'mansoni-tester',
    reason: 'Verification stuck >10min',
  },
  {
    condition: (s: DebugSessionMetadata) =>
      minutesSince(s.started_at) > 240, // 4 hours
    to: 'sequential-auditor',
    reason: 'Session >4h, needs deep audit',
  },
];

// Helper: minutes since ISO timestamp
function minutesSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 60000);
}
