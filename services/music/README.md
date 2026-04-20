# 🎵 Music Module — Mansoni

Динамически загружаемый музыкальный сервис для платформы Mansoni.

## 📁 Структура

```
mansoni/
├── services/
│   └── music/              # Музыкальный фронтенд-модуль (Vite)
│       ├── src/
│       │   ├── pages/      # Страницы: Home, Playlist, Track, Search
│       │   ├── components/ # Компоненты: Player, TrackList, PlaylistCard
│       │   ├── store/      # Zustand store (демо-данные)
│       │   ├── lib/        # Supabase client
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
VITE_SUPABASE_ANON_KEY=your-anon-key
```

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

Откройте **Supabase Dashboard** → **SQL Editor** и выполните:

```sql
-- Вставьте содержимое файла:
supabase/migrations/20250421000000_spotify_schema.sql
```

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

## 📦 Что делает модуль

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

## 🗂️ API

Музыкальный модуль использует **Supabase** напрямую (в будущем через Mansoni Auth).

### Зависимости:
- `@supabase/supabase-js` — для работы с БД
- `zustand` — локальное состояние (queue, currentTrack)
- `lucide-react` — иконки
- `react-router-dom` — роутинг внутри модуля

### Роуты модуля:
- `/` — главная (рекомендации, плейлисты)
- `/playlist/:id` — страница плейлиста
- `/track/:id` — страница трека
- `/search` — поиск

## 🔐 Безопасность

### Миграция включает:
- **RLS** на всех таблицах
- Публичный доступ на чтение для `artists`, `albums`, `tracks`
- Пользователи управляют только своими `playlists`, `history`, `likes`
- **Storage bucket** `music` с политиками:
  - Чтение: аутентифицированные пользователи
  - Запись: service_role
- **Функции**: `record_track_play()`, `get_music_recommendations()`
- **Триггеры**: автообновление `updated_at`

### Аутентификация:
- Модуль получает `window.__MANSONI_TOKEN__` от Mansoni
- Передаёт в Supabase через кастомный header (настраивается в `supabase.ts`)
- RLS использует `auth.uid()` из JWT

## 🛠️ Разработка модуля

### Локальный dev сервер:

```bash
cd services/music
npm run dev  # http://localhost:3001
```

### Добавление новых треков:

В `services/music/src/store/useMusicStore.ts` (временно, пока нет бэкенда):

```ts
playlists: [
  {
    id: '1',
    name: 'Новый плейлист',
    tracks: [
      {
        id: 'new1',
        title: 'Song Title',
        artist: 'Artist',
        album: 'Album',
        duration: 180,
        coverUrl: 'https://...',
        audioUrl: 'https://...',
      },
    ],
  },
]
```

### Подключение к реальному Supabase:

Замените демо-данные в store на реальные запросы:

```ts
import { supabase } from '@/lib/supabase';

// В компоненте:
const { data } = await supabase
  .from('music_tracks')
  .select(`
    id, title, duration_ms,
    music_artists(name),
    music_albums(cover_url)
  `)
  .limit(20);
```

## 📦 Сборка и деплой

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

## 🔧 Отладка

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

## 📱 Нативные платформы

### Android (Capacitor):
- Модули хранятся в `/data/data/com.mansoni/files/modules/`
- Размер каждого модуля ограничен свободным местом на устройстве

### iOS:
- Хранение: `Library/Application Support/modules/`
- Ограничение: WKWebView не поддерживает `eval()`, используется Blob URL

## 🎯 Планы развития

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
