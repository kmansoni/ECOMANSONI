# Исправление маршрутизации nginx для звонков (2026-04-16)

## Проблема
nginx на sfu-ru.mansoni.ru проксировал `/ws` → calls-ws:8787 (signaling gateway со заглушками), а не на SFU:4443 (реальный mediasoup).

## Корневая причина
calls-ws — это signaling-only gateway с **stubs** для TRANSPORT_CREATE, TRANSPORT_CONNECT и т.д. (строка ~1429 в index.mjs: "calls-ws is a signaling gateway...stubs..."). Реальный mediasoup-транспорт живёт ТОЛЬКО в server/sfu/index.mjs (порт 4443).

## Архитектура
- **SFU** (server/sfu/index.mjs, порт 4443) — полный сервер: auth, room create/join, mediasoup transport, E2EE, rekey
- **calls-ws** (server/calls-ws/index.mjs, порт 8787) — legacy signaling gateway, stubs для медиа
- Frontend подключается к ОДНОМУ WebSocket: `wss://sfu-ru.mansoni.ru/ws`
- nginx определяет куда идёт трафик

## Решение
Изменил nginx: `/ws` → `http://127.0.0.1:4443` (SFU) вместо `http://127.0.0.1:8787` (calls-ws).
Также исправил `/health` → SFU:4443/health.

## Урок
Всегда проверять nginx routing при debugging звонков. calls-ws НЕ нужен в production — это dev-fallback.

## Файлы
- Конфиг nginx в репо: `infra/calls/nginx-sfu-ru.conf`
- Конфиг на сервере: `/etc/nginx/sites-enabled/sfu.mansoni.ru`
