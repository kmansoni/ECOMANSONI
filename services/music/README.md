# Music Module — Mansoni

Динамически загружаемый музыкальный сервис для платформы Mansoni. Текущая версия уже работает не только на demo-store: модуль умеет читать треки, плейлисты, лайки и загрузки из Supabase, использовать JWT от основного приложения и падать обратно в demo-данные только как fallback.

## 📁 Структура

```
mansoni/
├── services/
│   └── music/              # Музыкальный фронтенд-модуль (Vite)
│       ├── src/
│       │   ├── pages/      # Страницы: Home, Playlist, Track, Search
│       │   ├── components/ # Компоненты: Player, TrackList, PlaylistCard
│       │   ├── store/      # Zustand store (playback + liked/downloaded state)
│       │   ├── lib/        # Supabase client, data hooks, offline cache
│       │   └── styles/     # CSS стили
│       ├── manifest.json   # Манифест модуля
│       ├── vite.config.ts  # Конфиг сборки
│       └── package.json
├── src/
│   ├── lib/
│   │   └── ModuleLoader.ts     # Загрузчик модулей
│   ├── components/
│   │   └── ModuleInstaller.tsx # UI установки модуля
│   ├── pages/
│   │   └── MusicPage.tsx       # Страница-обёртка
│   └── App.tsx                 # Добавлен роут /services/music
├── scripts/
│   └── build-modules.mjs   # Скрипт сборки всех модулей
└── supabase/
    └── migrations/
        └── 20250421000000_spotify_schema.sql  # Миграция БД
```

## 🚀 Быстрый старт

### 1. Установка зависимостей модуля

```bash
cd services/music
npm install
```

### 2. Конфигурация окружения

Скопируйте `.env.example` в `.env` и укажите ваши ключи:

```bash
cp services/music/.env.example services/music/.env
```

Заполните:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key

# fallback, если проект ещё не переведён на publishable key
# VITE_SUPABASE_ANON_KEY=your-anon-key
```

Модуль поддерживает оба варианта ключа, но сначала ищет `VITE_SUPABASE_PUBLISHABLE_KEY`, потому что именно его использует основной Mansoni.

### 3. Сборка модуля

Из корня проекта:

```bash
npm run build:modules
```

Это:
- Соберёт `services/music` через Vite
- Скопирует `music-module.js` в `public/modules/music/`
- Создаст `dist/modules/music/manifest.json`

### 4. Применение миграций Supabase

Для нового окружения требуется базовая музыкальная схема:

```sql
supabase/migrations/20250421000000_spotify_schema.sql
```

Для уже существующих окружений с частично развернутой старой музыкальной схемой нужен recovery/patch слой:

```sql
supabase/migrations/20260421130000_music_remote_schema_recovery.sql
supabase/migrations/20260421120000_music_module_hardening.sql
```

Порядок важен:
1. `20250421000000_spotify_schema.sql` для чистой базы.
2. `20260421130000_music_remote_schema_recovery.sql` если удалённая база уже содержит старые `music_tracks/music_playlists/music_playlist_tracks` в плоском формате.
3. `20260421120000_music_module_hardening.sql` для RLS/RPC hardening.

Или через CLI:

```bash
supabase db push
```

### 5. Запуск разработки

```bash
# Основное приложение
npm run dev

