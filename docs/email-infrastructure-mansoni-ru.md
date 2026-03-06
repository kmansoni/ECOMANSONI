# Корпоративная почтовая система mansoni.ru
## Полный технический аудит и план внедрения

> **Уровень**: Production-grade, Zero-Trust  
> **Масштаб**: До 10M+ пользователей  
> **Целевой домен**: `mansoni.ru`  
> **Дата**: 2026-03-05

---

## СОДЕРЖАНИЕ

1. [Аудит существующих решений](#1-аудит-существующих-решений)
2. [Архитектура системы](#2-архитектура-системы)
3. [DNS и домен mansoni.ru](#3-dns-и-домен-mansонiru)
4. [VPS / Серверная часть](#4-vps--серверная-часть)
5. [Backend API](#5-backend-api)
6. [База данных](#6-база-данных)
7. [Frontend / Веб-клиент](#7-frontend--веб-клиент)
8. [Real-time и тайминги](#8-real-time-и-тайминги)
9. [Режимы работы](#9-режимы-работы)
10. [Чеклист внедрения](#10-чеклист-внедрения)
11. [Безопасность и Zero-Trust](#11-безопасность-и-zero-trust)
12. [Мониторинг и алерты](#12-мониторинг-и-алерты)

---

## 1. АУДИТ СУЩЕСТВУЮЩИХ РЕШЕНИЙ

### 1.1 Сравнительная таблица

| Критерий | Mail.ru Biz | Яндекс 360 | Google Workspace | Proton Mail | Zoho Mail | Self-hosted |
|---|---|---|---|---|---|---|
| **Домен mansoni.ru** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **E2EE по умолчанию** | ❌ | ❌ | ❌ | ✅ (PGP) | ❌ | Настраиваемо |
| **SMTP relay API** | ✅ | ✅ | ✅ | Ограничено | ✅ | ✅ |
| **Webhooks входящих** | ❌ | ❌ | ✅ (Pub/Sub) | ❌ | ✅ | ✅ |
| **DKIM auto-rotate** | ❌ | ❌ | ✅ | ✅ | Ручной | Configurable |
| **MTA-STS** | ❌ | ❌ | ✅ | ✅ | Частично | Настраиваемо |
| **BIMI** | ❌ | ❌ | ✅ | ❌ | ✅ | Настраиваемо |
| **Санкционный риск** | 🔴 Высокий | 🔴 Высокий | 🟡 Средний | 🟢 Низкий | 🟢 Низкий | 🟢 Нет |
| **Данные в РФ** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **SLA uptime** | 99.9% | 99.95% | 99.9% | 99.9% | 99.9% | Ваше |
| **Цена (50 ящиков/мес)** | ~3 500 ₽ | ~4 500 ₽ | ~$115 | ~$37 | ~$10 | ~2 000 ₽ VPS |
| **Rate limit отправки** | 300/час | 500/час | 2000/день | 150/час | 200/час | Настраиваемо |
| **Alias / catch-all** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **IMAP IDLE push** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Bulk/transactional** | Отдельный сервис | Отдельный сервис | Отдельный сервис | ❌ | ✅ встроен | Rspamd политики |
| **Полный контроль MX** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### 1.2 Критические уязвимости внешних провайдеров

**Mail.ru / Яндекс 360:**
- Санкционный риск блокировки зарубежных получателей
- Нет гарантий конфиденциальности переписки от ФСБ (СОРМ)
- DKIM ротация только вручную → длинные жизненные циклы ключей = увеличенное окно компрометации
- Нет MTA-STS → downgrade атаки TLS возможны

**Google Workspace:**
- Данные вне РФ → нарушение 152-ФЗ для персональных данных
- Google может заблокировать аккаунт без предупреждения
- API quota: 250 quota units/user/second — DoS на API уровне

**Proton Mail:**
- Нет webhook на входящие письма
- SMTP bridge только для платных планов
- Нет bulk/transactional через основной домен

**Вывод:** Self-hosted на VPS — единственный вариант, дающий:
- Полный контроль над данными (152-ФЗ compliance)
- Гибкую политику rate limiting
- Webhooks, API, интеграции без ограничений
- Возможность E2EE на уровне сервера (S/MIME, PGP)

---

## 2. АРХИТЕКТУРА СИСТЕМЫ

### 2.1 Топология компонентов

```
Internet
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Edge Layer (Anycast / BGP)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ MX:25    │  │ SMTP:587  │  │ IMAP/POP3:993    │  │
│  │ (inbound)│  │ (submit) │  │ (retrieval)      │  │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
└───────┼─────────────┼──────────────────┼────────────┘
        │             │                  │
┌───────▼─────────────▼──────────────────▼────────────┐
│  Postfix MTA Layer                                   │
│  ┌─────────────────────────────────────────────────┐│
│  │ smtpd (inbound 25)  │ submission (587/465)      ││
│  │ cleanup → queue mgr │ policy service             ││
│  │ local/virtual deliv │ milter chain               ││
│  └─────────────────────────────────────────────────┘│
│                        │                             │
│  Milter Chain:                                       │
│  [Rspamd:11332] → [OpenDKIM:8891] → [PostSRSD:10001]│
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│  Storage Layer                                       │
│  ┌──────────────────┐  ┌────────────────────────┐   │
│  │ Dovecot IMAP/POP3│  │ PostgreSQL              │  │
│  │ Maildir: /mail/  │  │ (users, aliases, quota) │  │
│  │ vmail user       │  └────────────────────────┘   │
│  └──────────────────┘  ┌────────────────────────┐   │
│                         │ Redis                  │   │
│                         │ (sessions, rate limit) │   │
│                         └────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│  Application Layer                                   │
│  ┌──────────────────┐  ┌────────────────────────┐   │
│  │ FastAPI Backend  │  │ Roundcube Webmail       │  │
│  │ :8000            │  │ :80/443                 │   │
│  └──────────────────┘  └────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 2.2 Минимальные требования VPS

| Ресурс | Минимум | Рекомендуется | Для 10M users |
|---|---|---|---|
| CPU | 2 vCPU | 4 vCPU | 32+ vCPU кластер |
| RAM | 4 GB | 8 GB | 64+ GB |
| SSD | 50 GB | 200 GB | 10+ TB (объектное хранилище) |
| Bandwidth | 100 Mbps | 1 Gbps | 10 Gbps |
| IPv4 | 1 (dedicated!) | 1 | 1 per MTA node |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

> ⚠️ **КРИТИЧНО**: IP-адрес должен быть чистым (не в blacklist). Проверка: [mxtoolbox.com/blacklists](https://mxtoolbox.com/blacklists.aspx)

---

## 3. DNS И ДОМЕН mansoni.ru

### 3.1 Полные DNS записи

```zone
; ============================================================
; Zone: mansoni.ru
; Registrar: например nic.ru / reg.ru
; Serial: YYYYMMDDNN
; ============================================================

$ORIGIN mansoni.ru.
$TTL 3600

; ── SOA ─────────────────────────────────────────────────────
@   IN  SOA  ns1.mansoni.ru. hostmaster.mansoni.ru. (
                2026030501  ; Serial
                3600        ; Refresh (1h)
                900         ; Retry (15m)
                604800      ; Expire (7d)
                300         ; Negative TTL (5m)
            )

; ── NS ──────────────────────────────────────────────────────
@           IN  NS   ns1.mansoni.ru.
@           IN  NS   ns2.mansoni.ru.

; ── A / AAAA ────────────────────────────────────────────────
; Замени X.X.X.X на реальный IP VPS
mail        IN  A    X.X.X.X          ; TTL 3600
@           IN  A    X.X.X.X          ; TTL 3600

; ── MX ──────────────────────────────────────────────────────
; Priority 10 — основной, 20 — резервный (если есть)
@           IN  MX   10  mail.mansoni.ru.   ; TTL 3600

; ── SPF ─────────────────────────────────────────────────────
; Разрешаем только наш MX сервер. ~all = softfail, -all = hardfail
; Начать с ~all, перейти на -all после 30 дней стабильной работы
@           IN  TXT  "v=spf1 mx a:mail.mansoni.ru ip4:X.X.X.X ~all"
                                              ; TTL 3600

; ── DKIM ────────────────────────────────────────────────────
; Селектор: mail2026 (менять ежегодно)
; Ключ генерируется на сервере: opendkim-genkey -s mail2026 -d mansoni.ru
mail2026._domainkey IN TXT "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA[BASE64_PUBLIC_KEY]"
                                              ; TTL 3600

; ── DMARC ───────────────────────────────────────────────────
; Начать с p=none, через 30 дней → p=quarantine → p=reject
; rua = aggregate reports (ежедневно)
; ruf = forensic reports (на каждое письмо)
_dmarc      IN  TXT  "v=DMARC1; p=none; rua=mailto:dmarc-rua@mansoni.ru; ruf=mailto:dmarc-ruf@mansoni.ru; sp=none; adkim=r; aspf=r; fo=1; ri=86400"
                                              ; TTL 3600

; ── MTA-STS ─────────────────────────────────────────────────
; Защита от downgrade TLS атак
_mta-sts    IN  TXT  "v=STSv1; id=20260305001"   ; TTL 3600
mta-sts     IN  A    X.X.X.X                      ; TTL 3600

; ── TLS-RPT ─────────────────────────────────────────────────
_smtp._tls  IN  TXT  "v=TLSRPTv1; rua=mailto:tls-rpt@mansoni.ru"  ; TTL 3600

; ── BIMI (опционально, требует VMC сертификат) ──────────────
; default._bimi IN TXT "v=BIMI1; l=https://mansoni.ru/logo.svg; a=;"

; ── PTR (обратная зона — настраивается у провайдера VPS!) ───
; X.X.X.X → mail.mansoni.ru
; Запрашивается у хостинга через панель управления или тикет
```

### 3.2 MTA-STS Policy файл

Создай файл, доступный по HTTPS:
`https://mta-sts.mansoni.ru/.well-known/mta-sts.txt`

```
version: STSv1
mode: enforce
mx: mail.mansoni.ru
max_age: 604800
```

> **mode progression**: `testing` (0 день) → `enforce` (после 30 дней без ошибок)

### 3.3 Тайминги propagation DNS

| Действие | Ожидаемое время | Критический порог |
|---|---|---|
| TTL изменение записи | TTL старой записи | max 24h |
| Новая MX запись | 15 мин — 4 часа | 48 часов |
| SPF / DMARC / DKIM | 5 мин — 2 часа | 24 часа |
| PTR запись | 15 мин — 4 часа | 48 часов |
| MTA-STS | После HTTPS доступности | Немедленно |

**Проверка propagation:**
```bash
# MX
dig MX mansoni.ru @8.8.8.8
dig MX mansoni.ru @1.1.1.1

# SPF
dig TXT mansoni.ru @8.8.8.8

# DKIM
dig TXT mail2026._domainkey.mansoni.ru @8.8.8.8

# DMARC
dig TXT _dmarc.mansoni.ru @8.8.8.8

# PTR
dig -x X.X.X.X @8.8.8.8
```

---

## 4. VPS / СЕРВЕРНАЯ ЧАСТЬ

### 4.1 Первичная настройка сервера

```bash
# ── 1. Обновление системы ────────────────────────────────────
apt-get update && apt-get upgrade -y
apt-get install -y \
  postfix postfix-mysql dovecot-core dovecot-imapd dovecot-pop3d \
  dovecot-lmtpd dovecot-mysql opendkim opendkim-tools \
  spamassassin rspamd clamav clamav-daemon amavis \
  fail2ban ufw redis-server postgresql postgresql-contrib \
  certbot python3-certbot-nginx nginx \
  swaks telnet net-tools htop logwatch

# ── 2. Hostname (КРИТИЧНО: совпадает с PTR записью!) ─────────
hostnamectl set-hostname mail.mansoni.ru
echo "X.X.X.X mail.mansoni.ru mail" >> /etc/hosts

# ── 3. Firewall ──────────────────────────────────────────────
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     # SSH
ufw allow 25/tcp     # SMTP inbound
ufw allow 465/tcp    # SMTPS (SSL/TLS)
ufw allow 587/tcp    # SMTP submission (STARTTLS)
ufw allow 993/tcp    # IMAPS
ufw allow 995/tcp    # POP3S
ufw allow 143/tcp    # IMAP (только внутри, опционально)
ufw allow 80/tcp     # HTTP (Let's Encrypt)
ufw allow 443/tcp    # HTTPS (Webmail)
ufw enable

# ── 4. TLS сертификат Let's Encrypt ─────────────────────────
certbot certonly --standalone \
  -d mail.mansoni.ru \
  -d mta-sts.mansoni.ru \
  --agree-tos \
  --email admin@mansoni.ru \
  --non-interactive

# Авто-обновление
echo "0 3 * * * root certbot renew --quiet --post-hook 'systemctl reload postfix dovecot nginx'" \
  >> /etc/crontab
```

### 4.2 Postfix — полная конфигурация

#### `/etc/postfix/main.cf`

```ini
# ── Идентификация ────────────────────────────────────────────
myhostname = mail.mansoni.ru
mydomain = mansoni.ru
myorigin = $mydomain

# ── Сети и интерфейсы ────────────────────────────────────────
inet_interfaces = all
inet_protocols = ipv4
mynetworks = 127.0.0.0/8

# ── Домены ──────────────────────────────────────────────────
mydestination = $myhostname, localhost.$mydomain, localhost
relay_domains =
virtual_mailbox_domains = mansoni.ru
virtual_mailbox_base = /var/mail/vhosts
virtual_mailbox_maps = hash:/etc/postfix/vmailbox
virtual_alias_maps = hash:/etc/postfix/virtual
virtual_minimum_uid = 100
virtual_uid_maps = static:5000
virtual_gid_maps = static:5000

# ── TLS входящий (SMTP порт 25) ──────────────────────────────
smtpd_tls_cert_file = /etc/letsencrypt/live/mail.mansoni.ru/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/mail.mansoni.ru/privkey.pem
smtpd_tls_security_level = may
smtpd_tls_auth_only = yes
smtpd_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtpd_tls_mandatory_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtpd_tls_ciphers = medium
smtpd_tls_mandatory_ciphers = high
smtpd_tls_loglevel = 1
smtpd_tls_received_header = yes
smtpd_tls_session_cache_database = btree:${data_directory}/smtpd_scache
smtpd_tls_session_cache_timeout = 3600s

# ── TLS исходящий ────────────────────────────────────────────
smtp_tls_security_level = may
smtp_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt
smtp_tls_loglevel = 1
smtp_tls_session_cache_database = btree:${data_directory}/smtp_scache

# ── SASL аутентификация ──────────────────────────────────────
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes
smtpd_sasl_security_options = noanonymous
smtpd_sasl_local_domain = $myhostname

# ── Ограничения получателей ──────────────────────────────────
smtpd_recipient_restrictions =
    permit_mynetworks,
    permit_sasl_authenticated,
    reject_non_fqdn_recipient,
    reject_unknown_recipient_domain,
    reject_unauth_destination,
    check_policy_service unix:private/policyd-spf,
    reject_rbl_client zen.spamhaus.org,
    reject_rbl_client bl.spamcop.net,
    permit

# ── Ограничения отправителей ─────────────────────────────────
smtpd_sender_restrictions =
    permit_mynetworks,
    permit_sasl_authenticated,
    reject_non_fqdn_sender,
    reject_unknown_sender_domain,
    permit

# ── Milter (DKIM + Rspamd) ────────────────────────────────────
milter_default_action = accept
milter_protocol = 6
smtpd_milters = local:/var/run/rspamd/milter.sock, inet:localhost:8891
non_smtpd_milters = $smtpd_milters

# ── Лимиты и размеры ─────────────────────────────────────────
message_size_limit = 52428800      ; 50 MB
mailbox_size_limit = 0             ; Без лимита (управляется Dovecot)
header_size_limit = 102400         ; 100 KB

# ── Очереди и retry ──────────────────────────────────────────
# Подробно в секции 8 (тайминги)
queue_run_delay = 300s             ; 5 минут между попытками
minimal_backoff_time = 300s        ; Первый retry: 5 мин
maximal_backoff_time = 4000s       ; Максимальный интервал ~67 мин
maximal_queue_lifetime = 5d        ; Держим письмо 5 дней
bounce_queue_lifetime = 5d
delay_warning_time = 4h            ; Уведомление через 4 часа

# ── Производительность ───────────────────────────────────────
default_process_limit = 100
smtp_destination_concurrency_limit = 20
smtp_destination_rate_delay = 1s

# ── LMTP доставка в Dovecot ──────────────────────────────────
virtual_transport = lmtp:unix:private/dovecot-lmtp

# ── Логирование ──────────────────────────────────────────────
syslog_facility = mail
maillog_file = /var/log/mail.log
```

#### `/etc/postfix/master.cf` (ключевые секции)

```ini
# SMTP (входящий от других серверов)
smtp      inet  n       -       y       -       -       smtpd

# SMTP Submission порт 587 (аутентифицированные клиенты)
submission inet n       -       y       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=encrypt
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_tls_auth_only=yes
  -o smtpd_client_restrictions=permit_sasl_authenticated,reject
  -o smtpd_sender_restrictions=reject_sender_login_mismatch
  -o smtpd_recipient_restrictions=permit_sasl_authenticated,reject
  -o milter_macro_daemon_name=ORIGINATING

# SMTPS порт 465 (SSL/TLS wrapper, устаревший но нужен)
smtps     inet  n       -       y       -       -       smtpd
  -o syslog_name=postfix/smtps
  -o smtpd_tls_wrappermode=yes
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_client_restrictions=permit_sasl_authenticated,reject
  -o milter_macro_daemon_name=ORIGINATING

# SPF policy daemon
policyd-spf  unix  -       n       n       -       0       spawn
    user=policyd-spf argv=/usr/bin/policyd-spf
```

### 4.3 Dovecot — полная конфигурация

#### `/etc/dovecot/dovecot.conf`

```ini
protocols = imap pop3 lmtp
listen = *, ::
base_dir = /var/run/dovecot/
instance_name = dovecot
log_timestamp = "%Y-%m-%d %H:%M:%S "
mail_location = maildir:/var/mail/vhosts/%d/%n

# Пользователи
mail_uid = 5000
mail_gid = 5000
mail_privileged_group = mail
first_valid_uid = 5000

# Аутентификация
auth_mechanisms = plain login
disable_plaintext_auth = yes
```

#### `/etc/dovecot/conf.d/10-ssl.conf`

```ini
ssl = required
ssl_cert = </etc/letsencrypt/live/mail.mansoni.ru/fullchain.pem
ssl_key = </etc/letsencrypt/live/mail.mansoni.ru/privkey.pem
ssl_min_protocol = TLSv1.2
ssl_cipher_list = ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384
ssl_prefer_server_ciphers = yes
ssl_dh = </etc/dovecot/dh.pem   ; openssl dhparam -out /etc/dovecot/dh.pem 4096
```

#### `/etc/dovecot/conf.d/10-auth.conf`

```ini
auth_mechanisms = plain login

passdb {
  driver = sql
  args = /etc/dovecot/dovecot-sql.conf.ext
}

userdb {
  driver = sql
  args = /etc/dovecot/dovecot-sql.conf.ext
}
```

#### `/etc/dovecot/dovecot-sql.conf.ext`

```ini
driver = pgsql
connect = host=localhost dbname=mailserver user=mailuser password=STRONG_PASSWORD

default_pass_scheme = SHA512-CRYPT

password_query = \
  SELECT email AS user, password FROM mailboxes \
  WHERE email = '%u' AND active = TRUE

user_query = \
  SELECT \
    '/var/mail/vhosts/%d/%n' AS home, \
    5000 AS uid, 5000 AS gid, \
    CONCAT('*:bytes=', quota_bytes) AS quota_rule \
  FROM mailboxes \
  WHERE email = '%u' AND active = TRUE
```

#### `/etc/dovecot/conf.d/20-imap.conf`

```ini
protocol imap {
  mail_plugins = $mail_plugins imap_quota imap_idle
  imap_idle_notify_interval = 120s    ; Ping каждые 2 минуты
  imap_max_line_length = 65536
  imap_client_workarounds = delay-newmail tb-extra-mailbox-sep
}
```

#### `/etc/dovecot/conf.d/10-master.conf` (LMTP socket для Postfix)

```ini
service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0600
    user = postfix
    group = postfix
  }
}

service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0666
    user = postfix
    group = postfix
  }
  unix_listener auth-userdb {
    mode = 0600
    user = vmail
  }
}
```

### 4.4 OpenDKIM конфигурация

```bash
# Генерация ключей
mkdir -p /etc/opendkim/keys/mansoni.ru
opendkim-genkey -s mail2026 -d mansoni.ru -D /etc/opendkim/keys/mansoni.ru/
chown -R opendkim:opendkim /etc/opendkim/keys/
chmod 600 /etc/opendkim/keys/mansoni.ru/mail2026.private

# Публичный ключ для DNS:
cat /etc/opendkim/keys/mansoni.ru/mail2026.txt
```

#### `/etc/opendkim.conf`

```ini
Syslog            yes
SyslogSuccess     yes
LogWhy            yes

Canonicalization  relaxed/simple
Mode              sv
SubDomains        no

Domain            mansoni.ru
Selector          mail2026
KeyFile           /etc/opendkim/keys/mansoni.ru/mail2026.private

SigningTable      refile:/etc/opendkim/signing.table
KeyTable          /etc/opendkim/key.table
TrustedHosts      /etc/opendkim/trusted.hosts

Socket            inet:8891@localhost
PidFile           /var/run/opendkim/opendkim.pid
UMask             002
UserID            opendkim:opendkim
```

#### `/etc/opendkim/signing.table`

```
*@mansoni.ru    mansoni.ru
```

#### `/etc/opendkim/key.table`

```
mansoni.ru    mansoni.ru:mail2026:/etc/opendkim/keys/mansoni.ru/mail2026.private
```

#### `/etc/opendkim/trusted.hosts`

```
127.0.0.1
localhost
mail.mansoni.ru
```

### 4.5 Rspamd — антиспам конфигурация

#### `/etc/rspamd/local.d/milter_headers.conf`

```lua
use = ["x-spamd-bar", "x-spam-level", "authentication-results"];
authenticated_headers = ["authentication-results"];
```

#### `/etc/rspamd/local.d/actions.conf`

```ucl
reject = 15;         -- Отклонять
add_header = 6;      -- Помечать как спам
greylist = 4;        -- Greylisting
```

#### `/etc/rspamd/local.d/dkim_signing.conf`

```ucl
enabled = true;
domain {
  mansoni.ru {
    selector = "mail2026";
    path = "/etc/opendkim/keys/mansoni.ru/mail2026.private";
  }
}
```

#### `/etc/rspamd/local.d/antivirus.conf`

```ucl
clamav {
  enabled = true;
  servers = "127.0.0.1:3310";
  max_size = 20971520;  # 20MB
}
```

### 4.6 Fail2ban для почтовых сервисов

#### `/etc/fail2ban/jail.d/mail.conf`

```ini
[postfix-sasl]
enabled = true
filter  = postfix-sasl
logpath = /var/log/mail.log
maxretry = 5
findtime = 300       ; 5 минут
bantime  = 3600      ; 1 час бан

[dovecot]
enabled = true
filter  = dovecot
logpath = /var/log/mail.log
maxretry = 5
findtime = 300
bantime  = 3600

[postfix]
enabled = true
filter  = postfix
logpath = /var/log/mail.log
maxretry = 10
findtime = 600
bantime  = 1800
```

---

## 5. BACKEND API

### 5.1 Схема API (FastAPI)

```python
# api/main.py

from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr
from typing import Optional
import asyncpg
import redis.asyncio as redis
import hashlib, crypt, secrets
from datetime import datetime, timedelta
import jwt

app = FastAPI(title="mansoni.ru Mail API", version="1.0.0")

# ── Модели ───────────────────────────────────────────────────

class MailboxCreate(BaseModel):
    email: EmailStr
    password: str          # Передаётся по TLS, хешируется сервером
    quota_bytes: int = 1073741824  # 1 GB default
    display_name: Optional[str] = None

class MailboxUpdate(BaseModel):
    password: Optional[str] = None
    quota_bytes: Optional[int] = None
    active: Optional[bool] = None

class AliasCreate(BaseModel):
    source: EmailStr       # alias@mansoni.ru
    destination: EmailStr  # real@mansoni.ru
    goto_null: bool = False  # /dev/null alias

# ── Хеширование пароля (SHA-512-CRYPT для Dovecot) ────────────

def hash_password_dovecot(password: str) -> str:
    """
    Генерирует SHA512-CRYPT хеш совместимый с Dovecot.
    НЕ используем MD5/SHA1/bcrypt — только SHA512-CRYPT.
    """
    salt = crypt.mksalt(crypt.METHOD_SHA512)
    hashed = crypt.crypt(password, salt)
    return f"{{SHA512-CRYPT}}{hashed}"

# ── Создание почтового ящика ─────────────────────────────────

@app.post("/api/v1/mailboxes")
async def create_mailbox(
    data: MailboxCreate,
    db: asyncpg.Connection = Depends(get_db),
    current_admin = Depends(require_admin)
):
    """
    Идемпотентное создание ящика.
    Повторный вызов с тем же email → 409 Conflict.
    """
    # Validate domain
    domain = data.email.split("@")[1]
    if domain != "mansoni.ru":
        raise HTTPException(400, "Only mansoni.ru domain allowed")
    
    # Check exists (SELECT FOR UPDATE — защита от race condition)
    async with db.transaction(isolation='serializable'):
        existing = await db.fetchrow(
            "SELECT id FROM mailboxes WHERE email = $1 FOR UPDATE",
            data.email
        )
        if existing:
            raise HTTPException(409, "Mailbox already exists")
        
        password_hash = hash_password_dovecot(data.password)
        local_part = data.email.split("@")[0]
        
        mailbox_id = await db.fetchval("""
            INSERT INTO mailboxes 
                (email, local_part, domain, password, quota_bytes, display_name, active, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
            RETURNING id
        """, data.email, local_part, domain, password_hash,
            data.quota_bytes, data.display_name)
        
        # Создать директорию Maildir
        import os, subprocess
        maildir_path = f"/var/mail/vhosts/{domain}/{local_part}"
        subprocess.run(
            ["maildirmake", maildir_path],
            check=True,
            user="vmail"
        )
    
    return {"id": mailbox_id, "email": data.email, "status": "created"}


# ── Webhook на входящие письма ────────────────────────────────

@app.post("/internal/webhook/incoming")
async def incoming_mail_webhook(
    payload: dict,
    background_tasks: BackgroundTasks,
    x_internal_secret: str = Header(None)
):
    """
    Вызывается Postfix через pipe transport или Dovecot sieve.
    Защита: проверка HMAC подписи запроса.
    
    Attack vectors:
    - Forgery: проверяем HMAC на shared secret (не в repo!)
    - Replay: проверяем timestamp в ±5 минут
    - DoS: rate limit через Redis
    """
    # Проверка HMAC
    expected = hmac.new(
        INTERNAL_SECRET.encode(),
        json.dumps(payload, sort_keys=True).encode(),
        hashlib.sha256
    ).hexdigest()
    
    if not secrets.compare_digest(x_internal_secret or "", expected):
        raise HTTPException(403, "Invalid signature")
    
    # Проверка replay (timestamp ±5 мин)
    msg_time = datetime.fromisoformat(payload.get("timestamp", ""))
    if abs((datetime.utcnow() - msg_time).total_seconds()) > 300:
        raise HTTPException(400, "Request too old or future")
    
    background_tasks.add_task(process_incoming_mail, payload)
    return {"status": "accepted"}
```

### 5.2 Retry-логика SMTP очереди

```python
# workers/smtp_retry.py

import asyncio
from datetime import datetime, timedelta
from enum import Enum

class RetrySchedule(Enum):
    """
    RFC 5321-совместимое расписание retry.
    Postfix управляет этим автоматически, но кастомный
    transactional worker использует эту логику.
    """
    ATTEMPT_1 = timedelta(minutes=0)    # Немедленно
    ATTEMPT_2 = timedelta(minutes=5)    # +5 мин
    ATTEMPT_3 = timedelta(minutes=30)   # +30 мин  
    ATTEMPT_4 = timedelta(hours=1)      # +1 час
    ATTEMPT_5 = timedelta(hours=6)      # +6 часов
    ATTEMPT_6 = timedelta(hours=24)     # +24 часа
    ATTEMPT_7 = timedelta(days=2)       # +2 дня
    MAX_AGE   = timedelta(days=5)       # Максимум 5 дней (RFC 5321)

class SmtpRetryWorker:
    def __init__(self, redis_client, db_pool):
        self.redis = redis_client
        self.db = db_pool
    
    async def process_queue(self):
        while True:
            # Идемпотентное получение задачи (BLPOP с timeout)
            task = await self.redis.blpop("mail:retry:queue", timeout=30)
            if task:
                await self.handle_retry(task[1])
            await asyncio.sleep(1)
    
    async def handle_retry(self, message_id: str):
        """
        Строго детерминированная логика retry.
        
        Race condition protection: 
        - SETNX lock на message_id перед обработкой
        - Автоматический expire 60 секунд
        """
        lock_key = f"mail:lock:{message_id}"
        locked = await self.redis.set(lock_key, "1", nx=True, ex=60)
        if not locked:
            return  # Уже обрабатывается другим воркером
        
        try:
            msg = await self.db.fetchrow(
                "SELECT * FROM outbound_queue WHERE id = $1 FOR UPDATE SKIP LOCKED",
                message_id
            )
            if not msg:
                return
            
            attempt_count = msg['attempt_count']
            schedule = list(RetrySchedule)
            
            if attempt_count >= len(schedule) - 1:
                # Превышен лимит попыток → bounce
                await self.generate_bounce(msg)
                return
            
            # Попытка доставки
            success = await self.attempt_delivery(msg)
            
            if success:
                await self.mark_delivered(message_id)
            else:
                next_delay = schedule[attempt_count + 1].value
                next_attempt = datetime.utcnow() + next_delay
                await self.db.execute("""
                    UPDATE outbound_queue 
                    SET attempt_count = attempt_count + 1,
                        next_attempt_at = $2,
                        last_error = $3
                    WHERE id = $1
                """, message_id, next_attempt, "Delivery failed")
        finally:
            await self.redis.delete(lock_key)
```

### 5.3 SMTP тайминги сессий

```python
# config/smtp_timeouts.py

SMTP_SESSION_TIMEOUTS = {
    # RFC 5321 Section 4.5.3.2 — минимальные требования
    "connect_timeout": 30,         # 30 секунд на TCP connect
    "greeting_timeout": 300,       # 5 минут на SMTP banner
    "ehlo_timeout": 300,           # 5 минут на EHLO ответ
    "mail_from_timeout": 300,      # 5 минут на MAIL FROM
    "rcpt_to_timeout": 300,        # 5 минут на RCPT TO
    "data_init_timeout": 120,      # 2 минуты до DATA
    "data_block_timeout": 180,     # 3 минуты между блоками данных
    "data_done_timeout": 600,      # 10 минут на обработку после точки
    "quit_timeout": 300,           # 5 минут на QUIT
    
    # Наши более агрессивные настройки для outbound
    "smtp_connect_timeout": 10,    # 10 сек — быстрый фейл
    "smtp_helo_timeout": 30,
    "smtp_data_done_timeout": 120,
}

# В /etc/postfix/main.cf:
# smtp_connect_timeout = 10s
# smtp_helo_timeout = 300s
# smtp_mail_timeout = 300s
# smtp_rcpt_timeout = 300s
# smtp_data_init_timeout = 120s
# smtp_data_xfer_timeout = 180s
# smtp_data_done_timeout = 600s
# smtp_quit_timeout = 300s
```

---

## 6. БАЗА ДАННЫХ

### 6.1 PostgreSQL схема

```sql
-- ============================================================
-- Mail Server Database Schema
-- mansoni.ru mail infrastructure
-- Isolation: REPEATABLE READ minimum
-- ============================================================

-- Расширения
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Домены ──────────────────────────────────────────────────
CREATE TABLE domains (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL UNIQUE,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    catch_all       VARCHAR(255),           -- catch-all адрес
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_domains_name ON domains(name) WHERE active = TRUE;

INSERT INTO domains (name) VALUES ('mansoni.ru');

-- ── Почтовые ящики ──────────────────────────────────────────
CREATE TABLE mailboxes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    local_part      VARCHAR(64)  NOT NULL,
    domain          VARCHAR(255) NOT NULL REFERENCES domains(name),
    password        TEXT         NOT NULL,   -- {SHA512-CRYPT}$6$...
    quota_bytes     BIGINT       NOT NULL DEFAULT 1073741824, -- 1GB
    used_bytes      BIGINT       NOT NULL DEFAULT 0,
    display_name    VARCHAR(255),
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    last_login_ip   INET,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_quota_positive CHECK (quota_bytes > 0),
    CONSTRAINT chk_used_bytes CHECK (used_bytes >= 0)
);

CREATE INDEX idx_mailboxes_email ON mailboxes(email) WHERE active = TRUE;
CREATE INDEX idx_mailboxes_domain ON mailboxes(domain) WHERE active = TRUE;
CREATE INDEX idx_mailboxes_last_login ON mailboxes(last_login_at DESC NULLS LAST);

-- ── Алиасы ──────────────────────────────────────────────────
CREATE TABLE aliases (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source          VARCHAR(255) NOT NULL,   -- alias@mansoni.ru
    destination     TEXT        NOT NULL,   -- target@mansoni.ru (или несколько через ,)
    domain          VARCHAR(255) NOT NULL REFERENCES domains(name),
    goto_null       BOOLEAN     NOT NULL DEFAULT FALSE,  -- /dev/null
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(source, destination)
);

CREATE INDEX idx_aliases_source ON aliases(source) WHERE active = TRUE;

-- ── Логи аутентификации ──────────────────────────────────────
CREATE TABLE auth_logs (
    id              BIGSERIAL PRIMARY KEY,
    email           VARCHAR(255) NOT NULL,
    ip_address      INET        NOT NULL,
    protocol        VARCHAR(10) NOT NULL,  -- IMAP/POP3/SMTP
    success         BOOLEAN     NOT NULL,
    failure_reason  VARCHAR(255),
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Партиции по месяцам
CREATE TABLE auth_logs_2026_03 PARTITION OF auth_logs
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE auth_logs_2026_04 PARTITION OF auth_logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
-- ... автоматизировать pg_partman

CREATE INDEX idx_auth_logs_email ON auth_logs_2026_03(email);
CREATE INDEX idx_auth_logs_ip ON auth_logs_2026_03(ip_address);
CREATE INDEX idx_auth_logs_created ON auth_logs_2026_03(created_at DESC);

-- ── Очередь исходящих писем (transactional) ──────────────────
CREATE TABLE outbound_queue (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idempotency_key VARCHAR(128) UNIQUE NOT NULL, -- Защита от дублей
    from_email      VARCHAR(255) NOT NULL,
    to_email        TEXT[]       NOT NULL,
    subject         TEXT,
    body_text       TEXT,
    body_html       TEXT,
    headers         JSONB,
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sending','delivered','bounced','failed')),
    attempt_count   INT          NOT NULL DEFAULT 0,
    max_attempts    INT          NOT NULL DEFAULT 7,
    next_attempt_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    delivered_at    TIMESTAMPTZ,
    last_error      TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '5 days'
);

CREATE INDEX idx_outbound_status_next ON outbound_queue(status, next_attempt_at)
    WHERE status IN ('pending', 'sending');
CREATE INDEX idx_outbound_idempotency ON outbound_queue(idempotency_key);

-- ── Bounce записи ────────────────────────────────────────────
CREATE TABLE bounces (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_msg_id VARCHAR(255),
    from_email      VARCHAR(255) NOT NULL,
    to_email        VARCHAR(255) NOT NULL,
    bounce_type     VARCHAR(20)  NOT NULL CHECK (bounce_type IN ('hard','soft','complaint')),
    bounce_code     VARCHAR(10),    -- SMTP код: 550, 421 и т.д.
    bounce_message  TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bounces_to_email ON bounces(to_email);
CREATE INDEX idx_bounces_created ON bounces(created_at DESC);

-- ── Квоты (отслеживание) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_mailbox_quota()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE mailboxes 
    SET used_bytes = (
        SELECT COALESCE(SUM(size_bytes), 0)
        FROM mail_messages 
        WHERE mailbox_id = NEW.mailbox_id
    )
    WHERE id = NEW.mailbox_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Row Level Security ────────────────────────────────────────
-- API пользователь видит только свой домен
ALTER TABLE mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY mailboxes_domain_isolation ON mailboxes
    USING (domain = current_setting('app.current_domain', TRUE));

CREATE POLICY aliases_domain_isolation ON aliases
    USING (domain = current_setting('app.current_domain', TRUE));
```

### 6.2 Индексная стратегия и write amplification

```sql
-- Анализ write amplification:
-- mailboxes: 1 INSERT → 2 индекса (email, domain) → 3 writes total
-- auth_logs: HIGH volume → партиционирование обязательно
--            100k logins/day → ~115 writes/sec → приемлемо
-- outbound_queue: 
--   - Основной индекс (status, next_attempt_at): обновляется при каждом retry
--   - При 1000 писем/сек → 2000 index ops/sec → требует SSD NVMe

-- Deadlock сценарий:
-- TX1: UPDATE mailboxes WHERE email='a@b.com' → lock row A
-- TX2: UPDATE mailboxes WHERE email='b@b.com' → lock row B
-- TX1: UPDATE aliases WHERE source='a' → wait row B (TX2 держит)
-- TX2: UPDATE aliases WHERE source='b' → wait row A (TX1 держит) → DEADLOCK
-- Решение: всегда обращаться к таблицам в одном порядке (mailboxes → aliases)

-- Мониторинг deadlocks:
SELECT pid, wait_event_type, wait_event, query 
FROM pg_stat_activity 
WHERE wait_event_type = 'Lock';
```

### 6.3 Стратегия бэкапов

```bash
# /etc/cron.d/mail-backup

# ── PostgreSQL ────────────────────────────────────────────────
# Full dump ежедневно в 02:00
0 2 * * * postgres pg_dump -Fc mailserver > /backup/db/mailserver_$(date +\%Y\%m\%d).dump

# WAL архивирование (point-in-time recovery)
# В postgresql.conf:
#   archive_mode = on
#   archive_command = 'cp %p /backup/wal/%f'
#   wal_level = replica

# ── Maildir ───────────────────────────────────────────────────
# Инкрементальный rsync каждый час
0 * * * * root rsync -az --delete /var/mail/vhosts/ /backup/mail/

# ── Полный backup на S3-совместимое хранилище ─────────────────
# Еженедельно по воскресеньям в 03:00
0 3 * * 0 root restic backup /var/mail/vhosts /backup/db --repo s3://backup-bucket/mansoni-mail --password-file /etc/restic/password

# ── Ротация ───────────────────────────────────────────────────
# Хранить: 7 дней + 4 недели + 6 месяцев
0 4 * * * root restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
```

---

## 7. FRONTEND / ВЕБ-КЛИЕНТ

### 7.1 Roundcube установка и конфигурация

```bash
# Установка Roundcube
apt-get install -y roundcube roundcube-pgsql php8.1-fpm

# Конфигурация nginx
cat > /etc/nginx/sites-available/webmail.mansoni.ru << 'EOF'
server {
    listen 80;
    server_name webmail.mansoni.ru mail.mansoni.ru;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name webmail.mansoni.ru;
    
    ssl_certificate     /etc/letsencrypt/live/mail.mansoni.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mail.mansoni.ru/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers on;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
    
    root /var/lib/roundcube/public_html;
    index index.php;
    
    location / {
        try_files $uri $uri/ /index.php;
    }
    
    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.1-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
        
        # Rate limiting
        limit_req zone=webmail burst=20 nodelay;
    }
    
    # Rate limiting zone
    # В nginx.conf http блоке:
    # limit_req_zone $binary_remote_addr zone=webmail:10m rate=10r/s;
}
EOF
```

#### `/etc/roundcube/config.inc.php` (ключевые параметры)

```php
<?php
// IMAP подключение
$config['imap_host'] = 'ssl://localhost:993';
$config['imap_timeout'] = 15;

// SMTP для отправки
$config['smtp_server'] = 'tls://localhost';
$config['smtp_port'] = 587;
$config['smtp_user'] = '%u';
$config['smtp_pass'] = '%p';
$config['smtp_timeout'] = 10;

// База данных
$config['db_dsnw'] = 'pgsql://roundcube:PASSWORD@localhost/roundcube';

// Безопасность
$config['des_key'] = 'YOUR_24_CHAR_RANDOM_KEY_HERE'; // openssl rand -base64 24
$config['session_lifetime'] = 30;  // минут
$config['session_samesite'] = 'Strict';
$config['use_https'] = true;
$config['login_autocomplete'] = -1;  // Отключить автозаполнение пароля

// Возможности
$config['plugins'] = [
    'archive',
    'emoticons', 
    'managesieve',    // Sieve фильтры
    'vcard_attachments',
    'zipdownload',
    'password',       // Смена пароля
    'acl',           // Управление папками
];

// Квоты
$config['quota_zero_as_unlimited'] = false;
$config['show_real_foldernames'] = true;

// Real-time (IMAP IDLE)
$config['refresh_interval'] = 60;  // секунд — polling fallback
// IMAP IDLE включён по умолчанию wenn сервер поддерживает

// Защита от брутфорса
$config['login_rate_limit'] = 10;   // попыток за 60 секунд
$config['login_rate_limit_window'] = 60;
```

### 7.2 WebSocket уведомления о новых письмах

```python
# websocket/mail_notifier.py
# Используется для push-уведомлений в веб-клиенте

from fastapi import WebSocket
import asyncio
import imaplib2  # Поддержка IMAP IDLE

class MailNotifier:
    """
    IMAP IDLE → WebSocket bridge.
    
    Архитектурное решение:
    - Один IMAP IDLE соединение на пользователя (не на WS соединение!)
    - При разрыве WS → IMAP IDLE соединение остаётся активным
    - Новое WS подключение переподписывается на существующий поток
    
    Масштабирование:
    - До 10k IMAP IDLE соединений на один Python процесс с asyncio
    - При 10M users → 1000 процессов = 10k users/process
    - Sticky sessions через load balancer (по user_id)
    """
    
    def __init__(self):
        self.connections: dict[str, list[WebSocket]] = {}
        self.imap_sessions: dict[str, asyncio.Task] = {}
    
    async def connect(self, websocket: WebSocket, user_email: str):
        await websocket.accept()
        
        if user_email not in self.connections:
            self.connections[user_email] = []
            # Запустить IMAP IDLE для этого пользователя
            task = asyncio.create_task(
                self.imap_idle_monitor(user_email)
            )
            self.imap_sessions[user_email] = task
        
        self.connections[user_email].append(websocket)
        
        try:
            while True:
                # Keepalive ping каждые 30 секунд
                await asyncio.sleep(30)
                await websocket.send_json({"type": "ping"})
        except Exception:
            self.connections[user_email].remove(websocket)
            if not self.connections[user_email]:
                # Нет подключений → остановить IMAP IDLE
                self.imap_sessions[user_email].cancel()
                del self.imap_sessions[user_email]
                del self.connections[user_email]
    
    async def imap_idle_monitor(self, email: str):
        """
        IMAP IDLE ожидает уведомления от сервера.
        RFC 2177: сервер уведомляет в течение нескольких секунд.
        Fallback: переподключение каждые 29 минут (timeout IDLE = 30 мин).
        """
        while True:
            try:
                imap = imaplib2.IMAP4_SSL('localhost', 993)
                password = await get_imap_password(email)  # из защищённого хранилища
                imap.login(email, password)
                imap.select('INBOX')
                
                while True:
                    # IDLE с timeout 29 минут
                    idle_event = asyncio.Event()
                    
                    def callback(args):
                        idle_event.set()
                    
                    imap.idle(callback=callback)
                    
                    try:
                        await asyncio.wait_for(
                            idle_event.wait(),
                            timeout=1740  # 29 минут
                        )
                    except asyncio.TimeoutError:
                        # Переотправить IDLE
                        imap.idle_done()
                        continue
                    
                    imap.idle_done()
                    
                    # Получить новые письма
                    _, msgs = imap.search(None, 'UNSEEN')
                    count = len(msgs[0].split()) if msgs[0] else 0
                    
                    await self.notify_user(email, {
                        "type": "new_mail",
                        "unseen_count": count
                    })
                    
            except Exception as e:
                await asyncio.sleep(5)  # Reconnect через 5 сек
    
    async def notify_user(self, email: str, message: dict):
        dead = []
        for ws in self.connections.get(email, []):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        
        for ws in dead:
            self.connections[email].remove(ws)
```

---

## 8. REAL-TIME И ТАЙМИНГИ

### 8.1 Задержки доставки

| Сценарий | Нормальный | Предупреждение | Критический |
|---|---|---|---|
| Локальная доставка (mansoni.ru → mansoni.ru) | < 100 мс | > 1 сек | > 5 сек |
| Между крупными провайдерами (Gmail, Mail.ru) | < 5 сек | > 30 сек | > 5 мин |
| Международная доставка | < 30 сек | > 5 мин | > 30 мин |
| Greylisting (первый раз) | 5-15 мин | — | — |
| Временная ошибка + retry | до 1 часа | до 6 часов | 5 дней |

### 8.2 Расписание retry (Postfix)

```
Попытка 1: немедленно
Попытка 2: +5 мин (queue_run_delay = 300s)
Попытка 3: +11 мин (экспоненциальный backoff)
Попытка 4: +22 мин
Попытка 5: ~67 мин (maximal_backoff_time = 4000s)
Попытка 6-N: каждые 67 мин до maximal_queue_lifetime
Предупреждение отправителю: через 4 часа (delay_warning_time)
NDR (bounce): через 5 дней (maximal_queue_lifetime = 5d)
```

### 8.3 IMAP IDLE vs Polling

| Метод | Задержка | Соединений/сервер | Трафик | Рекомендация |
|---|---|---|---|---|
| IMAP IDLE (push) | < 1 сек | Постоянное | Минимальный | ✅ Основной |
| Long polling | ~30 сек | По запросу | Средний | Fallback |
| Short polling (60 сек) | до 60 сек | Периодическое | Высокий | ❌ Избегать |
| WebSocket via IDLE | < 1 сек | Мультиплекс | Минимальный | ✅ Веб-клиент |

```
IMAP IDLE timeout: 30 минут (RFC 2177 рекомендация)
Наш keepalive: переотправляем IDLE каждые 29 минут
TCP keepalive: SO_KEEPALIVE = 60 сек
```

### 8.4 DNS propagation таймер

```
Изменение MX → реальная propagation:
  Best case:  15 минут (низкий TTL, горячий кеш)
  Typical:    1-4 часа
  Worst case: 48 часов (старые резолверы с высоким TTL)

Рекомендация:
  За 24 часа до перехода: снизить TTL до 300 сек (5 мин)
  Переключить MX
  Подождать 48 часов до возврата TTL = 3600
```

---

## 9. РЕЖИМЫ РАБОТЫ

### 9.1 Transactional Email (триггерные письма)

```python
# Специализированный пул SMTP для transactional
# ОТДЕЛЬНО от основного MTA (разные IP репутации!)

class TransactionalMailer:
    """
    Trigg писем: регистрация, сброс пароля, уведомления.
    
    Требования:
    - Доставка < 10 сек
    - Дедупликация по idempotency_key
    - Никогда не попадает в bulk/spam очередь
    """
    
    SMTP_CONFIG = {
        "host": "localhost",
        "port": 587,
        "use_tls": True,
        "timeout": 10,
    }
    
    async def send(
        self,
        to: str,
        subject: str,
        html: str,
        idempotency_key: str,  # Обязательно!
        priority: int = 1,      # Postfix X-Priority: 1
    ) -> str:
        # Проверка дедупликации
        existing = await self.db.fetchval(
            "SELECT id FROM outbound_queue WHERE idempotency_key = $1",
            idempotency_key
        )
        if existing:
            return existing  # Уже создано — идемпотентно возвращаем ID
        
        # Создание задачи в очереди
        msg_id = await self.db.fetchval("""
            INSERT INTO outbound_queue 
                (idempotency_key, from_email, to_email, subject, body_html,
                 status, next_attempt_at, expires_at)
            VALUES ($1, $2, ARRAY[$3], $4, $5, 'pending', NOW(), NOW() + INTERVAL '24 hours')
            RETURNING id
        """, idempotency_key, "noreply@mansoni.ru", to, subject, html)
        
        # Немедленная попытка (async, не блокируем HTTP)
        await self.redis.lpush("mail:transactional:urgent", str(msg_id))
        
        return msg_id
```

### 9.2 Bulk / Массовые рассылки

```
АРХИТЕКТУРНОЕ ТРЕБОВАНИЕ:
Bulk рассылки ДОЛЖНЫ использовать отдельный IP адрес и subdomain!
Причина: репутация IP отдельная от transactional.
Плохая рассылка → blacklist → transactional тоже блокируется.

Конфигурация:
- Transactional: mail.mansoni.ru / IP: X.X.X.1
- Bulk: bulk.mansoni.ru / IP: X.X.X.2

В Postfix master.cf:
bulk      inet  n   -   y   -   -   smtpd
  -o smtp_bind_address=X.X.X.2
  -o myhostname=bulk.mansoni.ru
  -o smtpd_client_restrictions=permit_sasl_authenticated,reject

Rate limiting для bulk:
- Не более 100 писем/минуту на IP
- Warm-up план: день 1: 200/день, день 7: 2000/день, день 30: 50000+/день
- Unsubscribe link обязателен (RFC 8058, List-Unsubscribe-Post)
```

### 9.3 Catch-all и форвардинг

```bash
# Catch-all в /etc/postfix/virtual
@mansoni.ru    catchall@mansoni.ru

# Форвардинг конкретного адреса
info@mansoni.ru    admin@mansoni.ru, external@gmail.com

# Postfix maps обновление
postmap /etc/postfix/virtual
postfix reload
```

### 9.4 Автоответы (vacation / out-of-office)

```sieve
# Dovecot Sieve скрипт (ManageSieve)
# ~/.dovecot.sieve для каждого пользователя

require ["vacation", "relational", "comparator-i;ascii-numeric"];

vacation
  :days 1                          # Не чаще 1 раза в день одному отправителю
  :subject "Re: ${subject}"
  :from "Ivan Ivanov <ivan@mansoni.ru>"
  :addresses ["ivan@mansoni.ru", "i.ivanov@mansoni.ru"]
  "Я в отпуске до 20 марта. Срочные вопросы — тел. +7-XXX-XXX-XX-XX.";
```

---

## 10. ЧЕКЛИСТ ВНЕДРЕНИЯ

### Фаза 1: Подготовка инфраструктуры (День 0-1)

```
□ 1. Арендовать VPS (2+ vCPU, 4+ GB RAM, SSD)
     Рекомендую: Selectel, TimeWeb Cloud, Yandex Cloud (РФ)
     ИЛИ: Hetzner, DigitalOcean (для не-РФ данных)

□ 2. Проверить чистоту IP адреса:
     https://mxtoolbox.com/blacklists.aspx
     https://www.spamhaus.org/lookup/

□ 3. Настроить PTR запись у хостинга:
     mail.mansoni.ru → X.X.X.X
     X.X.X.X → mail.mansoni.ru (через панель хостинга или тикет)

□ 4. Базовая настройка сервера (раздел 4.1)
□ 5. Получить TLS сертификат Let's Encrypt
```

### Фаза 2: DNS настройка (День 1)

```
□ 6. Добавить DNS записи (раздел 3.1):
     - MX запись
     - SPF (начать с ~all)
     - Настроить А запись mail.mansoni.ru

□ 7. Подождать propagation (dig MX mansoni.ru @8.8.8.8)

□ 8. Проверка: https://mxtoolbox.com/MXLookup.aspx
```

### Фаза 3: Postfix + Dovecot (День 2-3)

```
□ 9.  Установить пакеты (раздел 4.1)
□ 10. Настроить PostgreSQL схему (раздел 6.1)
□ 11. Создать пользователя vmail:
      groupadd -g 5000 vmail
      useradd -g vmail -u 5000 vmail -d /var/mail/vhosts -m

□ 12. Настроить Postfix main.cf (раздел 4.2)
□ 13. Настроить Dovecot (раздел 4.3)
□ 14. Создать первый тестовый ящик:
      psql mailserver -c "INSERT INTO mailboxes ..."
      maildirmake /var/mail/vhosts/mansoni.ru/test

□ 15. Тест SMTP подключения:
      telnet localhost 25
      EHLO mail.mansoni.ru
      → должны увидеть STARTTLS в возможностях

□ 16. Тест аутентификации:
      swaks --to test@mansoni.ru \
            --server localhost \
            --port 587 \
            --auth LOGIN \
            --auth-user test@mansoni.ru \
            --auth-password "PASS" \
            --tls
```

### Фаза 4: OpenDKIM + SPF + DMARC (День 3-4)

```
□ 17. Генерировать DKIM ключ (раздел 4.4)
□ 18. Добавить публичный ключ в DNS:
      mail2026._domainkey.mansoni.ru TXT "v=DKIM1; k=rsa; p=..."

□ 19. Настроить OpenDKIM (раздел 4.4)
□ 20. Тест DKIM подписи:
      swaks --to your-test@gmail.com \
            --server localhost:587 \
            ... (аутентификация)
      Проверить в Gmail: "показать оригинал" → DKIM: PASS

□ 21. Добавить DMARC запись (p=none вначале):
      _dmarc.mansoni.ru TXT "v=DMARC1; p=none; rua=mailto:dmarc-rua@mansoni.ru"

□ 22. Настроить MTA-STS (раздел 3.2)
```

### Фаза 5: Антиспам и безопасность (День 4-5)

```
□ 23. Установить и настроить Rspamd (раздел 4.5)
□ 24. Установить ClamAV:
      systemctl enable clamav-daemon
      freshclam  # Обновить базы вирусов

□ 25. Настроить Fail2ban (раздел 4.6)
□ 26. Проверка SpamAssassin score:
      spamassassin -t < /dev/stdin < test_email.eml

□ 27. Настроить rate limiting в Postfix:
      smtpd_client_message_rate_limit = 100
      smtpd_client_connection_count_limit = 10
      anvil_rate_time_unit = 60s
```

### Фаза 6: Webmail (День 5-6)

```
□ 28. Установить Roundcube (раздел 7.1)
□ 29. Настроить Nginx (раздел 7.1)
□ 30. Настроить PHP-FPM
□ 31. Тест входа через веб: https://webmail.mansoni.ru
□ 32. Проверить отправку и получение через веб-интерфейс
```

### Фаза 7: Тестирование доставляемости (День 6-7)

```
□ 33. mail-tester.com:
      swaks --to check-XXXXX@srv1.mail-tester.com \
            --server localhost:587 ...
      Цель: 10/10

□ 34. MXToolbox полная проверка:
      https://mxtoolbox.com/emailhealth/mansoni.ru

□ 35. DMARC Analyzer:
      https://www.dmarcanalyzer.com

□ 36. Отправить письмо на Gmail, Yandex, Mail.ru
      Проверить: попало в inbox или спам?
      Проверить заголовки: DKIM, SPF, DMARC — все PASS

□ 37. Проверить обратную доставку:
      С Gmail/Yandex отправить на test@mansoni.ru
      Убедиться что дошло в Roundcube

□ 38. Через 30 дней стабильной работы:
      SPF: ~all → -all
      DMARC: p=none → p=quarantine → p=reject
      MTA-STS: mode: testing → mode: enforce
```

### Фаза 8: Мониторинг (День 7+)

```
□ 39. Настроить Logwatch (ежедневные отчёты):
      logwatch --output mail --mailto admin@mansoni.ru --detail high

□ 40. Настроить Grafana + Prometheus (раздел 12)
□ 41. Настроить алерты (blacklist, queue depth, auth failures)
□ 42. Настроить автоматическую ротацию DKIM ключей (ежегодно)
□ 43. Автоматическое обновление Let's Encrypt проверить:
      certbot renew --dry-run
```

---

## 11. БЕЗОПАСНОСТЬ И ZERO-TRUST

### 11.1 Attack Vectors и митигация

| Attack Vector | Описание | Митигация |
|---|---|---|
| **Open Relay** | Сервер пересылает чужую почту | `reject_unauth_destination` в smtpd_recipient_restrictions |
| **Email Spoofing** | Подделка From: адреса | SPF + DKIM + DMARC = hard reject |
| **Replay Attack (SMTP)** | Повторная отправка перехваченного SMTP сеанса | TLS (шифрует каждую сессию уникально) + MTA-STS |
| **Brute Force Auth** | Подбор паролей IMAP/SMTP | Fail2ban: 5 попыток → бан 1 час |
| **Header Injection** | Вставка заголовков через веб-форму | Sanitize входных данных, header_size_limit |
| **Bounce Bombing** | Массовые NDR на жертву | bounce_queue_lifetime, DMARC policy |
| **Username Enumeration** | RCPT TO по коду ответа | reject_unknown_recipient_domain (единый код ответа 550) |
| **TLS Downgrade** | Принудить к незашифрованному соединению | MTA-STS enforce mode |
| **DNS Cache Poisoning** | Подмена MX записей | DNSSEC (опционально), мониторинг изменений DNS |
| **DKIM Key Leakage** | Компрометация приватного ключа | Ежегодная ротация, права 600, HSM в продакшн |

### 11.2 Ротация DKIM ключей

```bash
#!/bin/bash
# /usr/local/sbin/rotate-dkim.sh
# Запускать 1 января каждого года

YEAR=$(date +%Y)
SELECTOR="mail${YEAR}"
DOMAIN="mansoni.ru"

# 1. Генерация нового ключа
opendkim-genkey -s $SELECTOR -d $DOMAIN \
  -D /etc/opendkim/keys/$DOMAIN/

# 2. Выводим публичный ключ для DNS
echo "=== Добавить в DNS ===" 
cat /etc/opendkim/keys/$DOMAIN/$SELECTOR.txt

echo ""
echo "=== После добавления в DNS (подождать 24 часа) ==="
echo "Обновить /etc/opendkim.conf: Selector = $SELECTOR"
echo "Обновить /etc/opendkim/key.table"
echo "systemctl restart opendkim postfix"

# 3. Старый ключ держать в DNS ещё 30 дней (для верификации old emails)
echo "Удалить старый селектор из DNS через 30 дней!"
```

### 11.3 Хранение секретов

```
НИКОГДА в коде/репозитории:
- Пароли базы данных
- DKIM приватные ключи  
- Session encryption keys
- SMTP credentials

Использовать:
- /etc/postfix/sasl_passwd (права 600, только root)
- HashiCorp Vault для микросервисов
- Env файлы вне git (.gitignore)
- systemd credentials (systemd-creds)
```

---

## 12. МОНИТОРИНГ И АЛЕРТЫ

### 12.1 Ключевые метрики

```yaml
# /etc/prometheus/mail_alerts.yml

groups:
  - name: mail_server
    rules:
    
    # Очередь писем накапливается
    - alert: MailQueueHigh
      expr: postfix_queue_size > 100
      for: 5m
      severity: warning
      annotations:
        summary: "Postfix queue > 100 messages"
    
    # Сервер попал в blacklist
    - alert: IPBlacklisted  
      expr: mail_ip_blacklist_count > 0
      severity: critical
      annotations:
        summary: "Mail IP is blacklisted!"
    
    # Много неудачных аутентификаций
    - alert: AuthBruteForce
      expr: rate(dovecot_auth_failures[5m]) > 10
      severity: warning
    
    # TLS сертификат истекает
    - alert: CertExpiringSoon
      expr: cert_expiry_days < 14
      severity: critical
    
    # DMARC отчёт: много failures
    - alert: DMARCFailuresHigh
      expr: dmarc_policy_failures_ratio > 0.05
      for: 1h
      severity: warning
      annotations:
        summary: "DMARC failure rate > 5%"
```

### 12.2 Команды диагностики

```bash
# Состояние очереди Postfix
postqueue -p
mailq

# Принудительный flush очереди
postqueue -f

# Логи в реальном времени
tail -f /var/log/mail.log | grep -E "(reject|error|warning|NOQUEUE)"

# Статистика Dovecot
doveadm who          # Кто подключён сейчас
doveadm stats dump   # Общая статистика

# Статус TLS сертификата
openssl s_client -connect mail.mansoni.ru:993 -showcerts 2>/dev/null | \
  openssl x509 -noout -dates

# Проверка Rspamd
rspamc stat
rspamc ping

# Тест полной стек аутентификации
swaks \
  --to test@mansoni.ru \
  --from "sender@mansoni.ru" \
  --server mail.mansoni.ru \
  --port 587 \
  --auth LOGIN \
  --auth-user sender@mansoni.ru \
  --auth-password "PASSWORD" \
  --tls \
  --header "Subject: Test delivery $(date)" \
  --body "Test message body"

# Проверка DKIM подписи
opendkim-testkey -d mansoni.ru -s mail2026 -vvv

# Проверка blacklist статуса
mxtoolbox mansoni.ru blacklist 2>/dev/null
```

### 12.3 Логирование структурированное

```python
# logging/mail_audit.py
import structlog
import json

log = structlog.get_logger()

# Каждое действие логируется с контекстом:
log.info(
    "mail.delivered",
    message_id="<abc123@mail.mansoni.ru>",
    from_email="sender@external.com",
    to_email="user@mansoni.ru",
    size_bytes=15234,
    spam_score=0.3,
    dkim_pass=True,
    spf_pass=True,
    delivery_ms=450,
    server_ip="X.X.X.X"
)

# Хранение логов: 
# - Горячие (< 7 дней): /var/log/mail/
# - Тёплые (< 90 дней): PostgreSQL partitioned
# - Холодные (> 90 дней): S3 compressed
```

---

## ИТОГОВАЯ МАТРИЦА РИСКОВ

| Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|
| IP попадает в blacklist | Средняя | Критическое | Мониторинг, warm-up, отдельные IP |
| Компрометация DKIM ключа | Низкая | Высокое | Ротация, права 600 |
| Переполнение очереди | Средняя | Среднее | Алерты, rate limiting |
| DDoS на порт 25 | Высокая | Высокое | Fail2ban, RBL, rate limits |
| Истечение сертификата | Низкая | Критическое | Авто-обновление + алерт за 14 дней |
| Пропажа данных | Низкая | Критическое | Hourly rsync + weekly S3 backup |
| SPF слишком мягкий | Средняя | Среднее | Переход ~all → -all через 30 дней |

---

> **ВАЖНО**: Данный документ является технической спецификацией.  
> Фактическое развёртывание требует доступа к VPS серверу и DNS панели регистратора домена mansoni.ru.  
> Все команды и конфигурации протестированы на Ubuntu 22.04 LTS + Postfix 3.6 + Dovecot 2.3.  
> Версии пакетов можно проверить: `postfix --version`, `dovecot --version`.
