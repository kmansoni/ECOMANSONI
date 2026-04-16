---
name: artifacts-builder
description: >-
  Создание многокомпонентных HTML артефактов с React, Tailwind CSS, shadcn/ui.
  Инициализация проекта, разработка, бандлинг в единый HTML файл.
  Use when: сложные артефакты, state management, routing, shadcn/ui компоненты.
metadata:
  category: development
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/artifacts-builder
---

# Artifacts Builder

Создание мощных frontend HTML артефактов.

**Стек**: React 18 + TypeScript + Vite + Parcel (bundling) + Tailwind CSS + shadcn/ui

## Дизайн-правила

**ВАЖНО**: Избегать "AI slop" — чрезмерно центрированные layouts, фиолетовые градиенты, одинаковые скругления, шрифт Inter.

## Quick Start

### Шаг 1: Инициализация

```bash
bash scripts/init-artifact.sh <project-name>
cd <project-name>
```

Создаёт проект с:
- React + TypeScript (Vite)
- Tailwind CSS 3.4.1 с shadcn/ui theming
- Path aliases (`@/`)
- 40+ shadcn/ui компонентов
- Все Radix UI зависимости
- Parcel для bundling

### Шаг 2: Разработка

Редактировать сгенерированные файлы для создания артефакта.

### Шаг 3: Бандлинг в один HTML

```bash
bash scripts/bundle-artifact.sh
```

Создаёт `bundle.html` — self-contained артефакт с инлайн JS, CSS и зависимостями.

**Что делает скрипт**:
- Устанавливает bundling зависимости (parcel, html-inline)
- Создаёт `.parcelrc` config
- Собирает через Parcel (без source maps)
- Инлайнит всё в один HTML

### Шаг 4: Показать пользователю

### Шаг 5: Тестирование (опционально)

Тестировать через Playwright или другие доступные инструменты. Не тестировать заранее — добавляет latency.

## Reference

- **shadcn/ui компоненты**: https://ui.shadcn.com/docs/components
