# E2EE Deferred Key Recovery Runtime Checklist

## Scope

Проверка только одного дефекта:

- inbound media застревает в pending из-за отсутствия decryption key.

Покрываем 3 сценария:

1. ключ пришел поздно, но до timeout;
2. ключ не пришел до timeout и сработал recovery;
3. recovery не роняет весь звонок (без полного teardown).

## Code Anchors

- Deferred transform + pending state: [src/contexts/video-call/useCallsV2MediaBootstrap.ts](../../src/contexts/video-call/useCallsV2MediaBootstrap.ts#L655)
- Replay после прихода ключа: [src/contexts/video-call/VideoCallProvider.tsx](../../src/contexts/video-call/VideoCallProvider.tsx#L626)
- Timeout watchdog + telemetry: [src/contexts/video-call/VideoCallProvider.tsx](../../src/contexts/video-call/VideoCallProvider.tsx#L699)
- Soft discovery retry: [src/contexts/video-call/VideoCallProvider.tsx](../../src/contexts/video-call/VideoCallProvider.tsx#L721)
- Inbound decrypt recovery path: [src/contexts/video-call/useE2eePipeBreakRecovery.ts](../../src/contexts/video-call/useE2eePipeBreakRecovery.ts#L159)

## Required Log Markers

Ищем в консоли браузера/агрегаторе логов:

- [src/contexts/video-call/useCallsV2MediaBootstrap.ts](../../src/contexts/video-call/useCallsV2MediaBootstrap.ts#L655)
  - E2EE receiver transform deferred: no decryption key yet
- [src/contexts/video-call/VideoCallProvider.tsx](../../src/contexts/video-call/VideoCallProvider.tsx#L634)
  - E2EE receiver transform re-applied after key arrival
- [src/contexts/video-call/VideoCallProvider.tsx](../../src/contexts/video-call/VideoCallProvider.tsx#L710)
  - video_call_context.e2ee_key_missing_timeout
- [src/contexts/video-call/VideoCallProvider.tsx](../../src/contexts/video-call/VideoCallProvider.tsx#L722)
  - E2EE deferred key discovery requested
- [src/contexts/video-call/useE2eePipeBreakRecovery.ts](../../src/contexts/video-call/useE2eePipeBreakRecovery.ts#L159)
  - E2EE receiver pipe recovery: OK

## Environment

1. Два клиента в одном звонке (A и B).
2. На обоих включен SFU/E2EE режим.
3. Включен сбор клиентских логов уровня info/warn.

## Scenario 1: Late Key, No Timeout

Цель:

- проверить, что при позднем KEY_PACKAGE (но раньше 15s) pending receiver переходит в рабочее состояние без recovery.

Шаги:

1. Стартовать звонок A -> B.
2. На B добиться краткой задержки key delivery (например, краткий network throttle).
3. Убедиться, что появился лог deferred.
4. В течение 15 секунд дождаться прихода ключа.

PASS:

1. Есть deferred лог.
2. Есть re-applied after key arrival.
3. Нет video_call_context.e2ee_key_missing_timeout.
4. Аудио/видео на B восстановились без пересоздания звонка.

FAIL:

1. Медиа остаются черными/тихими после key arrival.
2. Появился timeout при фактическом ключе до 15s.

## Scenario 2: Missing Key > 15s

Цель:

- проверить timeout и автоматический recovery без полного teardown.

Шаги:

1. Стартовать звонок A -> B.
2. На B спровоцировать отсутствие decryption key больше 15 секунд.
3. Наблюдать логи watchdog и recovery.

PASS:

1. Есть deferred лог.
2. Через >= 15s есть video_call_context.e2ee_key_missing_timeout.
3. Есть E2EE deferred key discovery requested.
4. Есть E2EE receiver pipe recovery: OK.
5. Звонок остается активным, не уходит в ended/failed только из-за этого события.

FAIL:

1. Нет timeout telemetry при реальном зависании pending > 15s.
2. Recovery не запускается.
3. Recovery приводит к teardown всего звонка.

## Scenario 3: Recovery Isolation

Цель:

- подтвердить, что лечится только inbound consumer-path, а не весь call session.

Шаги:

1. Повторить scenario 2.
2. Во время recovery следить за call state и transport state.

PASS:

1. Не происходит ROOM_LEAVE/полный closeCallsV2 как реакция на key timeout.
2. Нет принудительного завершения звонка по FSM ERROR только из-за key timeout.
3. После recovery продолжаются обычные события сигналинга/медиа.

FAIL:

1. Сессия полностью пересоздается или завершается.
2. Пропадает signaling channel при живом транспорте.

## Acceptance Gate

Чек считается пройденным только если:

1. Scenario 1 PASS.
2. Scenario 2 PASS.
3. Scenario 3 PASS.
4. Нет новых ошибок TS diagnostics в затронутых файлах.

## Notes

- Timeout сейчас фиксирован на 15s: [src/contexts/video-call/VideoCallProvider.tsx](../../src/contexts/video-call/VideoCallProvider.tsx#L102)
- Watchdog interval 2s: [src/contexts/video-call/VideoCallProvider.tsx](../../src/contexts/video-call/VideoCallProvider.tsx#L103)
- Soft discovery retry не должен менять outbound epoch key в recovery path.