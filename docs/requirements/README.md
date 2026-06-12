# Requirements System

Цель: хранить ТЗ/требования в репозитории, автоматически считать coverage/сценарии и строить граф выполнения.

## Файлы

- `telegram-500.yaml` — единый backlog из 500 задач (id 1..500) со статусами.
- `matrix.json` — матрица деривации (Platform×Network×Device×Auth×Privacy×State).
- `derived/` — автогенерируемые derived-сценарии (min 15 на задачу) + `summary.json`.
- `domains.json` — список доменов (>=30) с DRI/SLA.
- `taxonomy.json` — Domains → Capabilities → Features + стандарт описания функции.
- `dashboard.md` — автогенерируемая сводка (counts, графы).

## Команды

- `npm run req:init` — (пере)сгенерировать `telegram-500.yaml` (если пусто/нужно обновить скелет).
- `npm run req:dashboard` — сгенерировать `docs/requirements/dashboard.md`.
- `npm run req:derive` — сгенерировать `docs/requirements/derived/*.json`.
- `npm run req:check` — проверить целостность (500 задач, уникальность id, запрет удаления, min scenarios).

## Принцип работы

1) Требования живут в YAML и не удаляются (только `deprecated: true` + причина).
2) Все изменения идут через CI-гейты.
3) Графы строятся из YAML автоматически.
