---
description: "Правила для Supabase Edge Functions на Deno. Use when: создание Edge Function, Deno.serve, CORS, авторизация."
applyTo: "supabase/functions/**/*.ts"
---

# Edge Functions

## Обязательная структура

1. CORS headers — ПЕРВОЙ строкой обработки
2. Auth check — ВТОРОЙ (Bearer token)
3. Input validation — ТРЕТЬЕЙ
4. Бизнес-логика — после всех проверок
5. Error handling — try/catch на весь handler

## Запрещено

- `console.log` → используй `console.error` для ошибок (нет logger в Deno)
- `import` из npm без `https://esm.sh/`
- Прямой доступ к БД без проверки авторизации
- Возврат ответа без `Content-Type` header
- Хардкод секретов (используй `Deno.env.get()`)
