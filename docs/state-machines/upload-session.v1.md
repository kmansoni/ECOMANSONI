# Upload Session — State Machine v1

Scope: Phase 0–1 (resumable upload model)

Related:
- Spec: docs/specs/phase0/P0C-create-reels-upload-publish.md
- Contracts: docs/contracts/schemas/create-reel-intent.v1.schema.json

## Mermaid

```mermaid
stateDiagram-v2
  [*] --> Open: create_session
  Open --> Uploading: first_part_received
  Uploading --> Uploading: part_received
  Uploading --> Paused: client_pause
  Paused --> Uploading: client_resume
  Uploading --> Committing: commit_requested
  Committing --> Committed: commit_ok
  Committing --> Failed: commit_failed
  Uploading --> Failed: fatal_error
  Open --> Aborted: abort
  Uploading --> Aborted: abort
  Failed --> Uploading: retry (same session)
  Committed --> [*]
  Aborted --> [*]
```

## Invariants
- Session idempotency: повторный `create_session` с тем же `idempotency_key` возвращает ту же session.
- Commit idempotency: повторный commit не создаёт второй "original" объект.
- Storage path deterministic: привязан к client_publish_id.

## Allowed errors
- retryable: network, transient server
- non-retryable: permission, validation, policy
