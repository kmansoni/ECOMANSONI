# Publish Intent — State Machine v1

Scope: Phase 0–2 (idempotent publish)

Related:
- Spec: docs/specs/phase0/P0C-create-reels-upload-publish.md

## Mermaid

```mermaid
stateDiagram-v2
  [*] --> Draft: intent_created (client_publish_id)
  Draft --> Validating: precheck
  Validating --> Uploading: validation_ok
  Validating --> Failed: validation_failed
  Uploading --> Publishing: upload_done
  Uploading --> Failed: upload_failed
  Publishing --> Published: db_upsert_ok
  Publishing --> Failed: db_error
  Failed --> Uploading: retry (same client_publish_id)
  Failed --> Publishing: retry_publish (same client_publish_id)
  Published --> [*]
```

## Invariants
- `client_publish_id` никогда не меняется при retry.
- Повторный publish не создаёт дубль (DB unique/onConflict).
- UI in-flight guard предотвращает double-tap.
