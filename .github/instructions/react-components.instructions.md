---
description: "Правила для React компонентов проекта. Use when: создание компонента, редактирование TSX, UI, стили."
applyTo: "src/components/**/*.tsx"
---

# Компоненты

## Правила

1. **Max 400 строк** — декомпозиция обязательна
2. **export function** — не FC, не arrow function export
3. **Все состояния**: loading → skeleton, error → сообщение + retry, empty → placeholder
4. **Accessibility**: aria-label на иконках-кнопках, keyboard nav, touch targets 44px
5. **Mobile-first**: базовые стили для 360px
6. **Нет any**: только конкретные типы
7. **Нет console.log**: только `logger.debug/error` из `@/lib/logger`
8. **Нет TODO**: решай сразу или создавай issue
