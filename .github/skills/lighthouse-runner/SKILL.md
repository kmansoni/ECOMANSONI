---
name: lighthouse-runner
description: "Lighthouse CI: performance, accessibility, best practices, SEO, PWA scores. Use when: аудит производительности, проверка доступности, pre-release."
argument-hint: "[url или категория: perf|a11y|bp|seo|pwa]"
user-invocable: true
---

# Lighthouse Runner — Аудит производительности

Скилл для запуска и интерпретации Lighthouse-аудитов. Систематическая проверка performance, accessibility, best practices, SEO.

## Когда использовать

- Перед релизом — полный аудит
- После крупных UI-изменений
- Оптимизация загрузки страницы
- Проверка доступности (a11y)
- SEO-аудит

## Целевые метрики

| Метрика | Зелёная зона | Наш таргет |
|---|---|---|
| Performance | >= 90 | >= 85 |
| Accessibility | >= 90 | >= 95 |
| Best Practices | >= 90 | >= 90 |
| SEO | >= 90 | >= 90 |
| FCP | < 1.8s | < 1.5s |
| LCP | < 2.5s | < 2.0s |
| TBT | < 200ms | < 150ms |
| CLS | < 0.1 | < 0.05 |

## Протокол аудита

1. **Запусти Lighthouse** — Chrome DevTools или CLI
2. **Зафиксируй baseline** — текущие scores и метрики
3. **Приоритизируй** — сначала красные, потом оранжевые
4. **Performance** — LCP, FCP, TBT, CLS — по одной метрике
5. **Accessibility** — контраст, alt, labels, keyboard nav
6. **Best Practices** — HTTPS, no mixed content, no console errors
7. **Исправь** — итеративно, измеряй после каждого изменения
8. **Проверь мобилку** — Lighthouse mobile profile (slow 4G, 4x CPU)

## CLI запуск

```bash
# Установка
npm install -g lighthouse

# Базовый запуск
lighthouse http://localhost:5173 --output=json --output-path=./lh-report.json

# Только performance
lighthouse http://localhost:5173 --only-categories=performance

# Mobile simulation
lighthouse http://localhost:5173 --preset=perf --throttling-method=simulate

# CI-режим (headless)
lighthouse http://localhost:5173 --chrome-flags="--headless" --output=html
```

## Типичные проблемы и решения

### Performance

| Проблема | Решение |
|---|---|
| LCP > 2.5s | Preload hero image, optimize critical path |
| CLS > 0.1 | Задать width/height на img/video, skeleton placeholders |
| TBT > 200ms | Code splitting, defer non-critical JS, web workers |
| FCP > 1.8s | Inline critical CSS, preconnect to origins |

### Accessibility

| Проблема | Решение |
|---|---|
| Низкий контраст | Минимум 4.5:1 для текста, 3:1 для крупного |
| Нет alt на img | `alt="описание"` или `alt=""` для декоративных |
| Нет label на input | `<label htmlFor>` или `aria-label` |
| Нет focus indicator | `focus-visible:ring-2` на интерактивных |
| Нет skip link | `<a href="#main" className="sr-only focus:not-sr-only">` |

### Best Practices

| Проблема | Решение |
|---|---|
| Mixed content | Все ресурсы через HTTPS |
| Console errors | Исправить или удалить |
| Deprecated API | Обновить до современного API |
| Vulnerable deps | `npm audit fix` |

## Preconnect и preload

```html
<!-- В <head> для критических ресурсов -->
<link rel="preconnect" href="https://your-project.supabase.co" />
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin />
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin />
```

## Чеклист

- [ ] Performance >= 85 (mobile)
- [ ] Accessibility >= 95
- [ ] Best Practices >= 90
- [ ] LCP < 2.5s, CLS < 0.1, TBT < 200ms
- [ ] Все img имеют alt
- [ ] Все input имеют label
- [ ] Контраст >= 4.5:1
- [ ] Focus visible на всех интерактивных элементах
- [ ] Нет console errors в production

## Anti-patterns

- **Оптимизация без измерений** — "наверное быстрее". Измерь до и после
- **Desktop-only тест** — mobile profile показывает реальную картину
- **Игнорировать a11y** — 15% пользователей имеют ограничения
- **Одноразовый аудит** — нужно в CI, не только перед релизом
- **Score gaming** — прятать контент для улучшения метрик. Оптимизируй реально
