# Contract Pack (Schemas)

Дата: 2026-02-22

Цель: хранить исполнимые контракты (JSON Schema) для ключевых сообщений и API payloads.

Правила:
- Контракты версионируются.
- Любое изменение — backward-compatible или с новой версией.
- Reason codes берутся из: [docs/registry/reason-codes.md](docs/registry/reason-codes.md)

Примеры (golden traces):
- [docs/contracts/examples/explore-page.v1.example.json](docs/contracts/examples/explore-page.v1.example.json)
- [docs/contracts/examples/explore-cache-entry.v1.example.json](docs/contracts/examples/explore-cache-entry.v1.example.json)
- [docs/contracts/examples/explore-request.v1.example.json](docs/contracts/examples/explore-request.v1.example.json)
- [docs/contracts/examples/hashtag-page.v1.example.json](docs/contracts/examples/hashtag-page.v1.example.json)
- [docs/contracts/examples/hashtag-request.v1.example.json](docs/contracts/examples/hashtag-request.v1.example.json)
- [docs/contracts/examples/hashtag-status-change.v1.example.json](docs/contracts/examples/hashtag-status-change.v1.example.json)
- [docs/contracts/examples/trend-item.v1.example.json](docs/contracts/examples/trend-item.v1.example.json)
- [docs/contracts/examples/rollout-journal-entry.v1.example.json](docs/contracts/examples/rollout-journal-entry.v1.example.json)
- [docs/contracts/examples/auto-rollback-decision.v1.example.json](docs/contracts/examples/auto-rollback-decision.v1.example.json)
- [docs/contracts/examples/trend-run.v1.example.json](docs/contracts/examples/trend-run.v1.example.json)

Схемы:
- [docs/contracts/schemas/reels-feed-page.v1.schema.json](docs/contracts/schemas/reels-feed-page.v1.schema.json)
- [docs/contracts/schemas/reel-event-batch.v1.schema.json](docs/contracts/schemas/reel-event-batch.v1.schema.json)
- [docs/contracts/schemas/create-reel-intent.v1.schema.json](docs/contracts/schemas/create-reel-intent.v1.schema.json)
- [docs/contracts/schemas/moderation-decision.v1.schema.json](docs/contracts/schemas/moderation-decision.v1.schema.json)
- [docs/contracts/schemas/enforcement-action.v1.schema.json](docs/contracts/schemas/enforcement-action.v1.schema.json)
- [docs/contracts/schemas/rollout-journal-entry.v1.schema.json](docs/contracts/schemas/rollout-journal-entry.v1.schema.json)
- [docs/contracts/schemas/auto-rollback-decision.v1.schema.json](docs/contracts/schemas/auto-rollback-decision.v1.schema.json)
- [docs/contracts/schemas/conversion-event.v1.schema.json](docs/contracts/schemas/conversion-event.v1.schema.json)
- [docs/contracts/schemas/explore-page.v1.schema.json](docs/contracts/schemas/explore-page.v1.schema.json)
- [docs/contracts/schemas/explore-request.v1.schema.json](docs/contracts/schemas/explore-request.v1.schema.json)
- [docs/contracts/schemas/explore-cache-entry.v1.schema.json](docs/contracts/schemas/explore-cache-entry.v1.schema.json)
- [docs/contracts/schemas/hashtag-page.v1.schema.json](docs/contracts/schemas/hashtag-page.v1.schema.json)
- [docs/contracts/schemas/hashtag-request.v1.schema.json](docs/contracts/schemas/hashtag-request.v1.schema.json)
- [docs/contracts/schemas/hashtag-status-change.v1.schema.json](docs/contracts/schemas/hashtag-status-change.v1.schema.json)
- [docs/contracts/schemas/trend-item.v1.schema.json](docs/contracts/schemas/trend-item.v1.schema.json)
- [docs/contracts/schemas/trend-run.v1.schema.json](docs/contracts/schemas/trend-run.v1.schema.json)
