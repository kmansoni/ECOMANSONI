# Browser Test Engineer — Скилл браузерного тестирования

Полный протокол тестирования веб-приложения через Playwright MCP.

## Стратегия тестирования

### Auth Fixtures
| Роль | Метод | Данные |
|---|---|---|
| Guest | Без auth | — |
| User | supabase.auth.signInWithPassword | test@example.com |
| Admin | supabase.auth.signInWithPassword | admin@example.com |

### Приоритизация по риску
| Приоритет | Что тестируем |
|---|---|
| P0 — Критичный | Auth flow, оплата, E2EE, RLS-protected данные |
| P1 — Высокий | CRUD операции, формы, навигация, real-time |
| P2 — Средний | UI states, responsive, animations, empty states |
| P3 — Низкий | Hover states, tooltips, copy-to-clipboard |

## 8-фазный протокол тестирования

### Phase 1: Smoke (все роуты)
```
Для КАЖДОГО роута:
1. Открыть страницу
2. Проверить: нет console.error
3. Проверить: нет network 4xx/5xx (кроме expected 401)
4. Проверить: основной контент отрендерился
5. Скриншот
```

### Phase 2: Navigation
```
1. Все ссылки <a> и <Link> кликабельны и ведут куда надо
2. Browser back/forward работают
3. Deep links открывают правильную страницу
4. 404 страница для несуществующих роутов
5. Redirect после auth
```

### Phase 3: Interactive
```
Для КАЖДОЙ кнопки/элемента:
1. Клик → что-то происходит (не dead button)
2. Формы: submit с валидными данными → success
3. Формы: submit с невалидными → error message
4. Модальные окна: open/close/escape
5. Tabs: переключение показывает контент
6. Dropdown/Select: выбор работает
7. Toggle/Switch: состояние меняется
8. Drag-and-drop: элемент перемещается
```

### Phase 4: Functional (CRUD)
```
Для каждой сущности:
1. Create: заполнить форму → сохранить → появилось в списке
2. Read: список загружается, пагинация работает, фильтры
3. Update: редактирование → сохранение → данные обновились
4. Delete: удаление → подтверждение → исчезло из списка
5. Search: ввод текста → результаты релевантны
6. Sort: клик на заголовок → порядок меняется
```

### Phase 5: Security
```
XSS Payloads для КАЖДОГО текстового поля:
- <script>alert(1)</script>
- <img src=x onerror=alert(1)>
- javascript:alert(1)
- " onmouseover="alert(1)
- {{constructor.constructor('alert(1)')()}}

Auth bypass:
- Доступ к protected роутам без auth → redirect to login
- Доступ к admin роутам с user auth → 403 или redirect
- Манипуляция с localStorage/sessionStorage auth tokens
- Expired token → graceful redirect, не белый экран
```

### Phase 6: Performance
```
1. LCP < 2.5s для каждой страницы
2. Bundle size: initial < 200KB JS
3. Images: lazy loading, WebP
4. Lists > 50 items: virtual scroll
5. Нет memory leaks при навигации (heap snapshots)
```

### Phase 7: Responsive
```
Breakpoints: 375px (iPhone SE), 768px (iPad), 1440px (Desktop)
Для каждого:
1. Контент не обрезается
2. Текст читаемый (≥14px mobile)
3. Touch targets ≥ 44px
4. Горизонтального скролла нет
5. Навигация доступна (hamburger menu на mobile)
```

### Phase 8: Accessibility
```
1. Keyboard navigation: Tab через все интерактивные элементы
2. Focus visible: индикатор фокуса виден
3. ARIA labels: все кнопки/иконки имеют accessible name
4. Color contrast: 4.5:1 для текста
5. Screen reader: основной контент в правильном порядке
6. Alt text: все изображения имеют alt
7. Form labels: каждый input связан с label
```

## Реестр модулей и чеклистов

### Мессенджер
- [ ] Список чатов загружается
- [ ] Отправка сообщения
- [ ] Получение сообщения (realtime)
- [ ] Delivery status (sent/delivered/read)
- [ ] Reactions на сообщение
- [ ] Reply на сообщение
- [ ] Forward сообщения
- [ ] Поиск по сообщениям
- [ ] Создание группы
- [ ] Media: фото, видео, файлы

### Лента / Reels
- [ ] Infinite scroll
- [ ] Video autoplay
- [ ] Like / unlike
- [ ] Комментарии: create, read, delete
- [ ] Share
- [ ] Bookmark / save
- [ ] Profile page из ленты

### Знакомства
- [ ] Card swipe (like/dislike)
- [ ] Match notification
- [ ] Фильтры: возраст, пол, расстояние
- [ ] Profile view
- [ ] Unmatch

### Такси
- [ ] Выбор адреса (от/до)
- [ ] Карта отображается
- [ ] Расчёт стоимости
- [ ] Заказ такси
- [ ] Отслеживание водителя
- [ ] Завершение поездки
- [ ] Оценка

### Маркетплейс
- [ ] Каталог товаров
- [ ] Поиск
- [ ] Фильтры и сортировка
- [ ] Карточка товара
- [ ] Добавить в корзину
- [ ] Корзина: изменить количество, удалить
- [ ] Checkout: оформление заказа

### CRM
- [ ] Kanban board
- [ ] Drag-and-drop сделок
- [ ] Создание контакта / сделки
- [ ] Фильтры pipeline
- [ ] Activity timeline

### Недвижимость
- [ ] Карта с объектами
- [ ] Фильтры
- [ ] Карточка объекта
- [ ] Ипотечный калькулятор
- [ ] Избранное

### Страхование
- [ ] Wizard: ввод данных
- [ ] Расчёт котировок
- [ ] Сравнение предложений
- [ ] Оформление полиса
- [ ] Агентский кабинет

### Стриминг
- [ ] Список стримов
- [ ] Video player
- [ ] Live chat
- [ ] Создание стрима

### Звонки
- [ ] Аудио звонок
- [ ] Видео звонок
- [ ] Mute/unmute
- [ ] Camera on/off
- [ ] Screen share
- [ ] End call

## Console Error Handling

### Игнорировать (false positives)
- React DevTools warnings
- `[HMR]` messages
- `[vite]` messages
- `Warning: Each child in a list should have a unique "key" prop`

### Серьёзные (баги)
- `Uncaught TypeError`
- `Uncaught ReferenceError`
- `ChunkLoadError`
- `Failed to fetch`
- `NetworkError`
- `CORS error`
- `Unhandled Promise Rejection`

## Формат отчёта

```markdown
# Browser Test Report — {дата}

## Summary
- Total routes tested: {n}
- Passed: {n}
- Failed: {n}
- Bugs found: {n} (P0: {n}, P1: {n}, P2: {n}, P3: {n})

## P0 Bugs (блокеры)
1. **{описание}**
   - Route: {url}
   - Steps: {repro}
   - Expected: {what should happen}
   - Actual: {what happens}
   - Screenshot: {path}

## P1 Bugs (критические)
...

## Phase Results
| Phase | Status | Notes |
|---|---|---|
| 1. Smoke | ✅/❌ | {summary} |
| 2. Navigation | ✅/❌ | ... |
| 3. Interactive | ✅/❌ | ... |
| 4. Functional | ✅/❌ | ... |
| 5. Security | ✅/❌ | ... |
| 6. Performance | ✅/❌ | ... |
| 7. Responsive | ✅/❌ | ... |
| 8. Accessibility | ✅/❌ | ... |
```
