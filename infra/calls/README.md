# Calls Infra — TURN / SFU / Signaling

## Локальная разработка (dev)

```bash
docker compose -f infra/calls/docker-compose.yml up -d
```

Отредактируйте `infra/calls/coturn/turnserver.conf`:
- `static-auth-secret=CHANGE_ME_LONG_RANDOM_SECRET` → ваш секрет

Этот секрет должен совпадать с тем, что использует Edge Function `turn-credentials`.

### Порты

| Порт | Протокол | Назначение |
|------|----------|------------|
| 3478 | UDP+TCP | STUN / TURN |
| 5349 | TCP | TURNS (TLS) — без сертификата в dev |
| 49160-49200 | UDP | Relay диапазон |

---

## Production — автоматическая настройка coturn

### Вариант А: автоматический bootstrap (рекомендуется)

На VPS с Debian/Ubuntu:

```bash
# 1. Создайте DNS A-запись: turn.mansoni.ru → IP_VPS

# 2. Запустите bootstrap (определит IP, сгенерирует secret, получит TLS cert):
sudo bash infra/calls/coturn/bootstrap-coturn.sh turn.mansoni.ru

# 3. Запустите coturn:
docker compose -f infra/calls/docker-compose.prod.yml up -d coturn

# 4. Задайте secrets в Supabase (значения выведет bootstrap-скрипт):
supabase secrets set TURN_SHARED_SECRET="<secret из скрипта>"
supabase secrets set TURN_URLS="turn:turn.mansoni.ru:3478?transport=udp,turn:turn.mansoni.ru:3478?transport=tcp,turns:turn.mansoni.ru:5349?transport=tcp"
supabase secrets set TURN_TTL_SECONDS="3600"
```

Скрипт `bootstrap-coturn.sh` автоматически:
- определяет публичный IPv4 и подставляет в `external-ip`
- генерирует `static-auth-secret` (если placeholder)
- получает TLS-сертификат через certbot
- настраивает auto-renewal hook
- открывает порты в ufw (если активен)

### Вариант Б: ручная настройка

1. Купите VPS с публичным IPv4 (Европа — оптимально по latency)
2. DNS A-запись: `turn.<domain>` → `<VPS_PUBLIC_IP>`
3. На VPS:

```bash
# Получить TLS-сертификат
certbot certonly --standalone -d turn.<domain>
chown -R turnserver:turnserver /etc/letsencrypt/live/turn.<domain>/
```

4. Отредактируйте `infra/calls/coturn/turnserver.prod.conf`:
   - `external-ip=<VPS_PUBLIC_IP>` — **обязательно**, без этого TURN allocation fails
   - `static-auth-secret=<openssl rand -hex 32>` — **обязательно**, должен совпадать с Supabase secret
   - `realm=<domain>`, `server-name=turn.<domain>`
   - cert/pkey пути

5. Запустите:

```bash
docker compose -f infra/calls/docker-compose.prod.yml up -d
```

6. Задайте Supabase secrets:
   - `TURN_URLS=turn:turn.<domain>:3478?transport=udp,turn:turn.<domain>:3478?transport=tcp,turns:turn.<domain>:5349?transport=tcp`
   - `TURN_SHARED_SECRET=<secret из п.4>`
   - `TURN_TTL_SECONDS=3600`

### Проверка работоспособности

```bash
# 1. Проверить что coturn слушает
docker logs coturn 2>&1 | tail -20

# 2. Тест STUN (должен вернуть ваш public IP)
# Установить: apt install stun-client
stun turn.mansoni.ru 3478

# 3. Браузерный тест ICE candidates:
# https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
# Добавить: turn:turn.mansoni.ru:3478
# Username/credential: получить через Edge Function turn-credentials

# 4. Проверить TLS (TURNS):
openssl s_client -connect turn.mansoni.ru:5349 -brief
```

### Типичные проблемы

| Симптом | Причина | Решение |
|---------|---------|---------|
| ICE candidates содержат private IP | `external-ip` не задан | `bootstrap-coturn.sh` или ручная правка |
| `turn_not_configured` в Edge Function | `TURN_URLS` пуст в Supabase secrets | `supabase secrets set TURN_URLS=...` |
| TURNS не работает | Нет TLS-сертификата | `certbot certonly --standalone -d turn.<domain>` |
| Звонки работают в WiFi, не работают в мобильной сети | Только STUN, нет TURN relay | Настроить TURN (все три шага выше) |
| `401 Unauthorized` от coturn | `static-auth-secret` ≠ `TURN_SHARED_SECRET` | Синхронизировать оба значения |

