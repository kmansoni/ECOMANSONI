# Архитектурный план миграции с Supabase на Self-Hosted VPS

## 1. Executive Summary

### Цель миграции

Полный переход с облачной платформы Supabase на собственную VPS-инфраструктуру для обеспечения полного контроля над данными, снижения затрат и независимости от вендора.

### Текущее состояние

Проект "Your AI Companion" использует следующие сервисы Supabase:
- **Auth** — аутентификация (email, phone OTP, OAuth, JWT)
- **Database** — PostgreSQL с 100+ таблицами
- **Realtime** — WebSocket-подписки, presence, broadcast для звонков
- **Storage** — медиафайлы (голосовые, аватары, видео)
- **Edge Functions** — 40+ серверных функций
- **RLS** — Row Level Security на всех таблицах

### Ключевые риски

| Риск | Уровень | Mitigation |
|------|---------|------------|
| Потеря данных при миграции | Высокий | Dual-write стратегия, поэтапная миграция |
| Даунтайм сервиса | Высокий | Параллельная работа, blue-green деплой |
| Несовместимость RLS | Средний | Перенос политик на PostgreSQL |
| Сложность WebSocket replication | Высокий | Redis Pub/Sub кластер |
| TURN сервер для WebRTC | Средний | Coturn с Let's Encrypt |

### Оценка возможности миграции

**Да, миграция технически возможна.** Однако требует значительных ресурсов на разработку и инфраструктуру. Рекомендуется поэтапный подход с сохранением Supabase как fallback в течение 3-6 месяцев после миграции.

---

## 2. Архитектурная диаграмма

```mermaid
graph TB
    subgraph "Client Layer"
        TMA[Telegram Mini App<br/>React/Vite]
        Mobile[Mobile Apps]
    end

    subgraph "Load Balancer & API Gateway"
        Nginx[Nginx Reverse Proxy<br/>+ SSL Termination]
        WSS[WebSocket Proxy<br/>ws:// upgrade]
    end

    subgraph "Application Services (Docker)"
        Auth[Auth Service<br/>Node.js/Python<br/>JWT, OAuth, OTP]
        API[API Gateway<br/>REST/GraphQL]
        Edge[Edge Functions<br/>Replaced by Docker<br/>40+ microservices]
    end

    subgraph "Real-time Layer"
        SocketIO[Socket.io Server<br/>Realtime subscriptions]
        Redis[(Redis Cluster<br/>Pub/Sub + Cache)]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL Primary<br/>16+ vCPU, 64GB RAM)]
        PGReplica[(PostgreSQL Replica<br/>Read Replicas)]
        S3[(S3-compatible Storage<br/>MinIO / Cloudflare R2)]
    end

    subgraph "Media Processing"
        FFmpeg[FFmpeg Workers<br/>Video/Audio processing]
        MediaCDN[Media CDN<br/>Cloudflare]
    end

    subgraph "WebRTC Infrastructure"
        SFU[Mediaserver SFU<br/>Video calls]
        TURN[Coturn Servers<br/>TURN/STUN]
    end

    TMA --> Nginx
    Mobile --> Nginx
    Nginx --> API
    Nginx --> WSS
    WSS --> SocketIO
    SocketIO --> Redis
    API --> Auth
    API --> Edge
    Edge --> PG
    SocketIO --> PG
    PG --> PGReplica
    Edge --> S3
    FFmpeg --> S3
    S3 --> MediaCDN
    TMA --> SFU
    Mobile --> SFU
    SFU --> TURN
```

---

## 3. Компоненты миграции

### 3.1 PostgreSQL Database

| Параметр | Текущее (Supabase) | Целевое (Self-hosted) |
|----------|---------------------|----------------------|
| Версия | PostgreSQL 15 | PostgreSQL 16+ |
| Репликация | Managed | Streaming Replication |
| Connection pooling | Supabase PostgREST | PgBouncer |
| Backup | Managed | pgBackRest + WAL archiving |
| Сложность | — | **4/5** |

#### Стратегия миграции

1. **Экспорт схемы**: `pg_dump --schema-only` из Supabase
2. **Экспорт данных**: `pg_dump --data-only` с параллельными потоками
3. **RLS политики**: Конвертировать в SQL-триггеры или использовать `pg_policies`
4. **Database extensions**: Восстановить `pgvector`, `uuid-ossp`, `pg_trgm`

