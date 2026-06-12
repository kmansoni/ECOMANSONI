# Reels Playback + Events — State Machine v1

Scope: Phase 0–1 (event integrity)

Related:
- Spec: docs/specs/phase0/P0B-playback-event-integrity.md
- Contracts: docs/contracts/schemas/reel-event-batch.v1.schema.json

## Mermaid (Playback)

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Loading: item_active
  Loading --> Playing: first_frame
  Loading --> Error: load_fail
  Playing --> Buffering: buffer_empty
  Buffering --> Playing: buffer_ok
  Playing --> PausedUser: user_pause
  PausedUser --> Playing: user_play
  Playing --> PausedSystem: overlay_open|app_hidden
  PausedSystem --> Playing: overlay_close|app_visible
  Playing --> Ended: play_end
  Ended --> Idle: next_item
  Error --> Idle: next_item
```

## Mermaid (Event ordering)

```mermaid
flowchart TD
  I[impression] --> VS[view_start]
  VS --> V2[viewed_2s]
  V2 --> W[watched]
  W --> C[complete]
  VS --> S[skip]
  I --> NI[not_interested]
  I --> H[hide]
  I --> R[report]
```

## Invariants
- No complete without view_start.
- No watched without viewed_2s.
- Autopause on overlay -> watched_time does not accrue.
- Server dedup by (viewer/session, reel, type, time_bucket).
