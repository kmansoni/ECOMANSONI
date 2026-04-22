# AGENTS.md — Инструкции для агентов Kilo

## Проект Navigator (Android навигатор)

- Язык: Kotlin 1.9+, Jetpack Compose
- Min SDK: 24, Target SDK: 34
- Локальная работа: всё работает без сети (offline-first)

### Соблюдать:
- Не использовать сторонние сервисы (Google Maps, MapBox)
- Карта отображается через WebView + offline tiles (MBTiles)
- Маршруты строятся локально (Dijkstra) или через embedded routing API
- Голосевые подсказки через Android TTS

### Структура:
- `ui/` — Compose UI (screens, components)
- `location/` — LocationManager, BackgroundLocationService, GeofenceManager
- `routing/` — LocalRoutingClient, DijkstraRouter, NavigationManager
- `voice/` — VoiceService, VoiceCommandQueue
- `offline/` — TileCacheManager, RegionDownloadManager, LocalDataRepository
- `util/` — вспомогательные классы

### Сборка:
```bash
./gradlew assembleDebug
```

### Запуск приложения:
- Требуются разрешения: ACCESS_FINE_LOCATION, FOREGROUND_SERVICE, POST_NOTIFICATIONS
- Для оффлайн карт: нужно предварительно скачать регионы (Reg. Download Manager)
