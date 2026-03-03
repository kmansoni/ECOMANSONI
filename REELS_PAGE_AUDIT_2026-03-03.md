# 📋 АУДИТ СТРАНИЦЫ REELS — 03.03.2026

## Общая информация

| Параметр | Значение |
|----------|----------|
| **Дата аудита** | 03.03.2026 |
| **Страница** | `/reels` → `src/pages/ReelsPage.tsx` |
| **Основной хук** | `src/hooks/useReels.tsx` |
| **FSM** | `src/features/reels/fsm.ts` |
| **Размер основного файла** | ~46K chars, 1 259 строк |
| **Компоненты** | 9 в `src/components/reels/` |
| **Тесты** | 8 файлов в `src/test/` |
| **SQL-миграции** | 12+ в `supabase/migrations/` |

---

## 🏗️ Архитектурная карта

```
ReelsPage.tsx (1259 строк)
├── useReels.tsx (31K) — фид, лайки, сохранения, аналитика
├── features/reels/fsm.ts (13K) — ⚠️ НЕ ИСПОЛЬЗУЕТСЯ
├── components/reels/
│   ├── CreateReelSheet.tsx — создание рилса
│   ├── ReelCommentsSheet.tsx — комментарии
│   ├── ReelShareSheet.tsx — шаринг
│   ├── ReelCaptions.tsx — субтитры
│   ├── ReelInsights.tsx — аналитика
│   ├── ReelOverlayEditor.tsx — оверлеи
│   ├── ReelSpeedControl.tsx — скорость
│   ├── RemixReelSheet.tsx — ремиксы
│   └── RankingExplanation.tsx — ранжирование
├── layout/AppLayout.tsx — fullscreen режим
└── layout/BottomNav.tsx — навигация (⚠️ не скрывается)
```

---

## 🔴 КРИТИЧЕСКИЕ ПРОБЛЕМЫ (P0)

### 1. FSM определён, но не используется
- **Файл:** `src/features/reels/fsm.ts`
- **Проблема:** Полноценный конечный автомат `reduceReels()` с состояниями `IDLE → BOOTSTRAP → FEED_READY → PLAYING → PAUSED → BUFFERING → ERROR` создан, но `ReelsPage.tsx` его полностью игнорирует
- **Текущая реализация:** Параллельная система через `useState` (`isPlaying` + `isUserPaused` + `overlaysOpen`)
- **Дублирование:** `syncPlaybackPolicy()` в ReelsPage дублирует `resolvePlaybackStatus()` из FSM
- **Последствие:** Двойной механизм управления состоянием — источник багов
- **Исправление:** Внедрить FSM через `useReducer` в ReelsPage, удалить `syncPlaybackPolicy()`

### 2. `objectFit: 'contain'` → чёрные полосы на видео
- **Файл:** `src/pages/ReelsPage.tsx:808`
- **Проблема:** `objectFit: 'contain'` сохраняет пропорции и добавляет чёрные полосы (letterbox)
- **Ожидаемое:** `objectFit: 'cover'` как в TikTok/Instagram Reels — видео заполняет экран
- **Несоответствие:** Thumbnail использует `object-cover` (строка 848), а видео — `contain` — непоследовательно
- **Отсутствует:** Размытый фон (blur background) за видео для нестандартных пропорций

### 3. `100vh` вместо `100dvh` — обрезка на мобильных
- **Файлы:** `src/pages/ReelsPage.tsx:754, 758, 779`
- **Проблема:** `h-[calc(100vh-4rem)]` и `h-[calc(100vh-4rem-3rem)]` — на мобильных `100vh` не равен видимому viewport (адресная строка отнимает 50-80px)
- **Исправление:** Заменить на `100dvh` (Dynamic Viewport Height, поддерживается с 2022)

### 4. `(supabase as any)` — 14+ мест без типизации
- **Файл:** `src/hooks/useReels.tsx` — строки 303, 304, 305, 519, 539, 587, 607, 638, 680, 712, 762, 803, 846, 892, 922
- **Проблема:** Полное обнуление типобезопасности Supabase — ошибки проявятся только в runtime
- **Исправление:** Использовать сгенерированные типы `Database['public']['Tables']`

