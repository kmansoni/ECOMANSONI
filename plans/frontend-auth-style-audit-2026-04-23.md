# Frontend Audit Plan: Auth Design as UI Baseline

Дата: 2026-04-23
Область: Web frontend (src/pages)
Цель: сделать новый дизайн страницы аутентификации эталоном для остальных страниц без массового рискованного рефакторинга за один проход.

## 1. Эталон и источник правды

Эталонный UX/UI источник:
- src/pages/AuthPage.tsx

Эталонные дизайн-примитивы (глобально доступны):
- src/index.css
- .glass-window
- .glass-input
- .glass-popover
- .glass-primary-btn
- .glass-secondary-btn
- .unified-page-bg

Ключевая идея:
- AuthPage уже использует современный liquid-glass паттерн, адаптацию под светлую/тёмную тему, аккуратные переходы состояний и фокус на читаемость.
- Это надо стандартизировать через повторно используемые примитивы, а не копированием className-строк между страницами.

## 2. Базовый снимок (текущее состояние)

Скан src/pages/**/*.tsx дал:
- Всего страниц: 151
- Файлов с backdrop-blur: 81
- Файлов с glass-window: 1
- Файлов с SelectContent className="glass-popover": 1
- Файлов с className="glass-input": 0
- Файлов с жёсткими цветовыми паттернами (bg-black/*, bg-zinc-*, bg-gray-*) и без glass-window: 57

Вывод:
- В проекте уже есть много стеклянных/blur-мотивов, но они разрознены.
- Общая проблема не в отсутствии стиля, а в отсутствии единого дизайн-контракта.

## 3. Критичные расхождения

1) Локальные hardcoded палитры вместо токенов
- Массово встречаются bg-black/90, bg-zinc-900, bg-gray-950 и подобные классы.
- Это ломает единообразие между экранами и ухудшает тему/контраст на разных устройствах.

2) Повторяющиеся визуальные паттерны без единого компонента
- Sticky headers, glass cards, action bars, popovers описаны вручную в десятках страниц.
- Повышается стоимость сопровождения и риск регрессий при любом UI-изменении.

3) Экран авторизации для popup (web login callback) визуально изолирован от нового эталона
- src/pages/WebLoginCallbackPage.tsx использует отдельную серо-синюю схему и отдельные surface-правила.

4) Админский вход не приведён к эталону
- src/pages/admin/AdminLoginPage.tsx остаётся в базовом shadcn-оформлении и визуально выбивается из обновлённого auth brand experience.

5) В репозитории остался legacy файл стилей с Vite-демо артефактами
- src/App.css содержит стандартные demo-правила (logo/card/read-the-docs), не являющиеся частью нового стандарта.

## 4. Приоритеты миграции

P0 (в первую очередь, максимум эффекта):
- Auth-связанные публичные экраны:
  - src/pages/WebLoginCallbackPage.tsx
  - src/pages/admin/AdminLoginPage.tsx
- Цель: единый onboarding/auth визуальный контур.

P1 (высокий impact, часто посещаемые):
- Feed/коммуникации:
  - src/pages/HomePage.tsx
  - src/pages/ChatsPage.tsx
  - src/pages/ChatPage.tsx
  - src/pages/NotificationsPage.tsx
  - src/pages/SearchPage.tsx

P2 (большой кластер однотипных экранов):
- Settings cluster:
  - src/pages/settings/*
- Здесь уже есть близкие паттерны (backdrop-blur + rounded-2xl), поэтому выгодно быстро консолидировать.

P3 (доменные модули с собственным визуальным языком):
- navigation, insurance, taxi, CRM, live
- Подход: не ломать domain UX, но привести базовые surfaces/tokens/header/footer к общему стандарту.

## 5. План внедрения (этапы)

Этап A: Дизайн-контракт и инвентарь
1. Зафиксировать UI-контракт (Design Contract v1):
   - Surface: window/input/popover/button
   - Border radius scale
   - Elevation/shadow scale
   - Header/toolbar шаблон
   - Формы и фокус-состояния
2. Добавить таблицу соответствий:
   - legacy классы -> canonical классы/компоненты
3. Ограничить новые hardcoded-color классы (lint/grep gate).

Этап B: Компонентный слой
1. Вынести reusable primitives в shared UI слой (без массового переписывания страниц):
   - AppSurface
   - AppInput
   - AppSelectPopover
   - AppPrimaryButton / AppSecondaryButton
   - AppStickyHeader
2. Сохранить обратную совместимость className (через cn и slot-подход).

Этап C: Пилотная миграция (P0)
1. Мигрировать:
   - src/pages/WebLoginCallbackPage.tsx
   - src/pages/admin/AdminLoginPage.tsx
2. Проверка:
   - desktop + mobile
   - dark + light
   - keyboard focus
   - no visual regressions в auth flow

Этап D: Миграция по кластерам (P1 -> P2 -> P3)
1. Идти пакетами по одному домену.
2. На каждый пакет:
   - refactor
   - smoke test
   - visual review
   - фиксация метрик до/после

Этап E: Закрепление стандарта
1. Добавить CI-проверку на запрещённые hardcoded паттерны (мягкий режим -> строгий).
2. Добавить раздел в CONTRIBUTING:
   - как собирать новые экраны в стиле auth baseline
3. Очистить legacy UI фрагменты после подтверждения стабильности.

## 6. KPI аудита и rollout

Ключевые KPI:
- Доля страниц без hardcoded bg-black/bg-zinc/bg-gray: +80% от текущей базы
- Переиспользование canonical surface/input/popover primitives: >= 70% страниц
- Количество уникальных ручных sticky-header реализаций: снижение минимум в 2 раза
- Регрессии по accessibility focus-visible: 0 критичных

Контрольные точки:
- Gate 1: завершён P0
- Gate 2: завершён P1
- Gate 3: завершён P2
- Gate 4: завершён P3 + CI guard в строгом режиме

## 7. Риски и защита от регрессий

Риски:
- Ломка визуально специфичных доменных экранов (navigation/live).
- Непредсказуемый контраст в light/dark при механической замене классов.
- Перенос inline-tailwind логики без компонентного abstraction ухудшит читаемость.

Митигации:
- Миграция строго по доменам, не батчем по всему проекту.
- Визуальный чек-лист на каждый PR.
- A/B сравнение скриншотов для критичных маршрутов.

## 8. Практический чек-лист для каждого экрана

1. Нет прямых hardcoded bg-black/bg-zinc/bg-gray для главных surface-областей.
2. Карточки и контейнеры используют canonical surface.
3. Инпуты и селекты используют canonical input/popover.
4. Header/action bar используют единый sticky-шаблон.
5. Поддержаны light/dark и reduced motion.
6. Focus ring единообразен и видим.
7. Экран проходит мобильную проверку (safe-area + высота + скролл).

## 9. Рекомендованный первый рабочий спринт

Sprint-1 (без риска для прод-фич):
1. Ввести Design Contract v1 документально.
2. Подготовить shared primitives (без массового переписывания страниц).
3. Мигрировать только два экрана P0:
   - src/pages/WebLoginCallbackPage.tsx
   - src/pages/admin/AdminLoginPage.tsx
4. Зафиксировать diff-метрики и согласовать visual baseline.

---

Статус: аудит выполнен, план миграции готов к исполнению.