#### Риски

- Large object (LO) миграция для Storage
- Sequence reset после импорта
- Время простоя при финальном sync

---

### 3.2 Authentication

| Параметр | Текущее (Supabase) | Целевое (Self-hosted) |
|----------|---------------------|----------------------|
| Провайдер | Supabase Auth | Keycloak / Supertokens / Own Auth |
| JWT | Supabase JWT | RS256 or HS256 |
| OAuth | Built-in | NextAuth.js / Passport.js |
| OTP | Supabase Phone | Twilio / Own SMS Gateway |
| Сложность | — | **4/5** |

#### Варианты решений

| Решение | Плюсы | Минусы |
|---------|-------|--------|
| **Keycloak** | Полный IAM, OAuth, LDAP | Тяжелый, сложная настройка |
| **Supertokens** | Supabase-подобный UX, easy migration | Есть free tier, но self-hosted paid |
| **Own Auth Service** | Полный контроль, минимальные ресурсы | Требует разработки |
| **Auth.js (NextAuth)** | Простота, гибкость | Требует адаптации |

**Рекомендация**: Own Auth Service на Node.js/TypeScript с JWT (RS256), так как Supabase Auth API уже используется через `supabase-js`.

#### Миграция пользователей

```sql
-- Экспорт хешей паролей из Supabase (если доступно)
-- В ином случае - принудительная ре-авторизация

-- Создание таблицы пользователей
CREATE TABLE auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  phone TEXT,
  password_hash TEXT,
  email_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 3.3 Realtime (WebSockets)

| Параметр | Текущее (Supabase) | Целевое (Self-hosted) |
|----------|---------------------|----------------------|
| Протокол | Supabase Realtime | Socket.io / raw WebSocket |
| Pub/Sub | Supabase Postgres Changes | Redis Pub/Sub |
| Presence | Supabase Presence | Redis + Custom |
| Broadcast | Supabase Broadcast | Socket.io rooms |
| Сложность | — | **5/5** |

#### Архитектура

```mermaid
sequenceDiagram
    Client->>Socket.io: connect(channel)
    Socket.io->>Redis: SUBSCRIBE channel_updates
    Database->>PostgreSQL: INSERT/UPDATE/DELETE
    PostgreSQL->>Redis: NOTIFY channel_updates
    Redis->>Socket.io: PUBLISH
    Socket.io->>Client: realtime event
```

#### Компоненты

- **Socket.io Server**: Node.js с Redis adapter
- **PostgreSQL LISTEN/NOTIFY**: Публикация изменений в Redis
- **Presence Tracker**: Redis Hash для онлайн-статуса

#### Используемые realtime фичи в проекте

| Feature | Файл | Описание |
|---------|------|---------|
| Chat updates | `useChat.tsx` | Подписка на messages |
| Presence | `usePresence.tsx` | last_seen_at updates |
| Video calls | `useVideoCall.ts` | Broadcast signaling |
| Profile updates | — | User presence |

---

### 3.4 Storage (Media Files)

| Параметр | Текущее (Supabase) | Целевое (Self-hosted) |
|----------|---------------------|----------------------|
| Storage | Supabase Storage | MinIO / Cloudflare R2 |
| CDN | Supabase CDN | Cloudflare |
| Media processing | — | FFmpeg workers |
| Сложность | — | **3/5** |

#### Варианты

| Решение | Стоимость | Особенности |
|---------|-----------|-------------|
| **MinIO** | Бесплатно | S3-совместимый, полный контроль |
| **Cloudflare R2** | $0/месяц (Egress free) | Нулевой egress, S3-совместимый |
| **Backblaze B2** | $0.006/GB egress | Дешевле R2 |

**Рекомендация**: Cloudflare R2 с Cloudflare Pages/Distribution для CDN.

#### Миграция Storage

```bash
# Экспорт из Supabase Storage
supabase storage download --bucket avatars --output-dir ./avatars
supabase storage download --bucket messages --output-dir ./messages

