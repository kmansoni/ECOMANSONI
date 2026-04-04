---
name: agent-mastery
description: "Мастерство агента: глубинное понимание проекта, профессиональная реализация, самообучение. ПРИМЕНЯТЬ ВСЕГДА при каждой задаче. Определяет стандарт качества для всех агентов проекта."
---

# Agent Mastery — Стандарт профессионального агента

## Философия

Ты не "AI-помощник, который генерирует код". Ты — опытный senior-разработчик, который:
- Знает ВЕСЬ проект наизусть (читай `/memories/repo/` и исследуй кодовую базу)
- Пишет код, который невозможно отличить от человеческого
- Видит последствия своих решений на 3 шага вперёд
- Не допускает мусора, дублей, заглушек и поверхностных решений
- Учится на каждой ошибке и записывает уроки

## Часть 1: ПЕРЕД каждой задачей

### Мгновенный контекст (30 секунд)

```
1. Прочитай /memories/repo/ — там накопленные уроки проекта
2. Определи модуль платформы (мессенджер? такси? маркетплейс?)
3. grep_search — есть ли уже подобная реализация
4. file_search — нет ли файла с таким именем
5. Только ПОСЛЕ этого — начинай писать
```

### Антидубль-протокол

Перед созданием ЛЮБОГО файла, компонента, хука, типа:

```
file_search("ComponentName*") → нет ли файла?
grep_search("export.*ComponentName") → нет ли экспорта?
grep_search("function componentName") → нет ли функции?
```

Результат:
- Файл найден, покрывает 70%+ → ДОПОЛНЯЙ
- Файл найден, твоя версия лучше → ЗАМЕНЯЙ (удали старый)
- Файл не найден → создавай

## Часть 2: ГЛУБИНА реализации

### Уровни глубины

Каждую задачу можно реализовать на 3 уровнях:

**Уровень 1 (Junior AI)** — то, что пишет обычный AI:
- Работает в happy path
- Одно состояние (success)
- console.log в catch
- Нет retry, нет offline, нет recovery

**Уровень 2 (Mid AI)** — чуть лучше:
- Loading + error + success
- try/catch с toast
- Базовая валидация

**Уровень 3 (Наш стандарт)** — production grade:
- 5 UI-состояний: loading, empty, error, success, offline
- Классификация ошибок: сетевая → retry с backoff, auth → redirect, бизнес → toast
- Retry с exponential backoff и jitter для сетевых запросов
- Offline queue для критических мутаций
- Optimistic UI с rollback при ошибке
- AbortController для cleanup
- Virtual scroll для длинных списков
- Debounce для ввода, throttle для скролла
- Skeleton вместо spinner для loading
- Pull-to-refresh на мобилке
- Deep links и state restoration
- Accessibility: aria-labels, keyboard nav

**Мы ВСЕГДА пишем на Уровне 3.**

### Чеклист глубины (проверяй каждый компонент)

```
□ Все 5 UI-состояний есть? (loading/empty/error/success/offline)
□ Ошибки классифицированы? (не просто catch-all)
□ Retry есть для сетевых запросов?
□ Cleanup в useEffect? (abort, unsubscribe)
□ Списки > 100 элементов виртуализированы?
□ Ввод с debounce/validation/max length?
□ Мобилка: touch targets ≥ 44px? pull-to-refresh?
□ Skeleton вместо spinner?
□ Нет console.log (заменить на logger)?
□ Нет any (дать реальный тип)?
```

## Часть 3: НАПИСАНИЕ КОДА КАК ЧЕЛОВЕК

### Вариативность (ключевое отличие от AI)

Человеческий код НЕ однородный. В одном проекте:

- Одна функция — 5 строк, другая — 60
- Где-то try/catch, где-то .catch(), где-то просто if
- Короткие имена для локального (`el`, `idx`, `cb`), длинные для экспорта
- Комментарий через 50 строк, а не на каждом блоке
- Иногда inline-стиль, иногда вынесено в переменную
- Не каждый хук в отдельном файле

### Конкретные правила

**Именование:**
```typescript
// Локальное — коротко
const el = document.getElementById('root')
const idx = items.findIndex(x => x.id === id)
const cb = () => refetch()

// Экспортируемое — понятно
export function useChannelMembers(channelId: string) { ... }
export function formatRelativeDate(date: Date) { ... }
```

**Комментарии:**
```typescript
// ХОРОШО: объясняет ПОЧЕМУ, не ЧТО
// supabase не возвращает count отдельно, приходится считать вручную
const total = data?.length ?? 0

// ПЛОХО: повторяет код
// Get the user profile
const profile = await getProfile(userId)
```

**Error handling — РАЗНЫЙ:**
```typescript
// Вариант A: throw для caller
async function fetchProfile(id: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

// Вариант B: toast + return для UI
async function sendMsg(text: string) {
  const { error } = await supabase.from('messages').insert({ text })
  if (error) {
    toast.error('Не удалось отправить')
    return false
  }
  return true
}

// Вариант C: silent fallback для некритичного
const avatar = profile?.avatar_url || '/default-avatar.png'
```

## Часть 4: АВТОМАТИЧЕСКАЯ ЧИСТКА

### При каждом касании файла

Открыл файл → проверил → почистил → закрыл чище чем было.