# В отдельном терминале — модуль (для hot-reload)
cd services/music
npm run dev
```

Откройте: http://localhost:5173/services/music

## Что делает модуль

### В режиме **Native (Android/iOS через Capacitor)**:
1. При первом заходе в `/services/music` → проверяет, установлен ли модуль
2. Если нет → скачивает `music-module.js` с CDN (~2 МБ)
3. Сохраняет в файловую систему устройства
4. Динамически импортирует React-компонент
5. Отображает **нативный UI** (не iframe!)
6. Последующие запуски → из кэша (оффлайн)

### В режиме **Web (браузер)**:
1. Пытается загрузить локальный модуль из `/modules/music/music-module.js` (если собран)
2. Если нет → fallback на CDN URL
3. Динамический `import()` → нативный React

## Интеграция

Музыкальный модуль использует **Supabase напрямую** для read/write-сценариев и может использовать **music-api** для серверных маршрутов, где нужен service-role, signed URLs или централизованная авторизация.

### JWT bootstrap

Основное приложение передаёт JWT через query string `?token=...` при загрузке модуля. Входная точка [services/music/src/index.tsx](services/music/src/index.tsx) сохраняет токен через `setMansoniToken()` и после этого модуль создаёт Supabase client уже с корректным `Authorization` header.

### Зависимости
- `@supabase/supabase-js` — для работы с БД
- `zustand` — локальное состояние (queue, currentTrack, liked/downloaded ids)
- `lucide-react` — иконки
- `react-router-dom` — роутинг внутри модуля

### Роуты модуля:
- `/` — главная (рекомендации, плейлисты)
- `/playlist/:id` — страница плейлиста
- `/track/:id` — страница трека
- `/search` — поиск

## Что уже реализовано

- Загрузка реальных треков и плейлистов из Supabase с fallback на demo-данные.
- Лайки и загрузки (downloads) с синхронизацией в Supabase.
- Оффлайн-кэш аудио через Cache Storage.
- Учёт проигрываний через RPC `record_track_play()`.
- Поддержка прямого открытия страниц трека/плейлиста без предварительно прогретого store.
- API-сервер для playlists/likes/downloads/search/stream/subscription.

## Безопасность

### Миграция включает:
- **RLS** на всех таблицах
- Публичный доступ на чтение для `artists`, `albums`, `tracks`
- Пользователи управляют только своими `playlists`, `history`, `likes`
- **Storage bucket** `music` с политиками:
  - Чтение: аутентифицированные пользователи
  - Запись: service_role
- **Функции**: `record_track_play()`, `get_music_recommendations()`, `reorder_playlist_tracks()`
- **Триггеры**: автообновление `updated_at`

### Аутентификация
- Модуль получает `window.__MANSONI_TOKEN__` от Mansoni
- Передаёт в Supabase через кастомный header (настраивается в `supabase.ts`)
- RLS использует `auth.uid()` из JWT

## Локальная разработка

### Локальный dev сервер:

```bash
cd services/music
npm run dev  # http://localhost:3001
```

### Demo fallback

Demo-данные больше не должны редактироваться прямо в store. Если нужен fallback-набор, он лежит в [services/music/src/lib/demoMusicData.ts](services/music/src/lib/demoMusicData.ts).

Реальная загрузка данных уже реализована в [services/music/src/lib/useMusicData.ts](services/music/src/lib/useMusicData.ts), а mutation-сценарии вынесены в [services/music/src/lib/useMusicActions.ts](services/music/src/lib/useMusicActions.ts).

### Основные файлы

- [services/music/src/lib/supabase.ts](services/music/src/lib/supabase.ts) — token-aware Supabase client.
- [services/music/src/lib/useMusicData.ts](services/music/src/lib/useMusicData.ts) — read-side hooks.
- [services/music/src/lib/useMusicActions.ts](services/music/src/lib/useMusicActions.ts) — like/download mutations.
- [services/music/src/lib/offlineAudioCache.ts](services/music/src/lib/offlineAudioCache.ts) — оффлайн-аудио.
- [services/music/src/components/AudioPlayer.tsx](services/music/src/components/AudioPlayer.tsx) — playback + play-history RPC.
- [services/music-api/src/server.ts](services/music-api/src/server.ts) — серверный API.

## Сборка и деплой

### Сборка всех модулей:

```bash
npm run build:modules
```

Результат:
- `dist/modules/music/music-module.js` — бандл (~2 МБ)
- `dist/modules/music/manifest.json` — манифест
- `public/modules/music/music-module.js` — для dev сервера

### Загрузка на CDN (production):

Замените `VITE_MUSIC_MODULE_URL` в `.env` основного проекта на:

```
https://cdn.mansoni.com/modules/music/music-module.js
```

Загрузите файл `dist/modules/music/music-module.js` на ваш CDN (S3, CloudFront и т.д.).

### Обновление модуля:

1. Измените код в `services/music/`
2. Соберите: `npm run build:modules`
3. Загрузите новый `music-module.js` на CDN
4. При следующем запуске модуля пользователи получат обновление автоматически

## Отладка

### Просмотр установленных модулей (Capacitor):
```js
// В консоли браузера (мобильное приложение)
const modules = await moduleLoader.getInstalledModules();
console.log(modules);
```

### Очистка модулей (для тестов):
```js
await moduleLoader.clearAllModules();
```

### Логи ModuleLoader:
```js
// Включите debug
localStorage.setItem('debug', 'module-loader');
```

## Ограничения текущего шага

- Если Supabase-проект открыт только в read-only режиме, recovery/hardening миграции применить нельзя даже при готовом SQL.
- Без recovery-модуль будет откатываться на demo/fallback в тех местах, где ожидает нормализованные `music_artists/music_albums/...`.
- Remote smoke-test имеет смысл только после применения recovery-моделей и RLS.

## Нативные платформы

### Android (Capacitor):
- Модули хранятся в `/data/data/com.mansoni/files/modules/`
- Размер каждого модуля ограничен свободным местом на устройстве

### iOS:
- Хранение: `Library/Application Support/modules/`
- Ограничение: WKWebView не поддерживает `eval()`, используется Blob URL

## Дальше

1. Применить recovery и hardening миграции в write-capable Supabase-сеансе.
2. Залить/синхронизировать реальный музыкальный каталог, если в проекте ещё нет сидов.
3. Прогнать живой тест через `MusicPage` с реальным Mansoni JWT.

- [ ] Добавить бэкенд `services/music-api` (Express) для аутентификации через Mansoni JWT
- [ ] Интеграция с Spotify Web API для треков
- [ ] Offline-кэширование аудиофайлов
- [ ] Реальные рекомендации через ML
- [ ] Поддержка подписок (Stripe)
- [ ]Multi-account

## ❓ FAQ

**Можно ли использовать без интернета?**  
После первой установки модуль работает оффлайн. Данные (треки, плейлисты) требуют интернет, кроме кэшированных.

**Будет ли модуль в APK?**  
Нет. APKmansoni.apk содержит только загрузчик (ModuleLoader). Модуль скачивается отдельно (~2 МБ).

**Как обновлять модуль?**  
Загрузите новую версию `music-module.js` на CDN. При следующем открытии `/services/music` модуль обновится автоматически.

**Можно ли несколько модулей?**  
Да. Добавляйте в `scripts/build-modules.mjs` новые модули (taxi, editor и т.д.).

## 📄 Лицензия

Часть проекта Mansoni. См. LICENSE в корне.
