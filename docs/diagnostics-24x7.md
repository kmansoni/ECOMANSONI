# Diagnostics 24x7

## Goal
This pipeline is a practical approximation of continuous deep diagnostics for this repository.
It is designed to run checks on a schedule, produce artifacts, and fail when critical gates regress.

## What is implemented
- Local runner: `npm run diag:24x7`
- Soft mode for local experiments: `npm run diag:24x7:soft`
- Scheduled GitHub workflow: `.github/workflows/diagnostics-24x7.yml`
- Artifact output: `tmp/diagnostics/latest.json` and `tmp/diagnostics/latest.md`

## Current check stack
- Encoding BOM guard
- ESLint
- SQL alias lint
- Backend migration safety check
- Core tests (`test:acceptance` + `test:chaos`)
- Development build
- Python syntax compilation (`compileall`)
- Deno unit test for Supabase function payload validation

## Why this is useful
- Detects regressions without waiting for manual QA.
- Produces an auditable timeline of diagnostic runs.
- Aggregates multi-runtime checks (Node + Python + Deno).

## Built-in critique (limits)
This is not mathematically perfect or complete:
- Static and scripted checks cannot prove absence of all bugs.
- Runtime behavior bugs may still pass compile and lint checks.
- Environment-specific failures may not reproduce on CI runners.
- Security scanning can reduce risk but cannot guarantee zero-day immunity.

## Hardening roadmap to approach "ideal"
1. Add mutation testing gate for critical modules.
2. Add nightly e2e browser suite with flaky-test quarantine.
3. Add dependency and container vulnerability scans (SCA + image scan).
4. Add production synthetic probes and SLO-based alerting.
5. Add automatic rollback integration for failed canary diagnostics.
6. Add AI-assisted code review as a non-blocking advisory layer.

## Operational note
If a scheduled run fails, inspect `tmp/diagnostics/latest.json` in workflow artifacts first.
The report is structured to pinpoint failing command, exit code, duration, and raw output.
