---
description: "Комплексный code review через канонический режим Mansoni: 5 направлений, confidence scoring, вердикт PASS/WARN/FAIL"
agent: "mansoni"
---

# Code Review

Запусти комплексный review для указанного scope.

## Входные данные
- **Scope**: ${input:Что проверить — файл, директория, модуль или описание изменений}

## Runtime bootstrap
- Сразу в начале установи workflow context: `node .claude/helpers/workflow-context.cjs workflow review`

## Обязательные шаги

### 1. Сбор контекста
- Прочитай все файлы в scope
- Прочитай `/memories/repo/` для известных проблем
- Загрузи скиллы: **code-review**, **silent-failure-hunter**, **security-audit**, **skeptical-review**

### 2. Многоагентный review (5 направлений)
1. **Безопасность** — RLS, auth, XSS, утечки данных, CORS
2. **Корректность** — tsc, error handling, race conditions, stale closures
3. **Полнота UI** — loading/empty/error states, лимиты, валидация
4. **UX / Accessibility** — touch targets, keyboard nav, aria-labels, responsive
5. **Архитектура** — компонент ≤400 строк, дублирование, виртуализация, selectors

### 3. Confidence scoring
- Для каждой проблемы оцени 0–100
- Отбрось всё ниже 75 (ложные срабатывания)
- Уже существовавшие проблемы НЕ учитываются

### 4. Вердикт
- **FAIL** — есть критические проблемы (≥90% уверенность)
- **WARN** — серьёзные без критических (≥75%)
- **PASS** — только рекомендации или чисто

### 5. Оценка по категориям
Безопасность / Корректность / Полнота / UX / Производительность — каждое {x}/10

Перед финальным verdict проверь claims через skeptical-review: нельзя объявлять PASS/WARN/FAIL без подтверждённых evidence.

### 6. Финализация verdict
- Перед финальным PASS/WARN/FAIL зафиксируй review evidence: `node .claude/helpers/workflow-context.cjs evidence review "review completed with evidence-backed findings"`
- Если итог **PASS**, выполни: `node .claude/helpers/workflow-context.cjs review-verdict PASS`
- Если итог **WARN**, выполни: `node .claude/helpers/workflow-context.cjs review-verdict RISKY`
- Если итог **FAIL**, выполни: `node .claude/helpers/workflow-context.cjs review-verdict FAIL`