### 5. 2 unit-теста падают (регрессия)
- **Файл:** `src/test/reels-create-entrypoints.test.tsx`
- **Тесты:** `opens CreateReelSheet from empty ReelsPage CTA`, `opens CreateReelSheet from ReelsPage sidebar create button`
- **Причина:** В ReelsPage был удалён элемент, на который опираются тесты

---

## 🟠 СЕРЬЁЗНЫЕ ПРОБЛЕМЫ (P1)

### 6. BottomNav не скрывается на Reels
- **Файл:** `src/components/layout/AppLayout.tsx`
- **Проблема:** `isReelsPage` определён, но НЕ передаётся в `BottomNav hidden` prop
- **Следствие:** Нижняя навигация отображается поверх видео, высота контейнера компенсируется хрупким `-3rem`

### 7. Монолит 1 259 строк — нарушение SRP
- **Файл:** `src/pages/ReelsPage.tsx`
- **Отсутствуют компоненты:**
  - `<ReelItem>` — рендеринг одного рила (сейчас inline в `.map()`, строки 770–1207)
  - `<ReelSidebar>` — кнопки действий
  - `<ReelPlayer>` — управление `<video>`
  - `useReelGestures` — жест-обработчики

### 8. Утечки памяти: `<link prefetch>` не очищается
- **Файл:** `src/pages/ReelsPage.tsx:365-366`
- **Проблема:** `document.head.appendChild(link)` для prefetch — никогда не удаляется
- **Плюс:** `prefetchedVideoUrls` и `prefetchedPosterUrls` (Set) — неограниченно растут

### 9. IntersectionObserver пересоздаётся на каждый loadMore
- **Файл:** `src/pages/ReelsPage.tsx:239-294`
- **Зависимости:** `[reels, recordImpression]` — при каждом изменении массива `reels` observer уничтожается и создаётся заново
- **Следствие:** Гонка состояний — новые элементы могут не попасть в observer

### 10. Дублирование anonSessionId x6
- **Файл:** `src/hooks/useReels.tsx` — строки 667, 689, 748, 789, 832, 884
- **Исправление:** Вынести в `getOrCreateAnonSessionId()` утилиту

### 11. Sidebar: 9 кнопок не помещаются на экранах <700px
- **Файл:** `src/pages/ReelsPage.tsx:901`
- **Расчёт:** 9 кнопок × 68px + 8 gaps × 16px = 740px (при высоте iPhone SE = 568px)
- **Отсутствие:** Media queries для уменьшения gap/размера на маленьких экранах

### 12. Нет safe-area-inset-bottom для sidebar и описания
- **Файлы:** `src/pages/ReelsPage.tsx:901` (sidebar `bottom-8`), `src/pages/ReelsPage.tsx:1084` (описание `bottom-4`)
- **Проблема:** На iPhone нижние элементы перекрываются home indicator

### 13. Конфликт scroll-snap + smooth + JS handlers
- **Файл:** `src/pages/ReelsPage.tsx:763-767`
- **Три конкурирующих механизма:** CSS `scrollSnapType: mandatory`, CSS `scrollBehavior: smooth`, JS `scrollIntoView({ behavior: "smooth" })`
- **Следствие:** Двойная анимация, залипание на iOS Safari

### 14. Кнопка "Пожаловаться" — заглушка
- **Файл:** `src/pages/ReelsPage.tsx:1193`
- **Проблема:** `toast.info("Жалоба отправлена")` без API-запроса — вводит пользователя в заблуждение

---

## 🟡 ПРОБЛЕМЫ СРЕДНЕГО УРОВНЯ (P2)

### 15. Нет виртуализации списка рилов
- **Файл:** `src/pages/ReelsPage.tsx:770`
- **Проблема:** Все рилы рендерятся через `.map()` без виртуализации — при 50+ рилах DOM перегружен
- **Рекомендация:** Рендерить текущий ± 2 соседних рила

