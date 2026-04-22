# Navigator iOS App

Нативное iOS приложение для навигации с поддержкой офлайн режима.

## Возможности

- Интерактивная карта с MapKit
- Построение маршрутов (автомобиль, пешком, велосипед, транспорт)
- Turn-by-turn навигация
- Голосовые подсказки (TTS)
- Офлайн карты и тайлы
- Геозоны
- Локальный сервер тайлов

## Структура проекта

```
apps/navigator-ios/
├── Apps/NavigatorApp/
│   ├── NavigatorAppApp.swift    # Entry point
│   ├── SceneDelegate.swift       # Scene lifecycle
│   └── Info.plist               # Permissions
├── Sources/
│   ├── App/
│   │   ├── ContentView.swift
│   │   ├── MapViewRepresentable.swift
│   │   ├── NavigateView.swift
│   │   ├── SearchView.swift
│   │   ├── RouteView.swift
│   │   └── SettingsView.swift
│   └── Services/
│       ├── LocationManager.swift
│       ├── GeofencingService.swift
│       ├── RoutingService.swift
│       ├── NavigationService.swift
│       ├── VoiceService.swift
│       ├── OfflineDataManager.swift
│       └── LocalTileServer.swift
├── Package.swift
└── project.yml
```

## Сборка

### Требования
- Xcode 15+
- iOS 17.0+

### Через Xcode
1. Откройте `project.yml` в Xcode
2. Выберите устройство/симулятор
3. Нажмите Run (Cmd+R)

### Через Tuist
```bash
tuist generate
xcodebuild -project NavigatorApp.xcodeproj -scheme NavigatorApp -configuration Debug
```

## Разрешения

Приложение запрашивает следующие разрешения:
- `NSLocationWhenInUseUsageDescription` - Для навигации
- `NSLocationAlwaysAndWhenInUseUsageDescription` - Для фоновой навигации
- `UIBackgroundModes` - location, audio

## Особенности реализации

### Офлайн режим
- SQLite база данных для тайлов
- Локальный HTTP сервер для раздачи тайлов
- Скачивание регионов для офлайн использования

### Навигация
- Использует MKDirections для построения маршрутов
- Dijkstra алгоритм для офлайн маршрутов
- Turn-by-turn инструкции с голосовыми подсказками

### Голосовые подсказки
- AVSpeechSynthesizer для TTS
- Приоритетная очередь команд
- Русский язык по умолчанию