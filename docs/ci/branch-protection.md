# Branch Protection Contract (Stage-aware)

ValidationMode: Portable

## requiredJobsByStage

### S0
- governance-core
- ui-boundaries
- security-core
- migration-guard
- gate-output-contract

### S1
- governance-core
- ui-boundaries
- security-core
- migration-guard
- gate-output-contract
- architecture-boundaries
- module-contracts
- negotiation-contracts
- ui-quality
- security-extended

### S2
- governance-core
- ui-boundaries
- security-core
- migration-guard
- gate-output-contract
- architecture-boundaries
- module-contracts
- negotiation-contracts
- ui-quality
- security-extended
- governance-audit

## Stage strictness
- S0: FP-GOV-8001B mismatch = warn, missing doc = fail
- S1+: FP-GOV-8001B mismatch = fail

## NDJSON output contract
Every required job MUST upload `fp-gates.ndjson` on success/fail/early-exit.
Format line:
`FP-XXXX: <message> | file=<path> line=<n> fix=<action>`
