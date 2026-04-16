---
name: frontend-design
description: >-
  Создание выразительных production-grade фронтенд интерфейсов без AI-шаблонности.
  Use when: build web components, pages, landing, dashboard, UI design, styling, beautify.
metadata:
  category: development
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/frontend-design
---

# Frontend Design — выразительный UI без AI-слепоты

Создание production-grade интерфейсов с высоким дизайн-качеством, исключающих "AI slop".

## Design Thinking

Перед написанием кода — осмыслить контекст:

- **Назначение**: какую проблему решает интерфейс? Кто пользователь?
- **Тон**: выбрать ЯРКУЮ эстетику: brutalist, luxury, organic, retro-futuristic, editorial, playful, industrial, art deco, soft/pastel...
- **Ограничения**: framework, performance, accessibility
- **Отличие**: что делает этот UI ЗАПОМИНАЮЩИМСЯ?

**КРИТИЧНО**: Выбрать чёткое концептуальное направление и исполнить его с точностью. Смелый максимализм и утончённый минимализм — оба работают, ключ в намеренности.

## Эстетические гайдлайны

### Typography
- Выбирать красивые, уникальные шрифты — НЕ Inter, НЕ Arial, НЕ Roboto
- Пара: выразительный display font + утончённый body font
- Характерные, неожиданные выборы

### Color & Theme
- CSS переменные для консистентности
- Доминантный цвет + акценты > робкая равномерная палитра
- Учитывать dark/light mode

### Motion
- Анимации для эффектов и micro-interactions
- CSS-only для HTML, Motion library для React
- Высокоэффекнтые моменты: staggered reveals, scroll-triggering, hover surprises
- Одна оркестрованная анимация загрузки > рассеянные микро-анимации

### Spatial Composition
- Неожиданные layouts, асимметрия, overlap, диагональный flow
- Grid-breaking элементы
- Щедрый negative space ИЛИ контролируемая плотность

### Backgrounds & Visual Details
- Создавать атмосферу и глубину, НЕ solid colors по умолчанию
- Gradient meshes, noise textures, geometric patterns, layered transparencies
- Dramatic shadows, decorative borders, grain overlays

## ЗАПРЕЩЕНО (AI slop)

- ❌ Overused шрифты: Inter, Roboto, Arial, system fonts
- ❌ Клише: purple gradients на белом фоне
- ❌ Предсказуемые layouts и component patterns
- ❌ Cookie-cutter дизайн без контекстного характера
- ❌ Одинаковые решения между генерациями (Space Grotesk и т.д.)
- ❌ Excessive centered layouts, uniform rounded corners

## Принцип исполнения

Максималистский дизайн → сложный код с анимациями и эффектами.
Минималистский дизайн → сдержанность, точность, spacing, typography, subtle details.

Элегантность = исполнение видения хорошо.
