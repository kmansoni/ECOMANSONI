---
name: self-learning-protocol
description: "Протокол самообучения агента: изучение 30+ репозиториев перед решением, сохранение паттернов, адаптация к домену. Use when: новая фича в незнакомом домене, нужно изучить лучшие практики, spike-исследование, прежде чем проектировать архитектуру."
argument-hint: "[домен или задача для изучения]"
user-invocable: true
---

# Self-Learning Protocol — Протокол Самообучения

Перед тем как принимать решение в незнакомом домене — изучи как это делают лучшие. 30+ репозиториев, адаптация паттернов, сохранение в памяти.

> Инспирирован: Compound Engineering Plugin (turning past mistakes into future improvement), obra/superpowers, anthropic/model-spec.

## Тригеры (когда активировать)

- Новая фича которой в проекте ещё не было
- Домен с особой специфичностью (E2EE, matching, geofencing, payments)
- После серьёзной ошибки — чтобы не повторить
- Нужно выбрать между несколькими архитектурными подходами
- Жалобы на качество предыдущих решений

## Протокол (5 фаз)

### Фаза 1: IDENTIFY — Определить домен

```
Что изучаем: {конкретная задача}
Домен: {E2EE | geolocation | payments | realtime | feed | matching | ...}
Стек: {React + Supabase + TypeScript}
Ограничения: {мобилка, offline-first, performance требования}
```

### Фаза 2: SEARCH — Найти референсные репозитории

Искать репозитории с:
- Минимум 1000 stars
- Активная поддержка (коммит < 6 месяцев назад)
- Релевантный стек или домен
- Production-ready (не учебные проекты)

**Источники:**
| Тип | Источники |
|---|---|
| GitHub awesome lists | awesome-copilot, awesome-claude-code, travisvn/awesome-claude-skills |
| Official docs | Supabase docs, React docs, MDN |
| Community skills | obra/superpowers, trailofbits/skills |
| Domain-specific | Signal Protocol docs, WebRTC specs, OWASP |

**Минимум по доменам:**
| Домен | Ключевые источники |
|---|---|
| E2EE / мессенджер | Signal Protocol, Matrix.org, WhatsApp WhitePaper |
| Realtime | Supabase Realtime docs, Phoenix LiveView, Ably patterns |
| Геолокация / такси | PostGIS docs, H3 geohashing, Uber Engineering Blog |
| Payments | Stripe docs, Adyen docs |
| Feed / алгоритм | Instagram Engineering Blog, Twitter Feeds |
| Matching | Tinder Engineering Blog, OkCupid algorithms |
| Security | OWASP, Trail of Bits, Google Project Zero |

### Фаза 3: ANALYZE — Извлечь паттерны

Для каждого репозитория/источника:

```markdown
## {Источник}: {URL}

### Используемые паттерны
1. {паттерн}: {описание}
2. {паттерн}: {описание}

### Anti-patterns (что избегают)
1. {anti-pattern}: {почему}

### Применимость к нашему проекту
- Применимо: {что взять}
- НЕ применимо: {что не подходит и почему}
```

### Фаза 4: COMPARE — Сравнить с нашим кодом

```
1. grep_search + semantic_search по домену в нашем коде
2. Найти существующие решения
3. Сравнить с найденными паттернами:
   - Что у нас хуже?
   - Что у нас лучше?
   - Что отсутствует?
4. Составить Gap Analysis
```

**Gap Analysis формат:**
| Паттерн | Референс | Наш проект | Gap |
|---|---|---|---|
| Key rotation | Signal Protocol | Нет | 🔴 CRITICAL |
| Forward secrecy | Signal | Частично | 🟡 MEDIUM |
| Offline key pre-distribution | Matrix | Нет | 🟠 HIGH |

### Фаза 5: ADAPT + SAVE — Адаптировать и сохранить

**Адаптация:**
- Взять паттерн → адаптировать под TypeScript + Supabase + React
- Не копировать напрямую — думать о контексте проекта
- Упростить если паттерн избыточен для наших требований

**Сохранение в `/memories/repo/`:**

```markdown
# learning-{домен}.md

## Изучено: {дата}
## Домен: {домен}
## Источники: {список}

## Ключевые паттерны
1. {паттерн}: {когда использовать}
2. {паттерн}: {когда использовать}

## Anti-patterns
1. {anti-pattern}: {почему плохо}

## Применено в проекте
- [{commit/task}]: {что применили}

## Gap Analysis (残)
- {что ещё нужно реализовать}
```

## Быстрый старт (для агентов)

```
Задача: реализовать {домен}
1. Определи домен → ключевые слова
2. Найди 3-5 сильных источника (>1000 stars или официальная документация)
3. Извлеки паттерны → сравни с нашим кодом  
4. Составь Gap Analysis
5. Передай в architect с учётом found patterns
6. Сохрани в /memories/repo/learning-{домен}.md
```

## Принципы

- **Не изобретай велосипед**: если паттерн существует и проверен — используй его
- **Адаптируй, не копируй**: контекст проекта уникален
- **Документируй**: чтобы следующий агент не учился с нуля
- **Учись на ошибках**: фиксируй что не сработало
- **Скорость важна**: 30 минут исследования экономит 3 дня разработки

## Интеграция с пайплайном

```
Explore (кодовая база) 
  → Self-Learning (лучшие практики из 30+ repos)
  → Architect (спецификация с учётом паттернов)
  → CodeSmith (реализация)
  → Reviewer (аудит)
```
