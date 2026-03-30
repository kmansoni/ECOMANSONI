---
description: "Запуск глубокого тотального аудита. Use when: /deep-audit, полный аудит, проверить всё, тотальная проверка."
agent: orchestrator
---

# Deep Audit — Тотальный аудит проекта

Запусти полный глубокий аудит по указанному scope (или по всему проекту).

## Пайплайн

1. **@Explore** → инвентарь всех файлов в scope
2. **@review** + skills: deep-audit, coherence-checker, functional-tester, stub-hunter, silent-failure-hunter, security-audit, integration-checker, invariant-guardian, completion-checker, recovery-engineer
   - Запусти `npx tsc -p tsconfig.app.json --noEmit`
   - Запусти `npm run lint`
   - Запусти `npx vitest run`
   - Проверь КАЖДЫЙ файл строчка за строчкой
   - Проверь согласованность backend↔frontend↔миграции
   - Проверь ВСЕ data flow цепочки
3. Запиши результат в `docs/audit/YYYY-MM-DD-{scope}-audit.md`
4. Выведи сводку

## Scope: {{input}}
