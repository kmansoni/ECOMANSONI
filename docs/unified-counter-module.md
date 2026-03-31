# Единый модуль счётчиков (Unified Counter Module)

## 1. Обзор

Модуль обеспечивает **единый источник правды** для всех badge-счётчиков приложения: непрочитанные уведомления, непрочитанные чаты, и т.д.

### Проблемы, которые решает модуль

| Проблема | До | После |
|----------|-----|-------|
| Дублирование подписок | Каждый вызов `useNotifications()` / `useUnreadChats()` создаёт собственную Supabase Realtime подписку (2-6 одновременных каналов) | Ровно 2 канала на всё приложение |
| Дрейф счётчиков | Optimistic `prev + 1` без верификации. Чтение уведомления в другой вкладке не уменьшает badge | Периодический ресинк (45 сек) + ресинк при возврате в вкладку |
| Дублирование state | Каждый компонент держит собственный `useState(0)` для count | Единый zustand store |
| N+1 запросы | Legacy чат: цикл по каждому диалогу при каждом маунте компонента | Один цикл в провайдере, раз в 45 сек |

---

## 2. Архитектура

```
App.tsx
  └─ AuthProvider
    └─ UserSettingsProvider
      └─ UnifiedCounterProvider          ← единственный владелец подписок
        └─ AppearanceRuntimeProvider
          └─ ...pages & components...
            ├── BottomNav       → useUnreadChats()      → store.chatsUnread
            ├── BottomNav       → useNotifications()    → store.notificationsUnread
            ├── NotificationsPage → useNotifications()  → store + local list state
            └── ChatHeader      → prop (без изменений)
```

### Три слоя

1. **Zustand Store** (`src/stores/useUnifiedCounterStore.ts`) — чистое состояние + reducers, без side-effects
2. **Provider** (`src/providers/UnifiedCounterProvider.tsx`) — единственный владелец Supabase подписок, интервалов, ресинков
3. **Facade Hooks** (`useNotifications`, `useUnreadChats`) — обратно-совместимые обёртки, читают из store

---

## 3. Store API

### Файл: `src/stores/useUnifiedCounterStore.ts`

```typescript
interface CounterState {
  // Счётчики
  notificationsUnread: number;
  chatsUnread: number;

  // Метаданные синхронизации
  lastSyncAt: { notifications: number; chats: number };

  // Абсолютные сеттеры (после DB fetch)
  setNotificationsUnread: (count: number) => void;
  setChatsUnread: (count: number) => void;

  // Optimistic дельты (от realtime событий)
  incrementNotifications: (by?: number) => void;
  decrementNotifications: (by?: number) => void;
  incrementChats: (by?: number) => void;
  decrementChats: (by?: number) => void;

  // Массовые операции
  clearNotifications: () => void;
  clearChats: () => void;

  // Служебные
  touchSync: (key: 'notifications' | 'chats') => void;
  reset: () => void;
}
```

### Использование в компонентах

```typescript
// Прямое чтение из store (без хука-обёртки)
const count = useUnifiedCounterStore(s => s.notificationsUnread);

// Через существующие хуки (рекомендуется)
const { unreadCount } = useNotifications();
const { unreadCount } = useUnreadChats();
```

---

## 4. Provider: UnifiedCounterProvider

### Файл: `src/providers/UnifiedCounterProvider.tsx`

### Жизненный цикл

1. **Mount** (при наличии `user`):
   - Fetch notification unread count из `notifications` таблицы
   - Fetch chat unread count из `chat_inbox_projection` (v1.1) или `messages` (legacy)
   - Записать в store через абсолютные сеттеры

2. **Realtime подписки** (2 канала):
   - `unified-notif-rt`: `postgres_changes INSERT` на `notifications` → `incrementNotifications(1)`
   - `unified-chats-rt`:
     - **v1.1**: `postgres_changes *` на `chat_inbox_projection` → full refetch → `setChatsUnread(total)`
     - **Legacy**: `postgres_changes INSERT` на `messages` → проверка membership → `incrementChats(1)`

3. **Периодический ресинк** (каждые 45 сек):
   - Перезапрос обоих счётчиков из БД
   - Дебаунс: пропуск если `lastSyncAt < 10 сек назад`

4. **Visibility ресинк**:
   - При возврате в вкладку, если `lastSyncAt > 15 сек` → немедленный ресинк

