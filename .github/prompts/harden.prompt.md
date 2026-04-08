---
agent: mansoni
description: "Доводка существующей функции до production-grade через канонический режим Mansoni: полнота, recovery, security, интеграции."
---

# Hardening — доводка до продакшена

Доведи до production-grade: **${input}**

## Runtime bootstrap
- Сразу в начале установи workflow context: `node .claude/helpers/workflow-context.cjs workflow hardening`

## Загрузи скиллы
1. **completion-checker** — найди все недостающие состояния
2. **recovery-engineer** — реализуй recovery paths
3. **invariant-guardian** — проверь инварианты
4. **integration-checker** — проверь побочные эффекты
5. **stub-hunter** — убери заглушки
6. **silent-failure-hunter** — убери тихие сбои

## Процесс
1. Прочитай все файлы модуля
2. Проведи completion check — найди всё незавершённое
3. Проведи recovery audit — найди все тупики для пользователя
4. Проведи invariant check — проверь бизнес-правила
5. Проведи integration check — проверь цепочки и побочные эффекты
6. Составь список конкретных исправлений
7. Реализуй исправления (минимальные, точечные)
8. Верифицируй: `npx tsc -p tsconfig.app.json --noEmit` → 0 ошибок

## Финализация verdict
- После успешной доводки зафиксируй evidence typecheck: `node .claude/helpers/workflow-context.cjs evidence tsc "tsc ok after hardening"`
- Зафиксируй evidence проверки recovery/integration: `node .claude/helpers/workflow-context.cjs evidence manual "hardening verified across failure paths"`
- После успешной доводки и верификации зафиксируй review verdict: `node .claude/helpers/workflow-context.cjs review-verdict PASS`

## Правила
- Каждое исправление — минимальное и точечное
- Не рефактори то, что работает
- Сначала самые критичные проблемы (🔴), потом менее критичные
- Все toast-сообщения на русском
- Все ошибки через logger.error с контекстом
