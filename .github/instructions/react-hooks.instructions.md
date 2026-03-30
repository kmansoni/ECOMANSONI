---
description: "Правила для React хуков. Use when: создание хука, useEffect, useState, useCallback, useMemo, Zustand store."
applyTo: "src/hooks/**/*.ts"
---

# Hooks

## Правила

1. **Cleanup в useEffect** — ОБЯЗАТЕЛЕН (unsubscribe, abort, clearTimeout)
2. **AbortController** для fetch-запросов в useEffect
3. **useCallback** для колбэков, передаваемых в дочерние компоненты
4. **useMemo** для тяжёлых вычислений и объектов в deps
5. **Stable deps** — никогда объект/массив прямо в deps (useMemo сначала)
6. **Error handling**: try/catch в каждой async-функции
7. **Logging**: `logger.error('[HookName] описание', { context })` при ошибках
8. **Limit**: `.limit()` на КАЖДЫЙ запрос к Supabase