# Загрузка в R2/MinIO
r2 cp ./avatars r2://your-bucket/avatars
```

---

### 3.5 Edge Functions → Docker Microservices

| Параметр | Текущее (Supabase) | Целевое (Self-hosted) |
|----------|---------------------|----------------------|
| Runtime | Deno Deploy | Node.js / Python Docker |
| Functions | 40+ Edge Functions | 40+ Docker containers |
| API Gateway | Supabase | Nginx / API Gateway |
| Сложность | — | **4/5** |

#### Список Edge Functions для миграции

| Function | Назначение | Complexity |
|----------|------------|------------|
| `admin-api` | Admin panel API | High |
| `bot-api` | Bot integrations | Medium |
| `turn-credentials` | WebRTC TURN tokens | Low |
| `send-email-otp` / `verify-email-otp` | Primary auth OTP flow | Medium |
| `send-sms-otp` / `verify-sms-otp` | Optional SMS OTP flow | Medium |
| `insurance-*` | Insurance module (6 functions) | Medium |
| `reels-feed` | Reels algorithm | High |
| `trends-worker` | Background jobs | High |
| `mini-app-api` | Mini app backend | High |

#### Docker архитектура

```dockerfile
# Пример Dockerfile для API функции
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

#### Docker Compose

```yaml
version: '3.8'
services:
  api-gateway:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - auth-service
      - admin-api
      - bot-api

  auth-service:
    build: ./auth-service
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - DATABASE_URL=postgresql://...

  admin-api:
    build: ./supabase/functions/admin-api
    # Deno → Node.js port

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
```

---

### 3.6 TURN Server (WebRTC)

| Параметр | Текущее (Supabase) | Целевое (Self-hosted) |
|----------|---------------------|----------------------|
| TURN | Supabase credentials | Coturn servers |
| STUN | Built-in | Multiple STUN servers |
| Rate limiting | Supabase managed | Redis-based |
| Сложность | — | **3/5** |

#### Реализация

```yaml
# docker-compose.yml for Coturn
coturn:
  image: coturn/coturn:latest
  network_mode: host
  volumes:
    - ./turnserver.conf:/etc/coturn/turnserver.conf
  environment:
    - SECRET=${TURN_SECRET}
```

#### Конфигурация

```
listening-port=3478
tls-listening-port=5349
realm=your-domain.com
secret=TURN_SECRET
user-quota=12
total-quota=100
```

---

## 4. План миграции

### Фаза 1: Подготовка (4-6 недель)

- [ ] **1.1** Настройка VPS с PostgreSQL 16
- [ ] **1.2** Экспорт схемы БД из Supabase (`pg_dump`)
- [ ] **1.3** Создание RLS политик для PostgreSQL
- [ ] **1.4** Настройка PostgreSQL репликации
- [ ] **1.5** Развертывание Docker-стеков
- [ ] **1.6** Настройка MinIO/R2 Storage

### Фаза 2: Auth Service (3-4 недели)

- [ ] **2.1** Разработка Auth Service
- [ ] **2.2** JWT token compatibility
- [ ] **2.3** Phone OTP интеграция
- [ ] **2.4** OAuth провайдеры
- [ ] **2.5** Тестирование с dev-окружением

### Фаза 3: Realtime (4-5 недель)

- [ ] **3.1** Socket.io сервер с Redis
- [ ] **3.2** PostgreSQL LISTEN/NOTIFY → Redis publisher
- [ ] **3.3** Presence tracking
- [ ] **3.4** Broadcast для видеозвонков

### Фаза 4: Edge Functions → Microservices (6-8 недель)

- [ ] **4.1** Конвертация Deno → Node.js/Python
- [ ] **4.2** Docker Compose оркестрация
- [ ] **4.3** API Gateway (Nginx)
- [ ] **4.4** Rate limiting
- [ ] **4.5** Health checks и мониторинг

### Фаза 5: Dual-write (4-6 недель)

- [ ] **5.1** Конфигурация env variables для dual-read
- [ ] **5.2** Адаптация frontend клиента
- [ ] **5.3** Feature flags для switchover
- [ ] **5.4** Синхронизация данных ( incremental )

### Фаза 6: Cutover (1-2 недели)

- [ ] **6.1** Blue-green deployment
- [ ] **6.2** Переключение DNS
- [ ] **6.3** Rollback процедура (при необходимости)
- [ ] **6.4** Мониторинг ошибок

### Фаза 7: Post-migration (4-8 недель)

- [ ] **7.1** Выключение Supabase зависимостей
- [ ] **7.2** Cleanup неиспользуемых таблиц
- [ ] **7.3** Оптимизация производительности
- [ ] **7.4** Документация

