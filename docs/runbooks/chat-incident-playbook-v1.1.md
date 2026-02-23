# Chat Incident Playbook v1.1

## 1. Scope
- Контур: `send/receipt/recovery/resync/full_state/rollout control`.
- Источники истины: `chat_get_v11_release_gates()`, `chat_get_v11_rollout_state()`, `chat_get_v11_rollout_history()`.

## 2. Severity
- `P0`: риск потери/зависания write-path, нарушение инварианта `ACK accepted|duplicate -> receipt`.
- `P1`: деградация recovery/resync без потери целостности.
- `P2`: версия/схема/локальные ошибки без массового impact.

## 3. Roles
1. `IC` - командует, фиксирует решение каждые 10 минут.
2. `Backend Owner` - commit path, idempotency, receipt emission.
3. `SRE Owner` - lag, throttling, saturation, rollback.
4. `Frontend Owner` - fallback state machine, pending/drift.
5. `Scribe` - таймлайн, факты, решения.

## 4. Common Start (first 5 minutes)
1. Объявить инцидент и severity.
2. Снять SQL-срез:
```sql
select * from public.chat_get_v11_release_gates();
select * from public.chat_get_v11_rollout_state();
select * from public.chat_get_v11_rollout_history(50);
```
3. Заморозить промоут rollout.
4. Для `P0` сразу включить kill switch:
```sql
select * from public.chat_set_v11_rollout_state('canary_1', true, 'incident P0');
```

## 5. P0 Runbook: `ack_without_receipt_10s_rate > 0`
1. Kill switch `ON`, rollout freeze.
2. Проверить цепочку: `ACK -> ledger durable -> event durable -> receipt`.
3. Проверить факт receipt в БД и доставку в realtime.
4. Включить/подтвердить fallback клиента:
- `status_write` через 3-5 сек.
- `unknown -> resync_stream`.
- `range unavailable -> full_state_dialog` с throttle.
5. Не делать рискованный DDL в инциденте.
6. Exit criteria:
- `ack_without_receipt_10s_rate = 0` минимум 30-60 мин.
- `gate_p0_ok=true`, `rollout_decision='PROCEED'`.
- Нет новых `pending forever`.

## 6. P1 Runbook: `ERR_RESYNC_RANGE_UNAVAILABLE` spike
1. Не повышать rollout stage.
2. Проверить:
- retention vs max offline window.
- snapshot coverage/cadence.
- корректность `since_event_seq` на клиенте.
3. Mitigation:
- `full_state_dialog` не чаще `1/60s/dialog`.
- backoff `1,2,4,8...` до `60s` + jitter.
- single-flight recovery per stream.
4. Exit criteria:
- `ERR_RESYNC_RANGE_UNAVAILABLE` около baseline.
- `full_state_rate` и `forced_resync_rate` нормализованы.
- p95 recovery не деградирует.

## 7. Escalation
- `P1 -> P0`, если появляется любое:
- `ack_without_receipt_10s_rate > 0`.
- `timeline_duplicate_detected_rate > 0`.
- `read_rollback_detected_rate > 0`.
- Массовый user-facing send stall.

## 8. Rollback and Control
- Freeze без kill:
```sql
select * from public.chat_set_v11_rollout_state('canary_1', false, 'hold');
```
- Аварийный stop:
```sql
select * from public.chat_set_v11_rollout_state('canary_1', true, 'kill switch');
```
- Возврат после стабилизации:
```sql
select * from public.chat_set_v11_rollout_state('canary_1', false, 'resume controlled');
```

## 9. Go/No-Go Before Stage Promote
- `GO`:
- `gate_p0_ok=true`, `gate_p1_ok=true`, `rollout_decision='PROCEED'`.
- Нет активных P0/P1 алертов.
- Метрики стабильны в agreed observation window.
- `NO-GO`:
- Любой красный инвариант.
- Рост ошибок recovery или missing receipt.

## 10. Postmortem (required)
1. Таймлайн с UTC-метками.
2. RCA: техническая и процессная причина.
3. Что сработало/не сработало.
4. Permanent fixes:
- тест,
- алерт,
- guardrail,
- owner + deadline.
5. Decision log по rollout.

## 11. Minimal On-call Checklist
1. Severity назначен.
2. SQL-срез снят.
3. Rollout freeze включен.
4. Kill switch для P0 включен.
5. Fallback клиента подтвержден.
6. Root cause локализован по слою.
7. Exit criteria выполнены.
8. Rollout resume только через gate.
9. Postmortem создан.
10. Action items назначены.
