# Архитектура модуля мессенджера

## Обзор

Полнофункциональный мессенджер уровня Telegram, реализованный на React + TypeScript + Supabase.  
Код сосредоточен в `src/components/chat/`, `src/hooks/`, `src/lib/chat/`, `server/` и `supabase/`.

---

## Реализованные функции

### Базовые
- ✅ Личные сообщения (DM)
- ✅ Групповые чаты
- ✅ Каналы
- ✅ Видеозвонки с E2E шифрованием (SFrame)

### Сообщения
- ✅ E2E шифрование сообщений (AES-256-GCM)
- ✅ Исчезающие сообщения (30с — 7д)
- ✅ Запланированные сообщения
- ✅ Закреплённые сообщения (до 10)
- ✅ Ответы и пересылка
- ✅ Редактирование и удаление
- ✅ Read Receipts (✓ ✓✓)

### Медиа
- ✅ Фото с встроенным редактором (ChatMediaEditor)
- ✅ Видео
- ✅ Голосовые сообщения
- ✅ Видеокружочки
- ✅ Стикеры и стикерпаки
- ✅ GIF (Tenor API)
- ✅ Документы

### Социальные функции
- ✅ Подарки и Звёзды (виртуальная валюта)
- ✅ Реакции на сообщения
- ✅ Опросы (обычные, анонимные, викторины)
- ✅ Секретные чаты

### Группы
- ✅ Темы/Топики в группах
- ✅ Роли и права
- ✅ Приглашения по ссылке

### Бот API
- ✅ Создание ботов
- ✅ Команды (/start, /help)
- ✅ Inline клавиатуры
- ✅ Webhook интеграция
- ✅ REST API для ботов

### UX
- ✅ Свайп для ответа
- ✅ Двойной тап для реакции
- ✅ Haptic feedback
- ✅ Настраиваемые обои
- ✅ Настройки уведомлений
- ✅ Папки чатов
- ✅ Поиск по сообщениям

---

## Архитектура

### Frontend

| Технология | Назначение |
|---|---|
| React 18 + TypeScript | UI и бизнес-логика |
| Tailwind CSS | Стилизация (тёмная тема) |
| framer-motion | Анимации |
| Supabase Realtime | WebSocket (подписки на каналы) |
| Canvas API | Медиа-редактор (рисование, экспорт) |

### Backend

| Компонент | Стек |
|---|---|
| Supabase | PostgreSQL + Realtime + Edge Functions + Storage |
| Bot API сервер | Express.js (`server/bot-api/`) |
| WebSocket сервер звонков | Node.js WS (`server/calls-ws/`) |
| SFU медиа-сервер | mediasoup (`server/sfu/`) |

### База данных

#### Миграции (7 штук)
| Файл | Содержимое |
|---|---|
| `20260303000000` | Базовые таблицы мессенджера |
| `20260303000100` | Закреплённые сообщения, секретные чаты |
| `20260303000200` | Опросы, стикерпаки |
| `20260303000300` | Подарки, звёзды, виртуальная валюта |
| `20260303000400` | Боты, команды, inline-клавиатуры |
| `20260303000500` | Темы групп, топики |
| `20260303000600` | Исчезающие сообщения, расписание |
| `20260303000700` | Производительность: индексы, партиционирование |

#### Основные таблицы
```
messages            — сообщения (зашифрованные, со статусом)
conversations       — чаты (DM, group, channel, secret)
pinned_messages     — закреплённые (до 10 на чат)
secret_chats        — секретные чаты с ключами
message_polls       — опросы и голоса
sticker_packs       — паки стикеров
gift_catalog        — каталог подарков
user_stars          — баланс звёзд пользователей
bots                — боты и их конфигурация
group_topics        — темы/топики группы
scheduled_messages  — запланированные сообщения
disappearing_timers — таймеры исчезающих сообщений
message_reactions   — реакции на сообщения
```

#### RLS политики
Все таблицы защищены политиками Row-Level Security:
- Чтение: только участники диалога
- Запись: только аутентифицированный отправитель
- Удаление: отправитель + администраторы группы

#### Атомарные функции
- `send_gift_v1(sender, recipient, gift_id)` — отправка подарка
- `vote_poll_v1(user_id, poll_id, option_ids)` — голосование
- `process_disappearing_messages()` — cron-удаление истёкших

---

## Медиа-редактор (ChatMediaEditor)

### Компоненты

| Файл | Назначение |
|---|---|
| `src/components/chat/ChatMediaEditor.tsx` | Главный компонент-оверлей |
| `src/components/chat/DrawingCanvas.tsx` | Canvas рисования (mouse + touch) |
| `src/components/chat/TextOverlay.tsx` | Текстовые слои с drag |
| `src/components/chat/PhotoFilters.tsx` | Горизонтальный скролл фильтров |
| `src/hooks/useChatMediaEditor.ts` |状態管理: инструменты, история, экспорт |

### Интерфейс пропсов

```typescript
interface ChatMediaEditorProps {
  imageFile: File;
  onSend: (editedBlob: Blob, caption: string) => void;
  onCancel: () => void;
}
```

### Инструменты редактора

| Инструмент | Реализация |
|---|---|
| ✏️ Рисование | Canvas API, quadratic bezier, touch/mouse |
| 🔤 Текст | Абсолютно позиционированные div, drag, inline-редактор |
| 🎨 Фильтры | CSS `filter` (8 пресетов), превью |
| 😀 Стикеры/Emoji | Текстовые элементы с большим font-size |
| ↩️ Undo/Redo | Стек состояний (useRef) |

