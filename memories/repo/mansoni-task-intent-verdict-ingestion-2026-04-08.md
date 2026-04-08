# Mansoni Task Intent Verdict Ingestion

- Источник истины для auto workflow и auto verdict должен быть один: `workflow-context.cjs task-intent <phase> <description>`.
- Для review/audit wrapper-задач explicit verdict (`pass`, `risky`, `fail`, `accept`, `reject`, `unsafe` и русские аналоги) можно извлекать прямо из task description, не ожидая ручного `review-verdict`.
- При конфликте `review` vs `audit` во wrapper-финализации нужно сохранять уже выбранный текущий workflow, если он входит в конфликтующую пару и score сопоставим.
- История `reviewStages` не должна дублировать одинаковую stage между `pre` и `post` фазами одной и той же intent-операции.