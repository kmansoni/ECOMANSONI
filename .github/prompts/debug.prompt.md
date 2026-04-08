---
description: "Систематическая диагностика бага через канонический режим Mansoni: воспроизведение → изоляция → корневая причина → исправление → проверка"
agent: "mansoni"
---

# Диагностика бага

Запусти систематическую диагностику проблемы.

## Входные данные
- **Проблема**: ${input:Опиши баг — что ожидалось и что происходит вместо этого}

## Runtime bootstrap
- Сразу в начале установи workflow context: `node .claude/helpers/workflow-context.cjs workflow bug`

## Обязательные шаги

### 1. Pre-flight
- Прочитай `/memories/repo/` — известные ловушки проекта
- Загрузи скилл **silent-failure-hunter** если подозреваешь молчаливый сбой
- Загрузи **supabase-production** если проблема связана с БД, RLS, Edge Functions
- Перед финальным claim о fix используй **skeptical-review**, чтобы проверить, что исправление реально подтверждено

### 2. REPRODUCE — Воспроизведение
- Определи точные шаги для воспроизведения через анализ кода
- Проверь git log затронутых файлов — что изменилось недавно?

### 3. ISOLATE — Изоляция
- Сузь область до одного модуля
- Проверь: TypeScript ошибки (`tsc --noEmit`), ESLint, Supabase logs

### 4. ROOT CAUSE — Корневая причина
- Проследи всю цепочку от UI до базы данных
- Типичные причины: RLS блокирует, отсутствует await, race condition, stale closure

### 5. FIX — Исправление
- Минимальное изменение — только корневая причина
- Добавь защиту от повторения

### 6. VERIFY — Проверка
- `npx tsc -p tsconfig.app.json --noEmit` → 0 ошибок
- После успешной проверки зафиксируй evidence: `node .claude/helpers/workflow-context.cjs evidence tsc "tsc ok after bug fix"`
- Зафиксируй evidence с объяснением проверки: `node .claude/helpers/workflow-context.cjs evidence manual "root cause reproduced and fix verified"`
- После подтверждения, что корневая причина исправлена, зафиксируй review verdict: `node .claude/helpers/workflow-context.cjs review-verdict PASS`
- Объясни почему фикс работает