---

## 5. Инфраструктурные требования

### Minimum VPS Specification

| Компонент | Конфигурация | Monthly Cost (estimate) |
|-----------|--------------|--------------------------|
| **VPS Primary** | 8 vCPU, 32GB RAM, 500GB NVMe | $80-120 |
| **VPS Replica** | 4 vCPU, 16GB RAM, 250GB NVMe | $40-60 |
| **Object Storage** | R2 ($0) / MinIO ($20) | $0-20 |
| **Redis** | 2 vCPU, 4GB RAM | $20 |
| **TURN Servers** | 2x 2 vCPU, 4GB RAM | $40 |
| **CDN** | Cloudflare Pro | $20 |
| **Backup** | Backblaze B2 | $10 |
| **Monitoring** | Prometheus + Grafana (self-hosted) | $0 |
| **Domain/SSL** | Let's Encrypt | $0 |
| **Итого** | | **$210-290** |

### Recommended Production Specification

| Компонент | Конфигурация | Monthly Cost |
|-----------|--------------|---------------|
| **DB Primary** | 16 vCPU, 64GB RAM, 1TB NVMe | $200-300 |
| **DB Replica** | 8 vCPU, 32GB RAM, 500GB NVMe | $100-150 |
| **App Servers** | 3x 4 vCPU, 8GB RAM | $150-200 |
| **Redis Cluster** | 3x 2 vCPU, 4GB RAM | $60-80 |
| **Object Storage** | R2 | $0-50 |
| **TURN Servers** | 3x 2 vCPU, 4GB RAM | $60-80 |
| **Load Balancer** | Cloudflare Load Balancing | $5 |
| **CDN** | Cloudflare Enterprise | $200 |
| **Итого** | | **$775-1010** |

### Docker Stack

```yaml
# docker-compose.yml - Full Stack
version: '3.8'

services:
  # API Gateway
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
      - realtime
    networks:
      - app-network

  # REST API
  api:
    build: ./api
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/app
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis
    deploy:
      replicas: 3
    networks:
      - app-network

  # Realtime (WebSocket)
  realtime:
    build: ./realtime
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://user:pass@postgres:5432/app
    depends_on:
      - redis
    deploy:
      replicas: 2
    networks:
      - app-network

  # PostgreSQL
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=app
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./backups:/backups
    networks:
      - app-network
    command: >
      postgres
      -c shared_preload_libraries=pg_stat_statements
      -c max_connections=200

  # PostgreSQL Replica (Read)
  postgres-replica:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=app
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    command: >
      postgres
      -c hot_standby=on
      -c hot_standby_feedback=on
    depends_on:
      - postgres
    networks:
      - app-network

  # Redis
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    networks:
      - app-network

  # Background Workers
  worker:
    build: ./worker
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/app
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    deploy:
      replicas: 2
    networks:
      - app-network

networks:
  app-network:
    driver: bridge

volumes:
  pgdata:
  redis-data:
```

---

## 6. Стоимость владения

### Supabase (текущая)

| Tier | Features | Price |
|------|----------|-------|
| **Free** | 500MB DB, 1GB Storage, 2 Edge Functions | $0 |
| **Pro** | 8GB DB, 100GB Storage, Edge Functions, Realtime | $25/проект |
| **Team** | 50GB DB, 1TB Storage, SSO | $599/месяц |
| **Enterprise** | Custom | Custom |

**Текущая оценка**: $25-599/месяц (зависит от использования)

### Self-hosted (целевая)

| Компонент | Minimum | Recommended |
|-----------|---------|-------------|
| VPS (Primary + Replica) | $120 | $400 |
| Object Storage | $0 | $50 |
| Redis | $20 | $60 |
| TURN Servers | $40 | $60 |
| CDN + SSL | $20 | $200 |
| Backup | $10 | $20 |
| **Итого** | **$210** | **$790** |

### Сравнение

| Метрика | Supabase | Self-hosted |
|---------|----------|-------------|
| **Стоимость (small)** | $25 | $210 |
| **Стоимость (large)** | $599 | $790 |
| **Контроль | Низкий | Полный |
| **Сложность | Низкая | Высокая |
| **Масштабируемость | Ограниченная | Неограниченная |
| **Data privacy | Ограниченная | Полная |

---

