---
name: functional-tester
description: "Функциональное тестирование: не 'код выглядит правильно', а 'реально работает'. Проверка data flow end-to-end, WebSocket соединений, вызовов, отправки сообщений. Use when: проверить работает ли фича, тестовый звонок, проверить data flow, end-to-end тест."
argument-hint: "[фича или модуль для функционального тестирования]"
user-invocable: true
---

# Functional Tester — Реальное тестирование

Не "код выглядит правильно". А: "запусти, проверь, покажи что работает или ГДЕ ЛОМАЕТСЯ".

## Принцип

> Код может быть синтаксически правильным и при этом не работать. Functional Tester проверяет РЕАЛЬНОЕ поведение: data flow, connections, side effects, UI rendering.

## Методы тестирования

### 1. Static Analysis Tests (без запуска)
Проверки, которые можно выполнить через чтение кода:
- **Import chain**: A импортирует B, B импортирует C — вся цепочка разрешается?
- **Type flow**: типы не теряются через `any` по пути данных?
- **Config consistency**: env переменные, URL, порты — совпадают?
- **Feature flags**: все условия включения/выключения непротиворечивы?

### 2. TypeScript Compilation Tests
Запуск реальных проверок:
```bash
npx tsc -p tsconfig.app.json --noEmit     # Основная проверка
npx tsc -p tsconfig.strict.json --noEmit   # Строгая проверка
npm run lint                                # ESLint
```

### 3. Unit Test Execution
Запуск существующих тестов:
```bash
npx vitest run                              # Все тесты
npx vitest run src/test/{module}            # Тесты модуля
npx vitest run --reporter=verbose           # Подробный вывод
```

### 4. Data Flow Tracing
Для каждой фичи проследить путь данных:
```
DB Table → RLS Policy → Supabase Query → Hook → State → Component → JSX → User sees
```
На каждом шаге проверить:
- Данные не теряются?
- Типы не меняются?
- Ошибки ловятся?
- UI обновляется?

### 5. Connection Testing (звонки, WS, Realtime)
Для модулей с сетевыми соединениями:
- **WebSocket**: подключение устанавливается? Heartbeat работает? Reconnect при обрыве?
- **Realtime**: подписка создаётся? Events проходят? Cleanup отписывается?
- **SFU/mediasoup**: сигнализация WS → создание transport → produce/consume media
- **LiveKit**: токен выдаётся? Комната создаётся? Tracks публикуются?

### 6. Integration Chain Testing
Проверка полной цепочки без мок-данных:
- Действие пользователя → API вызов → DB запись → Realtime event → UI обновление
- Отправка сообщения → notification trigger → push delivery
- Upload файла → storage → CDN URL → рендер в чате

## Процесс тестирования модуля

### Шаг 1: Инвентарь контрактов
- Какие API endpoints использует модуль?
- Какие DB таблицы читает/пишет?
- Какие Realtime подписки создаёт?
- Какие внешние сервисы вызывает?

### Шаг 2: Проверка каждого контракта
Для каждого API/DB вызова:
1. Endpoint/таблица существует?
2. Параметры валидны? Типы совпадают?
3. RLS позволяет операцию?
4. Response обрабатывается корректно?
5. Error path реализован?

### Шаг 3: Запуск тестов
1. `npx tsc --noEmit` — компиляция
2. `npx vitest run` — unit-тесты
3. Чтение результатов, анализ failures

### Шаг 4: Ручная трассировка проблем
Если тест/проверка обнаружила проблему:
1. Определи точный файл и строку
2. Проследи data flow в обоих направлениях (вверх и вниз)
3. Найди корневую причину (не симптом)
4. Предложи минимальный фикс

## Чеклисты по модулям

### Звонки (calls)
- [ ] WebSocket к calls-ws серверу подключается?
- [ ] Сигнализация: offer/answer/ice-candidate проходят?
- [ ] mediasoup: transport создаётся? produce() работает?
- [ ] Входящий звонок: push уведомление приходит? UI показывает?
- [ ] Принятие звонка: медиа-потоки устанавливаются?
- [ ] Завершение: cleanup ресурсов, state reset?
- [ ] FSM: все переходы состояний корректны?

### Лента (reels/feed)
- [ ] Запрос к reels таблице возвращает данные?
- [ ] RLS позволяет SELECT для authenticated?
- [ ] Видео URL валидны? Storage файлы доступны?
- [ ] Бесконечная прокрутка работает? (.range() корректен)
- [ ] Лайки/комментарии записываются?
- [ ] Realtime обновления приходят?

### Чат (messages)
- [ ] Отправка: INSERT в messages проходит?
- [ ] Доставка: Realtime event приходит собеседнику?
- [ ] Отображение: новое сообщение рендерится?
- [ ] Медиа: файлы загружаются и отображаются?
- [ ] Реакции: добавляются и показываются?
- [ ] Статус: delivered/read обновляется?

## Формат вывода

```
## Functional Test — {модуль}

### Результаты компиляции
tsc: {PASS/FAIL} — {N} ошибок
lint: {PASS/FAIL} — {N} warnings

### Результаты unit-тестов
vitest: {N} passed | {N} failed | {N} skipped

### Data Flow Checks
| Цепочка | Статус | Разрыв |
|---------|--------|--------|
| reels → useReels → ReelsFeed | 🔴 FAIL | RLS блокирует на SELECT |
| messages → useChat → ChatConversation | ✅ PASS | — |

### Проблемы
1. [FUNC-001] 🔴 Звонки: WS не подключается
   Причина: URL сервера не совпадает с env
   Файл: src/hooks/useVideoCall.ts:42

### Рекомендации
1. {конкретный фикс}
```
