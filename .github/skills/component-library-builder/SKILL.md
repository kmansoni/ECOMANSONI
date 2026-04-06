---
name: component-library-builder
description: "Создание компонентной библиотеки: атомарный дизайн, варианты, документация, Storybook. Use when: новый UI-компонент, библиотека переиспользуемых элементов, дизайн-система."
argument-hint: "[название компонента или группы]"
user-invocable: true
---

# Component Library Builder — Компонентная библиотека

Скилл для создания переиспользуемых UI-компонентов по методологии атомарного дизайна. Каждый компонент: типизирован, документирован, покрывает все состояния.

## Когда использовать

- Создание нового переиспользуемого компонента
- Рефакторинг существующих компонентов в библиотеку
- Стандартизация UI-элементов проекта
- Компонент используется в 3+ местах

## Атомарный дизайн — уровни

| Уровень | Пример | Директория |
|---|---|---|
| Atom | Button, Badge, Avatar | `src/components/ui/` |
| Molecule | SearchInput, UserCard | `src/components/shared/` |
| Organism | ChatHeader, ProductGrid | `src/components/[module]/` |
| Template | PageLayout, ModalLayout | `src/components/layout/` |

## Протокол создания компонента

1. **Проверь аналоги** — `grep` по имени, не дублируй существующие
2. **Определи уровень** — atom/molecule/organism/template
3. **Спроектируй API** — минимум props, максимум гибкости через variants
4. **Реализуй все состояния** — default, hover, active, disabled, loading, error
5. **Типизируй строго** — интерфейс props, no `any`, discriminated unions для вариантов
6. **Добавь dark mode** — `dark:` классы Tailwind на каждый визуальный элемент
7. **Touch targets** — минимум 44x44px для интерактивных элементов
8. **Accessibility** — `aria-label`, `role`, keyboard navigation
9. **Экспортируй** — из `index.ts` модуля, named export
10. **Документируй** — JSDoc только на сам компонент (не на каждую строку)

## Паттерн variants через cva

```typescript
import { cva, type VariantProps } from 'class-variance-authority'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 py-2',
        lg: 'h-12 px-8 text-lg',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

export function Button({ className, variant, size, loading, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  )
}
```

## Паттерн compound components

```typescript
interface CardProps {
  children: React.ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return <div className={cn('rounded-lg border bg-card p-4', className)}>{children}</div>
}

Card.Header = function CardHeader({ children, className }: CardProps) {
  return <div className={cn('mb-3 font-semibold', className)}>{children}</div>
}

Card.Body = function CardBody({ children, className }: CardProps) {
  return <div className={cn('text-sm text-muted-foreground', className)}>{children}</div>
}
```

## Чеклист перед мержем

- [ ] Props типизированы, нет `any`
- [ ] Все визуальные состояния реализованы (не заглушки)
- [ ] Dark mode работает (`dark:` классы)
- [ ] Touch target >= 44px на кнопках и ссылках
- [ ] `aria-label` на иконочных кнопках
- [ ] Компонент <= 200 строк (atom), <= 400 строк (organism)
- [ ] Named export, не default export
- [ ] Нет hardcoded цветов — только design tokens / Tailwind

## Anti-patterns

- **God component** — компонент на 800 строк с 20 props. Декомпозируй
- **Props drilling** — 5+ уровней передачи. Используй context или composition
- **Стилевой хардкод** — `style={{ color: '#333' }}`. Только Tailwind классы
- **Implicit variants** — `if (type === 'a') ... else if (type === 'b')`. Используй cva
- **Missing disabled** — кнопка без `disabled` состояния при loading
- **onClick без feedback** — клик без визуального отклика (loading, ripple)
