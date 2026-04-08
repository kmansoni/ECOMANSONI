# Claude Commands

Этот каталог содержит короткие command wrappers для runtime-контекста Mansoni + Ruflo.

Доступные команды:

- `/workflow-feature`
- `/workflow-bug`
- `/workflow-review`
- `/workflow-audit`
- `/review-pass`
- `/review-risky`
- `/review-fail`

Назначение:

- не заставлять агента помнить helper-команды вручную
- унифицировать bootstrap/finalize шаги для workflow
- поддерживать промежуточные verdict-стадии review и audit
