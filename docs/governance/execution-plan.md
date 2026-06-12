# Execution Plan (Phased)

## Step 1 - Analysis on Compliance
- Run `npm run governance:analyze`.
- Review `docs/governance/frontend-platform-baseline.md`.
- Classify each failed control as `Blocker`, `Major`, `Minor`.

## Step 2 - Analysis of What Is Implemented
- Confirm SSOT artifacts:
  - `docs/ci/branch-protection.md`
  - `docs/migration/stage.json`
  - `docs/migration/flows.json`
  - `docs/migration/route-map.json`
  - `docs/arch/exceptions.json`
  - `docs/arch/transports.json`
- Confirm checklist source:
  - `docs/governance/project-to-implementation-1.md`

## Step 3 - Compare and Replace/Extend Decisions
- Keep current registry/contract gates where stronger.
- Replace ad-hoc frontend checks with FP-coded stage-aware gates.
- Migrate gradually from `src/components/ui/button` to canonical `packages/ui`.
- Move direct transport/storage usage into runtime/DAL wrappers.

## Step 4 - Work Schedule
- Week 1: S0 stabilize, no-new-legacy, SSOT hardening.
- Week 2-3: S1 shadow + activation readiness.
- Week 4-5: S1 required set stabilization.
- Week 6+: S2 hard-ban readiness and CDD/SHPL operationalization.

## Command Reference
- Full realization list: `npm run project:implementation1:list`
- Baseline report: `npm run governance:analyze`
