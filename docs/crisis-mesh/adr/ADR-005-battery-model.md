# ADR-005 — Battery Model

## Статус
Принято — 2026-04-17.

## Контекст
Crisis-mesh должен работать **часами** в фоне на устройствах, которые могут
не иметь возможности зарядиться (катастрофа, отключение электричества).
Непрерывный BLE advertising + scanning быстро разряжает батарею.

## Цели

| Режим | Расход батареи | Обнаружение пиров |
|---|---|---|
| Active (экран включён) | ≤15%/час | ≤3 сек |
| Background (свёрнуто) | ≤5%/час | ≤15 сек |
| Low power (<20% заряда) | ≤2%/час | ≤60 сек |

## Решение

### Duty cycle для BLE

| Режим | Advertising | Scanning |
|---|---|---|
| Active | постоянно | 1 сек каждые 3 сек |
| Background | 100ms каждые 1 сек | 1 сек каждые 10 сек |
| Low power | 100ms каждые 10 сек | 1 сек каждые 60 сек |

### Адаптивная стратегия

```typescript
function getDutyCycle(): DutyCycle {
  const battery = await navigator.getBattery?.();
  if (battery && battery.level < 0.2 && !battery.charging) return 'low-power';
  if (document.hidden) return 'background';
  return 'active';
}
```

### Auto-switch по событиям

| Событие | Действие |
|---|---|
| Экран заблокирован >60s | → background |
| Заряд <20%, не заряжается | → low-power |
| Активный SOS в группе | → active (форсируем независимо от заряда) |
| Пользователь открыл crisis-mesh screen | → active |
| Устройство подключено к зарядке | → active |

### Foreground service (Android)

Persistent notification при активной mesh-сессии:
- Текст: "Crisis Mesh активен — 3 пира рядом"
- Actions: [Приостановить] [Перейти в чат]
- Важно: БЕЗ этой нотификации Android 14+ убьёт фоновый BLE

### Background modes (iOS)

- `bluetooth-central` — для scan
- `bluetooth-peripheral` — для advertising
- iOS ограничивает фоновую BT активность после 10 мин в memory-constrained состоянии
- Решение: periodic wake через `BGProcessingTask`

## Метрики

Локальные (без отправки):
- `mesh_battery_drain_per_hour` — вычисляется из battery.level
- `mesh_active_minutes`
- `mesh_duty_cycle_current`

Пользовательский UI:
- На экране crisis-mesh: "Работает в режиме экономии • -3%/час"
- Уведомление при переходе в low-power режим

## Последствия

### Плюсы
- Работа часами на одном заряде
- SOS гарантированно доставится даже при low-power

### Минусы
- Более медленное обнаружение пиров в background
- Пользователь может подумать что mesh "не работает" если не видит пиров мгновенно → UX объяснение обязательно

## Критерии приёмки
- 6 часов background на среднем Android (например, Pixel 6 с 80% заряда) → ≤35% расход
- При <20% заряда duty cycle автоматически падает
- Foreground service не убивается Android системой в течение 4+ часов