### 16. Иконка Play для кнопки "Создать"
- **Файл:** `src/pages/ReelsPage.tsx:916`
- **Проблема:** Иконка `Play` семантически неправильна для "Создать" — нужна `Plus` или `PlusCircle`

### 17. enrichRows: 4 параллельных запроса на каждый блок
- **Файл:** `src/hooks/useReels.tsx:302`
- **Проблема:** `likes`, `saves`, `reposts` и `profiles` — 4 roundtrip при каждой загрузке
- **Рекомендация:** Объединить через один RPC или денормализовать в `get_reels_feed_v2`

### 18. Пустой заголовок 48px
- **Файл:** `src/pages/ReelsPage.tsx:718-720`
- **Проблема:** `<header>` с пустым `<div className="h-12">` — занимает 48px без контента, что вынуждает вычитать `-4rem` из высоты контейнера

### 19. `onTimeUpdate` без throttle
- **Файл:** `src/pages/ReelsPage.tsx:840`
- **Проблема:** ~4 вызова/сек `updateCurrentProgress()` — чрезмерная нагрузка на рендеринг

### 20. `refetch()` при закрытии комментариев
- **Файл:** `src/pages/ReelsPage.tsx:1232`
- **Проблема:** Полная перезагрузка фида вместо локального обновления `comments_count`

### 21. Optimistic updates без rollback
- **Файл:** `src/hooks/useReels.tsx:425, 491, 559`
- **Проблема:** `toggleLike/Save/Repost` — нет rollback при ошибке сети

---

## ♿ ДОСТУПНОСТЬ (a11y) — P2

| Проблема | Файл:Строка |
|----------|-------------|
| Кнопки sidebar без `aria-label` | `ReelsPage.tsx:952, 975, 1010, 1036` |
| `<video>` без `aria-label` / `role` | `ReelsPage.tsx:793` |
| Нет клавиатурной навигации (↑/↓, Space) | Все файлы |
| Screen reader не объявляет содержимое | Все файлы |
| ✅ Кнопка мьюта имеет `aria-label` | `ReelsPage.tsx:890` |

---

## ✅ ЧТО РЕАЛИЗОВАНО КОРРЕКТНО

| Функция | Статус |
|---------|--------|
| Прогресс-бар с порогом `0.01` | ✅ Работает |
| Мьют-кнопка с `aria-label` | ✅ Работает |
| Автор, счётчики, хэштеги | ✅ Отображаются |
| Retry-логика видео (2 попытки с экспон. задержкой) | ✅ Работает |
| Double-tap like с анимацией сердца | ✅ Работает |
| Cooldown навигации 350ms | ✅ Работает |
| Progressive disclosure аналитики | ✅ impression → viewed → watched → skip |
| Demo-mode в useReels | ✅ Работает |
| Идемпотентная публикация (client_publish_id) | ✅ Работает |

---

## 📊 СВОДНАЯ ТАБЛИЦА ВСЕХ ПРОБЛЕМ

