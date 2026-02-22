# OpenAPI Pack

Цель: минимальные OpenAPI спецификации поверх Contract Pack (JSON Schema) для ключевых read-path и ops API.

Принципы:
- Источник истины для payload структуры — `docs/contracts/schemas/*`.
- OpenAPI только связывает эндпойнты с контрактами.
- Без избыточных фич, только необходимое.

Файлы:
- `discovery.v1.yaml` — Explore/Hashtag + internal ops (trends run, rollouts decision).