### CSS-фильтры

| Название | CSS |
|---|---|
| Original | — |
| Vivid | `saturate(1.5) contrast(1.1)` |
| Warm | `sepia(0.3) saturate(1.2) brightness(1.1)` |
| Cool | `hue-rotate(20deg) saturate(0.9)` |
| B&W | `grayscale(1)` |
| Sepia | `sepia(0.8)` |
| Vintage | `sepia(0.4) contrast(0.9) brightness(1.1)` |
| Dramatic | `contrast(1.5) brightness(0.9)` |

### Экспорт (canvas.toBlob)

1. Создаётся offscreen canvas размером `naturalWidth × naturalHeight`
2. Применяются CSS-фильтры через `ctx.filter`
3. Рисуется оригинальное фото
4. Поверх накладывается слой рисования (drawingDataUrl)
5. Рендерятся текстовые элементы с масштабированием
6. `canvas.toBlob('image/jpeg', 0.92)` → Blob

---

## Файловая структура

```
src/
├── components/chat/
│   ├── ChatConversation.tsx        — главный компонент чата (~85KB)
│   ├── ChatMediaEditor.tsx         — медиа-редактор (новый)
│   ├── DrawingCanvas.tsx           — слой рисования (новый)
│   ├── TextOverlay.tsx             — текстовые оверлеи (новый)
│   ├── PhotoFilters.tsx            — фильтры фото (новый)
│   ├── MessageBubble.tsx           — пузырь сообщения
│   ├── VoiceMessagePlayer.tsx      — плеер голосовых
│   ├── VideoNotePlayer.tsx         — видеокружочки
│   ├── StickerPicker.tsx           — выбор стикеров
│   ├── GifSearch.tsx               — поиск GIF (Tenor)
│   ├── PollMessage.tsx             — опросы
│   ├── GiftMessage.tsx             — подарки
│   ├── SecretChatIndicator.tsx     — индикатор секретного чата
│   ├── PinnedMessage.tsx           — закреплённые
│   ├── ScheduledMessageBadge.tsx   — метка запланированных
│   ├── DisappearingTimer.tsx       — таймер исчезновения
│   ├── GroupTopics.tsx             — топики группы
│   └── ...
├── hooks/
│   ├── useChatMediaEditor.ts       — хук медиа-редактора (новый)
│   ├── useMessages.ts              — загрузка/отправка сообщений
│   ├── useConversations.ts         — список диалогов
│   ├── useTypingIndicator.ts       — индикатор набора
│   ├── useReadReceipts.ts          — статусы прочтения
│   ├── useEncryption.ts            — E2EE (AES-256-GCM)
│   ├── useVoiceRecorder.ts         — запись голоса
│   ├── useReactions.ts             — реакции
│   └── ...
├── lib/chat/
│   ├── e2ee.ts                     — шифрование/дешифрование
│   ├── gifService.ts               — Tenor GIF API
│   ├── mediaUpload.ts              — загрузка медиа в Supabase Storage
│   └── ...
server/
├── bot-api/
│   ├── index.ts                    — Express сервер Bot API
│   ├── webhooks.ts                 — входящие webhook
│   └── routes/                    — REST маршруты
├── calls-ws/
│   └── index.ts                    — WebSocket для сигналинга звонков
└── sfu/
    └── index.ts                    — SFU mediasoup сервер
supabase/
├── migrations/
│   ├── 20260303000000_messenger_base.sql
│   ├── 20260303000100_pinned_secret.sql
│   ├── 20260303000200_polls_stickers.sql
│   ├── 20260303000300_gifts_stars.sql
│   ├── 20260303000400_bots.sql
│   ├── 20260303000500_group_topics.sql
│   ├── 20260303000600_disappearing_scheduled.sql
│   └── 20260303000700_indexes.sql
└── functions/
    ├── send-message/               — Edge Function отправки
    ├── process-disappearing/       — Cron функция
    └── bot-webhook/                — обработка webhook ботов
```

---

## Потоки данных

### Отправка сообщения
```
UI → useMessages.sendMessage()
  → encrypt(content) [если E2EE чат]
  → Supabase INSERT messages
  → Supabase Realtime broadcast
  → Получатели: onMessage() → decrypt() → render
```

### Отправка медиа через редактор
```
Выбор файла → ChatMediaEditor открывается
  → Пользователь рисует/добавляет текст/фильтры
  → Нажимает "Отправить"
  → exportImage() → canvas.toBlob()
  → mediaUpload() → Supabase Storage
  → sendMessage(media_url, media_type='image')
```

### Реакция на сообщение
```
Двойной тап на сообщение
  → useReactions.toggle(message_id, emoji)
  → Supabase UPSERT message_reactions
  → Realtime broadcast → все участники обновляют счётчики
```

---

## Безопасность

- **E2EE**: AES-256-GCM, ключи создаются на устройстве, Supabase хранит только зашифрованный ciphertext
- **SFrame**: шифрование медиа-потоков видеозвонков
- **RLS**: Row-Level Security на всех таблицах
- **HMAC**: защита внутренних событий от replay-атак
- **Rate limiting**: защита Bot API и Edge Functions

---

## Производительность

- Виртуализация списка сообщений (только видимые в DOM)
- Оптимистичные обновления (отправленное сообщение показывается мгновенно)
- Lazy loading медиа (Intersection Observer)
- Debounce typing indicators (500ms)
- Кэширование превью стикеров и GIF
- Партиционирование таблицы `messages` по месяцам