5. **Cleanup** (при user=null / unmount):
   - `supabase.removeChannel()` для обоих каналов
   - `clearInterval()` для ресинка
   - `store.reset()` при логауте

---

## 5. Модифицированные хуки

### `useNotifications()` — `src/hooks/useNotifications.ts`

**Что изменилось:**
- `unreadCount` читается из `useUnifiedCounterStore(s => s.notificationsUnread)` вместо локального `useState`
- Удалена внутренняя Realtime подписка (`subscribeToNotifications`)
- Удалён fetch unread count при `fetchNotifications()`
- `markAsRead()` вызывает `store.decrementNotifications(1)`
- `markAllAsRead()` вызывает `store.clearNotifications()`
- `deleteNotification()` вызывает `store.decrementNotifications(1)` для непрочитанных

**Что НЕ изменилось:**
- Return type: `{ notifications, unreadCount, loading, hasMore, loadMore, markAsRead, ... }`
- Локальный state для списка уведомлений (пагинация, actors)
- Все consumer-компоненты (BottomNav, NotificationsPage, etc.)

### `useUnreadChats()` — `src/hooks/useUnreadChats.tsx`

**Что изменилось:**
- `unreadCount` читается из `useUnifiedCounterStore(s => s.chatsUnread)`
- Удалены: внутренний `useState`, `fetchUnreadCount`, Realtime подписка
- `refetch()` делает прямой DB query → `store.setChatsUnread(result)`

**Что НЕ изменилось:**
- Return type: `{ unreadCount, refetch }`

---

## 6. Таблица потоков данных

### Уведомления

```
Новое уведомление в БД
  → Supabase Realtime INSERT event
  → UnifiedCounterProvider (unified-notif-rt канал)
  → store.incrementNotifications(1)
  → useNotifications().unreadCount re-render
  → NotificationBadge в BottomNav обновляется

Каждые 45 сек:
  → Provider делает SELECT COUNT(*) WHERE is_read=false
  → store.setNotificationsUnread(exactCount) — коррекция дрейфа

Пользователь прочитал уведомление:
  → useNotifications().markAsRead(id)
  → UPDATE notifications SET is_read=true
  → store.decrementNotifications(1) — мгновенный UI
```

### Чаты (протокол v1.1)

```
Новое сообщение → DB триггер обновляет chat_inbox_projection
  → Supabase Realtime * event
  → UnifiedCounterProvider (unified-chats-rt канал)
  → Full refetch chat_inbox_projection → store.setChatsUnread(total)
  → useUnreadChats().unreadCount re-render
  → NotificationBadge в BottomNav обновляется
```

---

## 7. Расширение модуля

Для добавления нового счётчика (например, follow requests):

1. Добавить поле в store:
```typescript
followRequestsPending: number;
setFollowRequestsPending: (count: number) => void;
```

2. Добавить fetch + подписку в `UnifiedCounterProvider`

3. Создать facade hook или использовать store напрямую

---

## 8. Конфигурация

| Параметр | Значение | Описание |
|----------|----------|----------|
| `RESYNC_INTERVAL_MS` | 45000 | Интервал периодического ресинка |
| `VISIBILITY_RESYNC_THRESHOLD_MS` | 15000 | Минимальный возраст lastSync для visibility-ресинка |
| Дебаунс ресинка | 10000 | Пропуск ресинка если последний был < 10 сек назад |

---

## 9. Файловая структура

```
src/
├── stores/
│   └── useUnifiedCounterStore.ts    ← zustand store (чистое состояние)
├── providers/
│   └── UnifiedCounterProvider.tsx   ← подписки + ресинк
├── hooks/
│   ├── useNotifications.ts          ← facade (читает из store)
│   └── useUnreadChats.tsx           ← facade (читает из store)
├── components/
│   ├── layout/BottomNav.tsx         ← без изменений (потребитель)
│   └── notifications/
│       └── NotificationBadge.tsx    ← без изменений (чистый UI)
└── App.tsx                          ← UnifiedCounterProvider в дереве
```

---

## 10. Миграция и обратная совместимость

- **Нулевые breaking changes**: все существующие хуки сохраняют свой return type
- **Компоненты не требуют изменений**: BottomNav, NotificationsPage, ChatHeader, DesktopLayout и др.
- **Zustand store доступен для прямого использования** новыми компонентами через `useUnifiedCounterStore(selector)`
