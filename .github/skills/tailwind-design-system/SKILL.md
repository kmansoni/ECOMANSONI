# Tailwind Design System

## Описание

Скилл для построения design system на Tailwind: custom config, плагины, dark mode, responsive утилиты, JIT оптимизация. Единый визуальный язык для всей платформы.

## Когда использовать

- Настройка/расширение Tailwind конфига проекта
- Создание переиспользуемых UI-паттернов
- Dark mode поддержка
- Responsive breakpoints и container queries
- Кастомные утилити-классы и плагины

## Стек проекта

- TailwindCSS v3 + JIT
- `tailwind.config.ts` с кастомными tokens
- CSS variables для dynamic theming (dark mode)
- `cn()` (clsx + tailwind-merge) для условных классов

## Чеклист

- [ ] Design tokens в `theme.extend`: colors, spacing, fontSize из CSS vars
- [ ] `cn()` утилита для merge классов (не конкатенация строк)
- [ ] Mobile-first: `sm:`, `md:`, `lg:` — не наоборот
- [ ] Dark mode через `class` strategy + CSS variables
- [ ] Touch targets: min `h-11 min-w-[44px]` на интерактивных
- [ ] Focus-visible: `focus-visible:ring-2 focus-visible:ring-ring`
- [ ] Не дублировать Tailwind утилиты в CSS-файлах
- [ ] `@apply` только в base layer для reset, не в компонентах

## Пример: design tokens

```ts
// tailwind.config.ts
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
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
} satisfies Config
```

## Пример: cn() utility

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Использование
<button className={cn(
  'h-11 px-4 rounded-md font-medium transition-colors',
  'bg-primary text-primary-foreground',
  'hover:bg-primary/90',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'disabled:opacity-50 disabled:pointer-events-none',
  fullWidth && 'w-full',
  className,
)}>
```

## Паттерн: responsive component

```tsx
function DashboardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  )
}
```

## Паттерн: dark mode CSS variables

```css
/* globals.css */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222 47% 11%;
    --primary: 222 47% 31%;
    --muted: 210 40% 96%;
  }
  .dark {
    --background: 222 47% 6%;
    --foreground: 210 40% 98%;
    --primary: 210 40% 60%;
    --muted: 217 33% 17%;
  }
}
```

## Anti-patterns

| Плохо | Почему | Правильно |
|---|---|---|
| `className="text-[#3b82f6]"` | Hardcoded, не работает с dark mode | `text-primary` через CSS var |
| `style={{ padding: '16px' }}` | Обходит Tailwind, не responsive | `p-4` |
| `@apply` в компонентах | Убивает tree-shaking, тяжело отлаживать | Utility классы в JSX |
| `className={"btn " + (active ? "active" : "")}` | Tailwind merge конфликты | `cn('btn', active && 'active')` |
| Desktop-first: `md:hidden block` | Сначала пишешь для большого, потом ломаешь | Mobile-first: `hidden md:block` |
| `!important` через `!` prefix | Признак архитектурной проблемы | Пересмотреть specificity, использовать `cn()` |
