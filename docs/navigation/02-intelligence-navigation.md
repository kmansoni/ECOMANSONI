# Навигационный модуль — Part 2: Traffic Intelligence, Map Matching & Navigation Engine

> **Версия:** 1.0  
> **Дата:** 2026-03-06  
> **Язык:** Русский  
> **Статус:** Draft  
> **Модуль:** Navigation Engine  
> **Часть:** 2 из 5  
> **Связанные документы:**  
> — [01-core-engines.md](./01-core-engines.md) — Part 1: Core Engines (Map Data, Tile Rendering, Routing)  
> — [03-search-geocoding.md](./03-search-geocoding.md) — Part 3: Search, Geocoding & POI  
> — [04-offline-mobile.md](./04-offline-mobile.md) — Part 4: Offline Mode & Mobile SDK  
> — [05-infrastructure-ops.md](./05-infrastructure-ops.md) — Part 5: Infrastructure, Scaling & DevOps  

---

## Содержание

5. [Раздел 5: Traffic Intelligence Engine](#раздел-5-traffic-intelligence-engine)
   - 5.1 [Архитектура системы трафика](#51-архитектура-системы-трафика)
   - 5.2 [GPS Telemetry Collection](#52-gps-telemetry-collection)
   - 5.3 [Map Matching Pipeline](#53-map-matching-pipeline)
   - 5.4 [Speed Estimation](#54-speed-estimation)
   - 5.5 [Traffic Segment Storage](#55-traffic-segment-storage)
   - 5.6 [Traffic ML Prediction](#56-traffic-ml-prediction)
   - 5.7 [Traffic Score — аналог Яндекс Пробок](#57-traffic-score--аналог-яндекс-пробок)
   - 5.8 [Traffic Events](#58-traffic-events)
   - 5.9 [Kafka Architecture для трафика](#59-kafka-architecture-для-трафика)
6. [Раздел 6: Map Matching Engine](#раздел-6-map-matching-engine)
   - 6.1 [Online vs Offline Map Matching](#61-online-vs-offline-map-matching)
   - 6.2 [Valhalla Meili API](#62-valhalla-meili-api)
   - 6.3 [Map Matching Accuracy Metrics](#63-map-matching-accuracy-metrics)
7. [Раздел 7: Navigation Engine](#раздел-7-navigation-engine)
   - 7.1 [Архитектура Navigation Engine](#71-архитектура-navigation-engine)
   - 7.2 [Route Following](#72-route-following)
   - 7.3 [Maneuver Detection](#73-maneuver-detection)
   - 7.4 [Instruction Generation](#74-instruction-generation)
   - 7.5 [Lane Guidance](#75-lane-guidance)
   - 7.6 [Dynamic Re-routing](#76-dynamic-re-routing)
   - 7.7 [ETA Calculation](#77-eta-calculation)
   - 7.8 [Speed Alerts](#78-speed-alerts)
   - 7.9 [Navigation State Machine](#79-navigation-state-machine)
   - 7.10 [Navigation Session](#710-navigation-session)
   - 7.11 [Real-Time Position Tracking Protocol](#711-real-time-position-tracking-protocol)
   - 7.12 [Навигация для разных режимов](#712-навигация-для-разных-режимов)

---

## Раздел 5: Traffic Intelligence Engine

Система анализа трафика — ядро навигационного модуля, обеспечивающее real-time информацию о дорожной обстановке, прогнозирование заторов и динамическую корректировку маршрутов. Архитектура спроектирована по аналогии с Яндекс.Пробки / Google Live Traffic, с возможностью обработки до 10M активных устройств.

### 5.1 Архитектура системы трафика

#### 5.1.1 Полная Pipeline-диаграмма

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                           TRAFFIC INTELLIGENCE ENGINE — FULL PIPELINE                        │
│                                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────────┐    │
│  │                              DATA COLLECTION LAYER                                    │    │
│  │                                                                                       │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │    │
│  │  │ Mobile Apps  │  │ Driver Apps │  │ IoT Sensors │  │ Fleet APIs  │  │ 3rd Party │  │    │
│  │  │ GPS traces  │  │ GPS traces  │  │ Loop detect │  │ Taxi, Bus   │  │ Waze, TH  │  │    │
│  │  │ 1-5s freq   │  │ 1s freq     │  │ Count+Speed │  │ GTFS-RT     │  │ TMC feed  │  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘  │    │
│  │         │                │                │                │               │          │    │
│  │         └────────┬───────┴────────┬───────┴────────┬───────┴───────┬───────┘          │    │
│  │                  │                │                │               │                   │    │
│  │         ┌────────▼────────────────▼────────────────▼───────────────▼──────────┐       │    │
│  │         │                 GPS COLLECTOR SERVICE                                │       │    │
│  │         │  WebSocket / gRPC / HTTP Batch Endpoints                            │       │    │
│  │         │  Rate Limiter: 10K msg/s per instance, 16 instances                 │       │    │
│  │         │  Anti-Spoofing: velocity check, teleport detection                  │       │    │
│  │         │  Privacy: rotating device_id, k-anonymity                           │       │    │
│  │         └────────────────────────────┬────────────────────────────────────────┘       │    │
│  │                                      │                                                │    │
│  │                           ┌──────────▼──────────┐                                     │    │
│  │                           │  Kafka: gps-raw      │                                     │    │
│  │                           │  64 partitions       │                                     │    │
│  │                           │  ~500K msg/s         │                                     │    │
│  │                           │  Retention: 24h      │                                     │    │
│  │                           └──────────┬──────────┘                                     │    │
│  └──────────────────────────────────────┼────────────────────────────────────────────────┘    │
│                                         │                                                     │
│  ┌──────────────────────────────────────┼────────────────────────────────────────────────┐    │
│  │                           PROCESSING LAYER                                            │    │
│  │                                                                                       │    │
│  │         ┌────────────────────────────▼────────────────────────────────────────┐       │    │
│  │         │                    MAP MATCHER SERVICE                               │       │    │
│  │         │  Valhalla Meili — HMM + Viterbi Algorithm                           │       │    │
│  │         │  8 instances, ~60K matches/s                                        │       │    │
│  │         │  Snap GPS → road segment_id + distance_along_segment               │       │    │
│  │         └────────────────────────────┬────────────────────────────────────────┘       │    │
│  │                                      │                                                │    │
│  │                           ┌──────────▼──────────┐                                     │    │
│  │                           │  Kafka: gps-matched  │                                     │    │
│  │                           │  64 partitions       │                                     │    │
│  │                           │  ~400K msg/s         │                                     │    │
│  │                           │  Retention: 48h      │                                     │    │
│  │                           └──────────┬──────────┘                                     │    │
│  │                                      │                                                │    │
│  │         ┌────────────────────────────▼────────────────────────────────────────┐       │    │
│  │         │                  SPEED ESTIMATOR SERVICE                             │       │    │
│  │         │  Aggregation window: 15-60s rolling                                 │       │    │
│  │         │  Per segment: median speed, sample count, confidence                │       │    │
│  │         │  Outlier filter: IQR + z-score                                      │       │    │
│  │         │  12 instances, ~200K segments/s                                     │       │    │
│  │         └────────────────────────────┬────────────────────────────────────────┘       │    │
│  │                                      │                                                │    │
│  │                    ┌─────────────────┼─────────────────┐                              │    │
│  │                    │                 │                  │                              │    │
│  │         ┌──────────▼──────┐  ┌──────▼──────────┐  ┌───▼──────────────┐               │    │
│  │         │ Kafka:          │  │ Redis Cluster   │  │ ClickHouse       │               │    │
│  │         │ traffic-speed   │  │ Real-time cache │  │ traffic_history  │               │    │
│  │         │ 32 partitions   │  │ TTL: 120s       │  │ 365 days TTL    │               │    │
│  │         │ Retention: 7d   │  │ Pub/Sub push    │  │ ReplicatedMerge  │               │    │
│  │         └──────────┬──────┘  └─────────────────┘  └──────────────────┘               │    │
│  │                    │                                                                   │    │
│  └────────────────────┼─────────────────────────────────────────────────────────────────┘    │
│                       │                                                                      │
│  ┌────────────────────┼─────────────────────────────────────────────────────────────────┐    │
│  │                    │               ML / PREDICTION LAYER                               │    │
│  │                    │                                                                   │    │
│  │         ┌──────────▼──────────────────────────────────────────────────────┐           │    │
│  │         │                    ML PREDICTOR SERVICE                          │           │    │
│  │         │  LSTM / Temporal Fusion Transformer                             │           │    │
│  │         │  Input: current speed + historical + weather + events           │           │    │
│  │         │  Output: predicted speed at t+5m, t+15m, t+30m, t+1h           │           │    │
│  │         │  4 GPU instances (NVIDIA T4), batch inference                   │           │    │
│  │         │  MAPE target: < 15% at 15min horizon                           │           │    │
│  │         └────────────────────────────┬────────────────────────────────────┘           │    │
│  │                                      │                                                │    │
│  │                           ┌──────────▼──────────┐                                     │    │
│  │                           │  Kafka:              │                                     │    │
│  │                           │  traffic-predictions │                                     │    │
│  │                           │  32 partitions       │                                     │    │
│  │                           │  Retention: 24h      │                                     │    │
│  │                           └──────────┬──────────┘                                     │    │
│  └──────────────────────────────────────┼────────────────────────────────────────────────┘    │
│                                         │                                                     │
│  ┌──────────────────────────────────────┼────────────────────────────────────────────────┐    │
│  │                           PUBLISHING LAYER                                            │    │
│  │                                                                                       │    │
│  │         ┌────────────────────────────▼────────────────────────────────────────┐       │    │
│  │         │                   TRAFFIC PUBLISHER SERVICE                          │       │    │
│  │         │  Merge: live speed + predictions + events                           │       │    │
│  │         │  Output: traffic overlay tiles (MVT), REST API, WebSocket stream    │       │    │
│  │         │  Score calculator: regional traffic score 1-10                      │       │    │
│  │         │  8 instances, CDN-backed                                            │       │    │
│  │         └────────────────────────────┬────────────────────────────────────────┘       │    │
│  │                                      │                                                │    │
│  │              ┌───────────────────────┼───────────────────────┐                        │    │
│  │              │                       │                       │                        │    │
│  │     ┌────────▼──────┐  ┌────────────▼──────────┐  ┌────────▼──────────┐              │    │
│  │     │ Traffic Tiles │  │ REST API              │  │ WebSocket Push   │              │    │
│  │     │ MVT z10-z16   │  │ /api/v1/traffic/*     │  │ Real-time stream │              │    │
│  │     │ CDN: 30s TTL  │  │ JSON responses        │  │ Per-region rooms │              │    │
│  │     └───────────────┘  └───────────────────────┘  └──────────────────┘              │    │
│  └──────────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 5.1.2 Компоненты и их ответственность

| Компонент | Технология | Instances | Throughput | Latency P99 |
|-----------|-----------|-----------|------------|-------------|
| GPS Collector | Go + gRPC/WS | 16 | 500K msg/s | 5ms |
| Map Matcher | Valhalla Meili (C++) | 8 | 60K match/s | 15ms |
| Speed Estimator | Rust + Kafka Streams | 12 | 200K seg/s | 10ms |
| ML Predictor | Python + PyTorch | 4 (GPU) | 50K pred/s | 50ms |
| Traffic Publisher | Go + Redis | 8 | 100K pub/s | 8ms |
| Event Detector | Rust | 4 | 20K evt/s | 20ms |

#### 5.1.3 Потоки данных — размер сообщений

| Kafka Topic | Avg Message Size | Messages/s | Bandwidth |
|------------|-----------------|------------|-----------|
| gps-raw | 128 bytes | 500K | 61 MB/s |
| gps-matched | 196 bytes | 400K | 75 MB/s |
| traffic-speed | 64 bytes | 200K | 12 MB/s |
| traffic-events | 512 bytes | 1K | 0.5 MB/s |
| traffic-predictions | 256 bytes | 50K | 12 MB/s |

---

### 5.2 GPS Telemetry Collection

#### 5.2.1 Формат GPS-точки

Каждая GPS-точка содержит полный набор телеметрических данных:

```protobuf
// Proto3 schema: gps_telemetry.proto
syntax = "proto3";

package ecomansoni.traffic.v1;

message GpsPoint {
  // Идентификация
  string device_id       = 1;   // Анонимный rotating ID, 32 hex chars
  string session_id      = 2;   // ID навигационной сессии, UUID v4
  
  // Координаты
  double latitude        = 3;   // WGS84, -90..+90, 7 decimal places
  double longitude       = 4;   // WGS84, -180..+180, 7 decimal places
  float  altitude        = 5;   // Метры над уровнем моря, -500..+20000
  
  // Точность
  float  horizontal_accuracy = 6;  // Метры (CEP95), 1.0..100.0
  float  vertical_accuracy   = 7;  // Метры, 1.0..500.0
  
  // Движение
  float  speed           = 8;   // м/с, 0.0..100.0 (0..360 km/h)
  float  speed_accuracy  = 9;   // м/с, погрешность скорости
  float  bearing         = 10;  // Градусы от севера, 0.0..359.99
  float  bearing_accuracy = 11; // Градусы, погрешность направления
  
  // Время
  int64  timestamp_ms    = 12;  // Unix timestamp в миллисекундах
  int64  device_time_ms  = 13;  // Локальное время устройства
  
  // Метаданные устройства
  GpsProvider provider   = 14;  // Источник GPS
  float  battery_level   = 15;  // 0.0..1.0
  BatteryState battery_state = 16;
  NetworkType  network_type  = 17;
  
  // Контекст навигации
  NavigationMode nav_mode = 18;
  bool   is_foreground    = 19; // Приложение на переднем плане
}

enum GpsProvider {
  GPS_PROVIDER_UNKNOWN  = 0;
  GPS_PROVIDER_GPS      = 1;  // Спутниковый GPS
  GPS_PROVIDER_GLONASS  = 2;  // ГЛОНАСС
  GPS_PROVIDER_NETWORK  = 3;  // Cell tower / Wi-Fi
  GPS_PROVIDER_FUSED    = 4;  // Google Fused Location / Apple CLLocation
  GPS_PROVIDER_PASSIVE  = 5;  // Пассивный (от других приложений)
}

enum BatteryState {
  BATTERY_UNKNOWN    = 0;
  BATTERY_CHARGING   = 1;
  BATTERY_DISCHARGING = 2;
  BATTERY_FULL       = 3;
}

enum NetworkType {
  NETWORK_UNKNOWN = 0;
  NETWORK_WIFI    = 1;
  NETWORK_4G      = 2;
  NETWORK_5G      = 3;
  NETWORK_3G      = 4;
  NETWORK_2G      = 5;
  NETWORK_NONE    = 6;
}

enum NavigationMode {
  NAV_MODE_UNKNOWN    = 0;
  NAV_MODE_CAR        = 1;
  NAV_MODE_TRUCK      = 2;
  NAV_MODE_PEDESTRIAN = 3;
  NAV_MODE_BICYCLE    = 4;
  NAV_MODE_TRANSIT    = 5;
}

// Батчированная отправка
message GpsBatch {
  string device_id       = 1;
  string session_id      = 2;
  repeated GpsPoint points = 3; // До 60 точек в батче
  int32  app_version     = 4;   // Версия клиентского приложения
  string os_version      = 5;   // "Android 14" / "iOS 17.4"
  bytes  signature        = 6;   // HMAC-SHA256 для anti-spoofing
}
```

**Размер сообщения:**
- Одна GpsPoint: ~90 bytes (protobuf)
- GpsBatch (15 точек): ~1.4 KB (protobuf) → ~1.1 KB (с LZ4 compression)

#### 5.2.2 Протоколы отправки

**WebSocket (основной для активной навигации):**
```
wss://telemetry.nav.ecomansoni.ru/v1/gps

Connection lifecycle:
1. Client → Server: WebSocket Upgrade + JWT token в header
2. Server → Client: { "status": "connected", "device_id": "anon_xxx" }
3. Client → Server: Binary protobuf GpsBatch каждые 5-15 секунд
4. Server → Client: ACK + server_timestamp (для clock sync)
5. Heartbeat: Client ping каждые 30s, Server pong

Binary frame format:
┌──────────┬──────────┬─────────────────────┐
│ Type (1B)│ Len (4B) │ Payload (protobuf)  │
│ 0x01=GPS │ uint32LE │ GpsBatch bytes      │
│ 0x02=HB  │          │                     │
│ 0x03=ACK │          │                     │
└──────────┴──────────┴─────────────────────┘
```

**gRPC (для driver apps с высокой частотой):**
```protobuf
service TelemetryService {
  // Streaming: клиент шлёт поток GPS, сервер шлёт ACK
  rpc StreamGps(stream GpsBatch) returns (stream GpsAck);
  
  // Unary: одиночная отправка batch
  rpc SendBatch(GpsBatch) returns (GpsAck);
}

message GpsAck {
  int64  server_timestamp_ms = 1;
  int32  accepted_count      = 2;
  int32  rejected_count      = 3;
  string rejection_reason    = 4;  // "rate_limit" | "spoofing" | "invalid"
}
```

**HTTP Batch (fallback, когда WebSocket/gRPC недоступен):**
```
POST /api/v1/telemetry/batch
Content-Type: application/x-protobuf
X-Device-ID: anon_abc123def456
X-Session-ID: 550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <jwt>
Content-Encoding: lz4

Body: protobuf-encoded GpsBatch
```

#### 5.2.3 Частота отправки (Adaptive Frequency)

```
┌──────────────────────┬──────────────────┬──────────────────┐
│ Состояние            │ Частота GPS      │ Батч интервал    │
├──────────────────────┼──────────────────┼──────────────────┤
│ Активная навигация   │ 1 сек (1 Hz)     │ 5 сек (5 точек)  │
│ Движение > 30 km/h   │ 1 сек (1 Hz)     │ 5 сек (5 точек)  │
│ Движение 5-30 km/h   │ 2 сек (0.5 Hz)   │ 10 сек (5 точек) │
│ Движение < 5 km/h    │ 5 сек (0.2 Hz)   │ 15 сек (3 точки) │
│ Остановка (0 km/h)   │ 30 сек           │ 60 сек (2 точки) │
│ Фон (no navigation)  │ 60 сек           │ 120 сек          │
│ Батарея < 15%        │ ×2 интервал      │ ×2               │
│ Батарея < 5%         │ Отключение       │ —                │
└──────────────────────┴──────────────────┴──────────────────┘
```

**Алгоритм адаптивной частоты:**
```
function calculateGpsInterval(state):
    base_interval = 1.0  // секунды
    
    if state.speed < 1.4:        // < 5 km/h — стоим
        base_interval = 30.0
    elif state.speed < 8.3:      // < 30 km/h — медленно
        base_interval = 5.0
    elif state.speed < 16.7:     // < 60 km/h — город
        base_interval = 2.0
    else:                         // > 60 km/h — шоссе
        base_interval = 1.0
    
    // Уменьшить интервал перед маневром
    if state.distance_to_next_maneuver < 500:
        base_interval = min(base_interval, 1.0)
    
    // Увеличить при низком заряде
    if state.battery < 0.15:
        base_interval *= 2.0
    if state.battery < 0.05:
        return DISABLED
    
    // Увеличить в фоне
    if not state.is_foreground:
        base_interval = max(base_interval, 60.0)
    
    return base_interval
```

#### 5.2.4 Privacy: Анонимизация данных

**Rotating Device ID:**
```
Алгоритм:
1. При первом запуске генерируется master_secret (256-bit random)
2. Каждые 24 часа (в 00:00 UTC):
   device_id = HMAC-SHA256(master_secret, date_string)[:32]
   Пример: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
3. Сервер НЕ МОЖЕТ связать device_id разных дней
4. При удалении приложения — master_secret уничтожается

Дополнительные меры:
- k-anonymity: не публикуем данные сегмента с < 5 уникальных devices
- Spatial cloaking: округление координат до 11м (5 decimal places) в логах
- Temporal cloaking: ±30 секунд рандомизация timestamp в analytics
- GPS traces НЕ хранятся после map matching (только segment_id + speed)
- GDPR: пользователь может opt-out из traffic contribution
```

#### 5.2.5 Объём данных

```
┌──────────────────┬────────────────┬────────────────┬────────────────┐
│ Метрика          │ 100K devices   │ 1M devices     │ 10M devices    │
├──────────────────┼────────────────┼────────────────┼────────────────┤
│ GPS points/sec   │ 50K            │ 500K           │ 5M             │
│ Bandwidth (raw)  │ 4.3 MB/s       │ 43 MB/s        │ 430 MB/s       │
│ Bandwidth (lz4)  │ 2.5 MB/s       │ 25 MB/s        │ 250 MB/s       │
│ Kafka gps-raw    │ 4.3 GB/hour    │ 43 GB/hour     │ 430 GB/hour    │
│ Daily raw volume │ 103 GB         │ 1.03 TB        │ 10.3 TB        │
│ After matching   │ 35 GB/day      │ 350 GB/day     │ 3.5 TB/day     │
│ ClickHouse/day   │ 8 GB/day       │ 80 GB/day      │ 800 GB/day     │
│ Kafka brokers    │ 3              │ 9              │ 27             │
│ Map Matcher inst │ 2              │ 8              │ 24             │
│ Speed Est. inst  │ 3              │ 12             │ 36             │
└──────────────────┴────────────────┴────────────────┴────────────────┘
```

#### 5.2.6 Rate Limiting и Anti-Spoofing

**Rate Limiting:**
```
Per-device limits:
- Max 2 GPS points/second (защита от flood)
- Max 120 points/minute
- Max 5000 points/hour
- Max batch size: 60 points

Per-IP limits:
- Max 1000 devices/IP (NAT protection)
- Max 100K points/minute/IP

Глобальные limits:
- Max 600K msg/s на кластер (с headroom 20%)
- Circuit breaker: при > 80% capacity → shed low-priority traffic
- Priority: active_navigation > foreground > background
```

**Anti-Spoofing Detection:**
```
Алгоритм обнаружения спуфинга:

1. Velocity Check:
   distance = haversine(prev_point, curr_point)
   time_diff = curr_point.timestamp - prev_point.timestamp
   implied_speed = distance / time_diff
   
   if implied_speed > 83.3 m/s (300 km/h для авто):
       flag = TELEPORT_DETECTED
       action = DROP_POINT
   
   if implied_speed > 340 m/s (скорость звука):
       flag = SPOOFING_CERTAIN
       action = BAN_DEVICE_24H

2. Acceleration Check:
   acceleration = |curr_speed - prev_speed| / time_diff
   if acceleration > 15 m/s² (невозможно для авто):
       flag = IMPOSSIBLE_ACCELERATION
       action = DROP_POINT

3. Location Consistency:
   if point.altitude < -500 or point.altitude > 9000:
       flag = INVALID_ALTITUDE
       action = DROP_POINT
   
   if point on ocean (> 10km from nearest land):
       flag = OCEAN_POINT
       action = DROP_POINT

4. Device Pattern Analysis:
   if device sends from > 3 countries in 1 hour:
       flag = MULTI_COUNTRY_SPOOFING
       action = BAN_DEVICE_7D

5. Signature Verification:
   expected_sig = HMAC-SHA256(device_secret, batch_payload)
   if batch.signature != expected_sig:
       flag = INVALID_SIGNATURE
       action = REJECT_BATCH

Scoring:
  spoofing_score = Σ(flag_weights)
  if spoofing_score > 0.7:
      quarantine_device(device_id, duration=24h)
      exclude from traffic aggregation
```

---

### 5.3 Map Matching Pipeline

Map Matching — процесс привязки «шумных» GPS-координат к реальным дорожным сегментам. Это критический этап, от которого зависит качество всех downstream-процессов: расчёт скорости, определение заторов, ETA.

> **Связь с Part 1:** дорожные сегменты берутся из PostGIS таблицы `road_segments` (см. [01-core-engines.md](./01-core-engines.md), раздел 2.2).

#### 5.3.1 Hidden Markov Model (HMM)

Математическая основа map matching — Hidden Markov Model, где:
- **Hidden states** (S): дорожные сегменты из графа дорог
- **Observations** (Z): GPS-точки с координатами и погрешностью
- **Задача**: найти наиболее вероятную последовательность сегментов

```
GPS Observation:  z₁ ──── z₂ ──── z₃ ──── z₄ ──── z₅ ──── z₆
                   │        │        │        │        │        │
                   ▼        ▼        ▼        ▼        ▼        ▼
                 ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐
Emission P:      │P(z|r)│  │P(z|r)│  │P(z|r)│  │P(z|r)│  │P(z|r)│  │P(z|r)│
                 └──┬─┘  └──┬─┘  └──┬─┘  └──┬─┘  └──┬─┘  └──┬─┘
                    ▼        ▼        ▼        ▼        ▼        ▼
Hidden States:    r₁₁      r₂₁      r₃₁      r₄₁      r₅₁      r₆₁
(candidates)      r₁₂      r₂₂      r₃₂      r₄₂      r₅₂      r₆₂
                  r₁₃      r₂₃      r₃₃      r₄₃      r₅₃      r₆₃
                    │        │        │        │        │
                    └──Transition P(rᵢ→rⱼ)───┘
```

**Emission Probability (вероятность наблюдения):**

Вероятность того, что GPS-точка `z` была получена, если реальное положение — сегмент `r`:

```
P(zₜ | rᵢ) = ────────────────1──────────────── × exp( -d(zₜ, rᵢ)² )
               √(2π × σ_z²)                         ─────────────
                                                       2 × σ_z²

где:
  d(zₜ, rᵢ) = перпендикулярное расстояние от GPS-точки zₜ до сегмента rᵢ (метры)
  σ_z       = стандартное отклонение GPS (зависит от среды):
              σ_z = 4.07м   — urban (город, multipath)
              σ_z = 2.50м   — suburban (пригород)
              σ_z = 1.50м   — rural/highway (открытая местность)
              σ_z = 8.00м   — dense urban (каньон из зданий)
              σ_z = accuracy_from_device, если доступно
```

**Пример расчёта Emission Probability:**
```
GPS-точка: accuracy = 5.0м
Кандидат r₁: расстояние d = 3.2м
Кандидат r₂: расстояние d = 12.5м

σ_z = max(4.07, accuracy * 0.8) = max(4.07, 4.0) = 4.07

P(z|r₁) = (1/√(2π×4.07²)) × exp(-3.2²/(2×4.07²))
         = (1/√(104.17))    × exp(-10.24/33.13)
         = 0.098            × exp(-0.309)
         = 0.098            × 0.734
         = 0.0719

P(z|r₂) = (1/√(2π×4.07²)) × exp(-12.5²/(2×4.07²))
         = 0.098            × exp(-156.25/33.13)
         = 0.098            × exp(-4.716)
         = 0.098            × 0.00893
         = 0.000875

→ r₁ в 82 раза более вероятен, чем r₂
```

**Transition Probability (вероятность перехода):**

Вероятность перехода с сегмента `rᵢ` на сегмент `rⱼ`:

```
P(rᵢ → rⱼ) = ──1── × exp( -|d_route(rᵢ, rⱼ) - d_gc(zᵢ, zⱼ)| )
               β                    ─────────────────────────────
                                                  β

где:
  d_route(rᵢ, rⱼ) = кратчайшее расстояние по дорожному графу между rᵢ и rⱼ (метры)
  d_gc(zᵢ, zⱼ)    = great circle distance между GPS-точками zᵢ и zⱼ (метры)
  β                = параметр нормализации:
                     β = 2.0м   — default (эмпирически оптимально)
                     β = 3.0м   — для low-accuracy GPS
                     β = 1.5м   — для high-accuracy GPS (RTK)

Логика:
  Если d_route ≈ d_gc → переход вероятен (прямолинейное движение)
  Если d_route >> d_gc → переход маловероятен (объезд, невозможный маршрут)
  Если d_route << d_gc → переход маловероятен (GPS jump)
```

**Пример расчёта Transition Probability:**
```
GPS-точки: z₁ → z₂, great circle distance = 120м
Кандидат r₁ → r₃: route distance = 125м  →  |125 - 120| = 5м
Кандидат r₁ → r₄: route distance = 340м  →  |340 - 120| = 220м

β = 2.0

P(r₁→r₃) = (1/2.0) × exp(-5/2.0)   = 0.5 × exp(-2.5)  = 0.5 × 0.0821 = 0.0410
P(r₁→r₄) = (1/2.0) × exp(-220/2.0)  = 0.5 × exp(-110)  ≈ 0  (практически невозможно)

→ r₃ однозначно выигрывает
```

#### 5.3.2 Viterbi Algorithm

Алгоритм Витерби находит наиболее вероятную последовательность скрытых состояний:

```
VITERBI MAP MATCHING ALGORITHM
==============================

Input:
  Z = [z₁, z₂, ..., zT]           // T GPS-точек
  G = road graph                    // дорожный граф
  σ_z = GPS accuracy parameter
  β = transition parameter

Output:
  R* = [r*₁, r*₂, ..., r*T]       // оптимальная последовательность сегментов

Pseudocode:
─────────────────────────────────────────────────────

function viterbi_map_match(Z, G, σ_z, β):
    T = len(Z)
    
    // Step 1: Инициализация — найти кандидатов для первой точки
    candidates[1] = find_nearby_segments(G, z₁, search_radius=50m)
    N₁ = len(candidates[1])
    
    for i in 1..N₁:
        δ[1][i] = log(P_emission(z₁, candidates[1][i], σ_z))
        ψ[1][i] = NULL  // нет предшественника
    
    // Step 2: Рекурсия — для каждой следующей GPS-точки
    for t in 2..T:
        candidates[t] = find_nearby_segments(G, zₜ, search_radius=50m)
        Nₜ = len(candidates[t])
        
        for j in 1..Nₜ:
            // Emission probability для кандидата j
            log_emit = log(P_emission(zₜ, candidates[t][j], σ_z))
            
            // Найти лучший предшественник
            best_prev = -∞
            best_prev_idx = -1
            
            for i in 1..N_{t-1}:
                // Transition probability
                d_route = shortest_path_distance(
                    candidates[t-1][i], candidates[t][j], G
                )
                d_gc = great_circle_distance(z_{t-1}, zₜ)
                log_trans = log(P_transition(d_route, d_gc, β))
                
                score = δ[t-1][i] + log_trans
                
                if score > best_prev:
                    best_prev = score
                    best_prev_idx = i
            
            δ[t][j] = best_prev + log_emit
            ψ[t][j] = best_prev_idx
    
    // Step 3: Backtracking — восстановление пути
    // Найти лучший конечный state
    best_final = argmax_j(δ[T][j])
    
    R* = [candidates[T][best_final]]
    current = best_final
    
    for t in T-1..1 (reverse):
        current = ψ[t+1][current]
        R*.prepend(candidates[t][current])
    
    return R*

// Вспомогательные функции

function find_nearby_segments(G, z, search_radius):
    // R-tree spatial index query (см. Part 1, раздел 2.4)
    // PostGIS: ST_DWithin(segment.geom, ST_Point(z.lon, z.lat), search_radius)
    // Возвращает до max_candidates=10 ближайших сегментов
    return G.spatial_index.query_radius(z.lat, z.lon, search_radius, limit=10)

function P_emission(z, r, σ):
    d = perpendicular_distance(z, r)
    return (1.0 / sqrt(2 * π * σ²)) * exp(-d² / (2 * σ²))

function P_transition(d_route, d_gc, β):
    return (1.0 / β) * exp(-abs(d_route - d_gc) / β)

function perpendicular_distance(point, segment):
    // Проекция точки на отрезок (line segment)
    A = segment.start
    B = segment.end
    P = point
    
    AB = B - A
    AP = P - A
    t = dot(AP, AB) / dot(AB, AB)
    t = clamp(t, 0.0, 1.0)
    
    projection = A + t * AB
    return haversine_distance(P, projection)
```

**Сложность алгоритма:**
```
Time:    O(T × N² × R)
         T = количество GPS-точек (trace length)
         N = max кандидатов на точку (≤ 10)
         R = время shortest_path query (O(log V) с CH graph)
         
         Итого: O(T × 100 × log V)
         Для trace 100 точек, graph 10M nodes:
         ≈ 100 × 100 × 23 = 230K операций → ~2ms

Space:   O(T × N)
         100 × 10 = 1000 записей → ~8 KB

Throughput:
```
| Конфигурация                     | GPS-traces/sec | Latency p50 | Latency p99 |
|----------------------------------|----------------|-------------|-------------|
| 1 worker, 1 CPU core             | 420            | 2.1 ms      | 8.4 ms      |
| 8 workers, 8 CPU cores           | 3 200          | 2.3 ms      | 9.1 ms      |
| 32 workers, 32 CPU cores         | 11 500         | 2.8 ms      | 12 ms       |
| 32 workers + CH graph preload    | 14 200         | 1.9 ms      | 7.6 ms      |
| GPU-accelerated (CUDA batch)     | 48 000         | 0.8 ms      | 3.2 ms      |
```

**Ограничения Viterbi map matching:**
- При GPS-gap > 60 секунд → принудительный сброс HMM, новая цепь с cold start
- При σ > 30 м (urban canyon, тоннель) → emission probability коллапсирует, fallback на dead reckoning
- При candidate_count = 0 → сегмент помечается `unmatched`, пропускается в speed estimation
- Максимальная длина trace без сброса: 500 GPS-точек (~8 мин при 1 Hz)

---

## 5.4 Speed Estimation

### 5.4.1 Aggregation Pipeline

После map matching каждая GPS-точка `z_t` прикреплена к road segment `r_i`. Speed estimation агрегирует скорости по сегменту через rolling window.

**Схема pipeline:**
```
GPS Stream (1 Hz per probe)
        │
        ▼
Map Matching Worker
        │
        ▼  matched_point{segment_id, lat, lon, speed_raw, ts, accuracy}
        │
        ▼
Kafka topic: matched-gps  (partitioned by segment_id % 1024)
        │
        ▼
Speed Aggregation Worker (stateful, per-segment)
        │
  ┌─────┴──────────────────────────────────────────────┐
  │  Rolling Window State (in-memory per segment)       │
  │  ┌────────────────────────────────────────────────┐ │
  │  │ window_size = 60s (configurable 15s–300s)      │ │
  │  │ samples: deque[(ts, speed_raw, accuracy)]      │ │
  │  │ eviction: ts < now - window_size               │ │
  │  └────────────────────────────────────────────────┘ │
  └─────────────────────────────────────────────────────┘
        │
        ▼
  [on every NEW sample OR every 15s timer tick]
  Compute:
    speeds = [s for (ts, s, acc) in window if acc < 50m]
    if len(speeds) < 3: skip (insufficient data)
    
    median_speed = percentile(speeds, 50)
    q1 = percentile(speeds, 25)
    q3 = percentile(speeds, 75)
    iqr = q3 - q1
    
    # IQR-фильтрация выбросов (GPS glitches, teleportation)
    filtered = [s for s in speeds if q1 - 1.5*iqr <= s <= q3 + 1.5*iqr]
    
    mean_speed = mean(filtered)
    std_speed  = std(filtered)
    sample_count = len(filtered)
        │
        ▼
  SpeedReading{
    segment_id, ts_bucket (60s granularity),
    mean_speed, median_speed, std_speed,
    sample_count, min_speed, max_speed,
    quality_score
  }
        │
        ▼
Redis HSET + ClickHouse INSERT (async batch)
```

**Параметры rolling window:**

| Тип дороги     | window_size | min_samples | Обоснование                       |
|----------------|-------------|-------------|-----------------------------------|
| Motorway (4+)  | 60 s        | 5           | Высокая probe density             |
| Urban arterial | 45 s        | 4           | Средняя probe density             |
| Residential    | 120 s       | 3           | Низкая probe density              |
| Highway ramp   | 30 s        | 3           | Короткий сегмент, быстрые изменения |
| Tunnel         | 300 s       | 2           | GPS degraded, экстраполяция       |

**Pseudocode агрегации с IQR:**
```python
def compute_segment_speed(window: deque, now: float) -> Optional[SpeedReading]:
    # Evict stale samples
    while window and (now - window[0].ts) > WINDOW_SIZE_S:
        window.popleft()
    
    # Filter by GPS accuracy
    valid = [s for s in window if s.accuracy_m < 50.0 and s.speed_raw >= 0]
    
    if len(valid) < MIN_SAMPLES:
        return None  # недостаточно данных
    
    speeds = np.array([s.speed_raw for s in valid])
    
    # IQR outlier removal
    q1, q3 = np.percentile(speeds, [25, 75])
    iqr = q3 - q1
    mask = (speeds >= q1 - 1.5 * iqr) & (speeds <= q3 + 1.5 * iqr)
    filtered = speeds[mask]
    
    if len(filtered) < MIN_SAMPLES:
        filtered = speeds  # fallback: no filtering if too few points
    
    return SpeedReading(
        segment_id=window[0].segment_id,
        ts_bucket=int(now // 60) * 60,  # 60s bucket
        mean_speed=float(np.mean(filtered)),
        median_speed=float(np.median(filtered)),
        std_speed=float(np.std(filtered)),
        sample_count=int(len(filtered)),
        min_speed=float(np.min(filtered)),
        max_speed=float(np.max(filtered)),
    )
```

### 5.4.2 Confidence Score

Confidence score отражает достоверность скоростного наблюдения. Используется в downstream потребителями (routing engine, traffic score).

**Формула:**

```
confidence = w1 * f_sample(n) * w2 * f_freshness(age) * w3 * f_variance(cv)

где:
  f_sample(n)     = min(1.0, n / N_target)          # насыщение при N_target=10 пробах
  f_freshness(age)= exp(-age / τ_freshness)          # τ_freshness = 180s (half-life)
  f_variance(cv)  = 1.0 / (1.0 + cv)                # cv = std/mean (coefficient of variation)
  
  w1 = 0.40  (вес sample count)
  w2 = 0.35  (вес freshness)
  w3 = 0.25  (вес variance)

  Индексы нормированы: confidence ∈ [0.0, 1.0]
```

**Производные параметры:**

| Параметр         | Значение | Смысл                                                  |
|------------------|----------|--------------------------------------------------------|
| `N_target`       | 10       | Число проб для полного f_sample = 1.0                  |
| `τ_freshness`    | 180 s    | За 3 мин freshness падает до exp(-1) ≈ 0.37            |
| `cv` threshold   | 0.5      | При cv=0.5 → f_variance = 0.67; при cv=2.0 → 0.33     |
| Min confidence   | 0.10     | Ниже этого порога — данные не публикуются               |

**Таблица уровней confidence:**

| Level  | Range        | Действие в routing engine                          | Действие в traffic score |
|--------|--------------|----------------------------------------------------|--------------------------|
| HIGH   | [0.80, 1.00] | Используется напрямую без сглаживания              | Вес ×1.0                 |
| MEDIUM | [0.50, 0.80) | Смешивается с историческими данными (α=0.7/0.3)   | Вес ×0.7                 |
| LOW    | [0.25, 0.50) | Используется только при отсутствии HIGH/MEDIUM     | Вес ×0.4                 |
| STALE  | [0.10, 0.25) | Заменяется historical average для данного часа     | Вес ×0.1                 |
| NONE   | [0.00, 0.10) | Сегмент помечается как `no_data`, historical only  | Исключается              |

**Pseudocode:**
```python
def compute_confidence(n: int, age_s: float, mean_s: float, std_s: float) -> float:
    N_TARGET = 10
    TAU = 180.0
    W = (0.40, 0.35, 0.25)
    
    f_sample    = min(1.0, n / N_TARGET)
    f_freshness = math.exp(-age_s / TAU)
    cv          = (std_s / mean_s) if mean_s > 0.5 else 2.0  # avoid /0
    f_variance  = 1.0 / (1.0 + cv)
    
    c = W[0]*f_sample + W[1]*f_freshness + W[2]*f_variance
    return max(0.0, min(1.0, c))
```

### 5.4.3 Категории скорости

Скорость на сегменте классифицируется в 4 категории для цветовой индикации на карте.  
Пороги зависят от `free_flow_speed` самого сегмента (атрибут OSM `maxspeed` или исторический 85th percentile).

```
ratio = current_speed / free_flow_speed
```

| Категория    | ratio        | Цвет (hex) | Описание                                  | Avg delay    |
|--------------|--------------|------------|-------------------------------------------|--------------|
| `free_flow`  | ≥ 0.80       | `#4CAF50`  | Нет пробок, движение свободное            | +0%          |
| `slow`       | [0.50, 0.80) | `#FFC107`  | Замедление, небольшие пробки              | +15–40%      |
| `congested`  | [0.20, 0.50) | `#FF5722`  | Серьёзные пробки                          | +50–150%     |
| `blocked`    | < 0.20       | `#B71C1C`  | Стоп, скорость < 20% от нормы             | >+200%       |

**Дополнительные правила:**

```python
# Специальный случай: скорость 0 при ненулевом free_flow — сегмент заблокирован
if current_speed < 1.0 and free_flow_speed > 10.0:
    category = "blocked"  # явный стоп

# Если нет данных — используем historical average для текущего hour_of_week
if confidence < 0.10:
    category = historical_category(segment_id, hour_of_week=now.hour + now.weekday()*24)

# Для pedestrian/cycleway — абсолютные пороги (km/h), не ratio
if road_type in ("footway", "cycleway"):
    category = absolute_speed_category(current_speed_kmh)  # пешеходные особые правила
```

**Абсолютные пороги для пешеходных зон (км/ч):**

| Категория   | Мин скорость | Макс скорость |
|-------------|--------------|---------------|
| `free_flow` | > 4.0        | —             |
| `slow`      | 2.0 – 4.0    | —             |
| `congested` | 0.5 – 2.0    | —             |
| `blocked`   | < 0.5        | —             |

---

## 5.5 Traffic Segment Storage

### 5.5.1 Redis Schema

Redis — primary real-time хранилище. Все данные о текущем трафике живут здесь с TTL.

**Ключи:**
```
traffic:segment:{segment_id}          → HASH  (current speed reading)
traffic:segment:{segment_id}:history  → ZSET   (sorted set по timestamp, last 30 min)
traffic:region:{region_id}:score      → STRING (traffic score 1-10, float)
traffic:event:{event_id}              → HASH  (event data)
traffic:events:active                 → ZSET   (active events, scored by expiry)
traffic:events:geo                    → GEO    (geospatial index for events)
```

**HASH структура `traffic:segment:{id}`:**
```
HSET traffic:segment:42891736 \
  mean_speed       "34.7" \
  median_speed     "33.2" \
  std_speed        "4.1" \
  sample_count     "8" \
  confidence       "0.82" \
  category         "slow" \
  free_flow_speed  "60.0" \
  ratio            "0.578" \
  ts_bucket        "1741298700" \
  updated_at       "1741298712" \
  source           "probe"
```

**TTL стратегия:**
```
traffic:segment:{id}           TTL = 300s   (5 мин — стаятся при отсутствии обновлений)
traffic:segment:{id}:history   TTL = 1800s  (30 мин история в ZSET)
traffic:region:{id}:score      TTL = 90s    (пересчёт каждые 60s, запас 30s)
traffic:event:{event_id}       TTL = зависит от типа события (см. 5.8.3)
```

**Pub/Sub для real-time клиентов:**
```
Канал: traffic:updates:{region_id}
Формат: JSON {"segment_id": 42891736, "category": "slow", "ratio": 0.578, "ts": 1741298712}

Публикация: после каждого HSET обновления сегмента
Назначение: WebSocket push клиентам, смотрящим на данный регион (geofence 10km²)

Fanout через:
  Redis → traffic-fanout-service → WebSocket gateway → клиенты
  (не прямая подписка клиентов на Redis — zero-trust: клиент не имеет доступа к Redis)
```

**Lua script для атомарного обновления:**
```lua
-- KEYS[1] = traffic:segment:{id}
-- KEYS[2] = traffic:segment:{id}:history
-- ARGV[1] = field-value pairs JSON
-- ARGV[2] = ts_bucket (score для ZSET)
-- ARGV[3] = speed_json (для ZSET value)
-- ARGV[4] = TTL seconds

local data = cjson.decode(ARGV[1])
for k, v in pairs(data) do
    redis.call('HSET', KEYS[1], k, v)
end
redis.call('EXPIRE', KEYS[1], ARGV[4])

-- Добавляем в history ZSET
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[3])
-- Чистим старые записи (> 30 мин)
local cutoff = tonumber(ARGV[2]) - 1800
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', cutoff)
redis.call('EXPIRE', KEYS[2], 1800)

return 1
```

**Производительность Redis-слоя:**

| Операция            | Latency p50 | Latency p99 | Throughput       |
|---------------------|-------------|-------------|------------------|
| HSET (segment)      | 0.08 ms     | 0.35 ms     | 350K ops/sec     |
| HGETALL (segment)   | 0.06 ms     | 0.28 ms     | 480K ops/sec     |
| ZADD (history)      | 0.09 ms     | 0.40 ms     | 300K ops/sec     |
| ZRANGEBYSCORE       | 0.12 ms     | 0.55 ms     | 220K ops/sec     |
| GEO (events radius) | 0.15 ms     | 0.80 ms     | 150K ops/sec     |
| Pub/Sub publish     | 0.05 ms     | 0.22 ms     | 500K msgs/sec    |

*Конфигурация: Redis Cluster 6 shards × 2 replicas, r6g.2xlarge (8 vCPU, 64 GB RAM)*

### 5.5.2 ClickHouse — таблица `traffic_history`

ClickHouse используется для аналитики, ML training data и исторических запросов.

```sql
CREATE TABLE traffic_history ON CLUSTER '{cluster}'
(
    segment_id      UInt64,
    ts_bucket       DateTime,                    -- 60-секундные бакеты
    mean_speed      Float32,
    median_speed    Float32,
    std_speed       Float32,
    sample_count    UInt16,
    confidence      Float32,
    category        LowCardinality(String),      -- free_flow|slow|congested|blocked
    free_flow_speed Float32,
    ratio           Float32,
    region_id       UInt32,
    road_type       LowCardinality(String),       -- motorway|trunk|primary|secondary|...
    source          LowCardinality(String),       -- probe|sensors|manual|ml_prediction
    date            Date MATERIALIZED toDate(ts_bucket)
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/traffic_history', '{replica}')
PARTITION BY (toYYYYMM(ts_bucket), region_id % 16)
ORDER BY (region_id, segment_id, ts_bucket)
TTL ts_bucket + INTERVAL 90 DAY
SETTINGS
    index_granularity = 8192,
    storage_policy = 'tiered',          -- hot SSD 30d, cold HDD 90d
    min_bytes_for_wide_part = 10485760;

-- Materialized view для агрегации по часам
CREATE MATERIALIZED VIEW traffic_history_hourly
ON CLUSTER '{cluster}'
ENGINE = ReplicatedAggregatingMergeTree(...)
PARTITION BY toYYYYMM(hour_bucket)
ORDER BY (region_id, segment_id, hour_bucket)
AS SELECT
    segment_id,
    region_id,
    road_type,
    toStartOfHour(ts_bucket)        AS hour_bucket,
    avgState(mean_speed)            AS avg_speed_state,
    medianState(median_speed)       AS median_speed_state,
    avgState(sample_count)          AS avg_samples_state,
    countState()                    AS obs_count_state,
    minState(min_speed)             AS min_speed_state,
    maxState(max_speed)             AS max_speed_state
FROM traffic_history
GROUP BY segment_id, region_id, road_type, hour_bucket;

-- Индекс для ML feature extraction
ALTER TABLE traffic_history
    ADD INDEX idx_segment_ts (segment_id, ts_bucket) TYPE minmax GRANULARITY 4;

ALTER TABLE traffic_history
    ADD INDEX idx_category (category) TYPE set(8) GRANULARITY 2;
```

**Нагрузка на запись:**
- 10M активных сегментов × обновление каждые 60 s = 167K записей/сек
- Batch INSERT через Kafka Connect (batch size = 50K строк, flush interval = 10s)
- Write amplification: MergeTree + 2 replicas = ×2.4 (с учётом merges)
- Дисковое потребление: ~220 байт/строка сжатая → 167K × 220 = 36 MB/s → ~3 TB/день

**Запрос для ML feature extraction:**
```sql
-- Исторические скорости для сегмента: последние 4 недели, по часам недели
SELECT
    toDayOfWeek(hour_bucket)        AS dow,     -- 1=Mon..7=Sun
    toHour(hour_bucket)             AS hod,     -- 0..23
    avgMerge(avg_speed_state)       AS avg_speed,
    medianMerge(median_speed_state) AS median_speed,
    countMerge(obs_count_state)     AS obs_count
FROM traffic_history_hourly
WHERE segment_id = {segment_id}
  AND hour_bucket >= now() - INTERVAL 28 DAY
GROUP BY dow, hod
ORDER BY dow, hod;
-- Время выполнения: ~8 ms на segment_id с индексом
```

### 5.5.3 TimescaleDB — долгосрочное хранение

TimescaleDB используется для аналитических дашбордов и compliance (хранение 2+ лет).

```sql
-- Extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Основная таблица
CREATE TABLE traffic_long_term (
    ts              TIMESTAMPTZ         NOT NULL,
    segment_id      BIGINT              NOT NULL,
    region_id       INTEGER             NOT NULL,
    mean_speed      REAL,
    sample_count    SMALLINT,
    category        VARCHAR(16),
    confidence      REAL,
    road_type       VARCHAR(32)
);

-- Hypertable: chunk_time_interval = 1 day
SELECT create_hypertable(
    'traffic_long_term',
    'ts',
    chunk_time_interval => INTERVAL '1 day',
    number_partitions  => 16,           -- partitioning by segment_id hash
    partitioning_column => 'segment_id'
);

-- Индексы
CREATE INDEX idx_tlt_segment_ts ON traffic_long_term (segment_id, ts DESC);
CREATE INDEX idx_tlt_region_ts  ON traffic_long_term (region_id, ts DESC);

-- Compression policy: сжатие чанков старше 7 дней
ALTER TABLE traffic_long_term SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'ts',
    timescaledb.compress_segmentby = 'segment_id, region_id'
);

SELECT add_compression_policy('traffic_long_term', INTERVAL '7 days');

-- Retention policy: удаление данных старше 2 лет
SELECT add_retention_policy('traffic_long_term', INTERVAL '730 days');

-- Continuous aggregate: дневная статистика
CREATE MATERIALIZED VIEW traffic_daily_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', ts)    AS day_bucket,
    segment_id,
    region_id,
    AVG(mean_speed)             AS avg_speed,
    MIN(mean_speed)             AS min_speed,
    MAX(mean_speed)             AS max_speed,
    SUM(sample_count)           AS total_samples,
    COUNT(*)                    AS obs_count
FROM traffic_long_term
GROUP BY day_bucket, segment_id, region_id;

SELECT add_continuous_aggregate_policy(
    'traffic_daily_stats',
    start_offset => INTERVAL '3 days',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);
```

**Сравнение хранилищ:**

| Характеристика        | Redis                | ClickHouse           | TimescaleDB          |
|-----------------------|----------------------|----------------------|----------------------|
| Тип данных            | Горячий real-time    | Аналитика, ML data   | Long-term compliance |
| Retention             | 5–30 мин             | 90 дней              | 2 года               |
| Запись latency        | < 1 ms               | 10–50 ms (batch)     | 5–20 ms (batch)      |
| Чтение latency        | < 1 ms               | 5–500 ms (OLAP)      | 10–200 ms (OLAP)     |
| Compression ratio     | нет                  | 10:1                 | 8:1                  |
| Горизонт. масштаб     | Cluster sharding     | Shard + replica      | Chunk parallelism    |

---

## 5.6 Traffic ML Prediction

### 5.6.1 Model Architecture

**Temporal Fusion Transformer (TFT)** — архитектура модели, разработанная Google DeepMind, оптимальна для мультиварантного временного прогнозирования с known/unknown future covariates.

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Temporal Fusion Transformer                        │
│                                                                     │
│  Static Covariates     Time-Varying Known     Time-Varying Unknown  │
│  ┌─────────────────┐   ┌──────────────────┐   ┌──────────────────┐ │
│  │ segment_id emb  │   │ hour_of_day (sin) │   │ current_speed    │ │
│  │ road_type emb   │   │ day_of_week (cos) │   │ sample_count     │ │
│  │ region_id emb   │   │ is_holiday        │   │ confidence       │ │
│  │ free_flow_speed │   │ planned_events    │   │ weather_code     │ │
│  │ lanes_count     │   │ weather_forecast  │   │ incident_nearby  │ │
│  └──────┬──────────┘   └─────────┬────────┘   └────────┬─────────┘ │
│         │                        │                      │           │
│         ▼                        ▼                      ▼           │
│  ┌──────────────┐    ┌─────────────────────────────────────────┐    │
│  │ Static Enc.  │    │     Variable Selection Network (VSN)    │    │
│  │ (GRN×4)      │    │  (learnable importance weights per var) │    │
│  └──────┬───────┘    └─────────────────────────┬───────────────┘    │
│         │                                       │                   │
│         └─────────────────┬─────────────────────┘                   │
│                           ▼                                         │
│                  ┌─────────────────┐                                │
│                  │  LSTM Encoder   │  (seq_len=60 min of history)   │
│                  │  hidden=256     │                                │
│                  └────────┬────────┘                                │
│                           │                                         │
│                  ┌─────────────────┐                                │
│                  │ Interpretable   │                                │
│                  │ Multi-Head Attn │  (heads=4, d_model=256)        │
│                  └────────┬────────┘                                │
│                           │                                         │
│                  ┌─────────────────┐                                │
│                  │ Gated Residual  │                                │
│                  │ Network (GRN)   │                                │
│                  └────────┬────────┘                                │
│                           │                                         │
│         ┌─────────────────┼─────────────────┐                       │
│         ▼                 ▼                 ▼                       │
│    ┌─────────┐      ┌─────────┐      ┌─────────┐                   │
│    │  5 min  │      │ 15 min  │      │ 30 min  │  ← output heads   │
│    │ horizon │      │ horizon │      │ horizon │                   │
│    │ q10/50/90│     │ q10/50/90│     │ q10/50/90│  ← quantiles     │
│    └─────────┘      └─────────┘      └─────────┘                   │
│         +                 +                                         │
│    ┌─────────┐                                                      │
│    │  60 min │                                                      │
│    │ horizon │                                                      │
│    │ q10/50/90│                                                     │
│    └─────────┘                                                      │
└─────────────────────────────────────────────────────────────────────┘

Model size: ~18M parameters
Training: A100 80GB × 8 GPUs, ~72 hours for full Moscow dataset
Inference: T4 × 1, batch=512 segments, latency 12 ms/batch
```

**Output quantiles и применение:**
- `q10` — оптимистичный прогноз (для ETA best case)
- `q50` — медианный прогноз (основной для routing)
- `q90` — пессимистичный прогноз (для ETA worst case + user warning threshold)

### 5.6.2 Feature Engineering

**Полный список input features:**

| Feature               | Тип          | Dim  | Источник                          | Описание                                |
|-----------------------|--------------|------|-----------------------------------|-----------------------------------------|
| `current_speed`       | time-vary unk| 1    | Redis HGET                        | Текущая скорость на сегменте            |
| `speed_5m_ago`        | time-vary unk| 1    | Redis ZRANGEBYSCORE               | Скорость 5 мин назад                    |
| `speed_15m_ago`       | time-vary unk| 1    | Redis ZRANGEBYSCORE               | Скорость 15 мин назад                   |
| `speed_30m_ago`       | time-vary unk| 1    | Redis ZRANGEBYSCORE               | Скорость 30 мин назад                   |
| `historical_speed_1w` | time-vary kno| 1    | ClickHouse (same dow/hod, -7d)    | Исторический аналог прошлой недели      |
| `historical_speed_2w` | time-vary kno| 1    | ClickHouse (same dow/hod, -14d)   | Исторический аналог 2 недели назад      |
| `historical_avg`      | time-vary kno| 1    | ClickHouse hourly aggregate       | Средняя скорость для dow+hod            |
| `hour_of_day_sin`     | time-vary kno| 1    | cyclical encoding sin(2π×h/24)    | Время суток (циклическое)               |
| `hour_of_day_cos`     | time-vary kno| 1    | cyclical encoding cos(2π×h/24)    | Время суток (циклическое)               |
| `day_of_week_sin`     | time-vary kno| 1    | cyclical encoding sin(2π×d/7)     | День недели (циклическое)               |
| `day_of_week_cos`     | time-vary kno| 1    | cyclical encoding cos(2π×d/7)     | День недели (циклическое)               |
| `is_holiday`          | time-vary kno| 1    | calendar API (производственный)   | Праздничный день РФ (0/1)               |
| `is_pre_holiday`      | time-vary kno| 1    | calendar API                      | Предпраздничный день (сокращённый)      |
| `weather_precip_mm`   | time-vary unk| 1    | OpenMeteo / Яндекс.Погода API     | Осадки мм/ч                            |
| `weather_visibility_m`| time-vary unk| 1    | weather API                       | Видимость в метрах                      |
| `weather_temp_c`      | time-vary kno| 1    | weather forecast                  | Температура воздуха                     |
| `events_nearby`       | time-vary kno| 1    | events DB (концерты, матчи)       | Число запланированных событий в 2 км    |
| `incident_count_5km`  | time-vary unk| 1    | traffic events stream             | Число активных инцидентов в 5 км        |
| `upstream_speed`      | time-vary unk| 1    | Redis (смежные сегменты upstream) | Средняя скорость upstream-сегментов     |
| `downstream_speed`    | time-vary unk| 1    | Redis (смежные сегменты downstr.) | Средняя скорость downstream-сегментов   |
| `segment_id_emb`      | static       | 32   | embedding table (trainable)       | Learnable embedding сегмента            |
| `road_type_emb`       | static       | 8    | embedding table                   | Тип дороги                              |
| `free_flow_speed`     | static       | 1    | segment metadata                  | Нормативная скорость сегмента           |
| `lanes_count`         | static       | 1    | segment metadata                  | Число полос                             |

**Итого: 24 фичи (12 time-varying unknown + 8 time-varying known + 4 static)**

**Normalization:**
```python
# Z-score нормализация для continuous features
speed_mean, speed_std = 32.5, 18.7   # km/h, по всему датасету Москвы
speed_normalized = (speed_raw - speed_mean) / speed_std

# MinMax для бинарных/категориальных
is_holiday_norm = float(is_holiday)   # уже 0.0 или 1.0

# Cyclical encoding
hour_sin = math.sin(2 * math.pi * hour / 24)
hour_cos = math.cos(2 * math.pi * hour / 24)
```

### 5.6.3 Training Pipeline

**Dataset:**

| Параметр              | Значение                                                       |
|-----------------------|----------------------------------------------------------------|
| Период                | 3 года истории (2022–2024)                                     |
| Регион                | Москва: ~850K road segments                                    |
| Объём данных          | ~1.8B строк в ClickHouse (после агрегации в 60s buckets)       |
| Train/Val/Test split  | 70% / 15% / 15% (разбивка по времени, не по сегментам!)       |
| Batch size            | 4096 сегмент-временных последовательностей                     |
| Sequence length       | 60 шагов по 1 мин (1 час истории)                              |
| Forecast horizon      | 4 горизонта: 5m, 15m, 30m, 60m                                |
| Loss function         | Quantile loss (q10, q50, q90) на каждом горизонте             |

**Training schedule:**

```yaml
# Конфигурация обучения
training:
  full_retrain:
    schedule: "0 2 * * 0"        # каждое воскресенье в 2:00
    duration_estimate: 72h        # на 8× A100
    trigger: manual_or_cron
  
  incremental_update:
    schedule: "0 3 * * *"         # ежедневно в 3:00
    duration_estimate: 4h         # дообучение на данных последних 7 дней
    method: "fine-tuning with frozen lower layers"
    learning_rate: 1e-5           # LR меньше полного обучения (1e-4)
  
  online_adaptation:
    enabled: false                # слишком рискованно в prod без A/B test
    future_consideration: true
```

**MAPE targets по горизонтам:**

| Горизонт | Target MAPE | Current MAPE | RMSE target (km/h) | Baseline (historical avg) MAPE |
|----------|-------------|--------------|---------------------|-------------------------------|
| 5 min    | ≤ 8%        | 6.8%         | ≤ 3.5 km/h          | 14.2%                         |
| 15 min   | ≤ 12%       | 10.4%        | ≤ 5.0 km/h          | 18.7%                         |
| 30 min   | ≤ 16%       | 14.1%        | ≤ 6.5 km/h          | 22.3%                         |
| 60 min   | ≤ 22%       | 19.8%        | ≤ 8.0 km/h          | 27.5%                         |

*MAPE = Mean Absolute Percentage Error = mean(|actual - predicted| / actual) × 100%*

**Деградация модели (concept drift monitoring):**
```python
# Мониторинг качества в prod
# Запускается каждые 15 мин для 1000 случайных сегментов
def monitor_model_drift():
    actual   = fetch_actual_speeds(sample_segment_ids, lag_minutes=5)
    predicted = fetch_predictions(sample_segment_ids, horizon="5m", lag=5)
    
    mape = compute_mape(actual, predicted)
    
    if mape > MAPE_THRESHOLD_ALERT:    # 12% для 5-min horizon
        send_alert("model_drift", mape=mape)
    
    if mape > MAPE_THRESHOLD_ROLLBACK:  # 20% для 5-min horizon
        trigger_rollback_to_historical_baseline()
```

### 5.6.4 Inference Pipeline

**Batch vs Stream inference:**

```
┌──────────────────────────────────────────────────────────────┐
│                  Inference Architecture                       │
│                                                              │
│  ┌─────────────┐   batch every 60s    ┌──────────────────┐  │
│  │  Redis      │ ──────────────────→  │  Feature Store   │  │
│  │  (current)  │                      │  Builder Service │  │
│  └─────────────┘                      │  (stateless)     │  │
│                                       └────────┬─────────┘  │
│  ┌─────────────┐   bulk read          ┌────────▼─────────┐  │
│  │  ClickHouse │ ──────────────────→  │  TFT Inference   │  │
│  │  (history)  │                      │  Service         │  │
│  └─────────────┘                      │                  │  │
│                                       │  Input:          │  │
│  ┌─────────────┐   scheduled jobs     │  850K segments   │  │
│  │  weather    │ ──────────────────→  │  × 24 features   │  │
│  │  events API │                      │  × 60 timesteps  │  │
│  └─────────────┘                      │                  │  │
│                                       │  GPU: T4 × 4     │  │
│                                       │  Batch: 512 segs │  │
│                                       │  Total: ~20 sec  │  │
│                                       └────────┬─────────┘  │
│                                                │             │
│                            predictions (all horizons)        │
│                                                ▼             │
│                                       ┌──────────────────┐  │
│                                       │  Redis HSET      │  │
│                                       │  predictions:    │  │
│                                       │  segment:{id}:   │  │
│                                       │  5m / 15m /      │  │
│                                       │  30m / 60m       │  │
│                                       │  TTL: 65s        │  │
│                                       └──────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Требования к latency:**

| Режим         | Trigger           | Latency SLO | Покрытие                        |
|---------------|-------------------|-------------|---------------------------------|
| Batch bulk    | каждые 60s        | < 25 s      | Все 850K активных сегментов     |
| On-demand     | route calculation | < 150 ms    | Только сегменты маршрута (~200) |
| Incremental   | после события     | < 500 ms    | Сегменты в радиусе 5 км события |

**On-demand inference для route calculation:**
```python
# Запрашивается routing engine при построении маршрута
# Только для ~200 сегментов маршрута, не весь город
async def predict_route_segments(
    segment_ids: list[int],
    departure_time: datetime
) -> dict[int, SpeedPredictions]:
    
    # 1. Fetch features from Redis (bulk pipeline)
    features = await redis.pipeline_hgetall([
        f"traffic:segment:{sid}" for sid in segment_ids
    ])
    
    # 2. Build feature tensor (на CPU, затем в GPU)
    X = build_feature_tensor(features, departure_time)  # [N, 60, 24]
    
    # 3. Inference (TorchScript model, no Python overhead)
    with torch.no_grad():
        predictions = model(X.cuda())          # [N, 4, 3]  (horizons × quantiles)
    
    # 4. Return {'segment_id': {'5m': {'q10':..,'q50':..,'q90':..}, ...}}
    return format_predictions(segment_ids, predictions.cpu())

# Latency breakdown при N=200 сегментах:
# Feature fetch Redis pipeline: ~3 ms
# tensor construction:          ~1 ms  
# GPU inference:                ~8 ms
# total:                        ~12 ms  ✓ (SLO 150 ms)
```

**Инфраструктура GPU:**

| Компонент        | Конфигурация             | Назначение                   |
|------------------|--------------------------|------------------------------|
| Batch inference  | 4× T4 16GB + TorchServe  | Full-city inference каждые 60s|
| On-demand        | 2× T4 16GB + FastAPI     | Route-level on-demand         |
| Training         | 8× A100 80GB (scheduled) | Weekly full retrain           |
| Model storage    | S3 + versioned artifacts | MLflow Model Registry         |

---

## 5.7 Traffic Score — аналог Яндекс Пробок

### 5.7.1 Score Formula

Traffic Score — агрегированный показатель загруженности дорог в регионе. Аналог «Яндекс.Пробок» (1–10 баллов).

**Формула:**

```
TrafficScore(region, t) = 
    Σ_i [ congestion_ratio(i, t) × weight(i) ]
    ────────────────────────────────────────── × 10
           Σ_i [ weight(i) ]

где:
  i               — road segment в пределах region
  
  congestion_ratio(i) = 1 - (current_speed(i) / free_flow_speed(i))
                      ∈ [0.0, 1.0]
                      0 = нет пробок, 1 = полная остановка
  
  weight(i) = length_km(i) × capacity_factor(i)
  
  capacity_factor(i):
    motorway / trunk:  3.0   (важнейшие магистрали)
    primary:           2.0
    secondary:         1.5
    tertiary:          1.0
    residential:       0.3   (не влияет на общую картину)
    service / other:   0.1

  Только сегменты с confidence ≥ 0.25 участвуют в расчёте.
  Сегменты с confidence < 0.25 → заменяются historical baseline.
```

**Пример расчёта:**
```python
def compute_region_score(region_id: int, ts: float) -> float:
    segments = get_region_segments(region_id, min_road_class="tertiary")
    
    numerator   = 0.0
    denominator = 0.0
    
    for seg in segments:
        speed = get_current_speed(seg.id, ts)
        if speed is None or seg.free_flow_speed <= 0:
            # Используем historical baseline
            speed = get_historical_speed(seg.id, hour_of_week=hour_of_week(ts))
        
        congestion = max(0.0, 1.0 - speed / seg.free_flow_speed)
        w = seg.length_km * CAPACITY_FACTORS[seg.road_type]
        
        numerator   += congestion * w
        denominator += w
    
    if denominator == 0:
        return 0.0
    
    raw_score = (numerator / denominator) * 10
    return round(max(1.0, min(10.0, raw_score)), 1)
```

### 5.7.2 Score Scale 1–10

| Балл | Диапазон   | Цвет     | Hex       | avg speed ratio | Описание                              |
|------|------------|----------|-----------|-----------------|---------------------------------------|
| 1    | [0.0, 0.4) | Зелёный  | `#1B5E20` | > 95%           | Исключительно свободно, ночные часы   |
| 2    | [0.4, 1.2) | Зелёный  | `#2E7D32` | 90–95%          | Очень свободно, ранее утро            |
| 3    | [1.2, 2.0) | Салатовый| `#558B2F` | 85–90%          | Свободно, умеренный трафик            |
| 4    | [2.0, 3.0) | Жёлтый   | `#F9A825` | 75–85%          | Лёгкие заторы на отдельных участках   |
| 5    | [3.0, 4.2) | Жёлтый   | `#F57F17` | 65–75%          | Заметные пробки, рабочие часы         |
| 6    | [4.2, 5.5) | Оранжевый| `#E65100` | 50–65%          | Значительные заторы                   |
| 7    | [5.5, 6.8) | Красный  | `#BF360C` | 35–50%          | Серьёзные пробки, час пик             |
| 8    | [6.8, 7.8) | Красный  | `#B71C1C` | 20–35%          | Тяжёлые заторы                        |
| 9    | [7.8, 8.8) | Тёмно-кр.| `#880E4F` | 10–20%          | Критические пробки, город стоит       |
| 10   | [8.8, 10.0]| Чёрный   | `#212121` | < 10%           | Коллапс движения, ЧС, перекрытия      |

**Исторические нормы для Москвы:**
- Ночь (00:00–06:00): обычно 1–2 балла
- Утренний час пик (08:00–10:00): обычно 7–9 баллов
- Дневное затишье (11:00–16:00): обычно 4–6 баллов
- Вечерний час пик (18:00–20:00): обычно 8–10 баллов
- Выходные/праздники: на 2–3 балла ниже среднего

### 5.7.3 Regional Score Calculation

**Иерархия регионов:**

```
Moscow Region (1 запись)
    ├── Центральный округ (10 районов)
    │       ├── Тверской район
    │       ├── Арбат
    │       └── ...
    ├── Северный округ (16 районов)
    ├── ... (всего 12 округов)
    └── МКАД (отдельный регион-кольцо)
```

**Конфигурация обновления:**

```yaml
regional_score:
  update_interval_sec: 60       # пересчёт каждые 60 сек
  
  levels:
    city:                       # Москва целиком
      cache_ttl: 90s
      min_segments: 1000
      road_types: [motorway, trunk, primary, secondary]
      
    district:                   # Округа (12шт)
      cache_ttl: 90s
      min_segments: 100
      road_types: [motorway, trunk, primary, secondary, tertiary]
      
    neighborhood:               # Районы (~125шт)
      cache_ttl: 120s
      min_segments: 20
      road_types: [primary, secondary, tertiary, residential]
```

**Redis ключи для региональных scores:**
```
traffic:score:city:moscow                     → "7.3"  (STRING, TTL 90s)
traffic:score:district:central                → "8.1"
traffic:score:district:north                  → "6.4"
traffic:score:neighborhood:tverskoy           → "8.7"
traffic:score:road:mkad                       → "5.2"  (МКАД — особый регион)
```

**Scheduler для пересчёта:**
```python
# Работает как отдельный stateless microservice
# Одна инстанция на datacenter (с leader election через Redis SETNX)

async def regional_score_scheduler():
    while True:
        start = time.monotonic()
        
        regions = await db.get_all_regions(min_level="city")
        
        tasks = [compute_and_store_score(r) for r in regions]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        failed = [r for r in results if isinstance(r, Exception)]
        if failed:
            metrics.increment("score.computation.errors", len(failed))
        
        elapsed = time.monotonic() - start
        metrics.gauge("score.computation.duration_ms", elapsed * 1000)
        
        # Ждём следующего цикла: цикл каждые 60с
        await asyncio.sleep(max(0, 60.0 - elapsed))
```

### 5.7.4 Historical Score Patterns

**Типичные паттерны по Москве (медианные значения score по час/день):**

```
Hour │ Mon  Tue  Wed  Thu  Fri  Sat  Sun
─────┼─────────────────────────────────
 0   │  1.5  1.4  1.5  1.4  1.6  1.8  1.9
 1   │  1.2  1.2  1.2  1.2  1.3  1.5  1.7
 2   │  1.1  1.1  1.1  1.1  1.1  1.3  1.5
 3   │  1.1  1.1  1.1  1.1  1.1  1.2  1.4
 4   │  1.2  1.2  1.2  1.2  1.2  1.2  1.3
 5   │  1.8  1.8  1.8  1.8  1.9  1.4  1.3
 6   │  3.5  3.4  3.5  3.4  3.6  1.8  1.5
 7   │  5.8  5.7  5.9  5.8  5.9  2.4  1.8
 8   │  7.8  7.6  7.9  7.7  7.8  3.1  2.2
 9   │  8.2  8.1  8.3  8.1  8.2  3.8  2.7
10   │  6.5  6.4  6.6  6.5  6.7  4.5  3.2
11   │  5.2  5.1  5.3  5.2  5.4  5.0  3.8
12   │  5.0  4.9  5.1  5.0  5.2  5.3  4.1
13   │  5.3  5.2  5.4  5.3  5.5  5.4  4.3
14   │  5.4  5.3  5.5  5.4  5.6  5.2  4.5
15   │  5.6  5.5  5.7  5.6  5.8  5.0  4.4
16   │  6.4  6.3  6.5  6.4  6.7  4.8  4.2
17   │  7.8  7.7  7.9  7.8  8.0  4.5  3.9
18   │  8.8  8.7  8.9  8.8  9.0  4.6  3.7
19   │  8.5  8.4  8.6  8.5  8.3  4.7  3.6
20   │  7.2  7.1  7.3  7.2  6.8  4.9  3.8
21   │  5.4  5.3  5.5  5.4  5.2  5.1  4.0
22   │  3.8  3.7  3.9  3.8  3.6  4.2  3.4
23   │  2.4  2.3  2.5  2.4  2.8  3.0  2.5
```

**Аномалии и события, влияющие на score:**
- Матч на стадионе «Лужники» (±2 ч) → +1.5–2.5 балла в прилегающих районах
- Концерт «Олимпийский» / «Арена» → +1–2 балла
- Первый снегопад сезона (> 5 см) → +2–3 балла городу
- 9 мая / День города → перекрытия, score может достичь 10 в центре
- Чемпионат мира / Евро дни финалов → особый режим прогноза

---

## 5.8 Traffic Events

### 5.8.1 Event Types

**Таблица типов событий:**

| Тип события      | Код         | Иконка  | Автодетекция | User report | Radius влияния | TTL default |
|------------------|-------------|---------|--------------|-------------|----------------|-------------|
| ДТП              | `accident`  | 🚗💥    | Да           | Да          | 500 м          | 90 мин      |
| Дорожные работы  | `road_work` | 🚧      | Нет          | Да          | 200 м          | 8 ч         |
| Перекрытие       | `closure`   | 🚫      | Частично     | Да          | 1 км           | 4 ч         |
| Полиция          | `police`    | 👮      | Нет          | Да          | 300 м          | 30 мин      |
| Опасность        | `hazard`    | ⚠️      | Да           | Да          | 200 м          | 45 мин      |
| Погодная угроза  | `weather`   | 🌨️      | Нет          | Нет         | зона (10+ км)  | до отмены   |
| Камера/радар     | `camera`    | 📷      | Нет          | Да          | 100 м          | постоянно   |
| Пробка стоп      | `jam_stop`  | 🔴      | Да           | Нет         | 100 м          | 20 мин      |

**Protobuf схема события:**
```protobuf
syntax = "proto3";

message TrafficEvent {
  string  event_id       = 1;  // UUID
  string  type           = 2;  // "accident" | "road_work" | ...
  double  lat            = 3;
  double  lon            = 4;
  int64   segment_id     = 5;  // nullable (0 = no match)
  string  status         = 6;  // "detected" | "confirmed" | "active" | "resolved"
  int64   detected_at    = 7;  // Unix timestamp ms
  int64   confirmed_at   = 8;
  int64   expires_at     = 9;
  string  source         = 10; // "auto" | "user" | "official"
  string  user_id        = 11; // reporter (nullable)
  int32   upvotes        = 12;
  int32   downvotes      = 13;
  string  description    = 14;
  float   severity       = 15; // 0.0–1.0
  repeated string affected_segments = 16;
}
```

### 5.8.2 Event Detection

**Автоматическое обнаружение из GPS-данных:**

**Алгоритм 1: Sudden Stop Cluster (обнаружение ДТП/пробки)**
```python
# Детектор внезапных остановок
# Запускается over sliding window 5 мин

def detect_sudden_stop_cluster(
    segment_id: int,
    speed_history: list[SpeedReading]
) -> Optional[TrafficEvent]:
    
    if len(speed_history) < 3:
        return None
    
    # Вычисляем скоростную производную
    speeds = [r.mean_speed for r in speed_history]
    timestamps = [r.ts_bucket for r in speed_history]
    
    # Скоростной дроп за последние 3 минуты
    recent_speeds = [s for s, t in zip(speeds, timestamps)
                     if t >= now() - 180]
    
    if len(recent_speeds) < 2:
        return None
    
    speed_drop = recent_speeds[0] - recent_speeds[-1]   # первое - последнее
    relative_drop = speed_drop / max(recent_speeds[0], 1.0)
    
    # Условия срабатывания:
    # 1. Скорость упала более чем на 60% за 3 минуты
    # 2. Текущая скорость < 5 km/h (фактическая остановка)
    # 3. Было достаточно проб для надёжности
    if (relative_drop > 0.60
            and recent_speeds[-1] < 5.0
            and speed_history[-1].sample_count >= 5):
        
        seg_data = get_segment_metadata(segment_id)
        
        return TrafficEvent(
            event_id=uuid4(),
            type="jam_stop",        # начинаем с jam_stop, апгрейд до accident после verify
            lat=seg_data.center_lat,
            lon=seg_data.center_lon,
            segment_id=segment_id,
            status="detected",
            source="auto",
            severity=min(1.0, relative_drop)
        )
    
    return None
```

**Алгоритм 2: Speed Anomaly Detection (статистическая аномалия)**
```python
# Детектор аномально низкой скорости относительно исторической нормы

def detect_speed_anomaly(
    segment_id: int,
    current_speed: float,
    current_confidence: float,
    historical_avg: float,
    historical_std: float,
    hour_of_week: int
) -> Optional[AnomalySignal]:
    
    if current_confidence < 0.30:
        return None  # недостаточно данных для детекции
    
    if historical_std < 1.0:
        return None  # исторически стабильный сегмент — std слишком мал
    
    # Z-score относительно исторической нормы
    z_score = (historical_avg - current_speed) / historical_std
    
    # Более низкая чувствительность ночью (мало проб)
    threshold = 2.5 if 6 <= (hour_of_week % 24) <= 22 else 3.5
    
    if z_score > threshold:
        return AnomalySignal(
            segment_id=segment_id,
            z_score=z_score,
            expected_speed=historical_avg,
            actual_speed=current_speed,
            deviation_pct=(historical_avg - current_speed) / historical_avg * 100
        )
    
    return None
```

**Cluster verification: несколько сегментов в радиусе 500 м**
```python
# Если 3+ соседних сегмента имеют anomaly → повышаем до confirmed accident
def verify_cluster(anomalies: list[AnomalySignal], radius_m=500) -> list[TrafficEvent]:
    events = []
    
    # DBSCAN кластеризация по координатам
    coords = [(get_segment_center(a.segment_id)) for a in anomalies]
    clusters = dbscan(coords, eps=radius_m, min_samples=3, metric="haversine")
    
    for cluster_id, cluster_anomalies in group_by_cluster(anomalies, clusters):
        if cluster_id == -1:
            continue  # шум
        
        center = centroid([a.segment_id for a in cluster_anomalies])
        severity = min(1.0, len(cluster_anomalies) / 10.0)
        
        events.append(TrafficEvent(
            type="accident",
            status="confirmed",
            lat=center.lat,
            lon=center.lon,
            source="auto",
            severity=severity,
            affected_segments=[a.segment_id for a in cluster_anomalies]
        ))
    
    return events
```

### 5.8.3 Event Lifecycle

**State machine событий:**

```
                    ┌─────────────┐
                    │  DETECTED   │
                    │ (auto only) │
                    └──────┬──────┘
                           │
           ┌───────────────┼──────────────────┐
           │               │                  │
           ▼               ▼                  ▼
    [3+ user confirms]  [verified by      [timeout 15 min,
    или [auto cluster]   official src]    no confirmation]
           │               │                  │
           ▼               ▼                  ▼
    ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
    │  CONFIRMED  │  │   CONFIRMED  │  │   DISMISSED  │
    │             │  │  (official)  │  │              │
    └──────┬──────┘  └──────┬───────┘  └──────────────┘
           │                │
           └────────┬───────┘
                    ▼
             ┌────────────┐
             │   ACTIVE   │  ← публикуется на карте и в routing
             └─────┬──────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
        ▼          ▼          ▼
  [TTL expired] [3+ "clear"] [official
                 reports]     resolved]
        │          │          │
        └────────┬─┘──────────┘
                 ▼
          ┌────────────┐
          │  RESOLVED  │
          └────────────┘
                 │
         [после 30 мин]
                 ▼
          ┌────────────┐
          │  ARCHIVED  │  ← только в ClickHouse
          └────────────┘
```

**TTL по типам событий:**

| Тип             | detected TTL | confirmed TTL | active TTL | ext. если report в последние |
|-----------------|--------------|---------------|------------|------------------------------|
| `accident`      | 15 мин       | 90 мин        | 90 мин     | каждые 5 мин user report +15м|
| `road_work`     | N/A          | 8 ч           | 8 ч        | до официального закрытия     |
| `closure`       | 30 мин       | 4 ч           | 4 ч        | официальное обновление        |
| `police`        | 10 мин       | 30 мин        | 30 мин     | каждые 2 мин user report +5м |
| `hazard`        | 10 мин       | 45 мин        | 45 мин     | нет auto-extension            |
| `weather`       | N/A          | до отмены     | до отмены  | weather API feed update       |
| `jam_stop`      | 5 мин        | 20 мин        | 20 мин     | нет (заменяется speed данными)|

### 5.8.4 User Reports

**Crowdsourcing pipeline:**

```
Пользователь нажимает "Сообщить о событии"
              │
              ▼
  ┌─────────────────────────┐
  │  Client-side validation  │
  │  - location in range?    │  (не дальше 500м от текущей позиции)
  │  - type valid?           │
  │  - rate limit: 5 rep/min │
  └──────────┬──────────────┘
             │
     POST /api/v1/traffic/events/report
             │
             ▼
  ┌─────────────────────────┐
  │  Server-side validation  │
  │  - auth token valid      │
  │  - device_id alive       │
  │  - IP rate limit: 10/min │
  │  - duplicate detection   │  (2+ reports в 200м за 5 мин → merge)
  └──────────┬──────────────┘
             │
             ▼
  ┌─────────────────────────┐
  │  Verification Pipeline   │
  │                          │
  │  1. Speed check:         │
  │     current_speed < 0.5× │  ← подтверждает accident/jam автоматически
  │     historical avg?      │
  │                          │
  │  2. Neighbor reports:    │
  │     N reports in 500m    │  ← N=3 для accident, N=2 для police
  │     in last 10 min?      │
  │                          │
  │  3. Karma filter:        │
  │     user karma > 0?      │  ← негативная карма = спам-репорты
  └──────────┬──────────────┘
             │
     [CONFIRMED / PENDING]
             │
             ▼
  Kafka topic: traffic-events-raw
             │
             ▼
  Event Processor (stateful)
  → Redis + ClickHouse + routing engine notification
```

**Karma система:**

```python
# Karma изменяется на основе верификации репортов

class UserKarma:
    base_score: int = 100        # начальный счёт
    max_score: int  = 500
    min_score: int  = -50        # ниже -50 = мьют на 24ч
    
    # Изменения score:
    CONFIRMED_BY_CLUSTER    = +5    # репорт подтверждён кластером
    CONFIRMED_BY_OFFICIAL   = +10   # подтверждён официальным источником
    UPVOTED_BY_USERS        = +1    # другой пользователь upvoted
    DOWNVOTED_BY_USERS      = -2    # другой пользователь downvoted
    SPEED_DISPROVED         = -3    # GPS данные опровергли репорт
    REPORT_IGNORED          = -1    # ни одного подтверждения за TTL
    SPAM_PATTERN            = -20   # 5+ быстрых репортов подряд без подтверждений

# Мьют-логика:
# karma < 0 → все репорты требуют 5 подтверждений (вместо 3) для confirmed
# karma < -50 → автоматический мьют 24ч
```

**Защита от атак:**

| Вектор атаки                    | Защита                                                          |
|---------------------------------|-----------------------------------------------------------------|
| Флуд ложных репортов            | Rate limit per device_id + karma drain                         |
| Sybil attack (много аккаунтов)  | IP rate limit + device fingerprint clustering                   |
| Replay attack (old reports)     | Timestamp validation: max age 60 s                              |
| Geo spoofing (ложное местоположение) | GPS consistency check: speed от предыдущей точки       |
| Organised false events          | Cluster analysis: репорты из одной IP-подсети = suspect         |

---

## 5.9 Kafka Architecture для трафика

### 5.9.1 Topic Design

**Полный список Kafka-топиков Traffic Intelligence системы:**

| Topic                        | Partitions | Retention     | Replication | Key                    | Описание                              |
|------------------------------|------------|---------------|-------------|------------------------|---------------------------------------|
| `gps-raw`                    | 512        | 1 ч           | 3           | `device_id`            | Сырые GPS-телеметрия от пробов        |
| `gps-validated`              | 512        | 2 ч           | 3           | `device_id`            | Валидированные GPS-точки              |
| `matched-gps`                | 1024       | 3 ч           | 3           | `segment_id`           | Matched GPS к road segments           |
| `speed-readings`             | 256        | 6 ч           | 3           | `segment_id`           | Агрегированные скоростные наблюдения  |
| `speed-readings-dl`          | 64         | 24 ч          | 3           | `segment_id`           | Dead letter queue для speed-readings  |
| `traffic-segment-updates`    | 256        | 3 ч           | 3           | `segment_id`           | Обновления сегментов для Redis/CH     |
| `traffic-events-raw`         | 64         | 24 ч          | 3           | `event_id`             | Сырые события (user reports + auto)   |
| `traffic-events-verified`    | 32         | 48 ч          | 3           | `event_id`             | Верифицированные события              |
| `traffic-events-broadcast`   | 32         | 6 ч           | 3           | `region_id`            | Broadcast событий по регионам         |
| `traffic-score-updates`      | 64         | 3 ч           | 3           | `region_id`            | Обновления regional scores            |
| `ml-predictions`             | 128        | 2 ч           | 3           | `segment_id`           | ML-предсказания скоростей             |
| `ml-training-data`           | 256        | 7 дней        | 3           | `segment_id`           | Данные для incremental ML retraining  |
| `gps-anomalies`              | 32         | 24 ч          | 3           | `device_id`            | Аномальные GPS-трейсы для анализа     |
| `routing-traffic-updates`    | 128        | 1 ч           | 3           | `segment_id`           | Обновления для routing engine         |
| `notifications-traffic`      | 64         | 6 ч           | 3           | `user_id`              | Push-уведомления пользователям        |

**Topic конфигурация (kafka-configs):**

```yaml
# gps-raw — высокопроизводительный топик
gps-raw:
  partitions: 512
  replication.factor: 3
  min.insync.replicas: 2
  retention.ms: 3600000          # 1 час
  segment.bytes: 536870912       # 512 MB сегменты для быстрого rollover
  compression.type: lz4          # быстрое сжатие для throughput
  cleanup.policy: delete
  max.message.bytes: 1048576     # max 1 MB сообщение

# matched-gps — высокая партишионность для parallel processing
matched-gps:
  partitions: 1024               # 1024 чтобы иметь достаточно параллелизма
  replication.factor: 3
  min.insync.replicas: 2
  retention.ms: 10800000         # 3 часа
  compression.type: snappy
  
# ml-training-data — длинное хранение для batch ML jobs
ml-training-data:
  partitions: 256
  replication.factor: 3
  min.insync.replicas: 2
  retention.ms: 604800000        # 7 дней
  compression.type: gzip         # лучшее сжатие для long-term
  cleanup.policy: delete
```

**Throughput расчёт:**
```
gps-raw:        10M активных устройств × 1 msg/sec = 10M msg/sec
                avg msg size = 120 bytes → 1.2 GB/sec на запись
                512 partitions → 2.3 MB/sec per partition (ok)

matched-gps:    ~85% pass rate = 8.5M msg/sec
                avg msg size = 180 bytes → 1.53 GB/sec

speed-readings: 10M segments / 60s update interval = 167K msg/sec
                avg msg size = 250 bytes → 42 MB/sec
```

### 5.9.2 Consumer Groups

**Таблица consumer groups:**

| Consumer Group                   | Topic(s) потребляемых        | Instances | SLO lag    | Назначение                                     |
|----------------------------------|------------------------------|-----------|------------|------------------------------------------------|
| `gps-validator-cg`               | `gps-raw`                    | 512       | < 5 s      | Валидация GPS точек                            |
| `map-matcher-cg`                 | `gps-validated`              | 512       | < 10 s     | Viterbi map matching                           |
| `speed-aggregator-cg`            | `matched-gps`                | 256       | < 15 s     | Агрегация скоростей (stateful)                 |
| `redis-sink-cg`                  | `traffic-segment-updates`    | 128       | < 5 s      | Запись в Redis                                 |
| `clickhouse-sink-cg`             | `traffic-segment-updates`    | 64        | < 60 s     | Batch запись в ClickHouse                      |
| `timescale-sink-cg`              | `speed-readings`             | 32        | < 120 s    | Запись в TimescaleDB                           |
| `event-processor-cg`             | `traffic-events-raw`         | 32        | < 30 s     | Верификация и обработка событий                |
| `event-broadcaster-cg`           | `traffic-events-verified`    | 32        | < 5 s      | Broadcast событий клиентам                     |
| `ml-feature-builder-cg`          | `speed-readings`             | 64        | < 30 s     | Построение ML фичей для inference              |
| `ml-training-collector-cg`       | `matched-gps`                | 16        | < 300 s    | Сбор данных для ML retraining                  |
| `routing-updater-cg`             | `routing-traffic-updates`    | 128       | < 3 s      | Обновление traffic weights в routing engine    |
| `anomaly-detector-cg`            | `speed-readings`             | 32        | < 20 s     | Детекция аномалий → автоматические события     |
| `notification-dispatcher-cg`     | `notifications-traffic`      | 64        | < 10 s     | Отправка push-уведомлений                      |
| `score-calculator-cg`            | `traffic-segment-updates`    | 16        | < 60 s     | Пересчёт regional traffic scores               |

**Consumer group конфигурация (Java KafkaConsumer):**
```java
// map-matcher-cg — критический consumer, stateful
Properties props = new Properties();
props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafkaBrokers);
props.put(ConsumerConfig.GROUP_ID_CONFIG, "map-matcher-cg");
props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");  // manual commit!
props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, "500");
props.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, "30000");  // 30s max processing
props.put(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, "45000");
props.put(ConsumerConfig.HEARTBEAT_INTERVAL_MS_CONFIG, "15000");
props.put(ConsumerConfig.FETCH_MIN_BYTES_CONFIG, "65536");       // 64 KB min fetch
props.put(ConsumerConfig.FETCH_MAX_WAIT_MS_CONFIG, "500");       // max 500ms wait

// Deserializer (Protobuf)
props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG,
    "io.confluent.kafka.serializers.protobuf.KafkaProtobufDeserializer");
props.put("schema.registry.url", schemaRegistryUrl);
```

### 5.9.3 Exactly-Once Semantics

**Проблема повторной обработки:**  
GPS-телеметрия при consumer restart или rebalance может быть обработана дважды → дублирование скоростных наблюдений → искажение traffic score.

**Решение: Idempotent Producers + Transactional Consumers**

**1. Idempotent Producer (GPS Collector → Kafka):**
```java
// Producer конфигурация для idempotent writes
Properties producerProps = new Properties();
producerProps.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, "true");
producerProps.put(ProducerConfig.ACKS_CONFIG, "all");              // acks=all обязателен
producerProps.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);
producerProps.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, "5");
producerProps.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG,
    "gps-collector-" + instanceId);  // уникальный per-producer

// Kafka присваивает producer_id + sequence_number
// → дублированные сообщения одного producer_id + seq отклоняются брокером
```

**2. Transactional Consumer (Speed Aggregator → Redis + ClickHouse):**
```python
# Transactional read-process-write (read-committed isolation)
# Гарантирует EOS при сбое consumer в середине batch

from confluent_kafka import Consumer, Producer

consumer = Consumer({
    'bootstrap.servers': KAFKA_BROKERS,
    'group.id': 'speed-aggregator-cg',
    'isolation.level': 'read_committed',    # читаем только committed transactions
    'enable.auto.commit': False,
})

producer = Producer({
    'bootstrap.servers': KAFKA_BROKERS,
    'enable.idempotence': True,
    'transactional.id': f'speed-agg-{instance_id}',
})
producer.init_transactions()

while True:
    msgs = consumer.consume(num_messages=500, timeout=0.5)
    
    if not msgs:
        continue
    
    try:
        producer.begin_transaction()
        
        for msg in msgs:
            if msg.error():
                raise KafkaException(msg.error())
            
            reading = parse_matched_gps(msg.value())
            speed_result = aggregator.update(reading)
            
            if speed_result:
                producer.produce(
                    topic='traffic-segment-updates',
                    key=str(speed_result.segment_id),
                    value=speed_result.to_protobuf()
                )
        
        # Atomically commit both: output messages + consumer offsets
        offsets = [{
            'topic': msg.topic(),
            'partition': msg.partition(),
            'offset': msg.offset() + 1
        } for msg in msgs]
        
        producer.send_offsets_to_transaction(offsets, consumer.consumer_group_metadata())
        producer.commit_transaction()
    
    except Exception as e:
        producer.abort_transaction()
        logger.error(f"Transaction aborted: {e}")
        # consumer offset не сдвигается → retry
```

**3. Idempotent Redis writes (downstream):**
```lua
-- Lua script: обновляем только если ts_bucket НОВЕЕ или равен текущему
-- Предотвращает out-of-order запись устаревших данных
local current_ts = tonumber(redis.call('HGET', KEYS[1], 'ts_bucket') or 0)
local new_ts = tonumber(ARGV[1])

if new_ts >= current_ts then
    redis.call('HSET', KEYS[1], 'ts_bucket', ARGV[1], 'mean_speed', ARGV[2],
               'category', ARGV[3], 'confidence', ARGV[4])
    redis.call('EXPIRE', KEYS[1], 300)
    return 1
else
    return 0  -- stale write rejected
end
```

**4. Idempotency для ClickHouse:**
```sql
-- ReplacingMergeTree обеспечивает idempotent inserts
-- При дублях выбирается запись с MAX(updated_at)

CREATE TABLE traffic_history ON CLUSTER '{cluster}'
(
    segment_id  UInt64,
    ts_bucket   DateTime,
    mean_speed  Float32,
    updated_at  DateTime DEFAULT now()
)
ENGINE = ReplicatedReplacingMergeTree(
    '/clickhouse/tables/{shard}/traffic_history',
    '{replica}',
    updated_at                     -- version column: побеждает наибольшее
)
ORDER BY (segment_id, ts_bucket);

-- При дублях (segment_id, ts_bucket) оставляется запись с наибольшим updated_at
-- Dedup выполняется при merge — до merge могут существовать дубли (eventual)
-- Для немедленного dedup: FINAL modifier в SELECT
SELECT * FROM traffic_history FINAL WHERE segment_id = 42891736;
```

### 5.9.4 Kafka Connect

**Connectors для sink операций:**

**PostgreSQL Sink (events и metadata):**
```json
{
  "name": "traffic-events-postgres-sink",
  "config": {
    "connector.class": "io.confluent.connect.jdbc.JdbcSinkConnector",
    "tasks.max": "8",
    "topics": "traffic-events-verified",
    "connection.url": "jdbc:postgresql://pg-primary:5432/navigation",
    "connection.user": "${file:/secrets/connect.properties:pg.user}",
    "connection.password": "${file:/secrets/connect.properties:pg.password}",
    "insert.mode": "upsert",
    "pk.mode": "record_key",
    "pk.fields": "event_id",
    "table.name.format": "traffic_events",
    "auto.create": "false",
    "auto.evolve": "false",
    "batch.size": "1000",
    "max.retries": "5",
    "retry.backoff.ms": "3000",
    "errors.tolerance": "none",
    "errors.deadletterqueue.topic.name": "traffic-events-dl",
    "errors.deadletterqueue.context.headers.enable": "true",
    "transforms": "insertTs",
    "transforms.insertTs.type": "org.apache.kafka.connect.transforms.InsertField$Value",
    "transforms.insertTs.timestamp.field": "kafka_ingested_at"
  }
}
```

**ClickHouse Sink (speed history):**
```json
{
  "name": "traffic-history-clickhouse-sink",
  "config": {
    "connector.class": "com.clickhouse.kafka.connect.ClickHouseSinkConnector",
    "tasks.max": "32",
    "topics": "traffic-segment-updates",
    "hostname": "clickhouse-lb",
    "port": "8443",
    "ssl": "true",
    "database": "navigation",
    "username": "${file:/secrets/connect.properties:ch.user}",
    "password": "${file:/secrets/connect.properties:ch.password}",
    "clickhouseSettings": "async_insert=1,wait_for_async_insert=0",
    "exactlyOnce": "true",
    "keeperOnCluster": "'{cluster}'",
    "errorsTolerance": "none",
    "errors.deadletterqueue.topic.name": "traffic-history-dl",
    "tableNameFormat": "traffic_history",
    "batch.size": "50000",
    "flush.interval.ms": "10000"
  }
}
```

**Redis Sink (real-time updates):**

> **Примечание:** Официального Kafka Connect Redis Sink нет. Используется кастомный connector на базе `kafka-connect-redis` от Jaredsburrows или self-written.

```json
{
  "name": "traffic-redis-sink",
  "config": {
    "connector.class": "com.github.jcustenborder.kafka.connect.redis.RedisSinkConnector",
    "tasks.max": "64",
    "topics": "traffic-segment-updates",
    "redis.hosts": "redis-cluster-1:6379,redis-cluster-2:6379,redis-cluster-3:6379",
    "redis.client.mode": "Cluster",
    "redis.password": "${file:/secrets/connect.properties:redis.password}",
    "redis.ssl": "true",
    "operation.timeout.ms": "2000",
    "batch.size": "500"
  }
}
```

**Schema Registry:**
```yaml
# Все топики используют Confluent Schema Registry с Protobuf schemas
schema.registry.url: https://schema-registry:8081

# Compatibility level: BACKWARD (новые схемы читают старые данные)
# Позволяет rolling upgrades без downtime
compatibility: BACKWARD

# Защита от несовместимых schema changes в prod
schema.registry.ssl.truststore.location: /certs/truststore.jks
```

### 5.9.5 Monitoring

**Ключевые метрики Kafka (Prometheus + Grafana):**

**Consumer Lag — главный SLI:**
```yaml
# Prometheus alerting rules
groups:
  - name: kafka-traffic
    rules:
    
      - alert: ConsumerLagCritical
        expr: |
          kafka_consumer_group_lag{
            group=~"map-matcher-cg|speed-aggregator-cg",
            topic=~"gps-validated|matched-gps"
          } > 100000
        for: 2m
        severity: critical
        annotations:
          summary: "Kafka consumer lag критический: {{ $labels.group }} / {{ $labels.topic }}"
          description: "Lag {{ $value }} msgs. SLO нарушен."

      - alert: ConsumerLagWarning
        expr: |
          kafka_consumer_group_lag{
            group=~"map-matcher-cg|speed-aggregator-cg"
          } > 50000
        for: 5m
        severity: warning

      - alert: ConsumerLagGrowing
        expr: |
          rate(kafka_consumer_group_lag[5m]) > 1000
        for: 3m
        severity: warning
        annotations:
          summary: "Consumer lag растёт: {{ $labels.group }}"
```

**Дашборд метрик (Grafana panel descriptions):**

| Панель                          | Query                                                          | SLO                   |
|---------------------------------|----------------------------------------------------------------|-----------------------|
| GPS Messages/sec (total)        | `rate(kafka_topic_messages_in_total{topic="gps-raw"}[1m])`    | ≥ 8M/sec (load)        |
| Consumer Lag (map-matcher)      | `kafka_consumer_group_lag{group="map-matcher-cg"}`            | < 50K msgs            |
| Consumer Lag (speed-aggregator) | `kafka_consumer_group_lag{group="speed-aggregator-cg"}`       | < 100K msgs           |
| Producer Error Rate             | `rate(kafka_producer_record_error_total[5m])`                  | < 0.01%               |
| Broker Disk Usage               | `kafka_server_log_size_bytes` per broker                       | < 80% capacity        |
| Replication Under-Replicated    | `kafka_server_replicamanager_underreplicatedpartitions`         | = 0 (критично!)       |
| Message Latency p99 (e2e)       | custom histogram от GPS send до Redis HSET                     | < 30 s                |
| Dead Letter Queue depth         | `kafka_topic_offset_max{topic=~".*-dl"}`                       | < 1000 msgs           |

**E2E Latency tracking:**
```python
# Embedded в каждое GPS сообщение
class GpsMessage:
    device_id: str
    lat: float
    lon: float
    speed: float
    ts_device: int      # timestamp на устройстве (ms)
    ts_server: int      # timestamp на GPS collector (ms)
    trace_id: str       # distributed tracing ID (OpenTelemetry)
    
# На каждом этапе pipeline добавляется span:
# GPS collector → map-matcher → speed-aggregator → redis-sink
# Итоговое e2e время: ts_redis_write - ts_device

# Prometheus histogram buckets (seconds):
GPS_E2E_LATENCY = Histogram(
    'gps_e2e_latency_seconds',
    'End-to-end GPS processing latency',
    buckets=[1, 2, 5, 10, 15, 20, 30, 45, 60, 120]
)
```

**Operational runbook при ConsumerLagCritical:**

```
1. Проверить: kafka_consumer_group_members_count{group="map-matcher-cg"}
   - Если members < expected → consumer instances упали → scale out
   
2. Проверить: kafka_jvm_gc_pause_seconds{pod=~"map-matcher-.*"}
   - Если GC > 1s → OutOfMemory risk → restart pods
   
3. Проверить upstream: kafka_consumer_group_lag{group="gps-validator-cg"}
   - Если upstream lag тоже растёт → проблема выше по стеку
   
4. Scale out: kubectl scale deployment map-matcher --replicas=+50%
   - Auto-rebalance произойдёт в течение session.timeout.ms = 45s
   
5. Если lag не снижается за 5 мин после scale:
   - Проверить broker disk: df -h на kafka brokers
   - Проверить network bandwidth: если > 80% → throttle producers
   
6. Emergency: пропустить обработку (reset offset to latest)
   ТОЛЬКО если lag > 24h AND data is expendable
   kafka-consumer-groups.sh --reset-offsets --to-latest --group map-matcher-cg
```

**Kafka Cluster конфигурация:**

```yaml
# Production Kafka cluster для Traffic Intelligence
kafka:
  brokers: 12                    # 12 брокеров = достаточно для 10M GPS/sec
  instance_type: r6i.4xlarge     # 16 vCPU, 128 GB RAM, NVMe SSD
  storage_per_broker: 4 TB NVMe  # ~48 TB total
  
  broker_config:
    num.network.threads: 16
    num.io.threads: 32
    socket.receive.buffer.bytes: 33554432     # 32 MB
    socket.send.buffer.bytes: 33554432        # 32 MB
    socket.request.max.bytes: 104857600       # 100 MB
    
    log.flush.interval.messages: 50000
    log.flush.interval.ms: 1000
    
    default.replication.factor: 3
    min.insync.replicas: 2
    unclean.leader.election.enable: false     # НЕ выбираем отстающих лидеров
    
    auto.create.topics.enable: false          # только через IaC
    
    # Защита от split-brain
    controller.quorum.voters: "1@kafka-controller-1:9093,2@kafka-controller-2:9093,3@kafka-controller-3:9093"
    
  zookeeper_replacement: KRaft   # Kafka 3.6+ без ZooKeeper
```

---

*Конец раздела 5: Traffic Intelligence Engine*

*Следующие разделы: [Раздел 6: Map Matching Engine](./02-intelligence-navigation.md#раздел-6-map-matching-engine) | [Раздел 7: Navigation Engine](./02-intelligence-navigation.md#раздел-7-navigation-engine)*

---

## Раздел 6: Map Matching Engine

Map Matching Engine — выделенный микросервис-обёртка над **Valhalla Meili**, предоставляющий единый контракт для привязки GPS-координат к дорожной сети всем потребителям платформы: Navigation Engine, GPS Tracking, Fleet Management, Traffic Analytics и ML-пайплайнам. Сервис абстрагирует конкретную реализацию алгоритма (HMM + Viterbi, описанный в [5.3 Map Matching Pipeline](#53-map-matching-pipeline)) и экспонирует два режима доступа — **online** (real-time, incremental) и **offline** (batch, полный трейс). Это позволяет независимо масштабировать и настраивать каждый режим под свои SLA.

```
                        ┌─────────────────────────────────┐
                        │      Map Matching Engine         │
                        │                                  │
  Navigation Engine ───►│  ┌──────────┐  ┌─────────────┐ │
  GPS Tracking     ───►│  │  Online  │  │   Offline   │ │
  Fleet Management ───►│  │  Matcher │  │   Matcher   │ │
                        │  └────┬─────┘  └──────┬──────┘ │
  Traffic Analytics──►│        │               │        │
  ML Training     ───►│        └───────┬────────┘        │
                        │              ▼                  │
                        │   ┌─────────────────────┐      │
                        │   │  Valhalla Meili Pool │      │
                        │   │  (Load Balanced)     │      │
                        │   └─────────────────────┘      │
                        └─────────────────────────────────┘
```

---

### 6.1 Online vs Offline Map Matching

#### 6.1.1 Online Map Matching (Real-time)

**Назначение:** привязка GPS-координат в реальном времени для активной навигации, live tracking водителей и пассажиров, мониторинга флота.

**Архитектурные характеристики:**

- Обрабатывает GPS **по одной точке** (incremental), каждый вызов — stateless с точки зрения API, но сервис хранит **sliding window** последних 5–10 точек в Redis per-device для контекста
- Target latency: **< 15 ms p99** (после вычета сетевого оверхеда — < 8 ms для matching)
- Алгоритм: **Forward-only HMM** — Viterbi без backtracking; path пересчитывается только вперёд, что даёт детерминированный результат с константной памятью O(W×C), где W = window size, C = candidate count per point
- Sliding window обеспечивает контекст для устранения неоднозначности пересечений и разворотов, не накапливая неограниченную историю

**Поток данных:**

```
GPS Device
    │
    ▼
┌────────────────────────────────────────────────────────────────────┐
│  Online Matcher Service                                            │
│                                                                    │
│  GPS Point ──► [Redis Sliding Window: last 5-10 pts per device]   │
│                          │                                         │
│                          ▼                                         │
│              [Forward-only HMM context build]                      │
│                          │                                         │
│                          ▼                                         │
│              [Valhalla Meili: single-point match]                  │
│                          │                                         │
│                          ▼                                         │
│  Matched Point ──► emit (edge_id, offset, confidence, lat, lon)   │
└────────────────────────────────────────────────────────────────────┘
    │
    ▼
Navigation Engine / Fleet Tracker / Kafka topic: gps.matched.online
```

**Redis key schema для sliding window:**

```
KEY:   mm:window:{device_id}
TYPE:  Redis List (RPUSH + LTRIM)
TTL:   120s (auto-expire если устройство замолчало)
SIZE:  max 10 элементов
VALUE: JSON { lat, lon, ts, speed, bearing, accuracy }
```

**Используется в:** Navigation Engine (re-routing trigger), GPS Tracking (live map display), Fleet Management (driver position), Ride Hailing (ETA актуализация).

#### 6.1.2 Offline Map Matching (Batch)

**Назначение:** постобработка полных GPS-трейсов для аналитики трафика, обучения ML-моделей, обнаружения новых дорог, генерации speed profiles.

**Архитектурные характеристики:**

- Обрабатывает **полный трейс целиком** — от начала до конца поездки
- Latency не критична: SLA < 30 секунд на трейс до 10K точек (batch pipeline)
- Алгоритм: **Full Viterbi** (bi-directional) — оптимальное глобальное решение, может корректировать ранние решения на основе последующего контекста
- Принимает пропуски в GPS до **300 секунд** (туннели, паркинги) с interpolation

**Batch pipeline:**

```
Completed Trip Event
    │
    ▼
Kafka topic: trips.completed
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Offline Batch Processor                                        │
│                                                                 │
│  Kafka Consumer Group: map-matcher-offline-cg                   │
│       │                                                         │
│       ▼                                                         │
│  Fetch full GPS trace from TimescaleDB / S3                     │
│       │                                                         │
│       ▼                                                         │
│  Preprocess: filter duplicates, outliers (accuracy > 50m)      │
│       │                                                         │
│       ▼                                                         │
│  POST /trace_route → Valhalla Meili batch API                   │
│       │                                                         │
│       ▼                                                         │
│  Store matched edges → traffic_segments table                   │
│  Emit → Kafka: gps.matched.offline (for ML consumers)          │
└─────────────────────────────────────────────────────────────────┘
```

**Применение downstream:**

| Consumer | Данные | Частота |
|---|---|---|
| Traffic Analytics | Скорость по edge_id | Каждый трейс |
| Speed Profile Generator | Скорость по времени суток | Ежечасная агрегация |
| New Road Detector | Точки без matched edge | Ежедневно |
| ML Training Dataset | Labeled GPS traces | Еженедельный дамп |
| Map Quality Feedback | Ошибки привязки | Realtime sink |

#### 6.1.3 Сравнительная таблица Online vs Offline

| Параметр | Online | Offline |
|---|---|---|
| Latency target | < 15 ms per point | Не критична (< 30s/trace) |
| Accuracy | 92–95% | 97–99% |
| GPS gap tolerance | до 60 секунд | до 300 секунд |
| Trace length | Unlimited (streaming) | до 10 000 точек |
| Backtracking | Нет (forward-only HMM) | Да (full Viterbi) |
| State storage | Redis sliding window per device | Stateless (full trace в памяти) |
| Throughput | 50 000 points/sec per node | 500 traces/sec per node |
| Horizontal scaling | По device_id (consistent hash) | По trip_id (round-robin) |
| Use cases | Навигация, live tracking, re-routing | Аналитика, обучение ML, road detection |
| Failure mode | Emit raw GPS if match fails | Retry / DLQ |
| Resource profile | Low memory (window only) | High memory (full trace) |

---

### 6.2 Valhalla Meili API

#### 6.2.1 Deployment Architecture

Valhalla Meili запускается как **stateless C++ binary** с memory-mapped graph files (`.bin`). Все инстансы разделяют одни и те же read-only graph-файлы через shared volume (NFS / EFS) или pre-baked в Docker image.

```
                    ┌─────────────────────────────────────┐
                    │         Load Balancer (L7)           │
                    │   (NGINX / Envoy, least-conn)        │
                    └────────────┬────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
   ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
   │  Meili Instance 1│ │  Meili Instance 2│ │  Meili Instance N│
   │  8 vCPU / 32 GB  │ │  8 vCPU / 32 GB  │ │  8 vCPU / 32 GB  │
   │  port 8002        │ │  port 8002        │ │  port 8002        │
   └────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘
            │                    │                    │
            └────────────────────┴────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Shared Graph Files     │
                    │  (Read-only NFS / EFS)   │
                    │  graph.bin: ~40 MB/1M    │
                    │  road segments           │
                    └──────────────────────────┘
```

**Ресурсные требования:**

| Параметр | Значение |
|---|---|
| Graph size | ~40 MB на 1M дорожных сегментов |
| RAM per instance | 32 GB (graph mmap + overhead) |
| CPU per 1M matches/sec | ~25 vCPU (0.025 ms/point) |
| Startup time | ~8–12 сек (mmap prewarm) |
| Min instances | 3 (HA) |
| Max instances (auto-scale) | 50 |
| Scale trigger | CPU > 70% за 2 мин или p95 latency > 20 ms |

**Kubernetes deployment фрагмент:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: valhalla-meili
spec:
  replicas: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 2
  template:
    spec:
      containers:
        - name: meili
          image: ghcr.io/valhalla/valhalla:3.4.0
          args: ["valhalla_service", "/config/meili.json", "1"]
          ports:
            - containerPort: 8002
          resources:
            requests:
              memory: "28Gi"
              cpu: "6"
            limits:
              memory: "32Gi"
              cpu: "8"
          readinessProbe:
            httpGet:
              path: /status
              port: 8002
            initialDelaySeconds: 15
            periodSeconds: 5
          volumeMounts:
            - name: graph-data
              mountPath: /data/valhalla
              readOnly: true
            - name: meili-config
              mountPath: /config
      volumes:
        - name: graph-data
          persistentVolumeClaim:
            claimName: valhalla-graph-pvc
        - name: meili-config
          configMap:
            name: meili-config
```

#### 6.2.2 API Endpoints

**POST /trace_route** — полный map matching GPS-трейса:

```json
// Request
// POST /trace_route
// Content-Type: application/json

{
  "shape": [
    {"lat": 55.7558, "lon": 37.6173, "type": "break"},
    {"lat": 55.7562, "lon": 37.6185, "type": "via"},
    {"lat": 55.7570, "lon": 37.6201, "type": "via"},
    {"lat": 55.7578, "lon": 37.6220, "type": "break"}
  ],
  "costing": "auto",
  "shape_match": "map_snap",
  "filters": {
    "attributes": ["edge.id", "edge.speed", "edge.road_class", "matched.point", "matched.distance_from_trace_point"],
    "action": "include"
  },
  "trace_options": {
    "search_radius": 50,
    "gps_accuracy": 10,
    "breakage_distance": 2000,
    "interpolation_distance": 10,
    "turn_penalty_factor": 100
  }
}
```

```json
// Response
{
  "matchings": [
    {
      "confidence": 0.973,
      "distance": 487.3,
      "duration": 62.1,
      "geometry": "encodedPolyline...",
      "legs": [
        {
          "summary": { "length": 487.3, "time": 62.1 },
          "steps": [
            {
              "distance": 210.5,
              "duration": 28.3,
              "geometry": "...",
              "name": "Тверская улица",
              "road_class": "primary",
              "speed_limit": 60,
              "maneuver": { "type": 1, "instruction": "Двигайтесь на север" }
            }
          ]
        }
      ]
    }
  ],
  "tracepoints": [
    { "waypoint_index": 0, "matchings_index": 0, "location": [37.6173, 55.7558], "name": "Тверская улица", "distance": 2.1 },
    { "waypoint_index": 1, "matchings_index": 0, "location": [37.6185, 55.7562], "name": "Тверская улица", "distance": 1.8 },
    { "waypoint_index": 2, "matchings_index": 0, "location": [37.6201, 55.7570], "name": "Тверская улица", "distance": 3.2 },
    { "waypoint_index": 3, "matchings_index": 0, "location": [37.6220, 55.7578], "name": "Охотный ряд", "distance": 4.1 }
  ]
}
```

**POST /trace_attributes** — получение атрибутов дороги для matched точек без построения маршрута:

```json
// Request
// POST /trace_attributes

{
  "shape": [
    {"lat": 55.7558, "lon": 37.6173},
    {"lat": 55.7562, "lon": 37.6185},
    {"lat": 55.7570, "lon": 37.6201}
  ],
  "costing": "auto",
  "shape_match": "map_snap",
  "filters": {
    "attributes": [
      "edge.id", "edge.speed", "edge.speed_limit", "edge.surface",
      "edge.road_class", "edge.lane_count", "edge.tunnel", "edge.bridge",
      "edge.roundabout", "node.type", "node.traffic_signal",
      "matched.point", "matched.distance_from_trace_point", "matched.confidence"
    ],
    "action": "include"
  }
}
```

```json
// Response
{
  "edges": [
    {
      "id": 84927364,
      "speed": 48,
      "speed_limit": 60,
      "surface": "paved",
      "road_class": "primary",
      "lane_count": 3,
      "tunnel": false,
      "bridge": false,
      "roundabout": false
    }
  ],
  "matched_points": [
    { "lat": 55.75581, "lon": 37.61729, "distance_from_trace_point": 1.2, "confidence": 0.98, "edge_index": 0 },
    { "lat": 55.75621, "lon": 37.61851, "distance_from_trace_point": 1.7, "confidence": 0.97, "edge_index": 0 },
    { "lat": 55.75701, "lon": 37.62012, "distance_from_trace_point": 2.1, "confidence": 0.96, "edge_index": 0 }
  ]
}
```

**WebSocket endpoint для online streaming:**

```
WS /v1/match/stream?device_id={id}&costing=auto&search_radius=35

// Client → Server (каждая GPS точка):
{ "lat": 55.7558, "lon": 37.6173, "ts": 1709730000123, "accuracy": 8, "speed": 13.8, "bearing": 42 }

// Server → Client (matched результат):
{
  "ts": 1709730000123,
  "matched": { "lat": 55.75581, "lon": 37.61729, "edge_id": 84927364, "offset": 0.43 },
  "confidence": 0.97,
  "road": { "name": "Тверская улица", "speed_limit": 60, "road_class": "primary" },
  "latency_ms": 6.2
}

// Server → Client (breakage event):
{ "ts": 1709730000123, "event": "breakage", "reason": "gap_too_large", "gap_seconds": 85 }
```

#### 6.2.3 Конфигурация Meili

```json
{
  "mjolnir": {
    "tile_dir": "/data/valhalla",
    "concurrency": 8
  },
  "meili": {
    "mode": "auto",
    "default": {
      "search_radius": 50,
      "gps_accuracy": 10,
      "breakage_distance": 2000,
      "interpolation_distance": 10,
      "turn_penalty_factor": 100,
      "max_route_distance_factor": 5.0,
      "max_route_time_factor": 5.0,
      "route": true,
      "geometry": true
    },
    "customizable": [
      "mode",
      "search_radius",
      "gps_accuracy",
      "breakage_distance",
      "interpolation_distance",
      "turn_penalty_factor",
      "sigma_z",
      "beta"
    ],
    "verbose": false,
    "grid": {
      "size": 500,
      "cache_size": 100240
    }
  },
  "service_limits": {
    "trace": {
      "max_distance": 200000.0,
      "max_locations": 10000,
      "max_shape": 16000,
      "max_best_paths": 4,
      "max_best_paths_shape": 100,
      "max_alternates": 2,
      "max_radius": 200.0,
      "max_reachability": 500,
      "max_avoid_locations": 0,
      "max_avoid_polygons_summary_length": 0
    }
  },
  "statsd": {
    "host": "statsd.monitoring.svc",
    "port": 8125,
    "prefix": "valhalla.meili"
  }
}
```

**HMM параметры — физический смысл:**

- `sigma_z` (по умолчанию = `gps_accuracy / sqrt(2*pi)`) — стандартное отклонение GPS-шума в метрах; определяет emission probability
- `beta` — коэффициент экспоненциального затухания transition probability; чем меньше, тем больше штраф за длинные переходы между кандидатами
- `turn_penalty_factor` — штраф за развороты; 100 = тяжёлый штраф (предпочитать прямо)

#### 6.2.4 Performance Tuning

| Параметр | Prod значение | Влияние на accuracy | Влияние на latency |
|---|---|---|---|
| `search_radius` | 50 m | +candidates покрытие | +2–5 ms при > 100 m |
| `gps_accuracy` | 10 m | Emission prob туже | Минимальное |
| `breakage_distance` | 2000 m | Gap handling | Минимальное |
| `interpolation_distance` | 10 m | Плотность matched pts | +1 ms на 1K pts |
| `turn_penalty_factor` | 100 | Меньше разворотов | Минимальное |
| `max_route_distance_factor` | 5.0 | Длинные детуры | +3–8 ms |
| Grid `cache_size` | 100 240 | Candidate lookup hit rate | -4 ms при cache hit |
| `concurrency` (mjolnir) | 8 | N/A | Параллельные запросы |

**Memory footprint:**

```
graph.bin для Москвы (~1.8M road segments):
  ≈ 1.8M × 40 MB/1M = 72 MB на чтение
  + candidate grid cache: ~2 GB per instance at full load
  + routing cache: ~4 GB per instance
  Total per instance: ~28–32 GB RAM
```

**CPU профиль:**

```
Single GPS point matching breakdown:
  Candidate lookup (grid):      0.005 ms
  Emission probability calc:    0.003 ms
  Transition probability calc:  0.008 ms
  Viterbi forward step:         0.004 ms
  Edge attribute lookup:        0.005 ms
  ─────────────────────────────────────
  Total per point:              0.025 ms

  → 1 instance (8 vCPU): ~320 000 points/sec
  → 50 instances:         ~16 000 000 points/sec (10M concurrent devices @ 1 pt/sec)
```

#### 6.2.5 Error Handling

**Классификация ошибок и recovery actions:**

| Код ошибки | Сценарий | Детектирование | Recovery Action |
|---|---|---|---|
| `BREAKAGE` | GPS gap > `breakage_distance` (2000 m) | Расстояние между соседними точками tracing | Разбить трейс на два, сматчить независимо |
| `LOW_CONFIDENCE` | confidence < 0.5 | Meili возвращает confidence per matching | Интерполировать по предыдущей/следующей точке или отбросить |
| `NO_CANDIDATES` | Нет дорог в радиусе `search_radius` | Пустой candidates list | Увеличить search_radius × 2 (retry), если снова пусто → OFF_ROAD |
| `OFF_ROAD` | Устройство вне дорожной сети (парк, стройка) | Retry с search_radius 200 m без результата | Emit raw GPS + флаг `off_road: true` |
| `AMBIGUOUS_MATCH` | Параллельные улицы с одинаковым score | confidence = top1_score / top2_score < 1.2 | Использовать топологический контекст из предыдущих точек |
| `TIMEOUT` | Meili не отвечает > 50 ms | Circuit breaker | Fallback → Raw GPS point, health check → restart pod |
| `INVALID_COORDINATES` | lat/lon out of bounds / NaN | Validation layer перед Meili | Отклонить точку, increment `invalid_gps_total` counter |
| `GRAPH_NOT_LOADED` | Pod рестартовал, mmap не прогрет | /status endpoint не healthy | K8s readinessProbe держит pod вне LB до прогрева |

**Pseudo-code для online error handling:**

```python
def match_point_online(device_id: str, gps: GPSPoint) -> MatchResult:
    # Validation
    if not is_valid_coordinates(gps.lat, gps.lon):
        metrics.increment("invalid_gps_total")
        return MatchResult(raw=gps, error="INVALID_COORDINATES")

    # Get sliding window context
    window = redis.lrange(f"mm:window:{device_id}", 0, 9)

    # Build request with context
    shape = window + [gps]

    try:
        result = meili_client.trace_route(shape, timeout_ms=30)
    except TimeoutError:
        circuit_breaker.record_failure()
        metrics.increment("meili_timeout_total")
        return MatchResult(raw=gps, error="TIMEOUT")

    if result.confidence < 0.5:
        metrics.increment("low_confidence_total")
        # Try to interpolate from last known matched point
        last_matched = redis.get(f"mm:last_matched:{device_id}")
        if last_matched:
            return interpolate(last_matched, gps)
        return MatchResult(raw=gps, error="LOW_CONFIDENCE")

    # Success path
    redis.rpush(f"mm:window:{device_id}", gps.to_json())
    redis.ltrim(f"mm:window:{device_id}", -10, -1)
    redis.expire(f"mm:window:{device_id}", 120)
    redis.set(f"mm:last_matched:{device_id}", result.matched_point.to_json(), ex=120)

    metrics.histogram("match_distance_meters", result.distance_from_trace_point)
    metrics.increment("match_success_total")

    return MatchResult(matched=result.matched_point, confidence=result.confidence)
```

---

### 6.3 Map Matching Accuracy Metrics

#### 6.3.1 Measurement Methodology

Точность Map Matching Engine измеряется по трём методологиям:

1. **Ground Truth Dataset** — 10 000 вручную верифицированных GPS-трейсов (проверены через видеозаписи поездок и ручную разметку в JOSM), распределённых по категориям среды
2. **Cross-validation с коммерческими провайдерами** — параллельный прогон тех же трейсов через Google Maps Roads API и Яндекс Карты; расхождение > 3 м считается кандидатом на ошибку (при этом Ground Truth — арбитр)
3. **Continuous production monitoring** — 1% production-трейсов сэмплируется и сравнивается с offline batch-результатами (offline точнее → референс для оценки online-погрешности)

**Метрики точности:**

- **Accuracy (%)** — доля GPS-точек, привязанных к правильному дорожному ребру
- **Median Distance Error (m)** — медианное расстояние между matched положением и ground truth
- **P95 Distance Error (m)** — 95-й перцентиль расстояния (worst-case для планирования)

#### 6.3.2 Accuracy Benchmarks по категориям среды

| Категория среды | Accuracy | Median error | P95 error | Основные причины деградации |
|---|---|---|---|---|
| Highway (автотрасса) | 99.2% | 1.2 m | 3.5 m | Редкие ошибки у съездов |
| Suburban (пригород) | 97.3% | 2.1 m | 7.8 m | Частные дороги вне OSM |
| Urban (городские улицы) | 95.1% | 3.5 m | 12.0 m | Параллельные улицы, разворотные петли |
| Dense Urban (urban canyon) | 89.5% | 6.2 m | 22.0 m | Многоуровневые отражения сигнала |
| Rural (сельская местность) | 96.8% | 2.8 m | 9.5 m | Грунтовые дороги без разметки в OSM |
| Tunnel | 82.1% | 12.0 m | 35.0 m | Потеря GPS-сигнала, interpolation погрешность |
| Parking / Complex Intersection | 86.4% | 8.5 m | 25.0 m | Нет дорожной сети внутри парковки |
| Bridge overlap | 91.3% | 4.8 m | 16.0 m | Неверный уровень (мост vs дорога под ним) |

**Взвешенная итоговая точность (production mix):**

```
Weighted Accuracy = Σ(weight_i × accuracy_i)

Highway     (15%) × 99.2% = 14.88%
Suburban    (20%) × 97.3% = 19.46%
Urban       (35%) × 95.1% = 33.29%
Dense Urban (10%) × 89.5% =  8.95%
Rural       ( 8%) × 96.8% =  7.74%
Tunnel      ( 5%) × 82.1% =  4.11%
Parking     ( 4%) × 86.4% =  3.46%
Bridge      ( 3%) × 91.3% =  2.74%
─────────────────────────────────────
Total:                       94.63%  ← production weighted accuracy
```

#### 6.3.3 Error Analysis

| Тип ошибки | Описание | Частота (от всех ошибок) | Mitigation Strategy |
|---|---|---|---|
| **Wrong Road (parallel streets)** | Attraction на параллельную улицу в 15–30 м | 41% | Увеличить `turn_penalty_factor`; топологическая консистентность через window |
| **Wrong Turn at Intersection** | На перекрёстке выбрано неверное направление | 22% | Использовать `bearing` из GPS; добавить `bearing_penalty` в HMM |
| **Wrong Level (bridge/tunnel)** | Совмещение на мост вместо дороги под ним | 18% | layer-тег из OSM; Z-координата если доступна; 3D-граф |
| **GPS Gap Jump** | После пропуска сигнала — резкий прыжок | 11% | `breakage_distance` + сплит трейса; dead reckoning по скорости |
| **Off-Route (new/unmapped road)** | Дорога отсутствует в OSM | 5% | Сэмплировать unmapped points → New Road Detection pipeline |
| **Noise Outlier** | accuracy > 50 m → ложный candidate | 3% | Pre-filter: отбросить точки с accuracy > `gps_accuracy × 4` |

**Wrong Road mitigation — детали алгоритма:**

Параллельные улицы различаются через **bearing consistency check**: если bearing GPS-точки расходится с bearing matched edge более чем на 30°, candidate получает penalty:

```
bearing_penalty(θ_gps, θ_edge) = exp(-|θ_gps - θ_edge|² / (2 × 30²))

При |θ| < 30°: penalty ≈ 1.0  (нет штрафа)
При |θ| = 45°: penalty ≈ 0.6  (-40%)
При |θ| = 90°: penalty ≈ 0.01 (-99%, де-факто отклонён)
```

#### 6.3.4 Monitoring Dashboard Metrics

**Prometheus метрики Map Matching Engine:**

```
# HELP map_match_rate_percent Percentage of GPS points successfully matched
# TYPE map_match_rate_percent gauge
map_match_rate_percent{mode="online",region="msk"} 94.8
map_match_rate_percent{mode="online",region="spb"} 93.1
map_match_rate_percent{mode="offline",region="msk"} 98.2

# HELP map_match_distance_meters Distance from GPS point to matched road
# TYPE map_match_distance_meters histogram
map_match_distance_meters_bucket{mode="online",le="2"} 612450
map_match_distance_meters_bucket{mode="online",le="5"} 891230
map_match_distance_meters_bucket{mode="online",le="10"} 963410
map_match_distance_meters_bucket{mode="online",le="25"} 988100
map_match_distance_meters_bucket{mode="online",le="+Inf"} 1000000

# HELP map_match_breakage_rate_percent Percentage of traces with GPS breakage event
# TYPE map_match_breakage_rate_percent gauge
map_match_breakage_rate_percent{mode="online"} 2.3
map_match_breakage_rate_percent{mode="offline"} 1.1

# HELP map_match_latency_seconds Matching latency
# TYPE map_match_latency_seconds histogram
map_match_latency_seconds_bucket{mode="online",le="0.005"} 450000
map_match_latency_seconds_bucket{mode="online",le="0.010"} 820000
map_match_latency_seconds_bucket{mode="online",le="0.015"} 975000
map_match_latency_seconds_bucket{mode="online",le="0.020"} 992000
map_match_latency_seconds_bucket{mode="online",le="+Inf"} 1000000

# HELP map_match_errors_total Total matching errors by type
# TYPE map_match_errors_total counter
map_match_errors_total{error="LOW_CONFIDENCE",mode="online"} 18340
map_match_errors_total{error="NO_CANDIDATES",mode="online"} 4210
map_match_errors_total{error="TIMEOUT",mode="online"} 127
map_match_errors_total{error="INVALID_COORDINATES",mode="online"} 892
map_match_errors_total{error="OFF_ROAD",mode="online"} 2105

# HELP meili_instance_healthy Valhalla Meili instance health (1=up, 0=down)
# TYPE meili_instance_healthy gauge
meili_instance_healthy{instance="meili-0"} 1
meili_instance_healthy{instance="meili-1"} 1
meili_instance_healthy{instance="meili-2"} 1
```

**PromQL запросы для Grafana:**

```promql
# Match rate за последние 5 минут (online)
avg_over_time(map_match_rate_percent{mode="online"}[5m])

# P95 latency online matcher
histogram_quantile(0.95, rate(map_match_latency_seconds_bucket{mode="online"}[5m]))

# P99 latency online matcher
histogram_quantile(0.99, rate(map_match_latency_seconds_bucket{mode="online"}[5m]))

# Error rate по типам (req/sec)
sum by (error) (rate(map_match_errors_total{mode="online"}[5m]))

# Breakage rate trend
avg_over_time(map_match_breakage_rate_percent{mode="online"}[1h])

# Throughput (matched points per second)
sum(rate(map_match_distance_meters_count{mode="online"}[1m]))

# Unhealthy Meili instances
count(meili_instance_healthy == 0)
```

**Grafana Alerting Rules:**

```yaml
groups:
  - name: map_matching_alerts
    rules:

      - alert: MapMatchRateCritical
        expr: avg_over_time(map_match_rate_percent{mode="online"}[5m]) < 90
        for: 5m
        labels:
          severity: critical
          team: navigation
        annotations:
          summary: "Map match rate critically low: {{ $value }}%"
          description: "Online map matching success rate below 90% for 5 minutes. Possible Meili cluster issue or GPS quality degradation."
          runbook_url: "https://wiki.internal/navigation/map-matching-runbook"
        # Action: PagerDuty P1 → on-call navigation engineer

      - alert: MapMatchLatencyHigh
        expr: histogram_quantile(0.99, rate(map_match_latency_seconds_bucket{mode="online"}[5m])) > 0.030
        for: 3m
        labels:
          severity: warning
          team: navigation
        annotations:
          summary: "Map match p99 latency {{ $value | humanizeDuration }} > 30ms"
          description: "Online matching p99 exceeds SLA of 30ms. Auto-scaling should kick in; check CPU utilisation."

      - alert: MeiliInstanceDown
        expr: count(meili_instance_healthy == 0) > 0
        for: 1m
        labels:
          severity: warning
          team: navigation
        annotations:
          summary: "{{ $value }} Meili instance(s) unhealthy"
          description: "One or more Valhalla Meili pods failed readiness check. K8s will restart automatically."

      - alert: MapMatchBreakageRateHigh
        expr: avg_over_time(map_match_breakage_rate_percent{mode="online"}[15m]) > 8
        for: 10m
        labels:
          severity: warning
          team: navigation
        annotations:
          summary: "GPS breakage rate {{ $value }}% — possible network or GPS quality issue"
          description: "High rate of GPS trace breakages may indicate cellular network degradation in a region."

      - alert: MapMatchOfflineBacklogGrowing
        expr: kafka_consumer_lag{group="map-matcher-offline-cg", topic="trips.completed"} > 50000
        for: 10m
        labels:
          severity: warning
          team: navigation
        annotations:
          summary: "Offline map matcher consumer lag: {{ $value }} messages"
          description: "Offline batch processing falling behind. Consider scaling offline-matcher replicas."
```

---

*Конец раздела 6: Map Matching Engine*

*Следующий раздел: [Раздел 7: Navigation Engine](./02-intelligence-navigation.md#раздел-7-navigation-engine)*

---

## Раздел 7: Navigation Engine

Navigation Engine — клиент-серверная система пошаговой навигации уровня Google Maps / Яндекс Навигатор. Координирует routing, traffic, map matching и TTS для real-time turn-by-turn навигации. Обрабатывает 10M+ активных навигационных сессий одновременно с latency < 200ms на reroute и < 50ms на position update.

---

### 7.1 Архитектура Navigation Engine

#### 7.1.1 Полная архитектурная диаграмма

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                           CLIENT SIDE                                        ║
║                                                                              ║
║  ┌─────────────┐   raw NMEA    ┌──────────────────┐   filtered pos          ║
║  │  GPS Sensor │ ────────────► │  Position Filter  │ ──────────────────┐    ║
║  │  (1-10 Hz)  │               │  (Kalman Filter)  │                   │    ║
║  └─────────────┘               └──────────────────┘                   ▼    ║
║                                                                 ┌────────────╢
║  ┌──────────────────────────────────────────────────────────── ►Route Follower║
║  │                                                              │  (2ms)    ║
║  │  snap_to_route()  progress tracking  off-route detection    └─────┬──────╢
║  │                                                                    │      ║
║  │                         ┌──────────────────┐ lane data            │      ║
║  │                         │   Map Renderer   │◄─────────────────────┤      ║
║  │                         │  (16ms / 60fps)  │                      │      ║
║  │                         └──────────────────┘              ┌───────▼──────╢
║  │                                                            │  Maneuver   ║
║  │                                                            │  Detector   ║
║  │                                                            │   (1ms)     ║
║  │                                                            └───────┬──────╢
║  │                                                                    │      ║
║  │                                                            ┌───────▼──────╢
║  │                                                            │ Instruction  ║
║  │                                                            │  Generator   ║
║  │                                                            │   (1ms)      ║
║  │                                                            └───────┬──────╢
║  │                                                                    │      ║
║  │                                                            ┌───────▼──────╢
║  │                                                            │  Voice Engine║
║  │                                                            │    (TTS)     ║
║  │                                                            │   (50ms)     ║
║  │                                                            └───────┬──────╢
║  │                                                                    │      ║
║  │                                                            ┌───────▼──────╢
║  │                                                            │ Audio Output ║
║  │                                                            │  (speaker)   ║
║  └────────────────────────────────────────────────────────────└──────────────╢
║                                                                              ║
╠══════════════════════════════╦═══════════════════════════════════════════════╣
║    WebSocket (wss://)        ║           Kafka (internal)                    ║
║    heartbeat: 30s            ║           topics: nav.position                ║
║    reconnect: exp backoff    ║                   nav.reroute                 ║
║                              ║                   nav.traffic                 ║
╠══════════════════════════════╩═══════════════════════════════════════════════╣
║                           SERVER SIDE                                        ║
║                                                                              ║
║  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────┐    ║
║  │  Session Manager  │   │ Re-route Service  │   │   Traffic Updater    │    ║
║  │     (5ms p99)     │   │  (30–80ms p99)    │   │     (100ms cycle)    │    ║
║  └────────┬──────────┘   └────────┬──────────┘   └──────────┬───────────┘   ║
║           │                       │                          │               ║
║           └───────────────────────┴──────────────┬───────────┘               ║
║                                                   │                           ║
║                                          ┌────────▼─────────┐                ║
║                                          │  ETA Calculator   │                ║
║                                          │     (10ms)        │                ║
║                                          └──────────────────┘                ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

#### 7.1.2 Component Responsibility

| Компонент | Сторона | Latency (p99) | Частота | Ответственность |
|---|---|---|---|---|
| **Position Tracker** | Client | 1ms | 1–10 Hz | Приём GPS NMEA, Kalman-фильтрация, дедупликация |
| **Route Follower** | Client | 2ms | 1 Hz | Проекция позиции на маршрут, progress tracking, snap |
| **Maneuver Detector** | Client | 1ms | 1 Hz | Определение следующего манёвра, trigger distance |
| **Instruction Generator** | Client | 1ms | event-driven | Генерация текстовых инструкций по шаблонам |
| **Voice Engine TTS** | Client | 50ms | event-driven | Синтез речи, очередь аудио, debounce |
| **Map Renderer** | Client | 16ms | 60 fps | OpenGL ES рендеринг тайлов, маршрута, манёвров |
| **Session Manager** | Server | 5ms | per-connection | Auth сессий, хранение state, TTL 4h |
| **Re-route Service** | Server | 30–80ms | on-demand | Вычисление альтернатив при off-route или traffic |
| **Traffic Updater** | Server | 100ms | 60s cycle | Push traffic-дельт на активные сессии |
| **ETA Calculator** | Server | 10ms | 30s cycle | Пересчёт ETA с учётом текущего трафика |

#### 7.1.3 Клиент-серверный протокол

Транспорт — WebSocket (`wss://nav.example.com/ws/v2`). Все сообщения — Protobuf-encoded `NavigationMessage` envelope.

```protobuf
syntax = "proto3";

enum MessageType {
  POSITION_UPDATE   = 0;  // client → server, 1 Hz
  ROUTE_UPDATE      = 1;  // server → client, on reroute
  TRAFFIC_UPDATE    = 2;  // server → client, 60s cycle
  REROUTE_REQUEST   = 3;  // client → server, on off-route
  REROUTE_RESPONSE  = 4;  // server → client, 30-80ms after request
  ETA_UPDATE        = 5;  // server → client, 30s cycle
  SPEED_ALERT       = 6;  // server → client, on speed camera proximity
  EVENT_ALERT       = 7;  // server → client, road closure / accident
  HEARTBEAT         = 8;  // bidirectional, 30s
  SESSION_INIT      = 9;  // client → server, on connect
  SESSION_ACK       = 10; // server → client, session confirmed
}

message NavigationMessage {
  string  session_id  = 1;  // UUID v4, assigned at SESSION_ACK
  int64   timestamp   = 2;  // Unix ms, monotonic
  uint32  sequence    = 3;  // per-session counter, replay detection
  MessageType type    = 4;
  bytes   payload     = 5;  // sub-message serialized
  bytes   hmac_sha256 = 6;  // HMAC-SHA256(session_key, fields 1-5)
}

// POSITION_UPDATE payload
message PositionUpdate {
  double  lat             = 1;
  double  lng             = 2;
  float   accuracy_m      = 3;
  float   bearing_deg     = 4;
  float   speed_ms        = 5;
  float   altitude_m      = 6;
  string  provider        = 7;  // "gps" | "fused" | "network"
}

// REROUTE_RESPONSE payload
message RerouteResponse {
  string  request_id      = 1;
  bool    rerouted        = 2;
  Route   new_route       = 3;
  float   time_saved_sec  = 4;
  string  reason          = 5;  // "off_route" | "faster" | "closure"
}
```

**WebSocket lifecycle:**

```
Client                                Server
  │── SESSION_INIT (jwt, route_id) ──►│
  │◄── SESSION_ACK (session_id) ──────│
  │── POSITION_UPDATE (1 Hz) ────────►│
  │◄── TRAFFIC_UPDATE (60s) ──────────│
  │◄── ETA_UPDATE (30s) ──────────────│
  │── HEARTBEAT (30s) ───────────────►│
  │◄── HEARTBEAT ─────────────────────│
  │ [off-route detected]               │
  │── REROUTE_REQUEST ───────────────►│
  │◄── REROUTE_RESPONSE (≤80ms) ──────│
  │ [destination reached]              │
  │── SESSION_CLOSE ─────────────────►│
```

**Reconnection strategy:** exponential backoff — 1s, 2s, 4s, 8s, 16s, cap 60s. При reconnect клиент отправляет `session_id` + последний `sequence` — сервер восстанавливает state без потери маршрута.

**Replay protection:** сервер хранит `last_sequence[session_id]` в Redis. Сообщение с `sequence ≤ last_sequence` отклоняется с кодом `409 SEQUENCE_STALE`.

---

### 7.2 Route Following

#### 7.2.1 Position Projection Algorithm

Проекция GPS-позиции на маршрут — критическая операция, выполняемая 1 Hz на клиенте. Неправильная проекция приводит к phantom reroute или неверным инструкциям.

```python
def project_to_route(
    gps_pos: LatLng,
    route_segments: List[Segment],
    current_segment_idx: int,
    search_window: int = 5,          # сегментов вперёд
    snap_threshold_m: float = 50.0,  # за пределами — off-route
) -> ProjectionResult:
    """
    Проецирует GPS-позицию на ближайший сегмент маршрута.
    Поиск ограничен окном [current_idx .. current_idx + search_window]
    для предотвращения "прыжков" на параллельные дороги.
    """
    best_dist = float('inf')
    best_seg_idx = current_segment_idx
    best_frac = 0.0
    best_projected = gps_pos

    # Ограниченный поиск вперёд по окну
    end_idx = min(current_segment_idx + search_window, len(route_segments))
    for i in range(current_segment_idx, end_idx):
        seg = route_segments[i]
        projected, frac = closest_point_on_segment(gps_pos, seg.start, seg.end)
        dist = haversine_m(gps_pos, projected)

        if dist < best_dist:
            best_dist = dist
            best_seg_idx = i
            best_frac = frac
            best_projected = projected

    # Вычисление distance_along_route
    distance_along = sum(
        route_segments[j].length_m
        for j in range(best_seg_idx)
    ) + best_frac * route_segments[best_seg_idx].length_m

    # Perpendicular distance — метрика off-route
    perp_dist = best_dist

    return ProjectionResult(
        snapped_pos=best_projected,
        segment_idx=best_seg_idx,
        fraction_in_segment=best_frac,
        distance_along_route_m=distance_along,
        perpendicular_distance_m=perp_dist,
        is_off_route=(perp_dist > snap_threshold_m),
    )


def closest_point_on_segment(
    p: LatLng, a: LatLng, b: LatLng
) -> Tuple[LatLng, float]:
    """
    Возвращает ближайшую точку на отрезке AB и fraction [0..1].
    Используем проекцию в ECEF для точности при длинных сегментах.
    """
    ab = subtract(b, a)
    ap = subtract(p, a)
    t = dot(ap, ab) / max(dot(ab, ab), 1e-10)
    t = clamp(t, 0.0, 1.0)
    projected = add(a, scale(ab, t))
    return projected, t
```

**Kalman pre-filter** перед проекцией:
- State vector: `[lat, lng, speed, bearing]`
- Process noise Q = diag([1e-8, 1e-8, 0.1, 0.5])
- Measurement noise R = `accuracy_m² * I`
- Обновление при каждом GPS fix, predict при отсутствии fix

#### 7.2.2 Route Progress Tracking

```typescript
interface RouteProgress {
  // Индексы позиции
  current_leg_index: number;          // индекс leg (0..N-1)
  current_step_index: number;         // индекс step внутри leg
  current_segment_index: number;      // индекс геометрического сегмента

  // Расстояния
  distance_remaining_m: number;       // до конца маршрута
  distance_to_next_maneuver_m: number; // до следующего манёвра
  distance_traveled_m: number;        // пройдено с начала

  // Время
  time_remaining_sec: number;         // динамически, с трафиком
  time_to_next_maneuver_sec: number;

  // Прогресс [0..1]
  fraction_traveled: number;          // distance_traveled / total_distance

  // Текущая позиция
  snapped_position: LatLng;
  bearing_on_route: number;           // градусы, направление дороги

  // Состояние
  is_off_route: boolean;
  is_arriving: boolean;               // < 50m до цели
  speed_limit_ms: number | null;
}
```

Обновление: **1 Hz** на клиенте, немедленно после GPS fix. `time_remaining_sec` пересчитывается с текущими speed-факторами из последнего `TRAFFIC_UPDATE`.

#### 7.2.3 Off-Route Detection

Алгоритм использует **3 consecutive points** за пределами порога — для устойчивости к GPS jitter у поворотов.

```python
class OffRouteDetector:
    CONSECUTIVE_THRESHOLD = 3
    GRACE_DISTANCE_M = 80  # вблизи манёвров увеличиваем порог

    def update(self, result: ProjectionResult, near_maneuver: bool) -> bool:
        threshold = self._get_threshold(result.road_class, near_maneuver)

        if result.perpendicular_distance_m > threshold:
            self.consecutive_count += 1
        else:
            self.consecutive_count = 0

        return self.consecutive_count >= self.CONSECUTIVE_THRESHOLD

    def _get_threshold(self, road_class: str, near_maneuver: bool) -> float:
        base = OFF_ROUTE_THRESHOLDS[road_class]
        return self.GRACE_DISTANCE_M if near_maneuver else base
```

**Пороги off-route по типу дороги:**

| Тип дороги | Порог (м) | Обоснование |
|---|---|---|
| `highway` / `motorway` | 50 | Широкие обочины, GPS drift |
| `primary` / `trunk` | 40 | Средние дороги |
| `secondary` / `tertiary` | 30 | Городские дороги |
| `residential` | 25 | Узкие улицы, малые отклонения |
| `complex_intersection` | 80 | Grace period, GPS bounce |
| `tunnel` | 60 | Потеря сигнала, dead reckoning |

**Grace period у манёвров:** за 100m до и 50m после поворота порог увеличивается до `GRACE_DISTANCE_M` = 80m. Это предотвращает ложный reroute при срезании угла.

#### 7.2.4 Arrived Detection

```python
def check_arrived(
    progress: RouteProgress,
    gps_speed_ms: float,
    bearing_to_dest: float,
    route_bearing: float,
) -> ArrivalState:
    """
    Многокритериальная детекция прибытия.
    Критерии комбинируются AND-логикой для устойчивости.
    """
    dist_ok    = progress.distance_remaining_m < 50.0
    slow_ok    = gps_speed_ms < 2.0  # ~7 km/h
    bearing_ok = abs(angular_diff(bearing_to_dest, route_bearing)) < 60.0

    if dist_ok and slow_ok:
        if progress.is_arriving:
            # Уже в состоянии "approaching" — подтверждаем прибытие
            return ArrivalState.ARRIVED
        else:
            return ArrivalState.APPROACHING  # trigger "arriving" voice

    if progress.distance_remaining_m < 20.0:
        # Принудительное прибытие при очень малой дистанции
        return ArrivalState.ARRIVED

    return ArrivalState.EN_ROUTE
```

| Состояние | Дистанция | Скорость | Голос |
|---|---|---|---|
| `EN_ROUTE` | > 50m | любая | — |
| `APPROACHING` | < 50m | < 2 m/s → | "Вы прибываете к пункту назначения" |
| `ARRIVED` | < 20m ИЛИ (< 50m + < 2m/s подтв.) | — | "Вы достигли пункта назначения" |

---

### 7.3 Maneuver Detection

#### 7.3.1 Maneuver Types

Полная таблица манёвров с параметрами trigger и голосового сопровождения:

| Тип манёвра | Код | Base trigger (m) | Voice lead (s) | Иконка | Описание |
|---|---|---|---|---|---|
| Поворот налево | `turn_left` | 200 | 5 | ← | Стандартный поворот |
| Поворот направо | `turn_right` | 200 | 5 | → | Стандартный поворот |
| Резкий поворот налево | `turn_sharp_left` | 250 | 6 | ⟵ | Угол > 120° |
| Резкий поворот направо | `turn_sharp_right` | 250 | 6 | ⟶ | Угол > 120° |
| Плавный поворот налево | `turn_slight_left` | 150 | 4 | ↙ | Угол < 45° |
| Плавный поворот направо | `turn_slight_right` | 150 | 4 | ↘ | Угол < 45° |
| Разворот | `uturn` | 300 | 8 | ↩ | 180°, только где разрешено |
| Въезд на кольцо | `roundabout_enter` | 200 | 5 | ⊙ | + номер выезда |
| Выезд с кольца 1-й | `roundabout_exit_1` | 100 | 3 | ⊙¹ | Первый выезд |
| Выезд с кольца 2-й | `roundabout_exit_2` | 100 | 3 | ⊙² | Второй выезд |
| Выезд с кольца 3-й | `roundabout_exit_3` | 100 | 3 | ⊙³ | Третий выезд |
| Выезд с кольца N-й | `roundabout_exit_n` | 100 | 3 | ⊙ⁿ | N-й выезд |
| Слияние налево | `merge_left` | 300 | 7 | ↖ | Выезд с трассы |
| Слияние направо | `merge_right` | 300 | 7 | ↗ | Въезд на трассу |
| Съезд (ramp) налево | `ramp_off_left` | 400 | 10 | ↲ | Съезд с автострады |
| Съезд (ramp) направо | `ramp_off_right` | 400 | 10 | ↳ | Съезд с автострады |
| Въезд на ramp | `ramp_on` | 200 | 5 | ↱ | Въезд на автостраду |
| Развилка налево | `fork_left` | 350 | 8 | ⑃ | Развилка, ехать влево |
| Развилка направо | `fork_right` | 350 | 8 | ⑂ | Развилка, ехать вправо |
| Продолжить прямо | `continue` | 0 | 0 | ↑ | Без манёвра |
| Прибытие | `arrive` | 50 | 2 | ⚑ | Финальная точка |
| Прибытие к вейпоинту | `arrive_waypoint` | 50 | 2 | ◎ | Промежуточная точка |

#### 7.3.2 Trigger Distance Calculation

Дистанция до начала голосового сопровождения зависит от скорости и типа дороги:

```
trigger_distance = base_distance × speed_factor × road_factor
```

**speed_factor** — линейный рост при превышении городской скорости (16.7 m/s = 60 km/h):

```python
def speed_factor(speed_ms: float) -> float:
    """
    На скорости < 60 km/h: фактор = 1.0
    На скорости > 60 km/h: линейный рост, cap 3.0
    """
    return max(1.0, min(3.0, speed_ms / 16.7))
```

**road_factor** по классу дороги:

| Класс дороги | `road_factor` | Обоснование |
|---|---|---|
| `motorway` / `trunk` | 1.5 | Высокая скорость, сложный выезд |
| `primary` | 1.2 | Интенсивное движение |
| `secondary` | 1.0 | Базовый |
| `residential` | 0.8 | Низкая скорость, малые расстояния |
| `service` / `living_street` | 0.7 | Очень медленно |

**Числовой пример:**
- Манёвр: `turn_right`, `base = 200m`
- Скорость: 90 km/h = 25 m/s → `speed_factor = 25 / 16.7 = 1.50`
- Дорога: `primary` → `road_factor = 1.2`
- `trigger = 200 × 1.5 × 1.2 = 360m`

При скорости 30 km/h = 8.3 m/s на `residential`:
- `trigger = 200 × 1.0 × 0.8 = 160m`

#### 7.3.3 Voice Announcement Sequence

Трёхфазная система голосовых подсказок, обеспечивающая подготовку водителя задолго до манёвра:

```
Маршрут: ... ─── 800m ─── [Phase 1] ─── 300m ─── [Phase 2] ─── 50m ─── [Phase 3] ─── МАНЁВР
```

| Фаза | Название | Дистанция (базовая) | Пример фразы | Цель |
|---|---|---|---|---|
| **Phase 1** | Preparation | 500–1000m | "Через 700 метров поверните направо" | Осознание манёвра |
| **Phase 2** | Instruction | 200–300m | "Через 200 метров поверните направо" | Подготовка перестроения |
| **Phase 3** | Confirmation | 50–100m | "Поверните направо на улицу Ленина" | Выполнение манёвра |

```python
class VoiceAnnouncementScheduler:
    PHASES = [
        Phase(name="preparation", base_dist_m=700, priority=1),
        Phase(name="instruction",  base_dist_m=250, priority=2),
        Phase(name="confirmation", base_dist_m=70,  priority=3),
    ]
    DEBOUNCE_SEC = 10  # минимальный интервал между фразами

    def tick(
        self,
        distance_to_maneuver_m: float,
        maneuver: Maneuver,
        speed_ms: float,
    ) -> Optional[Announcement]:
        trigger = compute_trigger_distance(maneuver.base_trigger_m, speed_ms, maneuver.road_class)

        for phase in reversed(self.PHASES):  # от ближней к дальней
            phase_dist = phase.base_dist_m * (trigger / maneuver.base_trigger_m)
            if distance_to_maneuver_m <= phase_dist:
                if not self._was_announced(maneuver.id, phase.name):
                    self._mark_announced(maneuver.id, phase.name)
                    return Announcement(
                        text=self._generate_text(maneuver, phase, distance_to_maneuver_m),
                        priority=phase.priority,
                    )
        return None
```

**Debounce:** если предыдущая фраза была < 10 секунд назад, откладываем до истечения интервала. Исключение: `Phase 3` (confirmation) всегда проигрывается немедленно.

---

### 7.4 Instruction Generation

#### 7.4.1 Text Template System

Шаблонная система поддерживает полную локализацию с pluralization и склонением дорожных имён.

```python
# Шаблоны на русском языке (язык по умолчанию)
TEMPLATES_RU = {
    "turn_left": {
        "preparation": "Через {distance} поверните налево",
        "instruction":  "Через {distance} поверните налево на {road_name}",
        "confirmation": "Поверните налево{road_suffix}",
    },
    "turn_right": {
        "preparation": "Через {distance} поверните направо",
        "instruction":  "Через {distance} поверните направо на {road_name}",
        "confirmation": "Поверните направо{road_suffix}",
    },
    "turn_sharp_left": {
        "preparation": "Через {distance} резкий поворот налево",
        "instruction":  "Через {distance} резко поверните налево",
        "confirmation": "Резко поверните налево",
    },
    "uturn": {
        "preparation": "Через {distance} выполните разворот",
        "instruction":  "Через {distance} разворот",
        "confirmation": "Выполните разворот",
    },
    "roundabout_enter": {
        "preparation": "Через {distance} кольцо, выезд {exit_number}",
        "instruction":  "Через {distance} на кольце {exit_number}-й выезд",
        "confirmation": "На кольце {exit_number}-й выезд",
    },
    "ramp_off_right": {
        "preparation": "Через {distance} съезд направо",
        "instruction":  "Через {distance} съезжайте направо {road_name}",
        "confirmation": "Съезжайте направо",
    },
    "arrive": {
        "confirmation": "Вы достигли пункта назначения",
    },
    "arrive_waypoint": {
        "confirmation": "Вы достигли промежуточного пункта",
    },
}


def format_distance(meters: float, lang: str = "ru") -> str:
    """
    Форматирование дистанции с правильным склонением.
    """
    if meters >= 1000:
        km = meters / 1000
        if km == int(km):
            return f"{int(km)} километр{pluralize_km(int(km), lang)}"
        return f"{km:.1f} километра"  # дробные — всегда "километра"
    else:
        m = round(meters / 50) * 50  # округление до 50м
        m = max(50, m)
        return f"{m} метров{pluralize_m(m, lang)}"


def pluralize_m(n: int, lang: str) -> str:
    if lang != "ru":
        return ""
    mod10, mod100 = n % 10, n % 100
    if mod100 in range(11, 20):  return ""
    if mod10 == 1:  return "а"
    if mod10 in (2, 3, 4):  return "а"  # "200 метра" — нет, "100 метров"
    return ""  # "через 100 метров", "через 50 метров"
```

**Формат дистанций:**

| Дистанция | Форматирование |
|---|---|
| < 100m | "через 50 метров" |
| 100–500m | "через 100/150/…/500 метров" (шаг 50m) |
| 500–1000m | "через 500/600/700/800/900 метров" (шаг 100m) |
| 1–5 km | "через 1.0 / 1.5 / … километра" (шаг 0.5km) |
| > 5 km | "через 5 / 6 / … километров" (шаг 1km) |

#### 7.4.2 SSML для Voice (TTS)

Полный SSML-документ с управлением темпом, паузами и произношением:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.1" xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       xml:lang="ru-RU">

  <!-- Аудио-сигнал перед инструкцией (earcon) -->
  <audio src="https://cdn.example.com/nav/chime_soft.mp3" />

  <prosody rate="medium" pitch="+1st" volume="loud">

    <!-- Фраза Phase 2: instruction -->
    <s>
      Через
      <say-as interpret-as="cardinal">200</say-as>
      <break time="100ms"/>
      метров поверните направо
    </s>

    <break time="200ms"/>

    <!-- Название дороги с фонетической подсказкой при необходимости -->
    <s>
      на
      <phoneme alphabet="ipa" ph="ˈprospekt ˈlɛnɪnə">
        проспект Ленина
      </phoneme>
    </s>

  </prosody>
</speak>
```

**Параметры голоса по фазам:**

| Фаза | `rate` | `pitch` | `volume` | Earcon |
|---|---|---|---|---|
| Preparation | `slow` | `0st` | `medium` | нет |
| Instruction | `medium` | `+1st` | `loud` | `chime_soft.mp3` |
| Confirmation | `fast` | `+2st` | `x-loud` | `chime_confirm.mp3` |
| Arriving | `slow` | `-1st` | `medium` | нет |

#### 7.4.3 Multi-language Support

| Язык | Код | TTS Engine | Road name fallback | Статус |
|---|---|---|---|---|
| Русский | `ru-RU` | YandexSpeechKit / Google TTS | Транслитерация | Production |
| English | `en-US` | Google TTS / AWS Polly | Original | Production |
| Türkçe | `tr-TR` | Google TTS | Транслитерация | Production |
| العربية | `ar-SA` | Google TTS | Транслитерация | Beta |
| Қазақша | `kk-KZ` | Google TTS | `ru` fallback | Beta |
| O'zbek | `uz-UZ` | Google TTS | `ru` fallback | Beta |

**Fallback strategy для road names:**
1. Взять `name:lang` тег из OSM (напр. `name:ru`)
2. Если отсутствует — взять `name` (обычно на языке страны)
3. Если не читается на целевом языке — транслитерировать (ISO 9 для кириллицы)
4. Если нет имени — использовать `ref` (напр. "М-4")
5. Если нет ref — опустить название ("поверните направо" без дороги)

---

### 7.5 Lane Guidance

#### 7.5.1 Lane Data Source

Источник данных — OSM теги `turn:lanes`, `turn:lanes:forward`, `turn:lanes:backward`.

```
Пример OSM way:
  turn:lanes:forward = "left|through|through;right"
  lanes:forward = 3
```

**Парсинг тегов:**

```python
def parse_turn_lanes(tag_value: str) -> List[List[TurnDirection]]:
    """
    Парсит OSM turn:lanes тег в структуру полос.

    Input:  "left|through|through;right"
    Output: [
        [TurnDirection.LEFT],
        [TurnDirection.THROUGH],
        [TurnDirection.THROUGH, TurnDirection.RIGHT],
    ]
    """
    lanes = tag_value.split("|")
    result = []
    for lane_str in lanes:
        directions = lane_str.split(";")
        result.append([
            DIRECTION_MAP.get(d.strip(), TurnDirection.UNKNOWN)
            for d in directions
        ])
    return result

DIRECTION_MAP = {
    "left":          TurnDirection.LEFT,
    "slight_left":   TurnDirection.SLIGHT_LEFT,
    "sharp_left":    TurnDirection.SHARP_LEFT,
    "through":       TurnDirection.THROUGH,
    "right":         TurnDirection.RIGHT,
    "slight_right":  TurnDirection.SLIGHT_RIGHT,
    "sharp_right":   TurnDirection.SHARP_RIGHT,
    "reverse":       TurnDirection.UTURN,
    "merge_to_left": TurnDirection.MERGE_LEFT,
    "merge_to_right":TurnDirection.MERGE_RIGHT,
    "none":          TurnDirection.NONE,
}
```

#### 7.5.2 Lane Guidance Visualization

Полосы отображаются за **300m до манёвра**, исчезают через **50m после**.

```
╔══════════════════════════════════════════════════════╗
║           LANE GUIDANCE  (показ за 300m)             ║
║                                                      ║
║   Пример: turn_right на 3-полосной дороге            ║
║                                                      ║
║   ┌────────┐  ┌────────┐  ┌════════╗                ║
║   │   ←    │  │   ↑    │  ║   →    ║  ← РЕКОМЕНДОВАНА║
║   │        │  │        │  ║        ║                ║
║   │ [серый]│  │ [серый]│  ║[зелёный]║               ║
║   └────────┘  └────────┘  └════════╝                ║
║      #1           #2           #3                    ║
║   not_suggested not_suggested  suggested             ║
║                                                      ║
║   Пример: рекомендованы 2 полосы из 3               ║
║                                                      ║
║   ┌────────┐  ┌════════╗  ┌════════╗                ║
║   │   ←    │  ║ ↑      ║  ║  ↑→   ║                ║
║   │ [серый]│  ║[зелёный]║  ║[зелёный]║              ║
║   └────────┘  └════════╝  └════════╝                ║
║                                                      ║
║   Легенда:                                           ║
║   ┌────────┐  Полоса неподходящая (серая)            ║
║   ╔════════╗  Полоса рекомендованная (зелёная)       ║
╚══════════════════════════════════════════════════════╝
```

**Анимация появления:** fade-in за 0.3s при пересечении 300m. Fade-out за 0.5s при проезде манёвра.

#### 7.5.3 Lane Match Algorithm

```python
def recommend_lanes(
    lane_configs: List[List[TurnDirection]],  # все полосы текущего сегмента
    next_maneuver: Maneuver,                   # следующий манёвр
    after_maneuver: Optional[Maneuver],        # манёвр через один (lookahead)
) -> List[LaneRecommendation]:
    """
    Определяет рекомендованные полосы для следующего манёвра.
    Учитывает lookahead на следующий манёвр для предотвращения
    ситуации "сразу повернул — сразу опять поворот".
    """
    required_dir = maneuver_to_direction(next_maneuver.type)
    results = []

    for idx, lane_dirs in enumerate(lane_configs):
        if required_dir in lane_dirs:
            # Первичный match — полоса подходит для манёвра
            score = 1.0

            # Lookahead correction
            if after_maneuver:
                next_dir = maneuver_to_direction(after_maneuver.type)
                # Предпочитаем полосу, которая также совместима со следующим манёвром
                if next_dir in lane_dirs or TurnDirection.THROUGH in lane_dirs:
                    score += 0.5

            # Штраф за крайние полосы (труднее перестроиться)
            if idx == 0 or idx == len(lane_configs) - 1:
                score -= 0.2

            results.append(LaneRecommendation(
                lane_index=idx,
                is_suggested=True,
                score=score,
                directions=lane_dirs,
            ))
        else:
            results.append(LaneRecommendation(
                lane_index=idx,
                is_suggested=False,
                score=0.0,
                directions=lane_dirs,
            ))

    return results


def maneuver_to_direction(maneuver_type: str) -> TurnDirection:
    return {
        "turn_left":       TurnDirection.LEFT,
        "turn_slight_left":TurnDirection.SLIGHT_LEFT,
        "turn_right":      TurnDirection.RIGHT,
        "turn_slight_right":TurnDirection.SLIGHT_RIGHT,
        "continue":        TurnDirection.THROUGH,
        "merge_left":      TurnDirection.MERGE_LEFT,
        "merge_right":     TurnDirection.MERGE_RIGHT,
        "uturn":           TurnDirection.UTURN,
    }.get(maneuver_type, TurnDirection.THROUGH)
```

---

### 7.6 Dynamic Re-routing

#### 7.6.1 Re-routing Triggers

| Триггер | Код | Приоритет | Cooldown | Автоматический | Описание |
|---|---|---|---|---|---|
| Съехал с маршрута | `off_route` | **1** (критический) | 5s | Да | 3 consecutive points > порог |
| Найден быстрее маршрут | `faster_route` | 3 (низкий) | 120s | Да | ETA reduction > 15% AND > 180s |
| Перекрытие дороги | `road_closure` | **1** (критический) | 0s | Да | Событие road_closure из Traffic |
| Изменение трафика | `traffic_change` | 2 (средний) | 60s | Да | ETA increase > 15% AND > 180s |
| Отклонение пользователя | `user_detour` | **1** (критический) | 0s | Да | Пользователь намеренно свернул |
| Запрос пользователя | `user_request` | **1** | 0s | Нет | Кнопка "Перестроить маршрут" |
| Избегание событие | `avoid_event` | 2 | 30s | Да | Авария, перекрытие на маршруте |

**Cooldown enforcement** — Redis key `reroute_cooldown:{session_id}:{trigger}` с TTL = cooldown seconds. При попытке reroute до истечения TTL — запрос отклоняется, но `off_route` state сохраняется.

#### 7.6.2 Re-routing Flow

```
CLIENT                          SERVER
  │                                │
  │ [3 consecutive off-route pts]  │
  ├── REROUTE_REQUEST ────────────►│
  │   {session_id, position,       │  t=0ms
  │    reason: "off_route",        │
  │    request_id: UUID}           │
  │                                │
  │                          ┌─────┴──────────────────────────────┐
  │                          │  1. Validate session (2ms)          │
  │                          │  2. Check cooldown Redis (1ms)      │
  │                          │  3. Spawn 3 parallel route jobs:    │
  │                          │     a) fastest (Dijkstra w/traffic) │
  │                          │     b) shortest (pure distance)     │
  │                          │     c) balanced (time+eco)          │
  │                          │  4. Aggregate results (2ms)         │
  │                          │  5. Select best + alternatives      │
  │                          └─────┬──────────────────────────────┘
  │                                │  t≈50-80ms
  │◄── REROUTE_RESPONSE ───────────┤
  │   {new_route, alternatives[2], │
  │    time_saved_sec, reason}     │
  │                                │
  │ [animate route morph 300ms]    │
  │ [play chime + toast]           │
  │                                │
  │── POSITION_UPDATE (1 Hz) ─────►│  т возобновляется
```

**Latency budget breakdown:**

| Этап | Время | Описание |
|---|---|---|
| Off-route detect (client) | 5ms | 3 consecutive checks |
| WebSocket send + network | 50ms | RTT ~25ms × 2 |
| Server validation | 2ms | JWT + cooldown check |
| Parallel routing × 3 | 80ms | p99, valhalla + traffic |
| Response network | 50ms | |
| Client UI update | 16ms | 1 frame |
| **Итого** | **~200ms** | end-to-end latency |

**Параллельное вычисление 3-х маршрутов** — fan-out через Kafka topic `routing.request` с `correlation_id`, три worker'а, результаты собираются через `routing.response` с timeout 150ms. Если один worker не ответил — используются 2 готовых результата.

#### 7.6.3 Smart Re-routing (Proactive)

Проактивный rerouting — мониторинг трафика на оставшейся части маршрута без ожидания off-route события.

```python
class ProactiveRerouteMonitor:
    """
    Запускается на сервере для каждой активной сессии.
    Периодность проверки: 30s (синхронизировано с ETA_UPDATE).
    """
    ETA_INCREASE_THRESHOLD = 0.15   # 15% рост ETA
    ETA_ABSOLUTE_MIN_SEC = 180       # минимум 3 минуты экономии

    def check(
        self,
        session: NavigationSession,
        current_eta_sec: float,
        baseline_eta_sec: float,
    ) -> Optional[RerouteRecommendation]:
        eta_increase = (current_eta_sec - baseline_eta_sec) / baseline_eta_sec
        absolute_increase = current_eta_sec - baseline_eta_sec

        if eta_increase > self.ETA_INCREASE_THRESHOLD \
                and absolute_increase > self.ETA_ABSOLUTE_MIN_SEC:
            # Ищем альтернативный маршрут
            alternative = self.routing_service.find_alternative(
                from_pos=session.current_position,
                to_pos=session.destination,
                avoid_segments=self._get_congested_segments(session.route),
            )

            if alternative and alternative.eta_sec < current_eta_sec - self.ETA_ABSOLUTE_MIN_SEC:
                time_saved = current_eta_sec - alternative.eta_sec
                return RerouteRecommendation(
                    route=alternative,
                    time_saved_sec=time_saved,
                    trigger="traffic_change",
                    auto_apply=(session.preferences.auto_reroute == True),
                )
        return None
```

**Формула принятия решения:**

```
Reroute если:
  (ETA_new - ETA_baseline) / ETA_baseline > 0.15
  AND
  (ETA_new - ETA_baseline) > 180 seconds

Пример:
  ETA_baseline = 1200s (20 мин)
  ETA_new      = 1500s (25 мин)
  Рост         = (1500-1200)/1200 = 25% > 15% ✓
  Абсолютно    = 300s > 180s ✓
  → Предложить перестройку маршрута
```

**Пользовательские предпочтения:**
- `auto_reroute: true` — автоматически применяем без подтверждения
- `auto_reroute: false` — показываем UI suggestion banner

#### 7.6.4 Re-route Animation

**Визуальный эффект morph маршрута:**

```
Старый маршрут (красный) ──────────────┐
                                        │ morph 300ms
Новый маршрут (синий)    ──────────────┘
```

```typescript
async function animateReroute(
  oldRoute: RouteGeometry,
  newRoute: RouteGeometry,
  mapRenderer: MapRenderer,
): Promise<void> {
  const MORPH_DURATION_MS = 300;

  // 1. Найти общий префикс старого и нового маршрута
  const divergePoint = findDivergencePoint(oldRoute, newRoute);

  // 2. Fade out старый маршрут начиная от точки расхождения
  await mapRenderer.animateRouteFade({
    geometry: oldRoute.sliceFrom(divergePoint),
    fromOpacity: 1.0,
    toOpacity: 0.0,
    durationMs: MORPH_DURATION_MS,
    easing: "ease-out",
  });

  // 3. Одновременно — draw new route с fade-in
  await mapRenderer.animateRouteFade({
    geometry: newRoute.sliceFrom(divergePoint),
    fromOpacity: 0.0,
    toOpacity: 1.0,
    durationMs: MORPH_DURATION_MS,
    easing: "ease-in",
  });

  // 4. Обновить камеру для показа нового маршрута
  mapRenderer.fitBounds(newRoute.bounds, { padding: 60, animated: true });
}


function showRerouteToast(timeSavedSec: number): void {
  const minutes = Math.round(timeSavedSec / 60);
  const message = minutes > 0
    ? `Маршрут перестроен. Быстрее на ${minutes} мин.`
    : "Маршрут перестроен.";

  Toast.show({
    message,
    duration: 4000,
    position: "top",
    iconUrl: "https://cdn.example.com/nav/icons/reroute.svg",
    backgroundColor: "#1A73E8",
    textColor: "#FFFFFF",
  });

  // Аудио подтверждение
  AudioPlayer.play("chime_reroute.mp3", volume: 0.8);
}
```

**Аудио последовательность при reroute:**
1. `chime_reroute.mp3` — 0.4s, при начале анимации
2. TTS фраза — "Маршрут перестроен, быстрее на 5 минут" — через 0.5s
3. Первая навигационная инструкция нового маршрута — через 2s

**Failure handling:**
- Если сервер не ответил за 150ms → клиент показывает spinner "Перестраиваю маршрут..."
- Если сервер ответил `rerouted: false` (нет лучшего маршрута) → клиент показывает "Продолжайте движение, маршрут оптимален"
- Если WebSocket отключён → reroute-запрос кешируется локально, отправляется при reconnect

---

*Конец раздела 7.1–7.6. Продолжение: [7.7 ETA Calculation → 7.12 Навигация для разных режимов]*


---

### 7.7 ETA Calculation

#### 7.7.1 ETA Formula

Базовый детерминированный расчёт ETA строится по формуле:

```
ETA = Σ(segment_length_i / predicted_speed_i)
    + Σ(turn_penalties_j)
    + Σ(traffic_light_delays_k)
```

**Источник [`predicted_speed`](./02-intelligence-navigation.md):** Traffic Intelligence Engine (раздел 5.6) — TFT-модель, прогноз на горизонт 60 мин.

**Turn penalties (эмпирические, усреднённые по 500K поездкам):**

| Тип манёвра       | Штраф (сек) | Условие применения                   |
|-------------------|-------------|--------------------------------------|
| `right_turn`      | 5           | угол 45–135°, нет светофора          |
| `left_turn`       | 8           | угол 225–315°, нет светофора         |
| `left_turn_tl`    | 22          | левый поворот со светофором          |
| `uturn`           | 15          | разворот без светофора               |
| `traffic_light`   | 20          | прямо через светофор (avg red phase) |
| `roundabout_exit` | 3           | съезд с кольца                       |

**Пример числового расчёта (маршрут 15 км, Москва, 09:15):**

```
Маршрут: Коммунарка -> Кремль (15.3 км, 8 сегментов)

Сегмент 1: 2.1 км, predicted_speed=42 km/h -> 180.0s
Сегмент 2: 1.8 км, predicted_speed=18 km/h -> 360.0s  <- пробка МКАД
Сегмент 3: 3.2 км, predicted_speed=55 km/h -> 209.5s
Сегмент 4: 1.4 км, predicted_speed=28 km/h -> 180.0s
Сегмент 5: 2.0 км, predicted_speed=35 km/h -> 205.7s
Сегмент 6: 2.1 км, predicted_speed=22 km/h -> 343.6s  <- Садовое кольцо
Сегмент 7: 1.5 км, predicted_speed=30 km/h -> 180.0s
Сегмент 8: 1.2 км, predicted_speed=20 km/h -> 216.0s

Σ segments       = 1875.8s = 31.3 мин
Σ turn_penalties = 4×left_turn×8 + 3×traffic_light×20 = 32 + 60 = 92s
Σ traffic_lights = 14 светофоров × 20s avg = 280s

ETA_rule_based  = 1875.8 + 92 + 280 = 2247.8s ≈ 37.5 мин
ETA_ml_adjusted = 2247.8 × 0.96    = 2157.9s ≈ 36 мин  <- после ML correction
```

#### 7.7.2 ETA ML Model

Rule-based ETA систематически ошибается: праздники, дождь, крупные события, непредсказуемые аварии. LightGBM-модель корректирует результат мультипликативным коэффициентом.

**Архитектура:**

```
Feature Vector -> LightGBM Regressor -> correction_factor ∈ [0.7, 1.5]

ETA_final = ETA_rule_based × correction_factor
```

**Feature set:**

```python
features = {
    # Маршрутные характеристики
    "route_length_km":          float,   # 0–500
    "route_complexity":         float,   # turns per km
    "highway_ratio":            float,   # доля highway сегментов
    "urban_ratio":              float,   # доля городских сегментов
    "num_traffic_lights":       int,

    # Временные признаки
    "hour_of_day":              int,     # 0–23
    "day_of_week":              int,     # 0–6
    "is_holiday":               bool,
    "is_rush_hour":             bool,    # 07-09 / 17-20

    # Трафик (из Traffic Intelligence Engine)
    "avg_traffic_score":        float,   # 0–10
    "max_congestion_segment":   float,   # наихудший сегмент
    "num_congested_segments":   int,

    # Погода
    "weather_condition":        int,     # clear=0, rain=1, snow=2, fog=3
    "visibility_km":            float,
    "precipitation_mm":         float,

    # Исторические ошибки
    "historical_eta_error_p50": float,
    "historical_eta_error_p95": float,
}
```

**Training:**

```
Dataset:  500K завершённых поездок (Москва + СПб, 2024–2025)
Split:    70% train / 15% val / 15% test
Retrain:  еженедельно, инкрементально
Serving:  ONNX Runtime, p99 inference < 2ms
```

**Accuracy по типам маршрутов:**

| Тип маршрута           | MAPE rule-based | MAPE ML-adjusted | Улучшение |
|------------------------|-----------------|------------------|-----------|
| Городской < 10 км      | 18.2%           | 7.8%             | −57%      |
| Городской 10–30 км     | 21.5%           | 8.1%             | −62%      |
| Трасса > 50 км         | 9.3%            | 5.7%             | −39%      |
| Смешанный              | 16.1%           | 7.2%             | −55%      |
| Час пик (07-09, 17-20) | 24.7%           | 9.4%             | −62%      |
| Снегопад / гололёд     | 31.2%           | 11.8%            | −62%      |
| Праздник               | 28.4%           | 10.1%            | −64%      |

#### 7.7.3 Dynamic ETA Update

ETA пересчитывается сервером каждые **30 секунд**.

**Smoothing (exponential moving average):**

```
displayed_eta(t) = alpha × new_eta(t) + (1 − alpha) × displayed_eta(t−1)
alpha = 0.3
```

**Пример сглаживания:**

```
t=0:  new_eta=36, displayed=36.0
t=30: new_eta=39, displayed=0.3×39 + 0.7×36 = 36.9
t=60: new_eta=38, displayed=0.3×38 + 0.7×36.9 = 37.2
t=90: new_eta=34, displayed=0.3×34 + 0.7×37.2 = 36.2
```

**Server → Client (WebSocket):**

```typescript
interface ETAUpdateMessage {
  type: "eta_update";
  session_id: string;
  raw_eta_seconds: number;
  displayed_eta_seconds: number;
  eta_confidence: "high" | "medium" | "low";
  arrival_time_iso: string;
  distance_remaining_meters: number;
  updated_at: string;
}
```

**Backpressure:** при slow connection — пропускать промежуточные обновления, отправлять только последнее. Rate limit: не более 1 update / session / 10s в degraded режиме.

---

### 7.8 Speed Alerts

#### 7.8.1 Speed Camera Database

```sql
CREATE TABLE speed_cameras (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location         GEOGRAPHY(POINT, 4326) NOT NULL,
    direction_deg    SMALLINT,
    road_segment_id  BIGINT REFERENCES road_segments(id),
    speed_limit_kmh  SMALLINT NOT NULL,
    camera_type      TEXT NOT NULL
                     CHECK (camera_type IN (
                         'stationary', 'mobile',
                         'average_speed', 'red_light', 'crosswalk'
                     )),
    avg_speed_zone_id UUID,
    source           TEXT NOT NULL
                     CHECK (source IN (
                         'gibdd_official', 'crowdsourced', 'osm'
                     )),
    verified_at      TIMESTAMPTZ,
    last_reported_at TIMESTAMPTZ,
    report_count     INT DEFAULT 1,
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_speed_cameras_location
    ON speed_cameras USING GIST(location)
    WHERE is_active = TRUE;

CREATE INDEX idx_speed_cameras_segment
    ON speed_cameras(road_segment_id)
    WHERE is_active = TRUE;
```

**Размер и обновления:**

| Регион         | Кол-во камер | Источник          | UPDATE frequency |
|----------------|-------------|-------------------|------------------|
| Москва + МО    | ~8 500      | ГИБДД + crowd     | ежедневно 03:00  |
| СПб + ЛО       | ~4 200      | ГИБДД + crowd     | ежедневно 03:00  |
| Регионы РФ     | ~22 300     | crowd + OSM       | еженедельно      |
| **Итого РФ**   | **~35 000** |                   |                  |

**Crowdsourced pipeline:**

```
User Report -> Kafka: camera_reports
           -> Validation Service (≥3 reports в 48h window)
           -> approved -> INSERT/UPDATE speed_cameras
           -> rejected -> mark unverified, not shown
```

#### 7.8.2 Speed Limit Overlay

**Иерархия источников (убывает):**

1. `speed_cameras.speed_limit_kmh`
2. OSM `maxspeed` tag
3. Inferred from road class:

| OSM highway class  | Default (город) | Default (трасса) |
|--------------------|-----------------|------------------|
| `motorway`         | —               | 110 km/h         |
| `trunk`            | 80 km/h         | 90 km/h          |
| `primary`          | 60 km/h         | 90 km/h          |
| `secondary`        | 60 km/h         | 70 km/h          |
| `residential`      | 20 km/h         | 20 km/h          |

**Цветовая индикация:**

```typescript
type SpeedIndicatorState = "green" | "yellow" | "red";

function getSpeedIndicatorState(
  currentSpeed: number,
  speedLimit: number,
  roadType: "urban" | "highway"
): SpeedIndicatorState {
  const warningThreshold = speedLimit - 5;
  const tolerance = roadType === "urban" ? 10 : 20;
  if (currentSpeed <= warningThreshold) return "green";
  if (currentSpeed <= speedLimit + tolerance) return "yellow";
  return "red";
}
```

#### 7.8.3 Alert Logic

**Pseudocode [`check_speed_alerts(position, speed, route)`](./02-intelligence-navigation.md):**

```pseudocode
function check_speed_alerts(position, speed_kmh, route):

  current_limit = get_speed_limit(position, route.current_segment)

  # Overspeed alert
  tolerance = 10 if route.road_type == "urban" else 20
  if speed_kmh > current_limit + tolerance:
    if now() - last_overspeed_alert_at > 30s:
      emit_alert(OVERSPEED, speed=speed_kmh, limit=current_limit)
      last_overspeed_alert_at = now()

  # Camera approaching alert
  upcoming = query_cameras_ahead(position, bearing=route.heading, radius=700m)
  for camera in upcoming:
    dist = haversine(position, camera.location)
    if dist < 500m and camera.id not in alerted_cameras:
      emit_alert(CAMERA_APPROACHING, type=camera.camera_type,
                 distance=dist, limit=camera.speed_limit_kmh)
      alerted_cameras.add(camera.id)

  # Average speed zone
  if route.in_avg_speed_zone:
    zone = route.current_avg_speed_zone
    elapsed = now() - zone.entry_time
    avg_speed = zone.distance_covered() / elapsed * 3600
    if avg_speed > zone.limit:
      if now() - last_avgspeed_alert_at > 60s:
        emit_alert(AVG_SPEED_WARNING, avg=avg_speed, limit=zone.limit)
        last_avgspeed_alert_at = now()
```

**Alert types и UX:**

| Alert type           | Визуал                    | Аудио                       | Haptic |
|----------------------|---------------------------|-----------------------------|--------|
| `OVERSPEED`          | красный индикатор скорости| беeп × 2                    | × 2    |
| `CAMERA_APPROACHING` | иконка камеры + дистанция | "Камера через 400 метров"   | × 1    |
| `AVG_SPEED_WARNING`  | полоса средней скорости   | "Контроль средней скорости" | × 1    |
| `RED_LIGHT_CAMERA`   | иконка светофора + камеры | "Камера на светофоре"       | × 1    |

---

### 7.9 Navigation State Machine

#### 7.9.1 Full State Diagram

```
                    user.start_navigation
      +--------------------------------------------------+
      |                                                  v
   +--+--+   route.computed  +-------------+  start   +------------+
   | IDLE|------------------>|ROUTE_PLANNED|--------->| NAVIGATING |
   +--+--+                   +-------------+          +--+------+--+
      ^                                                  |      |
      |                        off_route.detected        |      |
      |                               v                  |      | user.pause
      |                         +----------+             |      v
      |                         |OFF_ROUTE |             |  +--------+
      |                         +----+-----+             |  | PAUSED |
      |                              | reroute.triggered  |  +---+----+
      |                              v                   |      |
      |                       +------------+             |      | user.resume
      |           reroute.ok  | REROUTING  |----ok------>+      |
      |                       +------------+                    |
      |                                                NAVIGATING<-+
      |   arrived.detected
      |          v
      |   +------------+
      |   |  ARRIVED   |
      |   +------------+
      |
      |   error.* (любое состояние)
      v
   +---------+   user.dismiss
   |  ERROR  |--------------> IDLE
   +---------+
```

#### 7.9.2 State Transitions Table

| From            | To              | Trigger              | Server Action                        | Client Action               |
|-----------------|-----------------|----------------------|--------------------------------------|-----------------------------|
| `IDLE`          | `ROUTE_PLANNED` | `user.start_nav`     | `compute_route`, `create_session`    | показать preview маршрута   |
| `ROUTE_PLANNED` | `NAVIGATING`    | `route.computed`     | `start_gps_tracking`, `init_eta`     | включить voice, HUD         |
| `NAVIGATING`    | `OFF_ROUTE`     | `off_route.detected` | `log_off_route_event`                | "вы съехали с маршрута"     |
| `OFF_ROUTE`     | `REROUTING`     | `reroute.triggered`  | `request_new_route(current_pos)`     | spinner "пересчёт..."       |
| `REROUTING`     | `NAVIGATING`    | `reroute.success`    | `apply_new_route`, `reset_eta`       | dismiss spinner, новый путь |
| `REROUTING`     | `NAVIGATING`    | `reroute.fail`       | `keep_old_route`, `log_fail`         | "Не удалось пересчитать"    |
| `NAVIGATING`    | `PAUSED`        | `user.pause`         | `pause_tracking`, `freeze_eta`       | заглушить voice, dim HUD    |
| `PAUSED`        | `NAVIGATING`    | `user.resume`        | `resume_tracking`, `recalc_eta`      | включить voice, full HUD    |
| `NAVIGATING`    | `ARRIVED`       | `arrived.detected`   | `close_session`, `save_analytics`    | звук прибытия, сводка       |
| `*`             | `ERROR`         | `error.*`            | `log_error`, alert oncall (P0)       | toast "Ошибка навигации"    |
| `ERROR`         | `IDLE`          | `user.dismiss`       | `cleanup_session`                    | reset UI на главную         |

**[`isArrived()`](./02-intelligence-navigation.md) criteria:**

```typescript
function isArrived(pos: GeoPoint, dest: GeoPoint, speed: number): boolean {
  return haversine(pos, dest) < 30 && speed < 5; // < 30м И скорость < 5 км/ч
}
```

#### 7.9.3 State Persistence

**Client-side (localStorage):**

```typescript
interface PersistedNavState {
  version: 2;
  session_id: string;
  state: NavigationState;
  route_geometry: GeoJSON.LineString;
  destination: GeoPoint;
  waypoints: GeoPoint[];
  last_known_position: GeoPoint;
  last_updated: string; // ISO 8601
}

const NAV_STATE_KEY = "nav_session_v2";

function recoverNavState(): PersistedNavState | null {
  const raw = localStorage.getItem(NAV_STATE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as PersistedNavState;
  const ageMs = Date.now() - new Date(parsed.last_updated).getTime();
  if (ageMs > 8 * 3600 * 1000) {
    localStorage.removeItem(NAV_STATE_KEY);
    return null;
  }
  return parsed;
}
```

**Server-side recovery при WebSocket reconnect:**

```
Client -> Server: { type: "session_restore", session_id: "...", last_position: {...} }
Server -> Client: {
  type: "session_restored",
  state: "NAVIGATING",
  route: { ...full route object },
  eta_seconds: 1240,
  next_instruction: { ... }
}
```

Если сессия `ARRIVED` или `CANCELLED` — сервер возвращает `session_expired`, клиент удаляет localStorage.

---

### 7.10 Navigation Session

#### 7.10.1 Session Lifecycle

```
create ---> active ---> completed
                   +--> cancelled   (user.cancel)
                   +--> expired     (TTL 8h без активности)
```

**PostgreSQL schema:**

```sql
CREATE TABLE navigation_sessions (
    session_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id        TEXT NOT NULL,
    nav_mode         TEXT NOT NULL
                     CHECK (nav_mode IN (
                         'car','truck','pedestrian','bicycle','transit'
                     )),
    origin           GEOGRAPHY(POINT, 4326) NOT NULL,
    destination      GEOGRAPHY(POINT, 4326) NOT NULL,
    waypoints        GEOGRAPHY(MULTIPOINT, 4326),
    route_geometry   GEOGRAPHY(LINESTRING, 4326),
    route_options    JSONB DEFAULT '{}',
    state            TEXT NOT NULL DEFAULT 'active'
                     CHECK (state IN (
                         'active','completed','cancelled','expired'
                     )),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    expires_at       TIMESTAMPTZ NOT NULL
                     GENERATED ALWAYS AS
                         (created_at + INTERVAL '8 hours') STORED,
    total_distance_m INT,
    total_time_s     INT,
    eta_initial_s    INT,
    eta_final_s      INT,
    reroute_count    SMALLINT DEFAULT 0,
    off_route_count  SMALLINT DEFAULT 0,
    app_version      TEXT,
    os_platform      TEXT
);

CREATE INDEX idx_nav_sessions_user
    ON navigation_sessions(user_id, created_at DESC);
CREATE INDEX idx_nav_sessions_active
    ON navigation_sessions(state, expires_at)
    WHERE state = 'active';
CREATE INDEX idx_nav_sessions_destination
    ON navigation_sessions USING GIST(destination);
```

**Idempotency:** `session_id` генерируется клиентом. Повторный POST возвращает существующую сессию:

```sql
INSERT INTO navigation_sessions (...) VALUES (...)
ON CONFLICT (session_id) DO NOTHING
RETURNING *;
```

#### 7.10.2 Session Analytics

**ClickHouse таблица:**

```sql
CREATE TABLE navigation_sessions_analytics (
    session_id       UUID,
    user_id          UUID,
    nav_mode         LowCardinality(String),
    date             Date,
    hour             UInt8,
    day_of_week      UInt8,
    distance_km      Float32,
    duration_min     Float32,
    eta_initial_min  Float32,
    eta_final_min    Float32,
    eta_accuracy_pct Float32,
    reroute_count    UInt8,
    off_route_count  UInt8,
    avg_speed_kmh    Float32,
    max_speed_kmh    Float32,
    city             LowCardinality(String),
    country          LowCardinality(String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (nav_mode, date, user_id)
TTL date + INTERVAL 2 YEAR;
```

**Useful queries:**

```sql
-- Средняя длительность по режиму (за 30 дней)
SELECT nav_mode,
       avg(duration_min)   AS avg_min,
       median(distance_km) AS median_km,
       count()             AS sessions
FROM navigation_sessions_analytics
WHERE date >= today() - 30
GROUP BY nav_mode ORDER BY sessions DESC;

-- ETA accuracy percentiles
SELECT nav_mode,
       quantile(0.50)(eta_accuracy_pct) AS p50,
       quantile(0.90)(eta_accuracy_pct) AS p90,
       quantile(0.95)(eta_accuracy_pct) AS p95
FROM navigation_sessions_analytics
WHERE date >= today() - 7
GROUP BY nav_mode;

-- Reroute rate по часам суток
SELECT hour,
       sum(reroute_count) / count() AS reroutes_per_session
FROM navigation_sessions_analytics
WHERE date >= today() - 30 AND nav_mode = 'car'
GROUP BY hour ORDER BY hour;
```

#### 7.10.3 Multi-device Support

**Инвариант:** один `user_id` — одна `active` сессия.

**Handoff (mobile → car display → mobile):**

```
1. Магнитола открывает навигацию:
   GET /sessions/active?user_id=...
   -> active session возвращается
   -> подключение к WS с existing session_id

2. Сервер инвалидирует WS предыдущего устройства:
   -> { type: "session_transferred", to_device: "car_unit_123" }
   -> Прежнее устройство: follower-режим (только чтение)

3. Возврат на телефон:
   PATCH /sessions/{id} { "device_id": "phone_abc" }
```

**Redis Pub/Sub:**

```
Channel:     nav:session:{session_id}
Publisher:   navigation worker
Subscribers: все WS connections данного session_id
```

---

### 7.11 Real-Time Position Tracking Protocol

#### 7.11.1 WebSocket Protocol

**Endpoint:** `wss://nav.ecomansoni.ru/v1/track`

**HTTP Upgrade:**

```http
GET /v1/track HTTP/1.1
Host: nav.ecomansoni.ru
Upgrade: websocket
Connection: Upgrade
Authorization: Bearer <JWT>
X-Session-Id: <session_id>
X-Device-Id: <device_id>
X-Nav-Version: 2
```

**Encoding:** binary Protocol Buffers — 3–5× компактнее JSON (критично при 1M connections).

**Protobuf schema:**

```protobuf
syntax = "proto3";
package nav.v2;

// Client -> Server
message PositionUpdate {
  string session_id       = 1;
  double latitude         = 2;
  double longitude        = 3;
  float  accuracy_m       = 4;
  float  speed_mps        = 5;
  float  bearing_deg      = 6;
  float  altitude_m       = 7;
  int64  timestamp_ms     = 8;
  bool   is_mock_location = 9;  // anti-cheat: детект фейковых локаций
}

// Server -> Client
message NavigationUpdate {
  oneof payload {
    ETAUpdate           eta_update    = 1;
    ManeuverInstruction next_maneuver = 2;
    RerouteNotification reroute       = 3;
    TrafficAlert        traffic_alert = 4;
    SpeedAlert          speed_alert   = 5;
    SessionCommand      session_cmd   = 6;
  }
  int64 server_timestamp_ms = 10;
}

message ETAUpdate {
  int32  eta_seconds           = 1;
  int32  displayed_eta_seconds = 2;
  int32  distance_remaining_m  = 3;
  string arrival_time_iso      = 4;
  string confidence            = 5;  // "high"|"medium"|"low"
}

message ManeuverInstruction {
  string maneuver_type = 1;
  string road_name     = 2;
  int32  distance_m    = 3;
  string tts_text      = 4;
  bytes  lane_bitmap   = 5;
}

message SpeedAlert {
  string alert_type  = 1;  // "overspeed"|"camera_approaching"|"avg_speed"
  int32  current_kmh = 2;
  int32  limit_kmh   = 3;
  int32  distance_m  = 4;
}
```

#### 7.11.2 Position Sharing

**Частоты обновлений:**

| Use case                      | Freq   | Privacy scope         | Auto-expire              |
|-------------------------------|--------|-----------------------|--------------------------|
| Такси: driver → passenger     | 2 Hz   | только passenger      | по завершении поездки    |
| Delivery: courier → customer  | 1 Hz   | только customer       | по завершении доставки   |
| Friends live location         | 0.5 Hz | явно выбранные friends| 15 мин – 8 ч (user cfg)  |
| Family safety                 | 1 Hz   | члены family-группы   | постоянно (можно отключить)|

**Privacy enforcement (Zero Trust):**

```
1. Требуется ЯВНЫЙ consent:
   POST /location-sharing/consent
   { sharer_user_id, viewer_user_id, duration_seconds, scope }
   -> short-lived share_token (signed JWT, exp = duration)

2. Viewer подключается только с valid share_token:
   WS: { type: "subscribe_location", share_token: "ey..." }
   -> Server: verify JWT signature + expiry + Redis blacklist

3. Revocation:
   DELETE /location-sharing/consent/{id}
   -> jti в Redis blacklist -> немедленное прерывание stream

4. Auto-expire: воркер каждые 60s чистит expired консенты
```

**Subscribe/receive flow:**

```
Viewer -> WS: { type: "subscribe_position", share_token: "ey..." }
Server:       verify JWT -> get sharer session_id
              SUBSCRIBE Redis: nav:position:{session_id}

Sharer -> WS: PositionUpdate (500ms)
Server:       map-match -> PUBLISH nav:position:{session_id}
Viewer <- WS: { type: "position_update", lat, lng, bearing, speed }
```

#### 7.11.3 Scaling

**Целевые параметры:**

| Метрика                          | Target         |
|----------------------------------|----------------|
| Concurrent WebSocket connections | 1 000 000      |
| WebSocket nodes                  | 20             |
| Connections per node             | 50 000         |
| Position update throughput       | 500 000 msg/s  |
| Redis pub/sub channels           | ~200 000       |
| p99 end-to-end latency           | < 150 ms       |

**Geohash-based sharding:**

```
Nodes partitioned by geohash precision 4 (~40 km cells)
LB routes by geohash hint в URL:
  wss://nav.ecomansoni.ru/v1/track?gh=ucfv
Cross-cell move -> handoff через Redis channel relay
```

**Redis Cluster:**

```
6 nodes (3 primary + 3 replica)

Namespaces:
  nav:position:{session_id}    -> pub/sub (позиции)         TTL 60s
  nav:session:{session_id}     -> hash (session state)      TTL 28800s
  nav:geohash:{gh4}:sessions   -> sorted set (sessions)
```

**Bandwidth:**

```
1 PositionUpdate (protobuf) ≈ 48 bytes
500K/s × 48 = 24 MB/s inbound
Fan-out 1.2× = 29 MB/s outbound
Total ≈ 53 MB/s << 20 nodes × 10 Gbps
```

---

### 7.12 Навигация для разных режимов

#### 7.12.1 Car Navigation

**Feature set:** полный — voice guidance, lane guidance, speed alerts, camera alerts, traffic rerouting, HUD mode.

**Профили маршрутизации:**

| Профиль          | Оптимизирует             | Типичный use case          |
|------------------|--------------------------|----------------------------|
| `fastest`        | время (default)          | повседневные поездки       |
| `shortest`       | расстояние               | экономия топлива / EV      |
| `eco`            | расход (~90 km/h cruise) | дальние поездки            |
| `avoid_tolls`    | без платных дорог        | бережливость               |
| `avoid_highways` | только местные дороги    | туристы                    |

**HUD mode config:**

```typescript
interface HUDConfig {
  fontSize:            "xl" | "2xl";
  highContrast:        boolean;    // белый фон, чёрный текст
  mirrorMode:          boolean;    // зеркальное для HUD-плёнок
  visibleFields:       Array<"speed" | "eta" | "next_turn" | "distance_next">;
  speedometerPosition: "left" | "right";
}
```

#### 7.12.2 Truck Navigation

**Vehicle profile:**

```typescript
interface TruckProfile {
  height_cm:    number;   // default: 400
  width_cm:     number;   // default: 255
  length_cm:    number;   // default: 1360
  weight_t:     number;
  axle_load_t:  number;
  adr_class?:   number;   // 1–9 (ADR опасные грузы)
  emit_class:   "euro3" | "euro4" | "euro5" | "euro6";
}
```

**Таблица ограничений сегментов:**

| Тип ограничения   | Параметр профиля | Действие                        |
|-------------------|------------------|---------------------------------|
| Высота моста      | `height_cm`      | исключить segment если ниже     |
| Вес моста         | `weight_t`       | исключить segment если ниже     |
| Жилая зона        | `no_trucks`      | исключить полностью             |
| ADR-запрет        | `adr_class`      | overlay запрещённых сегментов   |
| Время въезда      | `time_window`    | динамический фильтр по времени  |
| Ширина проезда    | `width_cm`       | исключить узкие улицы           |

#### 7.12.3 Pedestrian Navigation

- Приоритет: `highway=footway`, `footway=sidewalk`, `crossing`, `tunnel`, `bridge`
- `highway=steps` — штраф скорости: 0.5 m/s (vs 1.4 m/s на ровной поверхности)
- Нет speed alerts, нет lane guidance
- **Haptic feedback** вместо голоса по умолчанию

**Indoor navigation:**

```
Источники:    OpenIndoorMaps, venue GeoJSON floor plans
Объекты:      ТРЦ, аэропорты, вокзалы, метро
Floor change: лифт/эскалатор/лестница — отдельные edge типы
Routing:      multi-level A* + penalty на смену этажа (30s)
Indoor pos:   WiFi fingerprinting / BLE beacons (точность 2–5 м)
```

**Accessibility:**

```typescript
interface AccessibilityOptions {
  wheelchair:        boolean; // избегать ступени, предпочесть пандусы
  avoid_stairs:      boolean;
  prefer_elevators:  boolean;
  max_incline_pct:   number;  // default: 8% для wheelchair
  avoid_cobblestone: boolean;
}
```

#### 7.12.4 Bicycle Navigation

**Приоритет edge'ей (убывает):**

```
1. highway=cycleway
2. highway=path + bicycle=designated
3. highway=residential
4. highway=secondary + cycleway=track
5. Всё остальное с penalty
Исключить: highway=motorway, bicycle=no
```

**Elevation penalty (для grade > 3%):**

```
extra_s = grade_pct × segment_length_m × 0.008
```

**Surface type penalties:**

| OSM `surface=` | Penalty factor | Avg speed  |
|----------------|----------------|------------|
| `asphalt`      | 1.0            | 20 km/h    |
| `paved`        | 1.0            | 18 km/h    |
| `concrete`     | 1.1            | 18 km/h    |
| `sett`         | 1.5            | 12 km/h    |
| `gravel`       | 1.8            | 12 km/h    |
| `unpaved`      | 2.2            | 10 km/h    |
| `grass`        | 3.0            | 8 km/h     |

#### 7.12.5 Public Transit Navigation

**Мультимодальный маршрут:**

```
walk ---> bus ---> metro ---> walk
           |
           +--> [transfer] ---> tram ---> walk

Оптимизация: min(total_time) | min(transfers) — выбор пользователя
```

**GTFS Integration:**

```
GTFS-static: еженедельное обновление от операторов
GTFS-RT:     задержки/отмены в реальном времени, update каждые 30s

PostgreSQL: stops, routes, trips, stop_times (~50M rows)
Redis:      gtfs:delays:{route_id}:{trip_id} -> delay_s  (TTL 5 мин)
```

**Fare calculation:**

```typescript
interface TransitFare {
  currency:     "RUB" | "USD" | "EUR";
  total_amount: number;
  breakdown: Array<{
    operator:  string;    // "Московский Метрополитен"
    line:      string;
    fare:      number;
    fare_type: "flat" | "distance_based" | "zone_based";
  }>;
  payment_methods: string[]; // ["troika", "bank_card", "qr"]
}
```

#### 7.12.6 Сравнительная таблица режимов

| Feature                   | Car    | Truck  | Pedestrian | Bicycle | Transit     |
|---------------------------|--------|--------|------------|---------|-------------|
| Voice guidance            | Full   | Full   | Optional   | Optional| Partial     |
| Lane guidance             | Yes    | Yes    | No         | No      | No          |
| Speed alerts              | Yes    | Yes    | No         | No      | No          |
| Camera alerts             | Yes    | Yes    | No         | No      | No          |
| Rerouting                 | Auto   | Auto   | Manual     | Manual  | Auto        |
| Traffic integration       | Full   | Full   | Limited    | Limited | GTFS-RT     |
| Elevation profile         | No     | No     | No         | Yes     | No          |
| Offline routing           | Yes    | Yes    | Yes        | Yes     | Limited     |
| Indoor navigation         | No     | No     | Yes        | No      | Yes (metro) |
| Multi-modal               | No     | No     | No         | No      | Yes         |
| ETA accuracy (MAPE)       | ±8%    | ±10%   | ±15%       | ±15%    | ±6%         |
| HUD mode                  | Yes    | Yes    | No         | No      | No          |
| Accessibility options     | No     | No     | Yes        | Limited | Yes         |
| Vehicle restrictions      | No     | Yes    | No         | Limited | No          |
| Avg routing speed         | 35–90  | 25–80  | 4–6 km/h   | 12–22   | varies      |

---

## Приложение B: Глоссарий Part 2

| Термин                     | Определение                                                                                                            |
|----------------------------|------------------------------------------------------------------------------------------------------------------------|
| **HMM**                    | Hidden Markov Model — вероятностная модель, где GPS-точки (наблюдения) порождаются скрытым состоянием (позиция на дороге) |
| **Viterbi**                | Алгоритм динамического программирования для нахождения наиболее вероятной последовательности скрытых состояний в HMM   |
| **Map Matching**           | Привязка «сырых» GPS-координат к дорожному графу с учётом вероятностных моделей emission и transition                  |
| **Emission Probability**   | В HMM: вероятность того, что скрытое состояние (road segment) породит наблюдаемую GPS-точку                            |
| **Transition Probability** | В HMM: вероятность перехода между соседними road segments; учитывает дорожное расстояние vs crow-fly distance          |
| **Traffic Score**          | Агрегированный балл загруженности (0–10); аналог Яндекс Пробок: 0 = свободно, 10 = полный коллапс                     |
| **MAPE**                   | Mean Absolute Percentage Error — среднее абсолютное процентное отклонение предсказания от факта                        |
| **TFT**                    | Temporal Fusion Transformer — нейросетевая архитектура для прогнозирования временных рядов с вниманием к горизонтам    |
| **TTS**                    | Text-to-Speech — синтез речи; используется для голосовых навигационных инструкций                                      |
| **SSML**                   | Speech Synthesis Markup Language — XML-разметка для управления произношением, темпом и паузами TTS                     |
| **ETA**                    | Estimated Time of Arrival — прогнозируемое время прибытия к точке назначения                                          |
| **Re-routing**             | Пересчёт маршрута при отклонении или ухудшении трафика; стратегии: immediate, delayed, predictive                      |
| **Lane Guidance**          | Рекомендуемая полоса движения перед манёвром на основе данных разметки OSM/HERE                                        |
| **Geofencing**             | Обнаружение пересечения пользователем виртуальных географических границ; используется для arrived detection и rerouting |
| **k-anonymity**            | Каждая запись неотличима от ≥ k−1 других; защищает маршруты пользователей от деанонимизации трафика                   |

---

> **Далее:** [03-search-geocoding.md](./03-search-geocoding.md) — Part 3: Search, Geocoding & POI
