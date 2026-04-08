# Полный аудит раздела почты (Email Module)

**Дата:** 2026-03-14  
**Проект:** your-ai-companion (ECOMANSONI)  
**Автор:** AI Debug Assistant

---

## Содержание

1. [Обзор текущей реализации](#1-обзор-текущей-реализации)
2. [Анализ архитектуры](#2-анализ-архитектуры)
3. [Сравнение с российскими аналогами](#3-сравнение-с-российскими-аналогами)
4. [Сравнение с зарубежными аналогами](#4-сравнение-с-зарубежными-аналогами)
5. [Функциональный анализ](#5-функциональный-анализ)
6. [Технический анализ](#6-технический-анализ)
7. [Выводы и рекомендации](#7-выводы-и-рекомендации)

---

## 1. Обзор текущей реализации

### 1.1 Компоненты системы

Проект **your-ai-companion** включает полнофункциональную email-систему со следующими компонентами:

| Компонент | Назначение | Статус |
|-----------|-----------|--------|
| `email-router` | Node.js сервис для маршрутизации email | ✅ Активен |
| Supabase Edge Functions | API прокси для email операций | ✅ Активен |
| PostgreSQL | Хранение email данных | ✅ Активен |
| Redis + BullMQ | Очереди сообщений | ✅ Активен |
| Postfix | SMTP сервер | ✅ Развернут |
| Frontend Email Page | UI клиент | ✅ Активен |

### 1.2 Структура базы данных

```
public.email_templates     — Шаблоны писем
public.email_outbox         — Исходящие сообщения
public.email_inbox          — Входящие сообщения
public.email_deliveries     — История доставок
public.email_threads        — Треды сообщений
public.email_smtp_settings — Пользовательские SMTP настройки
public.email_imap_settings  — IMAP настройки для входящей почты
public.email_otp_codes      — OTP коды для верификации email
public.recovery_emails      — Резервные email для восстановления
```

---

## 2. Анализ архитектуры

### 2.1 Backend (Бэкенд)

#### 2.1.1 Email Router Service (`services/email-router`)

**Технологический стек:**
- Node.js 20 + Express
- TypeScript (strict mode)
- Zero-dependency подход для SMTP клиента
- BullMQ + Redis для очередей
- PostgreSQL для персистентности

**Ключевые модули:**

| Модуль | Файл | Функционал |
|--------|------|------------|
| SMTP Client | `src/providers/smtpProvider.ts` | Прямое TCP соединение через net.Socket |
| Queue Service | `src/services/queueService.ts` | BullMQ управление очередями |
| Send Service | `src/services/sendService.ts` | Отправка через nodemailer пул |
| Template Service | `src/services/templateService.ts` | Рендеринг HTML шаблонов |
| Bounce Processor | `src/services/bounceProcessor.ts` | Обработка bounce уведомлений |
| Suppression Service | `src/services/suppressionService.ts` | Suppression list management |
| Rate Limiter | `src/lib/rateLimit.ts` | Tenant-based rate limiting |
| Idempotency | `src/lib/idempotency.ts` | Дедупликация запросов |
| Circuit Breaker | `src/lib/circuitBreaker.ts` | Защита от каскадных отказов |

**API Endpoints:**

```
POST /api/v1/emails          — Отправить email
GET  /api/v1/emails/:id      — Получить статус
POST /api/v1/templates       — Создать шаблон
GET  /api/v1/templates       — Список шаблонов
GET  /api/v1/stats           — Статистика
GET  /api/v1/suppression     — Suppression list
DELETE /api/v1/suppression   — Удалить из suppression
POST /internal/webhooks/bounce    — Bounce callback
POST /internal/webhooks/complaint — Complaint callback
GET  /health                 — Health check
GET  /metrics                — Prometheus metrics
```

#### 2.1.2 Supabase Edge Functions

| Edge Function | Назначение |
|--------------|------------|
| `email-send` | Прокси отправки с кастомным SMTP override |
| `email-smtp-settings` | CRUD для SMTP/IMAP настроек пользователя |
| `send-email-otp` | Отправка OTP кодов на email |
| `verify-email-otp` | Верификация OTP |
| `recovery-email` | Управление recovery email |

**Особенности:**
- Rate limiting per user (10 req/min)
- AES-256-GCM шифрование SMTP паролей
- Server-side валидация From address
- JWT аутентификация

### 2.2 Frontend (Фронтенд)

#### 2.2.1 Страницы

| Страница | Файл | Описание |
|----------|------|----------|
| Email Page | `src/pages/EmailPage.tsx` | Основной email клиент |
| Email Settings | `src/pages/EmailSettingsPage.tsx` | Настройки SMTP/IMAP |

#### 2.2.2 Компоненты

| Компонент | Назначение |
|-----------|-----------|
| `SmtpSettingsPanel` | UI для настройки SMTP/IMAP |
| Email Thread View | Просмотр тредов |
| Composer Panel | Редактор новых писем |
| Message Row | Строка списка писем |

#### 2.2.3 Функции фронтенда

- ✅ Пагинация (50 писем на страницу)
- ✅ Система звездочек/флагов
- ✅ Reply / Reply All / Forward
- ✅ Drag & drop вложений
- ✅ Sandbox HTML рендеринг (iframe)
- ✅ Множественные почтовые ящики
- ✅ Папки (inbox, sent, draft, spam, trash)

### 2.3 База данных

#### 2.3.1 Таблицы

```sql
-- Ящики пользователей
email_inbox (
  id, message_id, in_reply_to_message_id,
  from_email, to_email, subject,
  html_body, text_body, thread_id,
  is_read, folder, is_starred,
  received_at, created_at
)

-- Исходящие
email_outbox (
  id, idempotency_key, to_email, from_email,
  subject, html_body, text_body,
  template_key, template_vars,
  status, thread_id, cc_email, bcc_email,
  reply_to_message_id, folder,
  attempts, max_attempts, next_attempt_at,
  locked_until, created_at, updated_at
)

-- Треды
email_threads (
  id, mailbox_email, subject_normalized,
  last_message_at, updated_at
)

-- Доставки
email_deliveries (
  id, outbox_id, provider,
  smtp_response, status, created_at
)

-- SMTP настройки пользователей
email_smtp_settings (
  id, user_id, smtp_host, smtp_port,
  smtp_user, smtp_password_enc (AES-256-CBC),
  tls_mode, from_name, from_email,
  reply_to, message_id_domain,
  verified_at, last_error, created_at
)

-- IMAP настройки
email_imap_settings (
  id, user_id, imap_host, imap_port,
  imap_user, imap_password_enc,
  tls_mode, sync_folders, poll_interval_s,
  verified_at, last_error, last_synced_at
)
```

#### 2.3.2 Индексы

```sql
idx_email_inbox_to_received     — to_email, received_at DESC
idx_email_inbox_reply_chain     — in_reply_to_message_id
idx_email_outbox_pending        — status, next_attempt_at
idx_email_outbox_locked        — locked_until (для processing)
idx_email_threads_mailbox_last  — mailbox_email, last_message_at DESC
idx_email_inbox_folder_received — to_email, folder, received_at DESC
```

### 2.4 Алгоритмы и логика

#### 2.4.1 Retry Strategy (Exponential Backoff)

```
Попытка 1: 30 сек
Попытка 2: 120 сек (2 мин)
Попытка 3: 480 сек (8 мин)
Попытка 4: 1920 сек (32 мин)
Попытка 5: 7680 сек (2.1 часа)
→ Dead Letter Queue
```

#### 2.4.2 Idempotency

- Двухуровневая проверка: Redis → PostgreSQL
- Ключ idempotency сохраняется с результатом
- При дубликате — возврат кэшированного результата

#### 2.4.3 Circuit Breaker

```
Состояния: CLOSED → OPEN → HALF_OPEN
Порог ошибок: 5失败 за 10 сек
Timeout: 30 сек
```

#### 2.4.4 Rate Limiting

- Sliding window per tenant (Redis)
- Ограничения: 100 email/мин на tenant

---

## 3. Сравнение с российскими аналогами

### 3.1 Яндекс.Почта

| Функция | Яндекс.Почта | your-ai-companion |
|---------|--------------|-------------------|
| **Отправка писем** | ✅ | ✅ |
| **Получение писем** | ✅ (IMAP/POP3) | ⚠️ Частично (IMAP настройка есть) |
| **SMTP/IMAP для пользователей** | ✅ | ✅ |
| **Кастомные SMTP настройки** | ❌ | ✅ |
| **Треды** | ✅ | ✅ |
| **Вложения** | ✅ | ✅ |
| **Поиск** | ✅ (полнотекстовый) | ❌ |
| **Алиасы** | ✅ | ❌ |
| **Автоответчик** | ✅ | ❌ |
| **Фильтры** | ✅ | ❌ |
| **Пересылка** | ✅ | ❌ |
| **S/MIME шифрование** | ✅ | ❌ |
| **DKIM/SPF/DMARC** | ✅ (встроено) | ✅ (Postfix + milter) |
| **API** | ✅ (XML-RPC устарел) | ✅ (REST) |

**Вывод:** Яндекс.Почта — полноценный почтовый клиент с 20+ лет разработки. Проект your-ai-companion предоставляет базовый функционал, но отсутствуют advanced функции: поиск, фильтры, автоответчики, алиасы.

### 3.2 Mail.ru

| Функция | Mail.ru | your-ai-companion |
|---------|---------|-------------------|
| **Отправка писем** | ✅ | ✅ |
| **Получение писем** | ✅ | ⚠️ Частично |
| **Треды** | ✅ | ✅ |
| **Кастомные SMTP** | ❌ | ✅ |
| **API** | ⚠️ Ограниченный | ✅ |
| **Корпоративная почта** | ✅ (Mail.ru для бизнеса) | ❌ |
| **Двухфакторная** | ✅ | ✅ (OTP email) |
| **Spam filtering** | ✅ (собственный) | ✅ (Rspamd) |

### 3.3 Российские CRM с email (amoCRM, Bitrix24)

| Функция | amoCRM | your-ai-companion |
|---------|--------|-------------------|
| **Email в CRM** | ✅ | ⚠️ Связь через CRM модуль |
| **Шаблоны** | ✅ | ✅ |
| **Рассылки** | ✅ | ❌ (только транзакционные) |
| **Email tracking** | ✅ | ❌ |
| **SMTP для писем** | ✅ | ✅ |

---

## 4. Сравнение с зарубежными аналогами

### 4.1 Gmail

| Функция | Gmail | your-ai-companion |
|---------|-------|-------------------|
| **Отправка/Получение** | ✅ | ✅ |
| **Кастомные SMTP** | ❌ (только OAuth) | ✅ |
| **Labels/Folders** | ✅ (labels) | ✅ (folders) |
| **Conversation threads** | ✅ | ✅ |
| **Search** | ✅ | ❌ |
| **Snooze** | ✅ | ❌ |
| **Canned responses** | ✅ | ❌ |
| **Send later** | ✅ | ❌ |
| **Undo send** | ✅ | ❌ |
| **Email tracking** | ✅ | ❌ |
| **S/MIME** | ✅ (платно) | ❌ |
| **API (Gmail API)** | ✅ | ❌ (REST свой) |
| **POP3/IMAP** | ✅ | ✅ (настраивается) |
| **Push notifications** | ✅ | ❌ |
| **Offline mode** | ✅ | ❌ |

### 4.2 Outlook.com

| Функция | Outlook | your-ai-companion |
|---------|---------|-------------------|
| **Email клиент** | ✅ | ✅ |
| **Calendar integration** | ✅ | ❌ |
| **People integration** | ✅ | ❌ |
| **Rules/Automations** | ✅ | ❌ |
| **Clutter** | ✅ | ❌ |
| **Focused inbox** | ✅ | ❌ |
| **SMTP/IMAP** | ✅ | ✅ |

### 4.3 Proton Mail

| Функция | Proton Mail | your-ai-companion |
|---------|-------------|-------------------|
| **End-to-end encryption** | ✅ | ❌ |
| **Zero-access architecture** | ✅ | ❌ |
| **Self-destructing messages** | ✅ | ❌ |
| **Password-protected emails** | ✅ | ❌ |
| **Anonymous routing** | ✅ | ❌ |
| **Open source** | ✅ | ⚠️ Частично |

### 4.4 Транзакционные email сервисы

| Сервис | Тип | Особенности |
|--------|-----|-------------|
| **SendGrid** | Transactional + Marketing | 250k emails/mo free |
| **Mailgun** | Transactional | Pay per email |
| **Amazon SES** | Transactional | Cheapest |
| **Postmark** | Transactional | High deliverability |
| **Resend** | Transactional | Modern API |

**your-ai-companion использует self-hosted подход**, что дает:
- ✅ Полный контроль над данными
- ✅ Экономия на объемах
- ✅ Кастомные SMTP для пользователей
- ❌ Сложность поддержки
- ❌ Deliverability требует настройки

---

## 5. Функциональный анализ

### 5.1 Реализованные функции

#### Email клиент (исходящие/входящие)

| Функция | Статус | Файл |
|---------|--------|------|
| Отправка email | ✅ | `services/email-router/src/routes/email.ts` |
| Получение (IMAP) | ⚠️ Настраивается | `SmtpSettingsPanel.tsx` |
| Треды сообщений | ✅ | `email_threads` table |
| Папки (inbox/sent/draft/spam/trash) | ✅ | `folder` column |
| Звездочки | ✅ | `is_starred` column |
| Прочтение | ✅ | `is_read` column |
| Reply/Reply All/Forward | ✅ | `EmailPage.tsx` |
| Черновики | ✅ | `folder = 'draft'` |
| Вложения | ✅ | Supabase Storage |
| HTML рендеринг | ✅ | sandbox iframe |

#### SMTP/IMAP

| Функция | Статус | Файл |
|---------|--------|------|
| Кастомный SMTP | ✅ | `email_smtp_settings` |
| Отправка через внешние провайдеры | ✅ | Presets for Gmail/Yandex/Outlook/Mail.ru |
| IMAP polling | ⚠️ Заготовка | `email_imap_settings` |
| DKIM подпись | ✅ | Postfix + OpenDKIM |
| SPF/DMARC | ✅ | DNS записи + OpenDMARC |
| Антиспам | ✅ | Rspamd |

#### Безопасность

| Функция | Статус | Файл |
|---------|--------|------|
| JWT аутентификация | ✅ | Edge Functions |
| Rate limiting | ✅ | `rateLimit.ts` |
| Idempotency | ✅ | `idempotency.ts` |
| Circuit breaker | ✅ | `circuitBreaker.ts` |
| Suppression list | ✅ | `suppressionService.ts` |
| Bounce processing | ✅ | `bounceProcessor.ts` |
| Encrypted SMTP passwords | ✅ | AES-256-CBC/PGP |

#### Шаблоны и автоматизация

| Функция | Статус | Файл |
|---------|--------|------|
| HTML шаблоны | ✅ | `email_templates` |
| Template variables | ✅ | `templateService.ts` |
| Транзакционные письма | ✅ | OTP, recovery, verification |

### 5.2 Отсутствующие функции

| Функция | Приоритет | Сложность |
|---------|-----------|-----------|
| **Полнотекстовый поиск** | Высокий | Средняя |
| **Email правила/фильтры** | Высокий | Высокая |
| **Автоответчики** | Средний | Средняя |
| **Email алиасы** | Средний | Низкая |
| **Email forwarding** | Средний | Средняя |
| **Send later / Snooze** | Средний | Средняя |
| **Canned responses** | Средний | Низкая |
| **Push notifications** | Высокий | Средняя |
| **Календарь интеграция** | Низкий | Высокая |
| **Контакты интеграция** | Средний | Высокая |
| **S/MIME шифрование** | Низкий | Высокая |
| **Pgp encryption** | Низкий | Высокая |
| **Offline mode** | Средний | Высокая |
| **Email tracking** | Низкий | Средняя |
| **Unread count badges** | Средний | Низкая |
| **POP3 поддержка** | Низкий | Средняя |

---

## 6. Технический анализ

### 6.1 Архитектурные решения

#### 6.1.1 Self-hosted vs SaaS

| Аспект | Self-hosted (current) | SaaS (SendGrid) |
|--------|----------------------|----------------|
| Контроль данных | ✅ Полный | ❌ |
| Стоимость при объеме | ✅ Дешевле | ❌ |
| Deliverability | ⚠️ Требует настройки | ✅ Гарантировано |
| Поддержка | ❌ Сложность | ✅ |
| Кастомные SMTP | ✅ | ❌ |

#### 6.1.2 Очереди и асинхронность

```
Frontend → Edge Function → email-router → BullMQ → Postfix → Recipient
              ↓              ↓
           PostgreSQL    Redis
```

**Плюсы:**
- Асинхронная обработка
- Retry с exponential backoff
- Circuit breaker protection

**Минусы:**
- Дополнительная сложность
- Задержки при высокой нагрузке

### 6.2 База данных

#### 6.2.1 Плюсы

- Нормализованная схема
- JSONB для template_vars
- Индексы на частые запросы
- RLS политики для безопасности

#### 6.2.2 Минусы

- Нет full-text search
- Ограниченные агрегатные запросы для analytics
- Нет материализованных представлений для отчетов

### 6.3 Real-time возможности

| Компонент | Технология | Статус |
|-----------|-----------|--------|
| Email уведомления | Supabase Realtime | ❌ Не подключено |
| Typing indicators | ❌ | ❌ |
| Message seen | ❌ | ❌ |
| Push notifications | ❌ | ❌ |

### 6.4 производительность

| Метрика | Текущее | Рекомендуемое |
|---------|---------|---------------|
| Max connections (SMTP pool) | 10 | Зависит от нагрузки |
| Retry attempts | 5 | ✅ |
| Timeout (send) | 30 сек | ✅ |
| Queue backlog | Неизвестно | Мониторинг нужен |

### 6.5 Безопасность

| Аспект | Реализация | Оценка |
|--------|-----------|--------|
| TLS | STARTTLS + TLS | ✅ |
| DKIM | OpenDKIM | ✅ |
| SPF | DNS запись | ✅ |
| DMARC | OpenDMARC | ✅ |
| Anti-spam | Rspamd | ✅ |
| Password encryption | AES-256-CBC | ✅ |
| RLS | PostgreSQL | ✅ |
| Rate limiting | Redis sliding window | ✅ |

---

## 7. Выводы и рекомендации

### 7.1 Общая оценка

| Критерий | Оценка | Комментарий |
|----------|--------|-------------|
| Базовая функциональность | 7/10 | Core email работает |
| Безопасность | 8/10 | Полный стек защиты |
| Архитектура | 8/10 | Современная, расширяемая |
| UX/UI | 6/10 | Базовый клиент |
| Масштабируемость | 7/10 | Требует оптимизации |
| Документация | 9/10 | Отличная документация |

### 7.2 Приоритетные улучшения

#### Высокий приоритет

1. **Полнотекстовый поиск**
   - Внедрить PostgreSQL full-text search или Elasticsearch
   - Покрыть: subject, body, sender, recipient

2. **Email правила/фильтры**
   - Позволить пользователям создавать правила на основе условий
   - Пример: "Если отправитель = X → переместить в папку Y"

3. **Push уведомления**
   - Интеграция с FCM / APNs
   - Web Push для PWA

4. **Email tracking (опционально)**
   - Open tracking (pixel)
   - Click tracking
   - ⚠️ Требует согласия пользователей

#### Средний приоритет

5. **Автоответчики**
   - Vacation responder
   - Правила автоответа

6. **Send Later / Snooze**
   - Отложенная отправка
   - "Спрятать" письмо до времени

7. **Canned Responses**
   - Шаблоны для быстрых ответов

8. **Offline mode**
   - IndexedDB для кэша
   - Queue для офлайн отправки

#### Низкий приоритет

9. **Интеграция с календарем**
   - iCal / CalDAV

10. **Шифрование (S/MIME, PGP)**
    - Для sensitive communications

### 7.3 Конкурентные преимущества

| Преимущество | Описание |
|--------------|----------|
| Self-hosted | Полный контроль над данными |
| Кастомные SMTP | Уникальная функция — пользователи могут использовать свой SMTP |
| Интеграция с CRM | Email внутри единой платформы |
| Zero-dependency | Легкость развертывания |

### 7.4 Угрозы и риски

| Риск | Вероятность | Влияние | Mitigation |
|------|-------------|---------|------------|
| Deliverability issues | Средняя | Высокое | Мониторинг, Rspamd, регулярная очистка списков |
| Email блокировка | Средняя | Высокое | SPF/DKIM/DMARC, warm-up |
| Spam complaints | Средняя | Высокое | Suppression list, consent |
| Database overload | Низкая | Среднее | Индексы, пагинация |
| Redis/Queue failure | Низкая | Высокое | Fallback синхронный режим |

### 7.5 Технические долги

1. **Отсутствует мониторинг email deliverability**
   - Нужны метрики: bounce rate, complaint rate, delivery rate

2. **Нет email analytics**
   - Отправлено/Доставлено/Открыто/Кликнуто

3. **IMAP polling не реализован полностью**
   - Только настройка, реальный fetching отсутствует

4. **Тесты для email-router**
   - Есть базовые, нужны интеграционные

---

## Резюме

Проект **your-ai-companion** имеет **solid foundation** для email модуля с:
- ✅ Production-ready архитектурой
- ✅ Self-hosted безопасностью
- ✅ Кастомными SMTP для пользователей
- ❌ Отсутствием advanced функций (search, filters, rules)

**Для конкуренции с российскими аналогами (Яндекс.Почта, Mail.ru)** необходимо добавить:
1. Полнотекстовый поиск
2. Правила/фильтры
3. Push уведомления

**Для конкуренции с Gmail/Outlook** нужен более долгий путь: интеграция календаря, контактов, offline mode.

---

*Документ создан в режиме Debug для систематического анализа email-подсистемы проекта.*
