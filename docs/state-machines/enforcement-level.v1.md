# Enforcement Level — State Machine v1

Scope: Phase 1

Related:
- Spec: docs/specs/phase1/P1L-trust-lite-rate-limits-enforcement.md
- Contract: docs/contracts/schemas/enforcement-action.v1.schema.json

## Mermaid

```mermaid
stateDiagram-v2
  [*] --> E0
  E0 --> E1: anomalies_detected
  E1 --> E2: repeated_anomalies
  E2 --> E3: confirmed_abuse
  E3 --> E4: severe_or_repeated
  E4 --> E5: manual_confirmed_repeat_offender
  E4 --> E3: cooldown
  E3 --> E2: cooldown
  E2 --> E1: cooldown
  E1 --> E0: cooldown
```

## Invariants
- Enforcement changes are audited.
- Appeals required for E3+.
- Rate limits depend on trust tier.
