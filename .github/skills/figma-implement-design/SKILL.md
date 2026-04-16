---
name: figma-implement-design
description: >-
  Реализация дизайнов из Figma в production-ready код с pixel-perfect точностью.
  Use when: implement design, реализовать дизайн из Figma, Figma URL, build component from Figma.
metadata:
  category: development
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/figma-implement-design
---

# Реализация дизайнов из Figma

Структурированный workflow для перевода Figma дизайнов в production-ready код.

## Когда использовать

- Пользователь даёт ссылку на Figma
- Нужно реализовать UI по макету
- "implement design", "сверстай по Figma", "реализуй компонент"

## Обязательный Workflow

### Step 0: Настройка Figma MCP

Если MCP не подключён — помочь пользователю:

```json
{
  "mcp": {
    "Figma Desktop": {
      "type": "remote",
      "url": "http://127.0.0.1:3845/mcp"
    }
  }
}
```

### Step 1: Получить Node ID

**Из URL**: `https://figma.com/design/:fileKey/:fileName?node-id=1-2`
- fileKey: сегмент после `/design/`
- nodeId: значение `node-id` параметра

**Из Figma Desktop**: автоматически из выбранного элемента.

### Step 2: Получить контекст дизайна

```
get_design_context(fileKey=":fileKey", nodeId="1-2")
```

Данные: layout, typography, colors, design tokens, компоненты, spacing.

Если ответ слишком большой:
1. `get_metadata(fileKey, nodeId)` — карта узлов
2. Точечный `get_design_context` для каждого дочернего узла.

### Step 3: Скриншот для визуальной проверки

```
get_screenshot(fileKey=":fileKey", nodeId="1-2")
```

### Step 4: Скачать ассеты

- Иконки, SVG, изображения из Figma MCP
- НЕ добавлять новые icon packages — всё из Figma payload
- НЕ создавать placeholder'ы

### Step 5: Перевод в проектные конвенции

**Ключевые принципы:**
- Figma MCP output — представление дизайна, НЕ финальный код
- Заменить Tailwind классы на дизайн-токены проекта
- Переиспользовать существующие компоненты (Button, Input, Typography)
- Использовать проектную систему цвет, типографики, spacing
- Соблюдать существующие паттерны роутинга и state management

### Step 6: Pixel-perfect точность

- Приоритет: точное соответствие Figma
- Design tokens вместо hardcoded значений
- При конфликте: design system tokens, но с минимальной корректировкой для визуального соответствия
- WCAG accessibility обязателен

### Step 7: Валидация

Чеклист:
- [ ] Layout совпадает (spacing, alignment, sizing)
- [ ] Typography совпадает (font, size, weight, line height)
- [ ] Цвета точные
- [ ] Интерактивные состояния (hover, active, disabled)
- [ ] Responsive поведение
- [ ] Ассеты рендерятся корректно
- [ ] Accessibility

## Правила

### Организация компонентов
- UI компоненты в `src/components/ui/` или доменную папку
- Следовать naming conventions проекта
- Избегать inline styles

### Дизайн-система
- ВСЕГДА использовать существующие компоненты
- Маппить Figma tokens → проектные tokens
- Расширять, а не дублировать

### Качество кода
- Без hardcoded значений — design tokens / constants
- Компонуемые и переиспользуемые компоненты
- TypeScript типы для props
- Компонент > 400 строк → декомпозиция
