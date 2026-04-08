---
description: "Запуск глубокого тотального аудита через канонический режим Mansoni. Use when: /deep-audit, полный аудит, проверить всё, тотальная проверка."
agent: mansoni
---

# Deep Audit — Тотальный аудит проекта

Запусти полный глубокий аудит по указанному scope (или по всему проекту).

## Runtime bootstrap
- Сразу в начале установи workflow context: `node .claude/helpers/workflow-context.cjs workflow audit`

## Пайплайн

1. **@Explore** → инвентарь всех файлов в scope
2. **Mansoni audit phase** + skills: deep-audit, coherence-checker, functional-tester, stub-hunter, silent-failure-hunter, security-audit, integration-checker, invariant-guardian, completion-checker, recovery-engineer
   - Запусти `npx tsc -p tsconfig.app.json --noEmit`
   - Запусти `npm run lint`
   - Запусти `npx vitest run`
   - Проверь КАЖДЫЙ файл строчка за строчкой
   - Проверь согласованность backend↔frontend↔миграции
   - Проверь ВСЕ data flow цепочки
3. Запиши результат в `docs/audit/YYYY-MM-DD-{scope}-audit.md`
4. Выведи сводку

## Финализация verdict
- Если аудит завершён без блокеров: `node .claude/helpers/workflow-context.cjs review-verdict PASS`
- Если есть значимые риски без явного блокера: `node .claude/helpers/workflow-context.cjs review-verdict RISKY`
- Если есть блокеры или unsafe verdict: `node .claude/helpers/workflow-context.cjs review-verdict FAIL`

## Scope: {{input}}
