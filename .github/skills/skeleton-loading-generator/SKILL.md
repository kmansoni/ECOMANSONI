# Skeleton Loading Generator

## Описание

Скилл для создания skeleton-заглушек при загрузке данных. Скелетоны повторяют layout финального контента, дают perceived performance и предотвращают layout shift.

## Когда использовать

- Любой компонент, загружающий данные (списки, карточки, профили)
- Первый рендер страницы до получения данных
- Замена спиннеров (скелетоны лучше по UX-метрикам)
- Placeholder для изображений до загрузки
- Infinite scroll: скелетоны в конце списка

## Стек проекта

- TailwindCSS `animate-pulse` для shimmer
- Компонент `Skeleton` из shadcn/ui
- Повторение layout финального контента

## Чеклист

- [ ] Скелетон ТОЧНО повторяет layout реального контента (размеры, отступы)
- [ ] `animate-pulse` с мягким timing (не мигает агрессивно)
- [ ] Высота скелетона = высота контента (нет CLS при загрузке)
- [ ] Количество skeleton-элементов = ожидаемое количество items
- [ ] Rounded corners совпадают с реальным компонентом
- [ ] Dark mode: скелетон использует `bg-muted` (не hardcoded gray)
- [ ] Скелетон для изображений: aspect-ratio placeholder
- [ ] Не показывать скелетон дольше 3 секунд — показать error state

## Пример: базовый Skeleton

```tsx
function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-muted', className)} />
  )
}
```

## Пример: skeleton карточки пользователя

```tsx
function UserCardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-[140px]" />
        <Skeleton className="h-3 w-[200px]" />
      </div>
    </div>
  )
}

function UserCard({ userId }: { userId: string }) {
  const { data: user, isLoading, error } = useUser(userId)

  if (isLoading) return <UserCardSkeleton />
  if (error) return <ErrorRetry onRetry={() => {}} message="Не удалось загрузить профиль" />
  if (!user) return null

  return (
    <div className="flex items-center gap-3 p-4">
      <Avatar src={user.avatarUrl} className="h-12 w-12" />
      <div className="flex-1">
        <p className="text-sm font-medium">{user.name}</p>
        <p className="text-xs text-muted-foreground">{user.status}</p>
      </div>
    </div>
  )
}
```

## Пример: skeleton списка

```tsx
function MessageListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-[80px]" />
            <Skeleton className={cn('h-4', i % 2 === 0 ? 'w-[240px]' : 'w-[180px]')} />
          </div>
        </div>
      ))}
    </div>
  )
}
```

## Паттерн: progressive loading

```tsx
function FeedPage() {
  const { data, isLoading } = useFeed()

  return (
    <div>
      <FeedHeader /> {/* мгновенно, без загрузки */}
      {isLoading ? <FeedSkeleton count={3} /> : <FeedList items={data ?? []} />}
    </div>
  )
}
```

## Anti-patterns

| Плохо | Почему | Правильно |
|---|---|---|
| Spinner вместо скелетона | Не даёт представления о layout, CLS | Скелетон, повторяющий layout |
| Скелетон не совпадает по размеру | Layout shift при загрузке данных | Точные размеры: w, h, gap |
| `bg-gray-200` hardcoded | Не работает в dark mode | `bg-muted` через CSS var |
| Один скелетон на всю страницу | Не информативно, хуже UX | Отдельный скелетон для каждой секции |
| Скелетон виден 10+ секунд | Пользователь думает что зависло | Timeout 3s -> error state с retry |
| Скелетон без `animate-pulse` | Выглядит как сломанный UI | Всегда добавлять анимацию |
