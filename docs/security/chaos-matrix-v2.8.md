# Chaos / Failure Matrix v2.8

## Status
Final Review (rev2)

## Required scenarios
| Scenario | Expected behavior | Block release |
| --- | --- | --- |
| DB lock contention | no partial commit; idempotency consistent | YES |
| Partial API outage | no duplicate commits | YES |
| Redis down | fail-closed on protected writes | YES |
| Replication lag | no replica for write consistency | NO (warn) |
| Clock skew (client ahead) | reject with server_time + skew_hint | YES |
| Clock skew (client behind) | accept within window | NO (warn) |
| Maintenance mid-write | write rejected, no partial state | YES |
| Migration interrupted | resume-safe via journal | YES |
| Projection rebuild crash | watermark prevents rollback | YES |

## Release blocker criteria
Any YES scenario failing blocks release until fixed.

## Required frequency
- before major release
- after schema changes
- quarterly minimum

## Required artifacts
- chaos_report.json must be generated and attached to CI artifacts

## Safety procedures
- enable maintenance_write_freeze before schema changes
- confirm purge jobs idle
- backfill is resume-safe with journal
- verify watermarks monotonic

# END chaos-matrix-v2.8.md
