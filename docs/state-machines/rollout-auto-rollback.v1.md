# Rollout + Auto-rollback — State Machine v1

Scope: Phase 1+

Related:
- Spec: docs/specs/phase1/P1M-rollouts-guardrails-autorevert.md
- Contract: docs/contracts/schemas/rollout-journal-entry.v1.schema.json
- Contract: docs/contracts/schemas/auto-rollback-decision.v1.schema.json

## Mermaid

```mermaid
stateDiagram-v2
  [*] --> Proposed
  Proposed --> Validated: validate_ok
  Proposed --> Rejected: validate_fail
  Validated --> Canary1: activate_1pct
  Canary1 --> Canary10: guardrails_ok
  Canary10 --> Canary50: guardrails_ok
  Canary50 --> Full: guardrails_ok
  Canary1 --> RolledBack: guardrails_fail
  Canary10 --> RolledBack: guardrails_fail
  Canary50 --> RolledBack: guardrails_fail
  Full --> RolledBack: guardrails_fail
  RolledBack --> [*]
  Full --> [*]
  Rejected --> [*]
```

## Invariants
- Любая стадия фиксируется в journal.
- Guardrail violation -> rollback автоматически.
- В rollback допускается включение kill-switch.