| # | Проблема | Приоритет | Категория | Файл |
|---|----------|-----------|-----------|------|
| 1 | FSM не используется | 🔴 P0 | Архитектура | `fsm.ts` |
| 2 | `objectFit: contain` → чёрные полосы | 🔴 P0 | Визуал | `ReelsPage:808` |
| 3 | `100vh` вместо `100dvh` | 🔴 P0 | Адаптивность | `ReelsPage:754` |
| 4 | `(supabase as any)` x14 | 🔴 P0 | Типизация | `useReels.tsx` |
| 5 | 2 unit-теста падают | 🔴 P0 | Тесты | `reels-create-entrypoints` |
| 6 | BottomNav не скрывается | 🟠 P1 | Лейаут | `AppLayout.tsx` |
| 7 | Монолит 1259 строк | 🟠 P1 | Архитектура | `ReelsPage.tsx` |
| 8 | `<link prefetch>` утечка | 🟠 P1 | Производительность | `ReelsPage:365` |
| 9 | Observer пересоздаётся | 🟠 P1 | Производительность | `ReelsPage:239` |
| 10 | anonSessionId x6 дубль | 🟠 P1 | DRY | `useReels.tsx` |
| 11 | 9 кнопок не помещаются | 🟠 P1 | Адаптивность | `ReelsPage:901` |
| 12 | Нет safe-area-inset-bottom | 🟠 P1 | Адаптивность | `ReelsPage:901,1084` |
| 13 | Конфликт scroll-snap | 🟠 P1 | UX | `ReelsPage:763` |
| 14 | "Пожаловаться" — заглушка | 🟠 P1 | UX | `ReelsPage:1193` |
| 15 | Нет виртуализации | 🟡 P2 | Производительность | `ReelsPage:770` |
| 16 | Иконка Play для "Создать" | 🟡 P2 | UX | `ReelsPage:916` |
| 17 | 4 запроса enrichRows | 🟡 P2 | Производительность | `useReels:302` |
| 18 | Пустой заголовок 48px | 🟡 P2 | Верстка | `ReelsPage:718` |
| 19 | onTimeUpdate без throttle | 🟡 P2 | Производительность | `ReelsPage:840` |
| 20 | refetch при закрытии комментариев | 🟡 P2 | Производительность | `ReelsPage:1232` |
| 21 | Нет optimistic rollback | 🟡 P2 | UX | `useReels:425` |
| 22 | Кнопки без aria-label | 🟡 P2 | a11y | `ReelsPage:952` |
| 23 | Нет клавиатурной навигации | 🟡 P2 | a11y | Весь файл |
| 24 | video без aria-label | 🟡 P2 | a11y | `ReelsPage:793` |

---

## 🎯 ПЛАН ИСПРАВЛЕНИЙ (приоритизированный)

### Фаза 1 — Критические (1-2 дня)
1. Заменить `objectFit: 'contain'` → `'cover'` в `ReelsPage.tsx:808`
2. Заменить `100vh` → `100dvh` в `ReelsPage.tsx:754, 758, 779`
3. Передать `isReelsPage` → `BottomNav hidden` в `AppLayout.tsx`
4. Починить 2 падающих теста в `reels-create-entrypoints.test.tsx`

### Фаза 2 — Архитектурные (3-5 дней)
5. Внедрить FSM через `useReducer`, удалить `syncPlaybackPolicy()`
6. Декомпозировать ReelsPage → `<ReelItem>`, `<ReelSidebar>`, `<ReelPlayer>`, `useReelGestures`
7. Убрать `(supabase as any)` — типизировать через Database types
8. Вынести `getOrCreateAnonSessionId()` утилиту

### Фаза 3 — UX и производительность (1 неделя)
9. Добавить safe-area-inset-bottom для sidebar и описания
10. Убрать `scrollBehavior: smooth` из CSS, оставить только JS `scrollIntoView`
11. Виртуализировать список рилов (текущий ± 2)
12. Очищать `<link prefetch>` при unmount
13. Стабилизировать IntersectionObserver
14. Реализовать API для "Пожаловаться"
15. Добавить aria-labels к кнопкам
16. Добавить клавиатурную навигацию

---

## 📝 Сравнение с предыдущими аудитами

### AUDIT_REPORT.md — что исправлено:
- ✅ Progressive disclosure аналитики реализован
- ✅ Идемпотентная публикация через `client_publish_id` работает
- ✅ Demo-mode поддерживается

### AUDIT_REPORT.md — что НЕ исправлено:
- ❌ 2 падающих теста (упомянуты в аудите, не починены)
- ❌ FSM не интегрирован (упомянуто как "спроектирован", но не подключён)
- ❌ Типизация Supabase (было `as any`, осталось `as any`)

### Новые проблемы (не были в предыдущем аудите):
- 🆕 `objectFit: contain` → чёрные полосы
- 🆕 `100vh` → обрезка на мобильных
- 🆕 9 кнопок sidebar не помещаются
- 🆕 Нет safe-area-inset-bottom
- 🆕 Утечки `<link prefetch>`
- 🆕 Пустой заголовок 48px

---

*Аудит проведён: 03.03.2026 | Аудитор: Kilo Code | Метод: автоматизированный code review + visual analysis*
