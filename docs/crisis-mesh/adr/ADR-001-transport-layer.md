# ADR-001 — Transport Layer

## Статус
Принято — 2026-04-17.

## Контекст
Crisis-mesh требует peer-to-peer обмен данными без серверной инфраструктуры.
Нужен транспорт, работающий:
- На Android (нативно, с фоновой работой)
- На iOS (нативно)
- На Web (degraded fallback для разработки и тестирования)

## Варианты

### Вариант A: community-плагины
- `@capacitor-community/bluetooth-le` — только BLE, нет Nearby
- `cordova-plugin-nearby-connections` — устаревший, Cordova
- **Отклонено:** ни один не покрывает Nearby Connections + Multipeer

### Вариант B: собственный Capacitor plugin
- TS API в `packages/capacitor-mesh-transport/src/`
- Android: `com.google.android.gms:play-services-nearby` (Nearby Connections API)
- iOS: `MultipeerConnectivity.framework`
- Web: WebRTC DataChannel через Supabase Realtime (signaling only)

### Вариант C: только WebRTC + сервер
- Требует signaling сервер → не работает в offline
- **Отклонено:** противоречит миссии "без инфраструктуры"

## Решение
**Вариант B — собственный плагин.**

## Технические детали

### Android
- Nearby Connections API, strategy: `P2P_CLUSTER`
- Service ID: `app.mansoni.mesh`
- Foreground service с persistent notification (требование Android 14+)
- Permissions runtime: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_ADVERTISE`,
  `NEARBY_WIFI_DEVICES` (API 33+), `ACCESS_FINE_LOCATION` (API < 31 для BLE scan)

### iOS
- `MultipeerConnectivity` — `MCSession`, `MCNearbyServiceAdvertiser`, `MCNearbyServiceBrowser`
- Service type: `mansoni-mesh` (max 15 chars, alphanumeric)
- Info.plist: `NSBluetoothAlwaysUsageDescription`, `NSLocalNetworkUsageDescription`,
  `NSBonjourServices` = `_mansoni-mesh._tcp`
- Background modes: `bluetooth-central`, `bluetooth-peripheral`

### Web fallback
- WebRTC DataChannel
- Signaling: Supabase Realtime Broadcast (channel `crisis-mesh-signaling`)
- НЕ full mesh, только для разработки и emergency-fallback когда есть интернет

### Android ↔ iOS interop
Nearby Connections (Google) и MultipeerConnectivity (Apple) **несовместимы**.
Решение (P1, отложено на после MVP): общий BLE GATT профиль.
Отдельный ADR-006 будет создан после P0.

## Последствия

### Плюсы
- Полный контроль над payload формат
- Не зависим от community-плагинов
- Работает оффлайн

### Минусы
- Нужно поддерживать 3 нативных реализации (Android / iOS / web)
- Android ↔ iOS не работает в P0
- Требуется физическое тестирование на ≥2 устройствах каждой платформы

## Критерии приёмки
- 2 Android устройства обнаруживают друг друга и обмениваются payload ≤4KB за ≤3 сек
- 2 iOS устройства то же
- Web-версия передаёт данные через WebRTC когда оба клиента онлайн
