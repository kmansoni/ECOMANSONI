---
description: "Рефакторинг и декомпозиция через канонический режим Mansoni: анализ → план → реализация → review → верификация"
agent: mansoni
---

# Рефакторинг

Запусти пайплайн рефакторинга для указанного кода.

## Входные данные
- **Scope**: ${input:Что рефакторить — файл, компонент, модуль или описание проблемы}

## Runtime bootstrap
- Сразу в начале установи workflow context: `node .claude/helpers/workflow-context.cjs workflow refactor`

## Обязательные шаги

### 1. Исследование
- Исследуй текущий код и все его зависимости
- Определи: размер (строки), сложность, дублирование, нарушения стандартов
- Загрузи скиллы: **code-simplifier**, **react-production**

### 2. План рефакторинга
- Что именно нужно исправить (конкретный список)
- 3 подхода: минимальный / чистый / прагматичный
- Таблица компромиссов
- Рекомендация с обоснованием
- Если задача не двусмысленна, переходи к реализации без дополнительного подтверждения

### 3. Реализация
- Следуй выбранному подходу
- Все стандарты: TypeScript strict, компоненты ≤400 строк, все UI состояния
- Обновляй todo по мере прогресса

### 4. Review
- Загрузи скиллы **code-review**, **silent-failure-hunter**
- Проверь: функциональность сохранена, нет новых багов
- Confidence scoring ≥75

### 5. Верификация
- `npx tsc -p tsconfig.app.json --noEmit` → 0 ошибок
- Зафиксируй evidence typecheck: `node .claude/helpers/workflow-context.cjs evidence tsc "tsc ok after refactor"`
- Зафиксируй evidence сохранения поведения: `node .claude/helpers/workflow-context.cjs evidence manual "public api and behavior preserved"`
- После подтверждения, что поведение сохранено, зафиксируй review verdict: `node .claude/helpers/workflow-context.cjs review-verdict PASS`
- Итог: что изменено, сколько строк до/после, что улучшено
