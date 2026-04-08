---
description: "Полный пайплайн разработки фичи через канонический режим Mansoni: исследование → архитектура → реализация → review-цикл → верификация"
agent: "mansoni"
---

# Пайплайн разработки фичи

Запусти полный многопроходный пайплайн для реализации фичи.

## Входные данные
- **Фича**: ${input:Опиши фичу, которую нужно реализовать}

## Runtime bootstrap
- Сразу в начале установи workflow context: `node .claude/helpers/workflow-context.cjs workflow feature`

## Обязательные фазы

### Фаза 1: Исследование
Используй Mansoni research phase, при необходимости подключай @Explore для read-only исследования:
- Найди все существующие модули, связанные с фичей
- Определи используемые паттерны и зависимости
- Проверь `/memories/repo/` на известные ловушки

### Фаза 2: Архитектура
Используй architectural phase Mansoni:
- Исследуй как аналогичная фича реализована в Telegram, Signal, WhatsApp
- Предложи 3 подхода (минимальный, чистый, прагматичный) с таблицей сравнения
- Выбери лучший и обоснуй
- Создай полную спецификацию: модель данных, API, UI состояния, лимиты, edge cases

### Фаза 3: Реализация
Используй implementation phase Mansoni с Ruflo runtime:
- Загрузи скиллы feature-dev, react-production, supabase-production, messenger-platform
- Реализуй ВСЁ за один проход — никаких "базовых версий"
- Все состояния: loading, empty, error, success
- Все лимиты, accessibility, responsive

### Фаза 4: Review-цикл
Используй review phase Mansoni:
- 5 направлений: стандарты, баги, Supabase/RLS, UI полнота, безопасность
- Confidence scoring 0-100, фильтр ≥75
- Если FAIL → Mansoni исправляет → повторный review (макс. 3 итерации)

### Фаза 5: Верификация
- `npx tsc -p tsconfig.app.json --noEmit` → 0 ошибок
- После успешного typecheck зафиксируй evidence: `node .claude/helpers/workflow-context.cjs evidence tsc "tsc ok after feature implementation"`
- После завершения review-цикла зафиксируй evidence: `node .claude/helpers/workflow-context.cjs evidence review "feature review passed with confidence filter"`
- После успешной финальной проверки зафиксируй review verdict: `node .claude/helpers/workflow-context.cjs review-verdict PASS`
- Финальный отчёт о проделанной работе
