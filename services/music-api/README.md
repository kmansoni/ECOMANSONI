# Music API

Express API для музыкального модуля Mansoni. Сервис нужен для сценариев, где фронту недостаточно прямого доступа к Supabase через RLS: signed stream URLs, централизованная JWT-проверка, recommendations/search и операции с playlist/likes/downloads через service-role.

## Запуск

```bash
cd services/music-api
npm install
npm run build
node dist/server.js
```

Для разработки можно использовать тот же `.env`, что описан в [services/music-api/.env.example](services/music-api/.env.example).

## Обязательные переменные

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
MANSONI_JWT_SECRET=your_shared_jwt_secret_here
PORT=3080
MANSONI_URL=http://localhost:5173
MUSIC_FRONTEND_URL=http://localhost:3001
```

## Основные маршруты

- `GET /health`
- `GET /api/me`
- `GET /api/tracks`
- `GET /api/tracks/:id`
- `GET /api/stream/:id`
- `GET /api/playlists`
- `POST /api/playlists`
- `POST /api/playlists/:id/tracks`
- `GET /api/likes`
- `POST /api/likes`
- `GET /api/downloads`
- `POST /api/downloads`
- `GET /api/subscription`
- `GET /api/recommendations`
- `GET /api/search`

## Схема базы

API ожидает нормализованную музыкальную схему:

- `music_artists`
- `music_albums`
- `music_tracks`
- `music_playlists`
- `music_playlist_tracks`
- `music_play_history`
- `music_likes`
- `music_subscriptions`
- `music_downloads`

Если в удалённом проекте сохранилась старая плоская схема только с `music_tracks/music_playlists/music_playlist_tracks`, сначала нужно применить recovery SQL из [supabase/migrations/20260421130000_music_remote_schema_recovery.sql](supabase/migrations/20260421130000_music_remote_schema_recovery.sql), затем hardening из [supabase/migrations/20260421120000_music_module_hardening.sql](supabase/migrations/20260421120000_music_module_hardening.sql).