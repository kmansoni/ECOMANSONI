---
name: responsive-design-audit
description: "Аудит адаптивности: breakpoints 375/768/1024/1440, touch targets, font sizes. Use when: проверка мобильной версии, новый layout, жалобы на отображение."
argument-hint: "[страница или компонент для аудита]"
user-invocable: true
---

# Responsive Design Audit — Аудит адаптивности

Скилл для систематической проверки адаптивности UI на всех целевых устройствах. Mobile-first подход: сначала мобилка, потом расширяем.

## Когда использовать

- Новая страница или крупный компонент
- Перед релизом мобильного приложения (Capacitor)
- Жалобы на отображение на конкретном устройстве
- Рефакторинг layout

## Целевые breakpoints

| Breakpoint | Ширина | Устройство | Tailwind |
|---|---|---|---|
| xs | 375px | iPhone SE, старые Android | default |
| sm | 640px | Большие телефоны landscape | `sm:` |
| md | 768px | iPad portrait | `md:` |
| lg | 1024px | iPad landscape, ноутбук | `lg:` |
| xl | 1440px | Desktop | `xl:` |

## Протокол аудита

1. **Проверь mobile-first** — базовые стили без prefix = мобильные
2. **375px проход** — всё влезает? Нет горизонтального скролла?
3. **Touch targets** — все кнопки/ссылки >= 44x44px (`min-h-11 min-w-11`)
4. **Font sizes** — минимум 14px на мобилке, 16px для input (iOS zoom fix)
5. **Spacing** — отступы уменьшены на мобилке (`p-3 md:p-6`)
6. **Изображения** — `max-w-full`, не вылезают за контейнер
7. **Таблицы** — горизонтальный скролл или card-layout на мобилке
8. **Модалки** — full-screen на мобилке, centered на desktop
9. **Навигация** — bottom nav на мобилке, sidebar на desktop
10. **Safe areas** — `env(safe-area-inset-*)` для notch-устройств

## Mobile-first паттерны

```typescript
// Правильно: mobile-first
<div className="flex flex-col gap-2 p-3 md:flex-row md:gap-4 md:p-6">
  <aside className="w-full md:w-64 lg:w-80">...</aside>
  <main className="flex-1">...</main>
</div>

// Неправильно: desktop-first
<div className="flex flex-row gap-4 p-6 max-md:flex-col max-md:gap-2 max-md:p-3">
```

## Touch targets

```typescript
// Минимум 44x44px для всех интерактивных элементов
<button className="min-h-11 min-w-11 p-2">
  <Icon className="h-5 w-5" />
</button>

// Ссылка с увеличенной областью клика
<a className="inline-flex items-center min-h-11 px-3 -mx-3">
  Ссылка
</a>
```

## Input zoom fix (iOS)

```typescript
// iOS зумит input при font-size < 16px
// Решение: всегда 16px на мобилке
<input className="text-base md:text-sm" />
```

## Safe areas для Capacitor

```css
/* Для устройств с notch (iPhone X+) */
.page-container {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
```

## Чеклист аудита

- [ ] Нет горизонтального скролла на 375px
- [ ] Все touch targets >= 44x44px
- [ ] Font size >= 16px на input (iOS)
- [ ] Изображения не вылезают за контейнер
- [ ] Модалки full-screen на мобилке
- [ ] Bottom sheet вместо dropdown на мобилке
- [ ] Safe area insets для Capacitor
- [ ] Текст не обрезается — `truncate` или `line-clamp`
- [ ] Нет fixed-width элементов без max-width

## Anti-patterns

- **Desktop-first** — `max-md:` вместо `md:`. Всегда mobile-first
- **Фиксированная ширина** — `w-[400px]` без `max-w-full`. Ломает мобилку
- **Мелкие кнопки** — 24x24px иконка без padding. Нажать невозможно
- **Hover-only** — функционал только через hover. На тач-устройствах не работает
- **Скрытие контента** — `hidden md:block` без мобильной альтернативы
- **Абсолютное позиционирование** — `absolute` без учёта разных размеров экрана
