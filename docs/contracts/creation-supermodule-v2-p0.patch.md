# Creation SuperModule v2 P0 Patch

Status: `patch-applied`  
Date: `2026-02-24`

## Scope
- CreativeGraph schema fix: `v1.0.1`
- FSM split for trust gates and held decisions
- Idempotency SSOT across mutating endpoints
- Multipart upload part ledger
- Telemetry deterministic dedupe + partitioning
- `ALLOW_WITH_ACTION` server mutation contract

## P0 Fix Summary
1. `timebase_hz` normalized to timeline-only values: `1000 | 90000`.
2. Audio sample rate moved out of graph and remains in render profile contracts.
3. Node `params` are now typed with `oneOf` per node type/subtype.
4. Port contracts are explicit (`from_port`, `to_port`) with typed port kinds.
5. Keyframes are channel-based and typed (`param_type`, bounded points).
6. FSM split into `PROCESSING_MEDIA -> TRUST_GATES -> READY_TO_PUBLISH`, with `HELD`.
7. Idempotency moved to dedicated table with `(scope,key)` + `request_hash`.
8. Upload completion truth is based on `upload_parts` ledger.
9. Telemetry uses partitioned table and deterministic dedupe uniqueness.

## FSM v2 (P0)

| From | Event | Guard | To |
|---|---|---|---|
| `UPLOADING` | `parts_complete` | manifest checksum valid | `PROCESSING_MEDIA` |
| `PROCESSING_MEDIA` | `media_jobs_ok` | transcode/waveform/thumb done | `TRUST_GATES` |
| `TRUST_GATES` | `gate_allow` | all gates `ALLOW` | `READY_TO_PUBLISH` |
| `TRUST_GATES` | `gate_hold` | any gate `HOLD` | `HELD` |
| `TRUST_GATES` | `gate_allow_with_action` | action patch produced | `HELD` |
| `HELD` | `action_applied` | server patch committed as new rev | `TRUST_GATES` |
| `READY_TO_PUBLISH` | `publish_request` | idempotency key bound | `PUBLISHING` |
| `PUBLISHING` | `commit_ok` | tx commit success | `PUBLISHED` |
| `PUBLISHING` | `commit_fail` | retriable | `READY_TO_PUBLISH` |
| `*` | `fatal_non_retriable` | n/a | `FAILED` |

## `ALLOW_WITH_ACTION` Contract (Server-side)

### Invariant
Client must not apply trust-critical graph mutations on its own.

### Flow
1. Gate emits decision payload with `action_patch`.
2. Server applies patch against current draft revision in a transaction.
3. Server writes a new `draft_versions.rev = current_rev + 1`.
4. Server stores `applied_rev` in `rights_events` or `moderation_events`.
5. Client receives read-only result: `new_rev`, `applied_actions`.

### Decision Payload
```json
{
  "decision": "ALLOW_WITH_ACTION",
  "decision_code": "RIGHTS_REPLACE_TRACK_REQUIRED",
  "action_patch": [
    {"op":"remove_node","node_id":"src_music_1"},
    {"op":"add_node","node":{"id":"src_music_safe","type":"Source","subtype":"audioTrack","params":{"source_kind":"audio","asset_ref":"asset_safe_123","track":"audio"}}},
    {"op":"rewire_edge","from":"src_music_safe","from_port":"audio_out","to":"mix_1","to_port":"audio_in"}
  ]
}
```

### Error Codes
- `DRAFT_REV_CONFLICT`
- `ALLOW_WITH_ACTION_PATCH_INVALID`
- `ALLOW_WITH_ACTION_PATCH_NOT_APPLICABLE`
- `ALLOW_WITH_ACTION_APPLY_FAILED`

## Idempotency Keys Contract
- Scope examples:
  - `draft.patch`
  - `uploads.init`
  - `uploads.complete`
  - `publish.submit`
  - `live.control`
- Replay rule:
  - Same `(scope,key,request_hash)` -> return stored result.
  - Same `(scope,key)` with different hash -> reject with `IDEMPOTENCY_HASH_MISMATCH`.

