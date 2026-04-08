# Archive Agents Policy

Этот каталог содержит **legacy agent definitions**.

Правила:

- архивные агенты не являются канонической точкой входа
- новые задачи должны идти через `mansoni`
- runtime orchestration должен идти через встроенный Ruflo layer внутри `mansoni`, а не через legacy agent files
- архивные файлы сохраняются только как исторический reference и источник идей для миграции

Канонические активные агенты находятся в:

- `.github/agents/mansoni.agent.md`
- `.github/agents/mansoni-core.agent.md`
- `.github/agents/ruflo.agent.md`
