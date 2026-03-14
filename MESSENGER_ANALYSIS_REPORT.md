# Технический анализ: Crisis Mesh Messenger и Columba (LXMF)

## Содержание

1. [Введение](#введение)
2. [Crisis Mesh Messenger](#crisis-mesh-messenger)
   - [Обзор](#обзор-crisis-mesh-messenger)
   - [Архитектура](#архитектура-crisis-mesh-messenger)
   - [Технологический стек](#технологический-стек-crisis-mesh-messenger)
   - [Функции и возможности](#функции-и-возможности-crisis-mesh-messenger)
   - [Статус разработки](#статус-разработки-crisis-mesh-messenger)
3. [Columba (LXMF Messenger)](#columba-lxmf-messenger)
   - [Обзор](#обзор-columba)
   - [Архитектура](#архитектура-columba)
   - [Технологический стек](#технологический-стек-columba)
   - [Функции и возможности](#функции-и-возможности-columba)
   - [Статус разработки](#статус-разработки-columba)
4. [Сравнительный анализ](#сравнительный-анализ)
5. [Выводы](#выводы)

---

## Введение

В данном отчёте представлен подробный технический анализ двух децентрализованных мессенджеров, предназначенных для использования в условиях отсутствия традиционной инфраструктуры связи:

1. **Crisis Mesh Messenger** - открытый проект для кризисных ситуаций
2. **Columba (LXMF)** - более зрелый мессенджер для сети Reticulum

Оба приложения направлены на обеспечение коммуникации в условиях, когда интернет, сотовые вышки или центральные серверы недоступны.

---

## Crisis Mesh Messenger

### Обзор

**Crisis Mesh Messenger** — это децентрализованное приложение для обмена сообщениями, разработанное для кризисных ситуаций. Проект создан для обеспечения связи при отказе традиционной инфраструктуры (интернет, сотовые вышки) вследствие:

- Природных катастроф
- Войн и конфликтов
- Цензуры
- Удалённых местоположений

Сообщения передаются от устройства к устройству с использованием Bluetooth и WiFi Direct, создавая устойчивую mesh-сеть, не требующую центральной инфраструктуры.

### Архитектура

#### Структура проекта

```
lib/
├── core/
│   ├── di/              # Dependency injection setup
│   ├── models/          # Data models
│   ├── services/        # Business logic services
│   └── utils/           # Utilities and constants
├── features/
│   ├── messaging/       # Chat and conversations
│   ├── network/        # Mesh network management
│   └── settings/       # App settings
├── ui/
│   ├── screens/        # Screen widgets
│   ├── widgets/        # Reusable widgets
│   └── theme/          # App theming
└── main.dart
```

#### Ключевые компоненты

**MeshNetworkService** — управление mesh-сетью:

- Обнаружение пиров (симулируется в текущей версии)
- Подключение к пирам
- Эпидемическая маршрутизация (broadcast to all neighbors)
- Store-and-forward для офлайн доставки
- Управление TTL (Time To Live) и hop count

**MessageStorageService** — постоянное хранилище:

- Использует Hive (зашифрованная локальная база данных)
- Сохранение сообщений и диалогов
- Управление статусами сообщений

**Message Model**:

```dart
class Message {
  final String id;
  final String senderId;
  final String recipientId;
  final String content;
  final DateTime timestamp;
  final MessageStatus status;
  final int hopCount;
  final int maxHops;
  final List<String> routePath;
  final String? encryptedContent;
  final bool isEncrypted;
}
```

#### Сетевая архитектура

- **Обнаружение пиров**: Симуляция в текущей версии, планируется реализация на Android через Nearby Connections API, WiFi Direct, Bluetooth LE; на iOS — Multipeer Connectivity
- **Маршрутизация**: Эпидемическая (flooding) — сообщения рассылаются всем подключённым пирам
- **Хоппинг**: Сообщения могут проходить через несколько устройств (maxHops = 10 по умолчанию)
- **Store-and-forward**: Сообщения буферизуются для офлайн пиров и доставляются при появлении

### Технологический стек

| Компонент | Технология |
|-----------|------------|
| Framework | Flutter 3.29+ |
| Language | Dart 3.7+ |
| State Management | Provider + GetIt (MVVM) |
| Local Storage | Hive (encrypted) |
| Communication (Android) | Nearby Connections API, WiFi Direct, Bluetooth LE |
| Communication (iOS) | Multipeer Connectivity, Bluetooth LE |
| Encryption | libsodium или Signal Protocol (planned) |

### Функции и возможности

#### Текущие функции (v0.1.0)

- Базовая UI (Home, Chat, Network Status экраны)
- Компоненты UI (message bubbles, conversation list)
- Локальное хранилище (Hive)
- Архитектура сервисов (MVVM с Provider/GetIt)
- Симулированное обнаружение пиров

#### Планируемые функции

- Реальное Bluetooth/WiFi mesh-сетирование
- Многоп跳转ная ретрансляция сообщений
- E2E шифрование
- Групповые сообщения
- Медиа поддержка (голосовые сообщения, изображения, файлы)
- Визуализация сети

### Статус разработки

| Фаза | Статус | Описание |
|------|--------|----------|
| Phase 1: Proof of Concept | ✅ Завершено | UI, архитектура, документация |
| Phase 2: Real Mesh Networking | 🔄 Планируется | Bluetooth/WiFi mesh-сетирование |
| Phase 3: Multi-Hop Relay | 📋 Запланировано | Многоп跳转ная маршрутизация |
| Phase 4: Security & Encryption | 📋 Запланировано | E2E шифрование |
| Phase 5: Performance & Reliability | 📋 Запланировано | Оптимизация батареи и производительности |
| Phase 6: Advanced Features | 📋 Запланировано | Группы, медиа, визуализация |
| Phase 7: Production Release | 📋 Запланировано | Релиз v1.0.0 |

---

## Columba (LXMF Messenger)

### Обзор

**Columba** (от лат. «голубь» — символ мира и надежды) — это защищённый peer-to-peer мессенджер и приложение для голосовых вызовов, работающее поверх сети [Reticulum](https://github.com/markqvist/Reticulum).

Приложение позволяет отправлять сообщения LXMF и совершать голосовые вызовы LXST без依赖 интернета, сотовых вышек или центральных серверов.

#### Ключевые возможности

- Отправка сообщений без инфраструктуры
- Подключение через Bluetooth LE, WiFi, LoRa радио (RNode), TCP
- E2E шифрование без аккаунтов и отслеживания
- Обмен местоположением с офлайн картами
- Поддержка нескольких идентичностей
- Экспорт/импорт идентичностей через QR код
- Настраиваемые цветовые темы

### Архитектура

#### Структура проекта

```
columba/
├── app/                    # Main Android application
├── data/                  # Data layer (Room, repositories)
├── reticulum/             # Reticulum bridge and utilities
├── micron/                # Micron markup parser
├── python/                # Python code for Reticulum (via Chaquopy)
│   ├── rnode_interface.py
│   ├── reticulum_wrapper.py
│   ├── ble_modules/
│   └── drivers/
└── docs/                  # Documentation
```

#### Архитектура BLE (многослойная)

```
Python Layer (ble-reticulum)
├── BLEInterface           # Protocol handler, fragmentation
├── BLEPeerInterface       # Per-peer routing
└── AndroidBLEDriver       # Chaquopy bridge to Kotlin

Kotlin Native Layer
├── KotlinBLEBridge        # Entry point, peer tracking
├── BleScanner             # Adaptive intervals
├── BleAdvertiser          # Identity advertising
├── BleGattClient          # Central mode
├── BleGattServer          # Peripheral mode
└── BleOperationQueue      # Serialized GATT ops

Android BLE Stack
├── BluetoothAdapter
├── BluetoothLeScanner
├── BluetoothLeAdvertiser
├── BluetoothGatt
└── BluetoothGattServer
```

#### GATT Service Structure

| Characteristic | UUID | Properties | Purpose |
|---------------|------|------------|---------|
| RX | 37145b00-442d-4a94-917f-8f42c5da28e5 | WRITE | Central → Peripheral data |
| TX | 37145b00-442d-4a94-917f-8f42c5da28e4 | READ, NOTIFY | Peripheral → Central data |
| Identity | 37145b00-442d-4a94-917f-8f42c5da28e6 | READ | 16-byte transport identity |

#### Reticulum Network

**Reticulum** — это сетевой стек, позволяющий устройствам общаться напрямую друг с другом, формируя устойчивые mesh-сети. Оптимизирован для низкой пропускной способности и высокой задержки соединений.

**LXMF** (Lightweight Extensible Message Format) — формат сообщений для Reticulum с:
- E2E шифрованием
- Подтверждением доставки
- Store-and-forward
- Ретрансляцией через промежуточные узлы

**LXST** — протокол для голосовых вызовов поверх Reticulum

### Технологический стек

| Компонент | Технология |
|-----------|------------|
| Platform | Android |
| Language | Kotlin + Python (via Chaquopy) |
| UI Framework | Jetpack Compose + Material Design 3 |
| DI | Hilt |
| Database | Room |
| Network | Reticulum (Python) |
| BLE | Native Android BLE API |
| Encryption | Reticulum native (E2E) |
| Maps | Offline vector/raster (MBTiles) |

### Функции и возможности

#### Текущие функции

- [x] Отправка сообщений без интернета
- [x] Подключение через Bluetooth LE, WiFi, LoRa (RNode), TCP
- [x] E2E шифрование
- [x] Обмен местоположением
- [x] Офлайн карты (векторные и растровые, MBTiles)
- [x] Несколько идентичностей
- [x] Экспорт/импорт идентичностей (QR код)
- [x] Настраиваемые темы
- [x] Голосовые вызовы (LXST)
- [x] Поддержка Tor (опционально)
- [x] USB bridge для RNode

#### Планируемые функции

- Улучшение производительности BLE
- Улучшение офлайн карт
- Дополнительные функции для голосовых вызовов

### Статус разработки

Columba — это активно разрабатываемый проект с:
- Регулярными релизами
- Comprehensive тестами (много юнит и интеграционных тестов)
- Документацией для пользователей и разработчиков
- Поддержкой сообщества

---

## Сравнительный анализ

| Критерий | Crisis Mesh Messenger | Columba (LXMF) |
|----------|----------------------|----------------|
| **Платформа** | Android, iOS | Android |
| **Язык** | Dart (Flutter) | Kotlin + Python |
| **Степень зрелости** | POC (v0.1.0) | Production-ready |
| **Сеть** | Custom mesh | Reticulum |
| **Mesh-сетирование** | Bluetooth, WiFi Direct | Bluetooth LE, WiFi, LoRa, TCP |
| **E2E шифрование** | Запланировано | ✅ Реализовано |
| **Голосовые вызовы** | Запланировано | ✅ LXST |
| **Офлайн карты** | ❌ | ✅ |
| **Идентичности** | Устройство | Множественные |
| **Store-and-forward** | ✅ | ✅ |
| **Маршрутизация** | Эпидемическая | Reticulum routing |
| **Лицензия** | MIT | MIT |

### Преимущества Crisis Mesh Messenger

1. **Кроссплатформенность**: Поддержка Android и iOS
2. **Современный UI**: Material Design 3 на Flutter
3. **Простота**: Лёгкая архитектура для понимания
4. **Активное сообщество**: Humanitarian focus

### Преимущества Columba

1. **Зрелость**: Production-ready с реальным mesh-сетированием
2. **Reticulum**: Проверенная децентрализованная сеть
3. **Множественные интерфейсы**: Bluetooth, WiFi, LoRa, TCP, Tor
4. **Голосовые вызовы**: Встроенная поддержка LXST
5. **Офлайн карты**: Поддержка векторных и растровых карт
6. **Множественные идентичности**: Управление несколькими личностями

---

## Выводы

### Crisis Mesh Messenger

Подходит для:
- Изучения архитектуры децентрализованных мессенджеров
- Создания нового проекта с нуля
- Исследовательских целей
- Humanitarian проектов с ограниченными ресурсами

**Ограничения**: Требует значительной доработки для production использования. Текущая версия — это POC с симулированным mesh-сетированием.

### Columba (LXMF)

Подходит для:
- Реального использования в условиях отсутствия инфраструктуры
- Интеграции с существующей экосистемой Reticulum
- Проектов, требующих голосовой связи
- Требовательных к надёжности сценариев

**Преимущества**: Более зрелый и проверенный продукт с реальной поддержкой mesh-сетирования через различные интерфейсы.

### Рекомендации

1. **Для нового проекта**: Рассмотреть использование Reticulum/LXMF в качестве основы
2. **Для изучения**: Crisis Mesh Messenger — хорошая отправная точка для понимания концепций
3. **Для production**: Columba — более надёжный выбор с реальным функционалом
4. **Для гибридного подхода**: Возможно использовать Crisis Mesh Messenger как inspiration для новых функций в существующих проектах

---

*Дата анализа: 2026-03-14*
*Источники: GitHub репозитории проектов*
