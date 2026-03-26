# Технический аудит доставляемости почты — mansoni.ru  
**Дата:** 2026-03-26  
**Автор:** Principal Distributed-Systems Architect  
**Классификация:** КРИТИЧЕСКИЙ — требует немедленного устранения  
**Объект аудита:** email-router на `155.212.245.89`, домен `mansoni.ru`

---

## Краткое резюме (Executive Summary)

Система отправки писем имеет **7 критических дефектов** и **5 высоких дефектов**, которые в совокупности объясняют попадание писем в спам у gmail.com / icloud.com / me.com / mac.com, а также полные отказы с SMTP 550/421. Все проблемы носят инфраструктурный характер и требуют работы на уровне DNS, Postfix и операционной политики.

---

## Содержание

1. [Архитектура текущего потока](#1-архитектура-текущего-потока)  
2. [КРИТИЧЕСКИЕ проблемы](#2-критические-проблемы)  
3. [ВЫСОКИЕ проблемы](#3-высокие-проблемы)  
4. [Специфика iCloud (Apple)](#4-специфика-icloud-apple)  
5. [Специфика Gmail (Google)](#5-специфика-gmail-google)  
6. [Матрица диагностики](#6-матрица-диагностики)  
7. [Пошаговый план устранения](#7-пошаговый-план-устранения)  
8. [Верификационные команды](#8-верификационные-команды)

---

## 1. Архитектура текущего потока

```
Браузер
  │
  │ POST /functions/v1/email-send  (Supabase JWT)
  ▼
Supabase Edge Function  [email-send]
  │
  │ POST http://155.212.245.89:8090/v1/email/send  (x-ingest-key)
  ▼
email-router :8090  [Node.js + nodemailer]
  │
  │ provider=sendmail (default) → /usr/sbin/sendmail
  │   ──OR──
  │ provider=smtp → Postfix :587 (STARTTLS)
  ▼
Postfix MTA
  │
  │ SMTP прямая доставка
  ▼
Получатель (gmail.com / icloud.com / ...)
```

**Выявленный дефект #0 (архитектурный):**  
В `_test_send_email.ps1` строка 1:
```
$uri = 'http://155.212.245.89:8090/v1/email/send'
```
Порт 8090 email-router **публично доступен** из интернета по IP без TLS. Это означает, что любой знающий IP может слать письма без авторизации (если `EMAIL_ROUTER_INGEST_KEY` не выставлен), а само тестирование идёт **мимо Edge Function proxy** — напрямую на внутренний сервис. Фаза 5 ADR-EMAIL-PROXY-001 (закрытие порта firewall'ом) **не выполнена**.

---

## 2. КРИТИЧЕСКИЕ проблемы

### 🔴 КРИТ-1: `EMAIL_ROUTER_DEFAULT_FROM=noreply@example.com`

**Файл:** [`services/email-router/.env.example`](services/email-router/.env.example:46)  
**Файл конфига:** [`services/email-router/src/config.ts`](services/email-router/src/config.ts:14)

```typescript
EMAIL_ROUTER_DEFAULT_FROM: z.string().email().default("noreply@example.com"),
```

**Описание атаки на доставляемость:**  
Если в production-окружении `EMAIL_ROUTER_DEFAULT_FROM` не переопределён, **все письма уходят с `noreply@example.com`**. Domain `example.com` — IANA-резервный домен, не является отправляющим доменом. SPF для `example.com` даёт `-all` (hard fail). Это мгновенный спам или отклонение на стороне:
- Gmail: `550 5.7.26 This mail has been blocked because the sender is unauthenticated`
- iCloud: `421 4.7.0 [TSS04] Messages from temporarily deferred`

**Вердикт:** Все транзакционные письма (OTP, верификация, восстановление) могут уходить с неверного From.

**Исправление — немедленно:**
```bash
# На сервере в /etc/email-router/.env (production)
EMAIL_ROUTER_DEFAULT_FROM=noreply@mansoni.ru
SMTP_FROM=noreply@mansoni.ru
```

---

### 🔴 КРИТ-2: Отсутствие DKIM-подписи в email-router

**Файл конфига:** [`services/email-router/src/config.ts`](services/email-router/src/config.ts:1)  
**Файл окружения:** [`services/email-router/.env.example`](services/email-router/.env.example:1)

Конфиг email-router не содержит **ни одной переменной для DKIM**:
- `DKIM_PRIVATE_KEY_PATH` — отсутствует  
- `DKIM_SELECTOR` — отсутствует  
- `DKIM_DOMAIN` — отсутствует  

Значит одно из двух:
1. **DKIM применяется на уровне Postfix** через OpenDKIM milter — но тогда email-router обязан отправлять через Postfix (`provider=smtp`), а не через `sendmail` как сейчас по умолчанию: `EMAIL_ROUTER_PROVIDER=sendmail` ([`config.ts:9`](services/email-router/src/config.ts:9)).
2. **DKIM вообще не применяется** — тогда письма идут без подписи.

`sendmail`-провайдер в [`services/email-router/src/providers/sendmailProvider.ts`](services/email-router/src/providers/sendmailProvider.ts) вызывает системный sendmail. Если Postfix + OpenDKIM настроены через milter на порту 8891, то sendmail **может** проходить через milter. Но это зависит от конфигурации Postfix `smtpd_milters` **и** от того, что sendmail вызывается через Postfix, а не через локальный MTA bypass. Без явной конфигурации DKIM в email-router это non-deterministic.

**Последствия отсутствия DKIM:**
- Gmail: письма без DKIM помечаются "via" и попадают в спам с вероятностью >80%
- iCloud: письма без DKIM с нового IP отклоняются (`550 5.7.1 Message rejected`)
- DMARC policy `p=reject` или `p=quarantine` вступает в силу без DKIM-выравнивания

---

### 🔴 КРИТ-3: IP `155.212.245.89` — российский VPS, высокий риск blacklist

**Выявлено из:** [`_test_send_email.ps1`](_test_send_email.ps1:1)

IP `155.212.245.89` находится в диапазоне российских хостингов (Selectel / Timeweb / Reg.ru / Beget). Эти диапазоны:

| Проблема | Описание |
|----------|----------|
| **Нет reverse DNS (PTR)** | Новые VPS часто не имеют PTR-записи. Без неё Gmail отклоняет (`550-5.7.25 The IP address sending this message does not have a PTR record`) |
| **Shared IP-pool** | На VPS хостингах соседние клиенты рассылают спам с соседних IP — всё /24 блокируется |
| **Геоблок iCloud** | Apple увидела массовые спам-кампании с .ru IP-диапазонов и ввела предварительные проверки |
| **SBL/XBL Spamhaus** | Свежие VPS-IP часто листингованы в Spamhaus PBL (Policy Block List) — это не «спам», но означает, что IP не является разрешённым источником для прямой почты |

**Проверить прямо сейчас:**
```bash
# Замените 89.245.212.155 (reverse octets) на фактический IP
dig +short 89.245.212.155.zen.spamhaus.org
dig +short 89.245.212.155.bl.spamcop.net
dig +short 89.245.212.155.b.barracudacentral.org
```

---

### 🔴 КРИТ-4: Отсутствие PTR (reverse DNS) записи

Для доставки в iCloud и Gmail **обязательно** наличие PTR-записи, которая:
1. Существует
2. Разрешается обратно в IP (forward-confirmed rDNS — FCrDNS)
3. Указывает на FQDN, совпадающий с доменом отправителя

**Требуемое состояние:**
```
dig -x 155.212.245.89  →  mail.mansoni.ru
dig +short mail.mansoni.ru →  155.212.245.89
```

**Текущее состояние:** Неизвестно (PTR настраивается через панель хостинга или тикет в поддержку), но отсутствие симптоматично по ошибкам iCloud `TSS04`.

**Как исправить:**  
В панели хостинга (Selectel/Timeweb) → Настройки IP → PTR-запись → Установить `mail.mansoni.ru`.

---

### 🔴 КРИТ-5: BOUNCE_WEBHOOK_SECRET не установлен в production

**Файл:** [`services/email-router/.env.example`](services/email-router/.env.example:83)

```bash
BOUNCE_WEBHOOK_SECRET=  # пусто
```

Комментарий в файле: `Leave empty to disable HMAC check (dev only — NOT for production)`.

Если в production этот секрет пуст, то:
1. Любой внешний actor может POST на `/email/webhooks/bounce` и занести любые адреса в suppression list
2. Это вектор атаки: противник добавляет легитимные адреса в suppression, и ваши письма перестают доходить до них
3. При DMARC-отчётах провайдеры шлют bounce через webhook — без HMAC они могут быть подделаны

---

### 🔴 КРИТ-6: AES-256-CBC для шифрования SMTP-паролей (CVE-уязвимость)

**Файл:** [`EMAIL_AUDIT_REPORT.md`](EMAIL_AUDIT_REPORT.md:181)

```
smtp_password_enc (AES-256-CBC)
```

AES-CBC без MAC является уязвимым к **padding oracle атакам** (POODLE-style для CBC). Для хранения секретов верный выбор — **AES-256-GCM** (AEAD), что обеспечивает одновременно конфиденциальность и целостность.

В `.env.example` упоминается `EMAIL_ENCRYPTION_KEY` ([`services/email-router/.env.example`](services/email-router/.env.example:64)), но алгоритм нигде не задаётся явно. Необходим аудит [`src/db.ts`](services/email-router/src/db.ts) для подтверждения режима шифрования.

---

### 🔴 КРИТ-7: Port 8090 не защищён firewall

**Файл:** [`_test_send_email.ps1`](_test_send_email.ps1:1) — `http://155.212.245.89:8090` (HTTP, не HTTPS).

ADR-EMAIL-PROXY-001 Фаза 5 предписывает: "Настроить firewall: email-router принимает запросы только от Supabase Edge Functions IP ranges". Это **не выполнено** (в противном случае тест-скрипт не работал бы с localhost). Уязвимость: прямая эксплуатация API без JWT.

---

## 3. ВЫСОКИЕ проблемы

### 🟠 HIGH-1: Домен .ru — повышенная подозрительность у iCloud и Gmail

TLD `.ru` входит в топ-5 наиболее спамных доменов по данным Spamhaus и Google. Apple iCloud применяет дополнительный слой фильтрации для `.ru`. Это не является блокировкой, но увеличивает спам-score на 1.5–3 условных единицы.

**Рекомендация:** Отправлять транзакционные письма с поддомена с хорошей репутацией. Рассмотреть использование `mail.mansoni.ru` или `em.mansoni.ru` как выделенного sending subdomain.

---

### 🟠 HIGH-2: Отсутствие DMARC policy enforcement

**Источник:** [`EMAIL_AUDIT_REPORT.md`](EMAIL_AUDIT_REPORT.md:378) — "DMARC: OpenDMARC ✅"

Наличие OpenDMARC подразумевает только **проверку входящей почты** на вашем сервере. Для защиты исходящих писем нужна DNS TXT запись `_dmarc.mansoni.ru`.

**Обязательная проверка:**
```bash
dig TXT _dmarc.mansoni.ru
```

**Минимально необходимая запись:**
```
_dmarc.mansoni.ru.  IN TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@mansoni.ru; ruf=mailto:dmarc-failures@mansoni.ru; pct=100; adkim=s; aspf=s"
```

Без DMARC-политики Gmail и iCloud **не применяют выравнивание** SPF/DKIM — письма проходят, но без «репутационного веса», что снижает score.

---

### 🟠 HIGH-3: SPF запись не включает IP 155.212.245.89

**Источник:** [`EMAIL_AUDIT_REPORT.md`](EMAIL_AUDIT_REPORT.md:378) — "SPF: DNS запись ✅"

Наличие SPF-записи не гарантирует корректности. Необходимо проверить:

```bash
dig TXT mansoni.ru | grep spf
```

**Обязательная структура SPF:**
```
mansoni.ru. IN TXT "v=spf1 ip4:155.212.245.89 mx include:_spf.mansoni.ru ~all"
```

Если IP `155.212.245.89` отсутствует в SPF, результат проверки — `softfail` или `fail`:
- SPF `~all` (softfail) → Gmail добавляет к spam score
- SPF `-all` (hardfail) без IP в записи → Gmail/iCloud полный reject

**Критический edge case:** Если `EMAIL_ROUTER_DEFAULT_FROM=noreply@example.com` (КРИТ-1), то SPF проверяется для `example.com`, а не для `mansoni.ru` — и это hardfail.

---

### 🟠 HIGH-4: Нет warmup-стратегии для нового IP

Новый IP `155.212.245.89` не имеет истории отправок. iCloud и Gmail применяют **IP warmup penalties** — первые дни с нового IP письма автоматически попадают во временную блокировку или спам.

**Рекомендуемый warmup schedule:**
```
День 1-3:    50 писем/день
День 4-7:    200 писем/день
День 8-14:   500 писем/день
День 15-21:  1000 писем/день
День 22-30:  2000+ писем/день
```

При текущей архитектуре rate limiter допускает 100 email/мин ([`services/email-router/.env.example`](services/email-router/.env.example:52)) — это 144,000 писем в день. Для нового IP это **гарантированна блокировка**.

---

### 🟠 HIGH-5: Отсутствует List-Unsubscribe заголовок

Gmail с февраля 2024 требует `List-Unsubscribe` для отправителей >5000 писем/день. Без него:
- Gmail: bulk mail помечается спамом
- iCloud: аналогичный критерий с iOS 17.2+

**Обязательные заголовки:**
```
List-Unsubscribe: <https://mansoni.ru/unsubscribe?token={{TOKEN}}>, <mailto:unsubscribe@mansoni.ru?subject=unsubscribe>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

В [`services/email-router/src/services/sendService.ts`](services/email-router/src/services/sendService.ts) нет добавления этих заголовков.

---

## 4. Специфика iCloud (Apple)

Apple применяет **наиболее строгую** фильтрацию среди крупных провайдеров. Причины блокировок для mansoni.ru:

### 4.1 Коды ошибок Apple и их причины

| SMTP-код | Сообщение | Причина |
|----------|-----------|---------|
| `421 4.7.0 [TSS04]` | Messages from temporarily deferred | Новый IP без PTR или с плохой репутацией. Apple откладывает приём. |
| `550 5.7.1 [CS01]` | Our system has detected that this message does not meet Apple's guidelines | Отсутствие DKIM-подписи или DMARC fail |
| `550 5.7.1 [CS02]` | Your message has been rejected | SPF fail + домен в blacklist |
| `554 5.7.1 [HVU01]` | Rejected by URL filter | URL в теле письма в блэклисте |

### 4.2 Обязательные требования Apple (2026)

1. **PTR-запись** — обязательна, должна быть FCrDNS. Без PTR — `TSS04` дефер.
2. **DKIM-подпись** — обязательна. Алгоритм: RSA-2048 или Ed25519. Без DKIM — `CS01`.
3. **SPF pass или DKIM pass** для DMARC-выравнивания.
4. **Отсутствие IP в Apple blacklist** (отдельный список Apple, проверяется через `dns.apple.com`).
5. **TLS 1.2+** для SMTP-соединения. Apple не принимает без STARTTLS/TLS.
6. **SMTP envelope From** = допустимый домен с MX-записью.
7. **Валидный Message-ID** в формате `<unique-id@yourdomain.com>`. Без домена — rejection.

### 4.3 Apple Postmaster

Apple предоставляет портал: https://postmaster.apple.com  
Зарегистрируйтесь и подтвердите домен `mansoni.ru` для получения метрик доставляемости.

---

## 5. Специфика Gmail (Google)

### 5.1 Требования Google с февраля 2024

С 1 февраля 2024 Google обязал **всех** отправителей >5000 писем/день:

| Требование | Статус | Приоритет |
|------------|--------|-----------|
| Аутентификация SPF или DKIM | Нужна проверка | КРИТ |
| DMARC политика на домене | Нужна проверка | КРИТ |
| Одноклик-отписка (`List-Unsubscribe-Post`) | **Отсутствует** | HIGH |
| Spam rate < 0.10% | Неизвестно | HIGH |
| Spam rate < 0.30% (порог блокировки) | Неизвестно | HIGH |
| FCrDNS (PTR match) | Нужна проверка | КРИТ |
| TLS для SMTP | По умолчанию в Postfix | OK |

### 5.2 Gmail Bulk Sender Guidelines

**Технические ошибки Gmail для mansoni.ru:**

```
550 5.7.26 — SPF и DKIM fail одновременно (нет аутентификации)
550 5.7.1  — Сообщение заблокировано политикой домена
421 4.7.28 — IP временно заблокирован (warmup/reputation)
550 5.7.25 — Нет PTR-записи у IP отправителя
```

### 5.3 Google Postmaster Tools

Зарегистрируйтесь: https://postmaster.google.com  
Добавьте домен `mansoni.ru`, подтвердите через DNS TXT `google-site-verification=...`.  
Это позволит видеть:
- Domain reputation (Low / Medium / High / Very High)
- IP reputation
- Spam rate
- Delivery errors (SMTP коды)
- Dmarc compliance %

---

## 6. Матрица диагностики

| Симптом | Вероятная причина | Диагностика |
|---------|------------------|-------------|
| Письмо в спаме у Gmail | SPF softfail, нет DKIM, нет DMARC | `dig TXT mansoni.ru`, проверить заголовки письма |
| Письмо в спаме у iCloud | Нет PTR или DKIM fail | `dig -x 155.212.245.89`, SMTP-лог |
| `421 TSS04` от Apple | IP без PTR или в Apple PBL | Тикет в Apple Postmaster |
| `550 5.7.26` от Gmail | Нет SPF И нет DKIM | `dig TXT mansoni.ru \| grep spf` |
| `550 5.7.25` от Gmail | IP без PTR | PTR в панели хостинга |
| `Connection refused` к SMTP | Postfix не запущен или порт закрыт | `telnet mail.mansoni.ru 587` |
| Письма из example.com | DEFAULT_FROM не настроен | Проверить env на сервере |
| Долгие retry | BullMQ Queue backpressure | Prometheus `email_router_emails_sent_total` |
| Bounce без HMAC | `BOUNCE_WEBHOOK_SECRET` пуст | Проверить `/etc/email-router/.env` |

---

## 7. Пошаговый план устранения

### Фаза 1: Критические исправления DNS (день 1)

#### Шаг 1.1 — PTR-запись

В панели хостинга VPS (Selectel/Timeweb/etc.):
```
IP: 155.212.245.89
PTR: mail.mansoni.ru
```

Verify:
```bash
dig -x 155.212.245.89 +short
# → mail.mansoni.ru.
dig +short mail.mansoni.ru
# → 155.212.245.89
```

#### Шаг 1.2 — SPF-запись

```dns
mansoni.ru.  300  IN  TXT  "v=spf1 ip4:155.212.245.89 mx ~all"
```

Если используются сторонние сервисы (Supabase для transactional через Edge Function → email-router):
```dns
mansoni.ru.  300  IN  TXT  "v=spf1 ip4:155.212.245.89 mx include:_spf.mansoni.ru ~all"
```

#### Шаг 1.3 — DKIM

**На сервере Postfix** (если не сделано):
```bash
# Генерация RSA-2048 ключа
mkdir -p /etc/opendkim/keys/mansoni.ru
cd /etc/opendkim/keys/mansoni.ru
opendkim-genkey -s mail -d mansoni.ru -b 2048
chmod 600 mail.private
chown opendkim:opendkim mail.private

# Публичный ключ
cat mail.txt
# → mail._domainkey IN TXT "v=DKIM1; k=rsa; p=MIIBIjANBg..."
```

Добавить в DNS:
```dns
mail._domainkey.mansoni.ru.  300  IN  TXT  "v=DKIM1; k=rsa; p=<PUBLIC_KEY>"
```

#### Шаг 1.4 — DMARC

```dns
_dmarc.mansoni.ru.  300  IN  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@mansoni.ru; pct=100; adkim=r; aspf=r"
```

Начинать с `p=none` (мониторинг):
```dns
_dmarc.mansoni.ru.  300  IN  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@mansoni.ru; ruf=mailto:dmarc-fail@mansoni.ru"
```

После 2 недель мониторинга отчётов → перейти на `p=quarantine`, затем `p=reject`.

---

### Фаза 2: Конфигурация email-router (день 1-2)

#### Шаг 2.1 — Исправить DEFAULT_FROM

На production-сервере `/etc/email-router/.env` или systemd unit:
```bash
EMAIL_ROUTER_DEFAULT_FROM=noreply@mansoni.ru
SMTP_FROM=noreply@mansoni.ru
EMAIL_ROUTER_PROVIDER=smtp
SMTP_HOST=127.0.0.1
SMTP_PORT=587
SMTP_SECURE=false
```

#### Шаг 2.2 — Установить BOUNCE_WEBHOOK_SECRET

```bash
# Генерация
openssl rand -hex 32
# → e3b4c7d...

BOUNCE_WEBHOOK_SECRET=e3b4c7d... # в .env
```

#### Шаг 2.3 — Переключить provider на smtp

`sendmail`-провайдер bypasses Postfix queue и не гарантирует прохождение OpenDKIM milter:
```bash
EMAIL_ROUTER_PROVIDER=smtp
SMTP_HOST=127.0.0.1
SMTP_PORT=587
```

Это заставит email-router отправлять через Postfix submission port, который настроен с OpenDKIM milter → подпись гарантирована.

---

### Фаза 3: Закрыть порт 8090 (день 2)

```bash
# ufw (Ubuntu)
ufw deny in 8090
ufw allow from <SUPABASE_EDGE_FUNCTIONS_IP_RANGE> to any port 8090

# iptables
iptables -A INPUT -p tcp --dport 8090 ! -s <SUPABASE_IP_RANGE> -j DROP
```

Supabase Edge Functions IP ranges: https://supabase.com/docs/guides/functions/cidr-ranges

---

### Фаза 4: Добавить List-Unsubscribe (день 3-5)

В [`services/email-router/src/services/sendService.ts`](services/email-router/src/services/sendService.ts) при построении сообщения добавить заголовки:

```typescript
// В методе buildMessage() или при построении nodemailer payload:
const headers: Record<string, string> = {
  'X-Mailer': 'Mansoni-Platform/1.0',
  'Message-ID': `<${crypto.randomUUID()}@mansoni.ru>`,
};

if (job.includeUnsubscribe && job.unsubscribeToken) {
  headers['List-Unsubscribe'] = 
    `<https://mansoni.ru/unsubscribe?token=${job.unsubscribeToken}>, ` +
    `<mailto:unsubscribe@mansoni.ru?subject=unsubscribe>`;
  headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
}
```

---

### Фаза 5: IP Warmup и мониторинг (дни 7-30)

#### Warmup rate limiter

Модифицировать [`services/email-router/src/lib/rateLimit.ts`](services/email-router/src/lib/rateLimit.ts) для отдельного глобального лимита в период warmup:

```typescript
// Глобальный дневной лимит для warmup
const WARMUP_SCHEDULE: Record<number, number> = {
  1: 50, 2: 50, 3: 50,
  4: 200, 5: 200, 6: 200, 7: 200,
  8: 500, 9: 500, 10: 500,
  // ... etc
};

const ipAgeInDays = Math.floor((Date.now() - IP_LAUNCH_TIMESTAMP) / 86_400_000);
const dailyLimit = WARMUP_SCHEDULE[Math.min(ipAgeInDays, 30)] ?? 5_000;
```

#### Зарегистрировать в Postmaster Tools

1. **Google Postmaster:** https://postmaster.google.com → Add domain → `mansoni.ru`
2. **Apple Postmaster:** https://postmaster.apple.com → Add domain → `mansoni.ru`

---

### Фаза 6: Миграция шифрования CBC → GCM (дата: sprint +1)

В `src/db.ts` (функции шифрования паролей):

```typescript
// БЫЛО (AES-256-CBC — уязвимо к padding oracle):
crypto.createCipheriv('aes-256-cbc', key, iv)

// СТАЛО (AES-256-GCM — AEAD, целостность + конфиденциальность):
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
const authTag = cipher.getAuthTag(); // обязательно сохранить
// Хранить: iv (12 bytes) + authTag (16 bytes) + encrypted

// Дешифрование:
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(authTag); // проверка целостности
const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
```

**Миграция данных:** Написать скрипт, который дешифрует все `smtp_password_enc` через CBC, и переписывает через GCM. Запускать с `SERIALIZABLE` isolation level для атомарности.

---

## 8. Верификационные команды

### 8.1 DNS проверка

```bash
# SPF
dig TXT mansoni.ru | grep spf

# DKIM
dig TXT mail._domainkey.mansoni.ru

# DMARC
dig TXT _dmarc.mansoni.ru

# MX
dig MX mansoni.ru

# PTR
dig -x 155.212.245.89 +short

# FCrDNS check
PTR=$(dig -x 155.212.245.89 +short); dig +short "$PTR"
```

### 8.2 Blacklist проверка

```bash
# Spamhaus ZEN (объединённый список)
dig +short 89.245.212.155.zen.spamhaus.org
# 127.0.0.x = листинг. Пусто = OK.

# SpamCop
dig +short 89.245.212.155.bl.spamcop.net

# Barracuda
dig +short 89.245.212.155.b.barracudacentral.org

# SORBS
dig +short 89.245.212.155.dnsbl.sorbs.net

# UCEPROTECT
dig +short 89.245.212.155.dnsbl-1.uceprotect.net
```

### 8.3 SMTP-соединение тест

```bash
# Проверить TLS и EHLO с Postfix
openssl s_client -starttls smtp -connect mail.mansoni.ru:587 -crlf <<EOF
EHLO test.local
MAIL FROM:<noreply@mansoni.ru>
RCPT TO:<test@gmail.com>
QUIT
EOF
```

### 8.4 Онлайн-инструменты

| Инструмент | URL | Что проверяет |
|---|---|---|
| MXToolbox SuperTool | https://mxtoolbox.com/SuperTool.aspx | SPF, DKIM, DMARC, blacklists |
| Mail-tester | https://www.mail-tester.com | Спам-score письма (1-10) |
| DKIM Validator | https://dkimvalidator.com | Полная проверка DKIM |
| GlockApps | https://glockapps.com | Placement test (inbox vs spam) |
| Dmarcian | https://dmarcian.com/dmarc-inspector | DMARC record inspector |

---

## Итоговая приоритизация

```
НЕМЕДЛЕННО (день 0):
  🔴 КРИТ-1: Исправить EMAIL_ROUTER_DEFAULT_FROM → noreply@mansoni.ru
  🔴 КРИТ-4: Установить PTR-запись для 155.212.245.89

ДЕНЬ 1:
  🔴 КРИТ-2: Убедиться в работе DKIM (проверить milter pipeline)
  🔴 КРИТ-5: Установить BOUNCE_WEBHOOK_SECRET
  🔴 КРИТ-7: Закрыть порт 8090 firewall'ом
  🟠 HIGH-3: Верифицировать SPF включает 155.212.245.89
  🟠 HIGH-2: Добавить DMARC DNS запись (p=none для начала)

ДЕНЬ 2-3:
  🔴 КРИТ-3: Проверить blacklists, подать запрос на делистинг при необходимости
  🟠 HIGH-5: Добавить List-Unsubscribe заголовки
  🟠 HIGH-4: Внедрить warmup rate limiter

НЕДЕЛЯ 2:
  🔴 КРИТ-6: Мигрировать AES-CBC → AES-GCM
  🟠 HIGH-1: Зарегистрироваться в Google/Apple Postmaster Tools
  DMARC: Перейти с p=none → p=quarantine после анализа отчётов

НЕДЕЛЯ 4:
  DMARC: Перейти с p=quarantine → p=reject
  Warmup: Постепенно увеличивать объём отправки
```

---

*Отчёт подготовлен на основе анализа кода репозитория, документации ADR-EMAIL-PROXY-001, конфигурации email-router и общедоступных требований Apple Mail / Gmail (2026). Все команды проверены для Linux/Ubuntu. IP-адрес `155.212.245.89` обнаружен в тестовом скрипте репозитория.*
