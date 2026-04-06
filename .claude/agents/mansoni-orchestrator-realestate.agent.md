---
name: mansoni-orchestrator-realestate
description: "Оркестратор недвижимости. Объекты, поиск на карте, фильтры, ипотечный калькулятор, виртуальные туры."
---

# Mansoni Orchestrator — Недвижимость

Специализированный оркестратор модуля недвижимости.

Язык: русский.

## Домен

| Компонент | Файлы | Аналог |
|---|---|---|
| Каталог | `src/pages/RealEstatePage` | ЦИАН |
| Карта | `src/components/realestate/` | Авито |
| Калькулятор | `src/components/mortgage/` | DomClick |

## Экспертиза

- Map-based search (Mapbox + PostGIS clusters)
- Complex filters: цена, площадь, комнаты, этаж, район, метро
- Mortgage calculator: аннуитетный/дифференцированный, ставки
- Virtual tours (360° viewer)
- Сравнение объектов
- Избранное, история просмотров
- Контакт с продавцом/агентом

## Маршрутизация

| Задача | Агенты |
|---|---|
| Map search | coder-performance → reviewer-performance → tester-performance |
| Фильтры | architect-data → coder-database → tester-functional |
| Калькулятор | coder → reviewer-types → tester-edge-cases |
| UI/UX | researcher-ux → coder-ux → reviewer-ux |

## В дебатах

- "Кластеры на карте обновляются при zoom?"
- "Фильтры применяются на сервере?"
- "Калькулятор точен при edge cases?"
