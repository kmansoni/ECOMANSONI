# Navigator — Offline навигатор для Android

Full fledged offline navigation app built with Kotlin + Jetpack Compose.

## Tech Stack
- **Kotlin** (100%)
- **Jetpack Compose** для UI
- **FusedLocationProviderClient** для GPS
- **Foreground Service** для фонового слежения
- **Geofencing API** для геозон
- **LocalRoutingClient** (fallback к Dijkstra)
- **Text-to-Speech** для голосовых инструкций
- **Offline tile cache** + регионы

## Architecture

```
app/src/main/java/com/mansoni/navigator/
├── ui/
│   ├── MainActivity.kt           // Entry point, Scaffold + BottomNav
│   ├── theme/Theme.kt            // Material 3 theme
│   ├── screens/
│   │   ├── MapScreen.kt          // Map with markers
│   │   ├── SearchScreen.kt       // POI search
│   │   ├── NavigateScreen.kt     // Active turn-by-turn
│   │   ├── RouteScreen.kt        // Route planning
│   │   └── SettingsScreen.kt     // App settings
│   └── components/
│       ├── MapView.kt            // WebView with offline tiles
│       ├── NavigationPanel.kt    // Instruction panel
│       └── SearchBar.kt
├── location/
│   ├── LocationManager.kt        // FusedLocationProvider wrapper
│   ├── BackgroundLocationService.kt // Foreground service
│   └── GeofenceManager.kt        // GeofencingClient wrapper
├── routing/
│   ├── LocalRoutingClient.kt     // HTTP client for local router
│   ├── DijkstraRouter.kt         // Embedded offline router
│   └── NavigationManager.kt      // Turn-by-turn logic
├── voice/
│   ├── VoiceService.kt           // Android TTS wrapper
│   └── VoiceCommandQueue.kt      // Serial TTS queue
├── offline/
│   ├── TileCacheManager.kt       // MBTiles cache
│   ├── RegionDownloadManager.kt  // Region DL via DownloadManager
│   └── LocalDataRepository.kt    // POI, favorites
└── db/
    └── NavigatorDatabase.kt      // SQLDelight schema (optional)
```

## How it works offline

- **Maps**: External tiles loaded via WebView; supports `file:///android_asset/…` for pre-bundled regions or cached MBTiles.
- **Routing**: Embedded Dijkstra for fallback when local routing server `http://10.0.2.2:8080` is unavailable.
- **POI**: Embedded sample POI + SharedPreferences for favorites.
- **Voice**: Android TTS engine with offline Russian voice pack recommended.

## Local server (optional)

```bash
# Python + osmnx + http.server
cd server
pip install osmnx fastapi
uvicorn routing_api:app --reload
```
API: `GET /route?from=<lat>,<lon>&to=<lat>,<lon>`

## Build

Requirements: Android SDK 34, JDK 17, Gradle 8.2+

```bash
./gradlew assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`

## Features
- Permission handling (Fine/Coarse location, Background location, Foreground service)
- Offline-first mode (all data cached locally)
- Turn-by-turn voice guidance (ru-RU)
- Region download manager (MBTiles)
- Favorites & recent searches
- Night mode (Material 3 dynamic colors)

## License
MIT
