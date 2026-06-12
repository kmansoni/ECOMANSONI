# Threat Model v2.8 (STRIDE + LINDDUN)

## Status
Final Review (rev2)

## Assets
- core_messages
- core_scopes
- scope_members
- idempotency_outcomes
- scope_invites
- projection_watermarks
- admin_action_log
- redis locks
- maintenance state
- migration journal
- api read version

## Trust boundaries
1) Client <-> API
2) API <-> DB
3) API <-> Redis
4) Primary DB <-> Replica
5) Admin plane <-> Production data
6) Migration plane <-> Live traffic

## Attacker models
- malicious client
- token thief
- compromised moderator
- service key leak
- infra partial failure
- timing attacker

Out of scope:
- DB superuser compromise
- OS/kernel compromise
- hypervisor compromise
- KMS/secrets manager compromise
- physical access to storage

## STRIDE mapping
Each threat must map to:
- INV-* invariant
- G-* runtime guard
- T-* acceptance test

Coverage is 100% or CI fails.

## LINDDUN mapping
Each privacy risk must map to:
- classification control
- retention policy
- at least one guard/test

## Coverage format (machine-checkable)
Threat entries are declared in YAML with fields:
- threat_id
- asset
- guard
- test
- invariant

CI gate: threat-model-coverage-check requires mapping for every threat.

## Out-of-scope statement
Out-of-scope risks are explicitly documented to avoid false assurance.

# END threat-model-v2.8.md
