---
name: domain-name-brainstormer
description: >-
  Генерация и проверка доменных имён: креативный нейминг, TLD guide,
  проверка доступности, анализ вариантов. Use when: домен, нейминг,
  название проекта, выбор домена, TLD, бренд.
metadata:
  category: business-naming
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/domain-name-brainstormer
---

# Domain Name Brainstormer

Креативная генерация и проверка доменных имён для проектов и продуктов.

## Когда использовать

- Нейминг нового проекта / продукта
- Поиск доступного домена
- Ребрендинг
- Выбор TLD
- Генерация альтернативных вариантов

## Strategies

### 1. Creative Naming
- **Portmanteau**: два слова → одно (Pinterest = Pin + Interest)
- **Misspelling**: Tumblr, Flickr, Lyft
- **Prefix/Suffix**: Un-, Re-, -ly, -ify, -io
- **Abstract**: придуманное слово (Spotify, Zillow)
- **Metaphor**: ассоциативное (Amazon, Apple)
- **Acronym**: из ключевых слов

### 2. TLD Guide
```
.com  — золотой стандарт, всегда первый выбор
.io   — tech/SaaS стартапы
.app  — мобильные приложения (HSTS по умолчанию)
.dev  — инструменты разработчика (HSTS)
.ai   — AI/ML продукты
.co   — компании, альтернатива .com
.ru   — Россия
.me   — персональные бренды
.so   — tech, "Stack Overflow" ассоциация
```

### 3. Availability Check
- whois lookup
- DNS resolution
- Trademark databases
- Social media handles
- App store names

## Workflow

### Полный цикл нейминга
```
1. Брифинг: продукт, аудитория, тон, ключевые слова
2. Генерация 20-30 вариантов по стратегиям
3. Фильтрация: произносимость, запоминаемость, уникальность
4. Проверка доступности (домены + социалки)
5. Shortlist 5-7 финалистов
6. Trademark check
7. Рекомендация с обоснованием
```

### Критерии хорошего домена
- ≤12 символов (идеально 6-8)
- Легко произносить
- Легко написать по памяти
- Нет дефисов и цифр
- Уникальный (не путается с конкурентами)
- Работает в разных языках
- Свободные social handles

## Output Format

### Domain Card
```markdown
| Вариант | TLD | Доступен | Длина | Оценка |
|---------|-----|----------|-------|--------|
| chatpulse | .com | ✅ | 9 | ⭐⭐⭐⭐ |
| chatpulse | .io | ✅ | 9 | ⭐⭐⭐⭐ |
| pulseapp | .com | ❌ | 8 | ⭐⭐⭐ |
| msgflow | .io | ✅ | 7 | ⭐⭐⭐⭐⭐ |
```

## Anti-patterns

✗ Слишком длинные домены (>15 символов)
✗ Дефисы (my-cool-app.com)
✗ Цифры вместо слов (4u, 2go)
✗ Сложное написание
✗ Похожие на существующие бренды
✗ Культурно неуместные значения
