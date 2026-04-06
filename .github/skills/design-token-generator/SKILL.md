---
name: design-token-generator
description: "Генерация design tokens: цвета, spacing, typography, dark mode, Tailwind config. Use when: обновление дизайн-системы, новая тема, стандартизация стилей."
argument-hint: "[тип токенов: colors|spacing|typography|all]"
user-invocable: true
---

# Design Token Generator — Генерация дизайн-токенов

Скилл для создания и поддержки единой системы дизайн-токенов. Токены — единственный источник правды для цветов, отступов, типографики и теней.

## Когда использовать

- Инициализация дизайн-системы проекта
- Добавление dark mode
- Рефакторинг hardcoded значений в токены
- Синхронизация Figma-токенов с кодом

## Архитектура токенов

```
tokens/
  colors.ts      — палитра + семантические цвета
  spacing.ts     — отступы (4px grid)
  typography.ts  — шрифты, размеры, высоты строк
  shadows.ts     — тени для elevation
  radii.ts       — border-radius
  index.ts       — реэкспорт всего
```

## Протокол

1. **Аудит текущих значений** — grep hardcoded `#hex`, `px`, `rem` в компонентах
2. **Определи палитру** — 5 оттенков на базовый цвет (50-950 по Tailwind)
3. **Семантические алиасы** — `primary`, `destructive`, `muted`, не `blue-500`
4. **CSS custom properties** — для runtime dark mode переключения
5. **Tailwind extend** — токены в `tailwind.config.ts`
6. **Dark mode пары** — каждый light-токен имеет dark-аналог
7. **Замени hardcoded** — пройди по компонентам, замени `#hex` на токены
8. **Проверь контраст** — WCAG AA минимум (4.5:1 текст, 3:1 крупный)

## CSS Custom Properties — базовый слой

```css
/* src/index.css */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --destructive: 0 84.2% 60.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --border: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 62.8% 30.6%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --border: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
  }
}
```

## Tailwind Config интеграция

```typescript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
}
```

## Spacing — система на 4px grid

```typescript
// Принцип: все отступы кратны 4px
// Tailwind: p-1 = 4px, p-2 = 8px, p-3 = 12px, p-4 = 16px
// Используй: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
// Запрещено: произвольные значения вроде p-[13px]
```

## Чеклист

- [ ] Все цвета через CSS custom properties, не hardcoded
- [ ] Dark mode: каждый токен имеет dark-вариант
- [ ] Контраст >= 4.5:1 для текста (WCAG AA)
- [ ] Spacing кратен 4px
- [ ] Typography: не более 5 размеров шрифта в проекте
- [ ] Тени: 3 уровня elevation (sm, md, lg)
- [ ] Tailwind config использует токены, не дублирует

## Anti-patterns

- **Magic numbers** — `mt-[17px]` вместо `mt-4`. Только стандартные значения
- **Цвет без пары** — light-цвет без dark-аналога. Белый текст на белом фоне
- **RGB вместо HSL** — HSL проще модифицировать программно
- **Дублирование** — один цвет в 3 местах: CSS, config, inline. Один источник
- **Слишком много токенов** — 50 оттенков серого. Максимум 10 нейтральных
- **Без семантики** — `blue-500` вместо `primary`. Семантика переживает ребрендинг