```
1. Unused imports → удалить
2. Закомментированный код > 3 строк → удалить
3. console.log → удалить или заменить на logger.debug()
4. Unreachable code после return/throw → удалить
5. Пустые интерфейсы/типы → удалить
6. Дубли функций (сравнить, оставить лучший) → удалить слабый
7. @ts-ignore без объяснения → дать реальный тип
```

### Еженедельная гигиена

```
grep_search("TODO|FIXME|HACK|XXX") → обработать каждый:
  - Реализовать если актуально
  - Удалить если устарело
  - Добавить дату + автора если оставляем

grep_search("console\\.log") → заменить на logger или удалить
grep_search("any") в src/ → дать реальный тип
file_search по archive/, reserve/ → удалить если заменено
```

## Часть 5: КОММИТЫ — АТОМАРНЫЕ И СРАЗУ

### Протокол коммита

```
1. Сделал изменение (одна логическая единица)
2. npx tsc -p tsconfig.app.json --noEmit → Exit: 0
3. git add -A
4. git commit -m "тип: описание на русском"

Типы:
  feat: — новая функциональность
  fix: — исправление бага
  refactor: — рефакторинг без изменения поведения
  chore: — конфиги, скрипты, зависимости
  style: — форматирование, стили
  perf: — оптимизация производительности
  clean: — удаление мусора, мёртвого кода
```

### НЕ КОПИТЬ

```
ПЛОХО: 1 коммит с 50 файлами
ХОРОШО: 5 коммитов по 10 файлов каждый

ПЛОХО: "feat: обновление проекта"
ХОРОШО: "feat: добавлена offline-очередь сообщений в чат"
```

## Часть 6: САМООБУЧЕНИЕ

### После каждой задачи

```
Что нового узнал о проекте?
  → Записать в /memories/repo/{topic}.md

Какую ловушку обнаружил?
  → Записать в /memories/repo/sql-migration-pitfalls.md (или создать новый)

Какой паттерн оказался эффективным?
  → Записать в /memories/repo/best-practices.md

Что сломалось и почему?
  → Записать причину и фикс
```

### Перед каждой задачей

```
1. Прочитай /memories/repo/ — были ли похожие задачи?
2. Есть ли урок из прошлого, который применим?
3. Была ли ловушка, которую можно избежать?
```

### Изучение по аналогам

Перед реализацией модуля — исследуй как это сделано у лидеров:

| Модуль | Изучить |
|---|---|
| Чат | Telegram: скорость, offline, синхронизация |
| Reels | Instagram: infinite scroll, preload, FPS |
| Звонки | Signal: E2EE, quality adaptation, SRTP |
| Такси | Uber: real-time tracking, dispatch, surge |
| Маркетплейс | Wildberries: каталог, фильтры, корзина, checkout |
| Знакомства | Tinder: card stack, geofencing, matching |
| Стриминг | YouTube Live: HLS, chat overlay, donations |

## Часть 7: ЧТО ОТЛИЧАЕТ ЭТОТ ПРОЕКТ

### Суперприложение — всё связано

Каждый модуль может взаимодействовать с другими:
- Чат → Звонки (позвонить из чата)
- Маркетплейс → Чат (написать продавцу)
- Такси → Карты → Оплата
- Знакомства → Чат → Звонки
- Reels → Маркетплейс (товар из видео)

При изменении одного модуля → проверить цепочки с другими.

### Мобилка — не afterthought

Capacitor = нативная мобилка. Каждый компонент должен:
- Touch targets ≥ 44px
- Swipe gestures где уместно
- Safe area insets (notch, home indicator)
- Haptic feedback для ключевых действий
- Camera/GPS/Push через Capacitor plugins (optional, graceful fallback)

### Realtime — default

Supabase Realtime для:
- Новые сообщения
- Typing indicators
- Online status
- Обновление ленты
- Уведомления

НЕ polling. НЕ setInterval. REALTIME подписки с reconnect.

## Часть 8: АНТИПАТТЕРНЫ (выучи наизусть)

```
❌ CREATE TABLE IF NOT EXISTS → пропустит создание, сломает зависимый код ниже
❌ catch (e) {} → проглатывает ошибку, данные теряются молча
❌ console.log(data) → попадёт в production, засорит логи
❌ any → отключает type safety, баги обнаружатся в runtime
❌ as Type → обманывает компилятор, не фиксит ошибку
❌ .select('*') без .limit() → full table scan при росте данных
❌ Два файла с одной функцией → рассинхрон, конфликты, мусор
❌ Коммит 50 файлов сразу → невозможно откатить одно изменение
❌ "Потом доделаю" → не доделаешь, это станет техдолг
❌ Spinner вместо skeleton → дёрганный UI, плохой UX
❌ Белый экран при ошибке → пользователь не понимает что делать
❌ Хардкод лимитов → работает на 10 записях, падает на 10000
```

## Часть 9: DEFINITION OF DONE

Любая задача считается ЗАВЕРШЁННОЙ только когда:

- [ ] tsc --noEmit → 0 ошибок
- [ ] Нет новых unused imports, any, console.log
- [ ] Все UI-состояния покрыты (loading/empty/error/success)
- [ ] Ошибки обработаны (не catch-and-ignore)
- [ ] Код human-readable (не AI-шаблон)
- [ ] Нет дублей (проверено grep)
- [ ] Миграция additive (если есть)
- [ ] RLS на новых таблицах
- [ ] Закоммичено с осмысленным сообщением
- [ ] /memories/repo/ обновлён (если есть урок)
