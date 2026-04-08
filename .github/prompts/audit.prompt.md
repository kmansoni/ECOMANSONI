---
agent: mansoni
description: "CTO-уровень аудит зрелости модуля или всей платформы через канонический режим Mansoni. Scoring, risk map, честный вердикт."
---

# Аудит зрелости

Проведи полный аудит зрелости для: **${input}**

## Загрузи скиллы
1. **platform-auditor** — основной workflow аудита
2. **stub-hunter** — найди все заглушки
3. **completion-checker** — проверь полноту функций
4. **invariant-guardian** — проверь доменные инварианты
5. **integration-checker** — проверь межсервисные цепочки
6. **security-audit** — проверь безопасность
7. **silent-failure-hunter** — найди тихие сбои

## Процесс
1. Определи scope аудита (модуль / сервис / вся платформа)
2. Собери инвентарь: файлы, компоненты, хуки, stores, Edge Functions, таблицы
3. Проведи проверку по каждому направлению (скиллы выше)
4. Оцени по 4 категориям: полнота, надёжность, безопасность, архитектура (0-25 каждая)
5. Выведи общий балл 0-100 и вердикт (ACCEPT / PARTIAL / RISKY / REJECT / UNSAFE)
6. Составь risk map и top-5 действий для повышения уровня
7. Напиши честный CTO verdict

## Runtime bootstrap
- Сразу в начале установи workflow context: `node .claude/helpers/workflow-context.cjs workflow audit`

## Формат
Используй формат из скилла **platform-auditor**: инвентарь → категории → risk map → stub density → действия → вердикт

## Финализация verdict
- Перед финальным verdict зафиксируй audit evidence: `node .claude/helpers/workflow-context.cjs evidence review "audit completed with risk map and evidence"`
- ACCEPT → `node .claude/helpers/workflow-context.cjs review-verdict PASS`
- PARTIAL или RISKY → `node .claude/helpers/workflow-context.cjs review-verdict RISKY`
- REJECT или UNSAFE → `node .claude/helpers/workflow-context.cjs review-verdict FAIL`
