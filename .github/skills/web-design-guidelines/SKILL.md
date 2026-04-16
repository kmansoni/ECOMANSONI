---
name: web-design-guidelines
description: >-
  Аудит UI кода по Web Interface Guidelines. Проверка accessibility, UX, best practices.
  Use when: review UI, check accessibility, audit design, review UX, check site best practices.
metadata:
  category: development
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/web-design-guidelines
---

# Web Interface Guidelines

Проверка UI кода на соответствие Web Interface Guidelines.

## Как работает

1. Загрузить актуальные guidelines из источника
2. Прочитать указанные файлы (или запросить у пользователя)
3. Проверить по всем правилам
4. Вывести findings в формате `file:line`

## Источник guidelines

Загружать перед каждой проверкой:
```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

## Использование

Пользователь даёт файл или pattern:
1. Загрузить guidelines из URL выше
2. Прочитать указанные файлы
3. Применить все правила
4. Вывести findings в формате из guidelines

Если файлы не указаны — спросить пользователя.

## Категории проверок

### Accessibility
- Semantic HTML (правильные теги, heading hierarchy)
- ARIA атрибуты где нужны
- Keyboard navigation
- Color contrast
- Screen reader compatibility
- Focus management

### Typography
- Правильная иерархия
- Читабельность
- Responsive sizing

### Layout
- Responsive design
- Touch targets (min 44px)
- Spacing consistency
- Content reflow

### Interaction
- Hover states
- Focus states
- Loading states
- Error states
- Disabled states

### Performance
- Image optimization
- Lazy loading
- Critical rendering path
- Bundle size

### Best Practices
- Progressive enhancement
- Cross-browser compatibility
- Mobile-first approach
- Dark mode support

## Формат вывода

```
src/components/chat/ChatWindow.tsx:45 — Missing aria-label on interactive element
src/components/ui/button.tsx:12 — Touch target below 44px minimum
src/pages/ShopPage.tsx:89 — Heading hierarchy skipped (h2 → h4)
```

Каждый finding: файл:строка — описание проблемы.