## 7. Timeline

| Фаза | Длительность | Неделя |
|------|--------------|--------|
| **Подготовка** | 4-6 недель | 1-6 |
| **Auth Service** | 3-4 недели | 5-8 |
| **Realtime** | 4-5 недель | 7-11 |
| **Edge Functions** | 6-8 недель | 9-16 |
| **Dual-write** | 4-6 недель | 15-20 |
| **Cutover** | 1-2 недели | 19-21 |
| **Post-migration** | 4-8 недель | 20-28 |
| **Итого** | **~7 месяцев** | |

### Milestones

```
Week 1-4:   ████████ Infrastructure setup
Week 5-8:  █████████ Auth service
Week 9-12: ███████████ Realtime
Week 13-20: █████████████████ Edge Functions
Week 19-22: ███████████ Dual-write + Cutover
Week 23-28: █████████████ Post-migration
```

---

## 8. Rollback План

### Стратегия отката

```mermaid
graph LR
    A[Production<br/>Supabase] -->|Week 19| B{Dual-write<br/>Mode}
    B -->|Success| C[Switch to<br/>Self-hosted]
    B -->|Failure| A
    C -->|Critical Error| D[Rollback to<br/>Supabase]
    D -->|Fix| C
```

### Rollback Triggers

| Триггер | Действие |
|---------|----------|
| >5% ошибок API | Немедленный rollback |
| >1% потерянных данных | Немедленный rollback |
| >30 сек latency | Алерты, investigate |
| TURN connectivity <95% | Алерты, investigate |

### Rollback Procedure

```bash
# 1. DNS Rollback
# Изменить CNAME обратно на Supabase

# 2. Frontend config
# VITE_API_URL -> Supabase URL
# VITE_REALTIME_URL -> Supabase Realtime

# 3. Database sync (если needed)
# pg_dump from self-hosted -> Supabase

# 4. Communications
# Уведомить пользователей о проблемах
```

### Dual-read Fallback

```typescript
// src/lib/backendSwitch.ts
const BACKEND_MODE = import.meta.env.VITE_BACKEND_MODE; // 'supabase' | 'selfhosted' | 'dual'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const selfHosted = createClient(SELFHOSTED_URL, SELFHOSTED_KEY);

export function getBackend() {
  if (BACKEND_MODE === 'supabase') return supabase;
  if (BACKEND_MODE === 'selfhosted') return selfHosted;
  // dual - используем self-hosted с fallback на Supabase
  return selfHosted; // с retry логикой
}
```

---

## 9. Рекомендации

### Приоритеты

1. **Не пытаться мигрировать всё сразу** — Использовать dual-write как минимум 2 месяца
2. **Начать с Storage** — Проще всего, быстрые wins
3. **Auth — самый сложный** — Оставить на потом, тщательно протестировать
4. **Realtime — критично** — требует наибольшего внимания к reliability
5. **Keep Supabase as backup** — 6 месяцев после полной миграции

### Альтернативы

| Если... | То... |
|---------|-------|
| Бюджет ограничен | Начать с MinIO + базовым VPS |
| Нужна простота | Рассмотреть PocketBase как замену |
| Масштаб enterprise | Обратить внимание на Supabase Enterprise |
| Масштаб startup | Self-hosted с 6-month roadmap |

### Критические факторы успеха

- [ ] Выделенная команда (минимум 2 разработчика)
- [ ] Мониторинг с самого начала
- [ ] Документирование всех изменений
- [ ] Автоматизированное тестирование
- [ ] Blue-green deployment

---

## 10. Заключение

**Ответ на главный вопрос: "Можно ли безопасно перейти с Supabase на свой VPS и как это сделать?"**

**Да, это технически возможно**, но требует:

1. **7+ месяцев** разработки и тестирования
2. **$210-790/месяц** инфраструктурных затрат (vs $25-599 Supabase)
3. **2+ разработчика** для полноценной команды
4. **Сложность 4-5/5** для Realtime и Auth компонентов

**Рекомендация**: Если текущее решение работает и бюджет позволяет — оставаться на Supabase. Если есть явные причины (compliance, стоимость при масштабировании, полный контроль) — начинать миграцию поэтапно, начиная с наименее критичных компонентов.

---

*Document Version: 1.0*  
*Created: 2026-03-05*  
*Author: Architecture Team*
