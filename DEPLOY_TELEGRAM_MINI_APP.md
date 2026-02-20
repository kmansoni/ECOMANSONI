# Deploy: Telegram Mini App

Ниже — пошаговый план, чтобы развернуть этот Vite/React проект как Telegram Mini App (WebApp).

## 0) Важно (ограничения Telegram)

- Mini App должен быть доступен по **HTTPS**.
- URL Mini App задаётся в BotFather (кнопка меню/кнопка WebApp).
- Для SPA (React Router) хостинг должен отдавать `index.html` на любые пути (rewrites). Для этого в репозитории уже есть:
  - `vercel.json`
  - `netlify.toml`
  - GitHub Pages fallback через `public/404.html` + скрипт в `index.html`

## 1) Подготовь backend (Supabase)

Если ты ещё не пушил миграции/функции:

- Выполни `Supabase: DB push (linked)`
- Если используешь edge functions — `Supabase: Functions deploy (...)`

Смотри базовые команды в `DEPLOY.md`.

## 2) Выбери хостинг фронта (любой HTTPS)

Нужен постоянный публичный URL (например `https://app.example.com`).

### Вариант A: Vercel (проще всего)

1. Залей репозиторий на GitHub.
2. Vercel → **New Project** → импорт репозитория.
3. Environment Variables (Project Settings → Environment Variables):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key)
4. Deploy.

Примечание: `vercel.json` уже добавлен, чтобы React Router работал на прямых ссылках.

### Вариант B: Netlify

1. Netlify → Add new site → Import from Git.
2. Environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
3. Deploy.

Примечание: `netlify.toml` уже добавлен со SPA redirects.

### Вариант C: GitHub Pages

В проекте уже есть workflow `deploy-pages.yml` и SPA fallback.
Но для Telegram Mini App удобнее домен без `/<repo>/` в URL.

## 3) Создай и настрой бота в BotFather

1. Открой `@BotFather` → `/newbot` → создай бота.
2. Включи Mini App:
   - BotFather → **Bot Settings** → **Menu Button** → **Configure menu button**
   - Выбери **Web App**
   - Укажи URL на твой деплой (Vercel/Netlify/Pages)

3. (Опционально) Создай отдельный WebApp объект:
   - BotFather → **Bot Settings** → **Web App** (если доступно) → добавь URL.

## 4) Проверка запуска

- Открой бота в Telegram.
- Нажми кнопку меню (Web App).
- Проверь:
  - авторизация/загрузка данных (Supabase URL/anon key подтянуты)
  - роуты (переходы внутри приложения и прямой заход по deep link)
  - камера/микрофон (звонки) — работают только по HTTPS и после жеста пользователя

## 5) Диагностика (если что-то не так)

- Если при открытии Mini App пустой экран:
  - проверь, что переменные окружения заданы в хостинге
  - открой DevTools (в Telegram Desktop проще) и посмотри ошибки
- Если роуты ломаются на прямой ссылке:
  - убедись, что SPA rewrites включены (Vercel: `vercel.json`, Netlify: `netlify.toml`)
- Если звонки не стартуют:
  - проверь разрешения камеры/микрофона в Telegram WebView
  - проверь HTTPS и что клик был именно по кнопке (иначе getUserMedia блокируется)
