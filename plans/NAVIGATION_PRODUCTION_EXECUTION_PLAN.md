# Navigation Production Execution Plan

## Purpose

This plan defines the default 10-step execution mode for bringing the navigation stack to production level without repeated branching questions during routine implementation.

## Default Operating Rule

When the task is within the current navigation architecture and does not require legal, billing, destructive data, or external product-policy decisions, the implementation path should default to the strongest production-safe version immediately.

Questions are only required when one of the following is true:
- a destructive migration or irreversible delete is required
- credentials, external access, or billing changes are required
- two options have materially different product behavior and neither is already implied by existing architecture
- the workspace contains conflicting user changes that block a safe merge

## 10 Steps

### 1. Lock Production Contract First

Before touching code, define the production contract for the feature:
- source of truth
- fallback order
- user-visible failure behavior
- telemetry requirement
- rollback surface

Default action:
- prefer backend-authoritative behavior for live routing and traffic
- prefer offline-capable behavior for search and navigation continuity
- never leave safety-critical behavior implicit

Done when:
- the target path has explicit success, degraded, and failed states

### 2. Remove Silent Degradation

Every fallback-heavy path must classify why it degraded.

Default action:
- replace warn-and-clear or log-and-continue behavior with structured reason codes
- carry degradation reason through return types or view state
- keep partial results if they are still valid

Done when:
- the system can answer both questions: what failed, and what took over

### 3. Prefer Backend, Preserve Offline Survival

Live providers should be primary, but local capability must preserve navigation continuity.

Default action:
- route order: navigation server -> offline graph -> OSRM
- traffic order: navigation server -> Supabase RPC -> cache -> time estimate
- voice address search: learned/offline resolve -> online refinement only when needed

Done when:
- fallback order is explicit and identical across initial build, preview rebuild, and reroute paths

### 4. Make State Machine Explicit

Do not rely on booleans that hide multiple runtime states.

Default action:
- separate initialized vs ready vs degraded
- separate no data vs fallback data vs hard error
- expose state in types, not only in logs

Done when:
- consuming components can render correct UX without inferring hidden conditions

### 5. Wire User-Facing Degraded UX

Production quality means degraded behavior is understandable, not merely operational.

Default action:
- show compact inline diagnostics for voice search and fallback-heavy panels
- show partial matches instead of empty screens when safe
- keep technical reason codes machine-readable but user text human-readable

Done when:
- degraded mode is visible and actionable for the user

### 6. Add Structured Telemetry At Decision Points

Logs alone are insufficient for production hardening.

Default action:
- record fallback reason at selection point, not only at failure point
- distinguish selected source from attempted sources
- log backend state changes through KPI/runtime diagnostics

Done when:
- production telemetry can reconstruct the whole decision chain for route, traffic, and voice search

### 7. Enforce Data Realism

Navigation outputs must come from real sources or deterministic estimates, never placeholders.

Default action:
- no random speed limits, random traffic, or fake confidence
- if real data is unavailable, use deterministic fallback and label it as such
- prefer incomplete truth over polished fiction

Done when:
- every displayed navigation signal is either real, derived, or clearly marked fallback

### 8. Harden Shared Interfaces, Not Just Call Sites

If a fallback issue repeats across multiple flows, fix the shared contract.

Default action:
- extend shared return types with source and degradation metadata
- centralize error classification helpers
- avoid duplicating ad hoc string parsing in components

Done when:
- new consumers inherit production behavior by default

### 9. Validate With Local Gates Before Declaring Done

A production change is not finished at compile success alone.

Default action:
- run file-level error checks immediately after edits
- run targeted typecheck/tests for touched navigation paths when feasible
- verify no unrelated broken state was introduced by new interfaces

Minimum gates:
- changed files have zero editor errors
- fallback metadata compiles through all touched call sites
- degraded UX still preserves normal happy path

Done when:
- validation confirms both primary and degraded paths still work conceptually and type-wise

### 10. Finish With Deployment Readiness, Not Just Code Completion

Each completed slice should end in a deployable state.

Default action:
- update plan/docs when runtime behavior changed
- note residual risks explicitly instead of deferring them silently
- prefer forward-fix follow-ups over temporary ambiguity

Done when:
- the change can be merged, deployed, observed, and rolled forward without rediscovery work

## Recommendations For Default Execution

1. Treat navigation, traffic, voice, and rerouting as one runtime system, not isolated files.
2. Prefer strengthening shared contracts over adding more catch blocks in UI.
3. Keep partial offline capability alive even when online enrichment fails.
4. Surface degradation in UI only where it changes user action; keep the rest in telemetry.
5. Avoid asking the user to choose between technically equivalent implementations when the repo already implies the stronger default.
6. Ask only when the decision changes product semantics, operational cost, or irreversible data state.

## Definition Of Production-Ready For Navigation Changes

A navigation change is production-ready when all are true:
- primary path is explicit
- fallback order is explicit
- failure reasons are classified
- degraded UX is visible where needed
- telemetry captures chosen source and failure chain
- editor/type validation passes for touched files
- no fake runtime data was introduced
- rollout and residual risk are documented