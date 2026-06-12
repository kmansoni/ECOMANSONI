# Часть III — Техническая Архитектура

---

## 1. Общая Архитектура

### 1.1 Принципы проектирования

1. **Event-Driven Architecture** — сервисы общаются через события (Kafka), не через синхронные вызовы
2. **CQRS (Command Query Responsibility Segregation)** — разделение записи и чтения
3. **Event Sourcing** — хранение состояния как последовательности событий (для заказов, финансов)
4. **Domain-Driven Design** — ограниченные контексты (bounded contexts) соответствуют бизнес-доменам
5. **Circuit Breaker** — деградация при отказе зависимостей вместо каскадных сбоев
6. **Idempotency** — все критичные операции (платежи, списание) идемпотентны
7. **Observability First** — трейсинг, метрики, логи в каждом сервисе с рождения

### 1.2 Диаграмма высокого уровня

```
                        ┌─────────────────────────────────────────┐
                        │           External Clients               │
                        │  Browser  Mobile App  Seller App  B2B   │
                        └──────────────┬──────────────────────────┘
                                       │ HTTPS
                        ┌──────────────▼──────────────────────────┐
                        │          Cloudflare CDN + WAF            │
                        │     DDoS Protection + TLS Termination    │
                        └──────────────┬──────────────────────────┘
                                       │
                        ┌──────────────▼──────────────────────────┐
                        │           API Gateway (Kong)             │
                        │  Rate Limiting │ Auth │ Routing │ Logging│
                        └──┬─────┬──────┬──────┬─────────┬────────┘
                           │     │      │      │         │
                    ┌──────▼─┐ ┌─▼────┐ ┌─────▼─┐ ┌────▼───┐ ┌──▼────┐
                    │ Search │ │Catalog│ │ Order │ │Payment │ │ User  │
                    │Service │ │Service│ │Service│ │Service │ │Service│
                    │  (Go)  │ │ (Go) │ │ (Go)  │ │ (Go)   │ │(Node) │
                    └──┬─────┘ └──┬───┘ └───┬───┘ └────┬───┘ └──┬────┘
                       │          │          │           │         │
                    ┌──▼──────────▼──────────▼───────────▼─────────▼───┐
                    │              Apache Kafka (Event Bus)              │
                    │  Topics: orders, payments, inventory, notifications│
                    └──┬─────┬──────┬──────┬──────────────────────┬─────┘
                       │     │      │      │                      │
                    ┌──▼──┐ ┌▼────┐ ┌─────▼──┐ ┌────────────┐ ┌──▼────────┐
                    │Notif│ │Recs │ │Logistic│ │  Analytics │ │  Seller   │
                    │Svc  │ │Svc  │ │ Svc    │ │  (ClickHs) │ │  Center   │
                    │(Node│ │(Py) │ │ (Go)   │ │            │ │  (Node)   │
                    └─────┘ └─────┘ └────────┘ └────────────┘ └───────────┘
```

### 1.3 Microservices Catalog

| Сервис | Язык | БД | Ответственность |
|--------|------|-----|----------------|
| `api-gateway` | Kong (Lua) | Redis | Роутинг, rate limit, auth token validation |
| `user-service` | Node.js 20 (Fastify) | PostgreSQL | Регистрация, профиль, аутентификация |
| `auth-service` | Go 1.22 | Redis | JWT issuing, refresh, revocation |
| `catalog-service` | Go 1.22 | PostgreSQL + ES | Управление товарами, категории |
| `search-service` | Go 1.22 | Elasticsearch | Полнотекстовый поиск, векторный поиск |
| `recommendation-service` | Python 3.12 | Neo4j + Redis | Рекомендательные модели |
| `cart-service` | Go 1.22 | Redis | Корзина (ephemeral) |
| `order-service` | Go 1.22 | PostgreSQL (Event Sourcing) | Управление заказами |
| `payment-service` | Go 1.22 | PostgreSQL | Платежи, эскроу, выплаты |
| `logistics-service` | Go 1.22 | PostgreSQL | Доставка, трекинг, ПВЗ |
| `inventory-service` | Go 1.22 | PostgreSQL + Redis | Остатки, резервирование |
| `review-service` | Node.js | PostgreSQL + Redis | Отзывы, рейтинги, блокчейн |
| `loyalty-service` | Node.js | PostgreSQL + Redis | Stars, уровни, промокоды |
| `ads-service` | Go 1.22 | PostgreSQL + ClickHouse | Рекламный аукцион, статистика |
| `notification-service` | Node.js | PostgreSQL + Redis | Push, Email, SMS |
| `analytics-service` | Python 3.12 | ClickHouse | Аналитика продавцов, A/B тесты |
| `ai-service` | Python 3.12 | PostgreSQL + S3 | LLM, image AI, personalization |
| `seller-service` | Node.js | PostgreSQL | Seller Center логика |
| `b2b-service` | Node.js | PostgreSQL | B2B модуль, тендеры, ЭДО |
| `live-service` | Go 1.22 | Redis + PostgreSQL | Live стримы, чат |
| `antifraud-service` | Python 3.12 | PostgreSQL + Redis | ML антифрод |
| `media-service` | Go 1.22 | MinIO/S3 | Загрузка, обработка медиа |
| `config-service` | Go 1.22 | etcd | Feature flags, конфигурации |

---

## 2. Фронтенд

### 2.1 Технологический Стек

| Технология | Версия | Обоснование |
|-----------|--------|-------------|
| React | 18.3 | Concurrent Mode, Suspense, transitions — критично для производительности |
| Next.js | 14.x (App Router) | SSR/ISR/SSG, Server Components, built-in оптимизации |
| TypeScript | 5.x (strict mode) | Типобезопасность, IDE поддержка, рефакторинг |
| Tailwind CSS | 3.x | Utility-first, JIT компиляция, дизайн-токены |
| Redux Toolkit | 2.x | Предсказуемый state management для сложных состояний |
| React Query (TanStack) | 5.x | Server state, кешируемые запросы, optimistic updates |
| Radix UI (headless) | latest | Доступные, стилизуемые примитивы компонентов |
| Framer Motion | 10.x | Анимации с GPU ускорением, жесты |
| Zustand | 4.x | Лёгкий локальный state store |
| React Hook Form | 7.x | Перформативные формы |
| Zod | 3.x | Runtime validation + TypeScript integration |
| date-fns | 3.x | Работа с датами без side effects |
| i18next | 23.x | Интернационализация |

### 2.2 Архитектура приложения

**App Router (Next.js 14) структура:**
```
src/
├── app/                              # Next.js App Router
│   ├── (public)/                     # Публичные маршруты
│   │   ├── page.tsx                  # Главная страница
│   │   ├── search/page.tsx           # Поиск
│   │   ├── product/[id]/page.tsx     # PDP
│   │   ├── category/[...path]/page.tsx
│   │   └── live/[streamId]/page.tsx  # Стримы
│   ├── (auth)/                       # Страницы аутентификации
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (account)/                    # Личный кабинет
│   │   ├── orders/page.tsx
│   │   ├── wishlist/page.tsx
│   │   └── settings/page.tsx
│   ├── seller/                       # Seller Center
│   │   ├── dashboard/page.tsx
│   │   ├── products/page.tsx
│   │   ├── orders/page.tsx
│   │   ├── analytics/page.tsx
│   │   ├── finance/page.tsx
│   │   └── ads/page.tsx
│   ├── checkout/                     # Корзина и оформление
│   │   ├── cart/page.tsx
│   │   └── payment/page.tsx
│   └── api/                          # Next.js API Routes (BFF layer)
├── components/
│   ├── ui/                           # Дизайн-система компоненты
│   ├── features/                     # Бизнес-компоненты
│   └── layouts/                      # Layouts
├── lib/
│   ├── api/                          # API клиенты (React Query hooks)
│   ├── store/                        # Redux slices
│   └── utils/                        # Утилиты
├── hooks/                            # Custom React hooks
├── types/                            # TypeScript типы
└── styles/                           # Глобальные стили
```

### 2.3 SSR/SSG/ISR Стратегия

| Тип страницы | Стратегия | Revalidate | Обоснование |
|-------------|-----------|-----------|-------------|
| Главная | ISR | 300 сек | Меняется часто, но не в реальном времени |
| PDP (карточка товара) | ISR | 60 сек | Цена/остатки меняются часто |
| Категория / SERP | SSR | — | Персонализация требует user context |
| Статические страницы (FAQ, About) | SSG | Rebuild | Редко меняются |
| Корзина / Checkout | CSR | — | Полностью персональные |
| Seller Center | CSR | — | Динамические дашборды |
| Live страница | SSR + WebSocket | — | Real-time контент |

**Server Components vs Client Components:**
- Server Components: layout, navigation, product cards (только отображение)
- Client Components: interactive UI (cart, filters, modals, animation)
- Правило: "Use client только когда нужен `useState`, `useEffect`, или браузерные API"

### 2.4 Производительность — Core Web Vitals

**Целевые метрики (LCP / FID / CLS):**

| Метрика | Целевое значение | Acceptable | Poor |
|---------|-----------------|------------|------|
| LCP (Largest Contentful Paint) | < 1.5 сек | < 2.5 сек | > 4 сек |
| FID / INP (Interaction to Next Paint) | < 50ms | < 200ms | > 500ms |
| CLS (Cumulative Layout Shift) | < 0.05 | < 0.1 | > 0.25 |
| TTFB (Time to First Byte) | < 200ms | < 600ms | > 1800ms |
| FCP (First Contentful Paint) | < 1.0 сек | < 1.8 сек | > 3 сек |

**Технические оптимизации:**
```typescript
// next.config.js — ключевые оптимизации
const nextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 640, 750, 828, 1080, 1200, 1920],
    minimumCacheTTL: 86400,
    remotePatterns: [{ hostname: 'cdn.nexus.ru' }],
  },
  compress: true,
  poweredByHeader: false,
  experimental: {
    optimizeCss: true,         // Critical CSS extraction
    optimizeServerReact: true,
    ppr: true,                 // Partial Pre-rendering (Next.js 14)
  },
  // Bundle splitting по маршрутам — автоматически в App Router
};
```

**Lazy Loading стратегия:**
- Изображения: `loading="lazy"` для всего below-the-fold
- Компоненты: `next/dynamic` для тяжёлых виджетов (карты, редакторы)
- Шрифты: `next/font` с `display: swap`
- Third-party скрипты: `next/script` strategy="lazyOnload"

### 2.5 PWA (Progressive Web App)

```javascript
// next-pwa конфигурация
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/cdn\.nexus\.ru\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'cdn-cache',
        expiration: { maxEntries: 200, maxAgeSeconds: 86400 }
      }
    },
    {
      urlPattern: /^https:\/\/api\.nexus\.ru\/v1\/catalog\/.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'catalog-cache',
        expiration: { maxEntries: 100, maxAgeSeconds: 300 }
      }
    }
  ]
});
```

**Offline-функциональность:**
- Закешированные страницы доступны offline
- Корзина сохраняется в IndexedDB (offline add-to-cart)
- Синхронизация при восстановлении связи (Background Sync API)

### 2.6 Мобильные Приложения (React Native + Expo)

**Выбор React Native vs Flutter:**

| Критерий | React Native (Expo SDK 51) | Flutter |
|----------|--------------------------|---------|
| Code sharing с web | ~60% (hooks, store, utils) | ~10% |
| Нативные ощущения | Нативные компоненты → отлично | Pixel-perfect, но не нативные |
| Экосистема | Богатая, всё есть | Растёт, но меньше |
| Developer experience | Знакомый JS/TS стек | Dart нужно учить |
| Размер команды | Меньше (1 команда web+mobile) | Отдельная команда Dart |
| Performance | Хорошее (New Architecture с JSI) | Отличное |
| **Решение** | ✅ React Native | — |

**Архитектура React Native приложения:**
```
apps/
├── mobile/
│   ├── src/
│   │   ├── screens/          # Экраны
│   │   ├── navigation/       # React Navigation 6
│   │   ├── components/       # Нативные компоненты
│   │   ├── hooks/            # Shared hooks (из web)
│   │   ├── store/            # Shared Redux store
│   │   └── native/           # Platform-specific modules
│   ├── ios/                  # iOS native code
│   ├── android/              # Android native code
│   └── app.json              # Expo config
```

**Нативные модули:**
- Push уведомления: `expo-notifications` (APNs + FCM)
- Биометрия: `expo-local-authentication` (Face ID, Touch ID)
- Камера (поиск по фото): `expo-camera`
- Геолокация: `expo-location`
- Глубокие ссылки (deep linking): `expo-linking`
- Haptic feedback: `expo-haptics`
- Secure storage: `expo-secure-store`

---

## 3. Бэкенд — Детальная Спецификация Микросервисов

### 3.1 Catalog Service (Go)

**Ответственность:** CRUD товаров, управление категориями, атрибутами, вариациями.

**API Endpoints:**
```
# Public API (через Gateway)
GET  /v1/catalog/products/{id}               # Получить товар
GET  /v1/catalog/products                    # Список (пагинация, фильтрация)
GET  /v1/catalog/categories                  # Дерево категорий
GET  /v1/catalog/categories/{id}/attributes  # Атрибуты категории
GET  /v1/catalog/brands                      # Справочник брендов

# Seller API
POST   /v1/seller/products                   # Создать товар
PUT    /v1/seller/products/{id}              # Обновить товар
DELETE /v1/seller/products/{id}              # Удалить (soft delete)
POST   /v1/seller/products/bulk              # Массовая загрузка (async job)
GET    /v1/seller/products/bulk/{jobId}      # Статус задачи загрузки
POST   /v1/seller/products/{id}/images       # Загрузить изображения
```

**Ключевые сущности (PostgreSQL DDL):**
```sql
-- Товары
CREATE TABLE products (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id   UUID NOT NULL REFERENCES sellers(id),
    sku         VARCHAR(255) NOT NULL,
    parent_id   UUID REFERENCES products(id),  -- NULL = parent
    category_id UUID NOT NULL REFERENCES categories(id),
    brand_id    UUID REFERENCES brands(id),
    status      VARCHAR(32) NOT NULL DEFAULT 'draft',
      -- draft | moderation | active | paused | archived
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(seller_id, sku)
);

-- Контент товара (i18n-ready)
CREATE TABLE product_content (
    product_id  UUID NOT NULL REFERENCES products(id),
    locale      CHAR(5) NOT NULL DEFAULT 'ru-RU',
    title       VARCHAR(255) NOT NULL,
    description TEXT,
    bullets     JSONB,  -- ["bullet1", "bullet2", ...]
    keywords    TEXT,   -- backend search keywords
    PRIMARY KEY (product_id, locale)
);

-- Цены (history-aware)
CREATE TABLE product_prices (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   UUID NOT NULL REFERENCES products(id),
    price        NUMERIC(12,2) NOT NULL,
    old_price    NUMERIC(12,2),
    currency     CHAR(3) NOT NULL DEFAULT 'RUB',
    valid_from   TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to     TIMESTAMPTZ,
    CONSTRAINT price_positive CHECK (price > 0)
);

-- Атрибуты товаров (EAV pattern для гибкости)
CREATE TABLE product_attributes (
    product_id   UUID NOT NULL REFERENCES products(id),
    attr_key     VARCHAR(64) NOT NULL,
    attr_value   TEXT NOT NULL,
    PRIMARY KEY (product_id, attr_key)
);

-- Индексы
CREATE INDEX idx_products_seller ON products(seller_id) WHERE status != 'archived';
CREATE INDEX idx_products_category ON products(category_id, status);
CREATE INDEX idx_products_parent ON products(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_product_prices_active ON product_prices(product_id) 
  WHERE valid_to IS NULL OR valid_to > now();
```

**Kafka Events издаваемые сервисом:**
```json
// product.created
{
  "event": "product.created",
  "version": "1.0",
  "timestamp": "2027-01-15T10:30:00Z",
  "payload": {
    "product_id": "uuid",
    "seller_id": "uuid",
    "category_id": "uuid",
    "status": "moderation"
  }
}

// product.price_changed  
{
  "event": "product.price_changed",
  "payload": {
    "product_id": "uuid",
    "old_price": 2999.00,
    "new_price": 2499.00,
    "currency": "RUB"
  }
}
```

---

### 3.2 Search Service (Go + Elasticsearch)

**Elasticsearch Index Mapping:**
```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "title": {
        "type": "text",
        "analyzer": "russian",
        "fields": {
          "keyword": { "type": "keyword" },
          "en": { "type": "text", "analyzer": "english" }
        }
      },
      "description": { "type": "text", "analyzer": "russian" },
      "brand_name": { "type": "keyword" },
      "category_path": { "type": "keyword" },
      "price": { "type": "float" },
      "rating": { "type": "float" },
      "reviews_count": { "type": "integer" },
      "sales_30d": { "type": "integer" },
      "is_available": { "type": "boolean" },
      "attributes": { "type": "flattened" },
      "embedding": {
        "type": "dense_vector",
        "dims": 384,
        "index": true,
        "similarity": "cosine"
      },
      "image_embedding": {
        "type": "dense_vector",
        "dims": 512,
        "index": true,
        "similarity": "cosine"
      }
    }
  },
  "settings": {
    "number_of_shards": 6,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "russian": {
          "tokenizer": "standard",
          "filter": ["lowercase", "russian_stop", "russian_stemmer"]
        }
      }
    }
  }
}
```

**Query DSL для гибридного поиска:**
```json
{
  "query": {
    "bool": {
      "should": [
        {
          "multi_match": {
            "query": "{{user_query}}",
            "fields": ["title^3", "brand_name^2", "description", "keywords"],
            "type": "best_fields",
            "fuzziness": "AUTO"
          }
        },
        {
          "knn": {
            "embedding": {
              "vector": [/* user query embedding */],
              "k": 50,
              "num_candidates": 200,
              "boost": 0.3
            }
          }
        }
      ],
      "filter": [
        { "term": { "is_available": true } },
        { "range": { "price": { "gte": "{{min_price}}", "lte": "{{max_price}}" } } }
      ]
    }
  },
  "sort": [
    { "_score": "desc" },
    { "sales_30d": { "order": "desc" } }
  ],
  "_source": ["id", "title", "price", "rating", "image_url"],
  "size": 48,
  "from": 0,
  "aggs": {
    "brands": { "terms": { "field": "brand_name", "size": 20 } },
    "price_range": { "histogram": { "field": "price", "interval": 1000 } },
    "categories": { "terms": { "field": "category_path", "size": 10 } }
  }
}
```

---

### 3.3 Order Service (Go + Event Sourcing)

**Доменная модель заказа (Event Sourcing):**
```go
// Агрегат Order
type Order struct {
    ID         uuid.UUID
    BuyerID    uuid.UUID
    SellerID   uuid.UUID
    Items      []OrderItem
    Status     OrderStatus
    TotalPrice decimal.Decimal
    Version    int  // оптимистичная блокировка
    Events     []DomainEvent  // uncommitted events
}

// Все события меняющие состояние заказа:
const (
    OrderPlaced         = "order.placed"
    OrderConfirmed      = "order.confirmed"
    OrderPaid           = "order.paid"
    OrderPickedUp       = "order.picked_up"
    OrderShipped        = "order.shipped"
    OrderDelivered      = "order.delivered"
    OrderCancelled      = "order.cancelled"
    OrderReturnRequested = "order.return_requested"
    OrderReturnApproved = "order.return_approved"
    OrderRefunded       = "order.refunded"
)

// Таблица событий (Event Store)
CREATE TABLE order_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID NOT NULL,
    event_type   VARCHAR(64) NOT NULL,
    payload      JSONB NOT NULL,
    metadata     JSONB,
    version      INTEGER NOT NULL,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(order_id, version)  -- оптимистичная блокировка
);

CREATE INDEX idx_order_events_order_id ON order_events(order_id, version);

-- Read Model (CQRS query side) — проекция для быстрого чтения
CREATE TABLE orders_read_model (
    id           UUID PRIMARY KEY,
    buyer_id     UUID NOT NULL,
    seller_id    UUID NOT NULL,
    status       VARCHAR(32) NOT NULL,
    total        NUMERIC(12,2) NOT NULL,
    items_count  INTEGER NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL,
    delivery_eta TIMESTAMPTZ,
    tracking_url TEXT
);
```

**State Machine заказа:**
```
DRAFT → PLACED → CONFIRMED → PAYMENT_PENDING → PAID
                                                 │
                              ┌──────────────────┘
                              ▼
                         PROCESSING
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
          PICKED_UP     READY_AT_PVZ    ASSEMBLING (FBO)
              │               │               │
              └───────────────┴───────────────┘
                              │
                              ▼
                          SHIPPED
                              │
                              ▼
                         DELIVERED (auto: +72ч = COMPLETED)
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              RETURN_REQUESTED      COMPLETED
                    │
                    ▼
              RETURN_IN_TRANSIT
                    │
              ┌─────┴──────┐
              ▼            ▼
          REFUNDED    RETURN_REJECTED
```

---

### 3.4 Payment Service (Go)

**Архитектура платёжного сервиса:**
```go
// Payment Orchestrator — координирует платёжный флоу
type PaymentOrchestrator struct {
    providers    map[PaymentMethod]PaymentProvider
    escrow       EscrowEngine
    ledger       LedgerService
    eventBus     EventBus
    idempotency  IdempotencyStore  // Redis
}

// Идемпотентный ключ — предотвращает двойное списание
type PaymentRequest struct {
    IdempotencyKey  string         `json:"idempotency_key"`  // UUID от клиента
    OrderID         uuid.UUID      `json:"order_id"`
    Amount          decimal.Decimal `json:"amount"`
    Currency        string         `json:"currency"`
    PaymentMethod   PaymentMethod  `json:"payment_method"`
    // ...
}

// Двойная запись (double-entry ledger)
CREATE TABLE ledger_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  UUID NOT NULL,
    debit       NUMERIC(15,2) NOT NULL DEFAULT 0,
    credit      NUMERIC(15,2) NOT NULL DEFAULT 0,
    description TEXT,
    reference   UUID,  -- order_id или другая ссылка
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ledger_one_side CHECK (
        (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
    )
);

CREATE TABLE accounts (
    id          UUID PRIMARY KEY,
    owner_type  VARCHAR(32),  -- buyer | seller | platform | escrow
    owner_id    UUID NOT NULL,
    currency    CHAR(3) NOT NULL DEFAULT 'RUB',
    balance     NUMERIC(15,2) GENERATED ALWAYS AS (
        (SELECT COALESCE(SUM(credit - debit), 0) FROM ledger_entries WHERE account_id = id)
    ) STORED
);
```

**Retry и Circuit Breaker для внешних платёжных шлюзов:**
```go
// Circuit Breaker конфигурация для каждого провайдера
circuitBreakerConfig := gobreaker.Settings{
    Name:        "tinkoff-payment",
    MaxRequests: 3,
    Interval:    10 * time.Second,
    Timeout:     60 * time.Second,
    ReadyToTrip: func(counts gobreaker.Counts) bool {
        failure_ratio := float64(counts.TotalFailures) / float64(counts.Requests)
        return counts.Requests >= 5 && failure_ratio >= 0.6
    },
    OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
        metrics.CircuitBreakerStateChange(name, from.String(), to.String())
    },
}
```

---

### 3.5 Recommendation Service (Python + Neo4j)

**Граф рекомендаций в Neo4j:**
```cypher
// Схема графа
(:User {id: "uuid", segment: "impulsive"})
(:Product {id: "uuid", category: "electronics"})
(:Category {name: "Smartphones"})
(:Brand {name: "Samsung"})

// Связи
(:User)-[:PURCHASED {timestamp, amount}]->(:Product)
(:User)-[:VIEWED {timestamp, duration_sec}]->(:Product)
(:User)-[:ADDED_TO_CART {timestamp}]->(:Product)
(:User)-[:RATED {stars: 5, timestamp}]->(:Product)
(:Product)-[:IN_CATEGORY]->(:Category)
(:Product)-[:BY_BRAND]->(:Brand)
(:Product)-[:FREQUENTLY_BOUGHT_TOGETHER]->(:Product)
(:User)-[:SIMILAR_TO]->(:User)  // user clusters

// Рекомендательный запрос (Collaborative Filtering через граф):
MATCH (u:User {id: $userId})-[:PURCHASED]->(p:Product)
      <-[:PURCHASED]-(similar:User)-[:PURCHASED]->(rec:Product)
WHERE NOT (u)-[:PURCHASED]->(rec)
  AND NOT (u)-[:VIEWED {duration_sec > 30}]->(rec)
RETURN rec, COUNT(*) as support, 
       AVG(rec.rating) as avg_rating
ORDER BY support DESC, avg_rating DESC
LIMIT 20
```

**ML-модели рекомендаций:**
```python
# Neural Collaborative Filtering (PyTorch)
class NCFModel(nn.Module):
    def __init__(self, num_users, num_items, embed_dim=64):
        super().__init__()
        # GMF branch (Generalized Matrix Factorization)
        self.gmf_user = nn.Embedding(num_users, embed_dim)
        self.gmf_item = nn.Embedding(num_items, embed_dim)
        
        # MLP branch
        self.mlp_user = nn.Embedding(num_users, embed_dim)
        self.mlp_item = nn.Embedding(num_items, embed_dim)
        self.mlp = nn.Sequential(
            nn.Linear(embed_dim * 2, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Dropout(0.3),
        )
        
        # Output fusion
        self.output = nn.Linear(embed_dim + 128, 1)
        
    def forward(self, user_ids, item_ids):
        gmf_out = self.gmf_user(user_ids) * self.gmf_item(item_ids)
        mlp_in = torch.cat([self.mlp_user(user_ids), self.mlp_item(item_ids)], dim=1)
        mlp_out = self.mlp(mlp_in)
        combined = torch.cat([gmf_out, mlp_out], dim=1)
        return torch.sigmoid(self.output(combined)).squeeze()
```

---

## 4. База Данных — Стратегии и Схемы

### 4.1 Матрица выбора СУБД по сервисам

| Сервис | Primary DB | Причина | Secondary/Cache |
|--------|-----------|---------|-----------------|
| user-service | PostgreSQL 16 | ACID, relationships | Redis (sessions) |
| catalog-service | PostgreSQL 16 | Structured data, ACID | Redis (hot data) |
| search-service | Elasticsearch 8 | Full-text + vector | — |
| order-service | PostgreSQL 16 | Event Sourcing, ACID | Redis (statuses) |
| payment-service | PostgreSQL 16 | Financial ACID | Redis (locks) |
| cart-service | Redis 7 | Ephemeral, fast | — |
| analytics-service | ClickHouse 24 | OLAP, columns | — |
| recommendation | Neo4j 5 | Graph traversal | Redis (hot recs) |
| media-service | MinIO (S3) | Binary objects | — |
| session-store | Redis 7 | Sub-ms latency | — |
| feature-flags | etcd | Config store | — |
| review-service | PostgreSQL 16 | Relational | Redis (ratings cache) |
| loyalty-service | PostgreSQL 16 | Transactional | Redis (balances) |
| notification-service | PostgreSQL 16 | Queue + history | Redis (dedup) |

### 4.2 PostgreSQL — Стратегии шардирования

**Горизонтальное шардирование через Citus:**

```sql
-- Для orders — шардирование по buyer_id
SELECT create_distributed_table('orders', 'buyer_id');
SELECT create_distributed_table('order_events', 'order_id');

-- Для catalog — шардирование по seller_id
SELECT create_distributed_table('products', 'seller_id');

-- Co-location: связанные данные на одном шарде
SELECT create_distributed_table('product_content', 'product_id',
    colocate_with => 'products');
```

**Стратегия репликации:**
- Primary-Replica (1P + 2R): writes → primary, reads → replica
- Streaming replication с lag < 100ms
- Standby в другом AZ для failover
- point-in-time recovery (PITR): WAL archiving в S3, retention 30 дней

### 4.3 ClickHouse — Аналитические Таблицы

```sql
-- Основная таблица событий продавца
CREATE TABLE seller_events (
    event_date   Date,
    event_time   DateTime,
    seller_id    UUID,
    product_id   UUID,
    event_type   LowCardinality(String),
      -- view, click, add_to_cart, order, return
    user_id      UUID,
    channel      LowCardinality(String),
    price        Decimal(12, 2),
    quantity     UInt16
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (seller_id, event_date, event_type)
SETTINGS index_granularity = 8192;

-- Агрегированная таблица для быстрых дашбордов (MaterializedView)
CREATE MATERIALIZED VIEW seller_daily_stats
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (seller_id, event_date, product_id, event_type)
AS SELECT
    toDate(event_time) AS event_date,
    seller_id,
    product_id,
    event_type,
    count() AS events_count,
    sum(price * quantity) AS revenue,
    uniqExact(user_id) AS unique_users
FROM seller_events
GROUP BY event_date, seller_id, product_id, event_type;
```

### 4.4 Redis Cluster Конфигурация

```yaml
# Redis Cluster — 6 нод (3 master + 3 replica)
# Конфигурация через Helm chart

redis:
  cluster:
    enabled: true
    nodes: 6
    replicas: 1
  resources:
    requests:
      memory: "4Gi"
      cpu: "500m"
    limits:
      memory: "8Gi"
      cpu: "2000m"
  config:
    maxmemory: "6gb"
    maxmemory-policy: "allkeys-lru"
    activerehashing: "yes"
    lazyfree-lazy-eviction: "yes"
    # Persistence — AOF для критичных данных
    appendonly: "yes"
    appendfsync: "everysec"
```

**Ключевые схемы Redis:**
```
# Сессии пользователей
session:{session_id}  →  Hash { user_id, created_at, last_active, token }  // TTL: 7 дней

# Корзина
cart:{user_id}  →  Hash { product_id: qty, product_id: qty, ... }  // TTL: 30 дней

# Кеш цен (горячие данные)
price:{product_id}  →  String (JSON: { price, old_price, currency })  // TTL: 60 сек

# Rate limiting
ratelimit:{ip}:{endpoint}  →  String (count)  // TTL: window size

# Distributed locks
lock:{resource_id}  →  String (owner_id)  // TTL: operation timeout

# User recommendations cache
recs:{user_id}:{placement}  →  List [product_id, ...]  // TTL: 4 часа

# OTP хранение
otp:{phone_normalized}  →  Hash { code, attempts, created_at }  // TTL: 5 минут
```

---

## 5. Инфраструктура

### 5.1 Kubernetes Архитектура

```yaml
# Namespace структура
namespaces:
  - nexus-prod        # Production workloads
  - nexus-staging     # Staging
  - nexus-dev         # Development
  - nexus-infra       # Infrastructure (Kafka, Redis, etc.)
  - nexus-monitoring  # Prometheus, Grafana, Jaeger
  - nexus-ingress     # Ingress controllers

# Node pools (хостинг: Yandex Cloud / Selectel / Oblako.ru)
node_pools:
  - name: general
    instance_type: n2-standard-8   # 8 CPU, 32 GB RAM
    min_nodes: 5
    max_nodes: 30
    auto_scaling: true
    
  - name: compute-intensive        # Для ML/AI сервисов
    instance_type: n2-highcpu-16
    min_nodes: 2
    max_nodes: 10
    
  - name: memory-intensive         # Для Redis, Elasticsearch
    instance_type: n2-highmem-8
    min_nodes: 3
    max_nodes: 8
    
  - name: gpu                      # Для AI inference
    instance_type: g2-standard-4
    gpu: nvidia-l4
    min_nodes: 0
    max_nodes: 5
    auto_scaling: true
```

**Deployment стратегия для product-critical сервисов:**
```yaml
# Пример: order-service deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: nexus-prod
spec:
  replicas: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2          # Максимум +2 поды при обновлении
      maxUnavailable: 0    # Нельзя иметь unavailable поды (zero-downtime)
  selector:
    matchLabels:
      app: order-service
  template:
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchLabels:
                  app: order-service
              topologyKey: kubernetes.io/hostname  # Разные ноды!
      containers:
        - name: order-service
          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"
            limits:
              cpu: "2000m"
              memory: "1Gi"
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 15
```

### 5.2 CI/CD Pipeline

**GitHub Actions + ArgoCD:**
```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run unit tests
        run: make test-unit
      - name: Run integration tests
        run: make test-integration
      - name: Security scan (Snyk)
        run: snyk test --all-projects
      - name: SAST (SonarCloud)
        run: sonar-scanner
      - name: Code coverage check
        run: make coverage-check  # Fail if < 80%
        
  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Build Docker image
        run: |
          docker build -t nexus/$SERVICE:$TAG .
          docker push nexus/$SERVICE:$TAG
      - name: Sign image (cosign)
        run: cosign sign nexus/$SERVICE:$TAG

  deploy-staging:
    needs: build
    steps:
      - name: Update ArgoCD staging
        run: argocd app set nexus-$SERVICE --revision $TAG
      - name: Wait for rollout
        run: argocd app wait nexus-$SERVICE --health
      - name: Run smoke tests
        run: make test-smoke ENVIRONMENT=staging
        
  deploy-production:
    needs: deploy-staging
    environment: production  # Requires manual approval
    steps:
      - name: Progressive rollout (Argo Rollouts)
        run: |
          kubectl argo rollouts set image $SERVICE $SERVICE=nexus/$SERVICE:$TAG
          # 10% → wait 5min → 30% → wait 10min → 100%
      - name: Monitor metrics
        run: make monitor-rollout CANARY_THRESHOLD=0.001  # < 0.1% error rate
```

### 5.3 Service Mesh (Istio)

```yaml
# Istio конфигурация для мотиния трафика
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: catalog-service
spec:
  hosts:
    - catalog-service
  http:
    - route:
        - destination:
            host: catalog-service
            subset: stable
          weight: 95
        - destination:
            host: catalog-service
            subset: canary
          weight: 5
      retries:
        attempts: 3
        perTryTimeout: 2s
        retryOn: "gateway-error,connect-failure,retriable-4xx"
      timeout: 5s
      fault:
        delay:
          percentage:
            value: 0.01  # 0.01% fault injection для тестирования
          fixedDelay: 5s
```

**mTLS между сервисами:**
```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: nexus-prod
spec:
  mtls:
    mode: STRICT  # Все межсервисные запросы обязаны использовать mTLS
```

### 5.4 Мониторинг и Observability

**Prometheus метрики (RED method — Rate, Errors, Duration):**
```go
// Go: инструментация сервиса
var (
    requestDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "http_request_duration_seconds",
            Help:    "HTTP request latency",
            Buckets: []float64{0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5},
        },
        []string{"method", "path", "status"},
    )
    
    requestTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "http_requests_total",
        },
        []string{"method", "path", "status"},
    )
    
    // Business metrics
    ordersCreated = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "nexus_orders_created_total",
            Help: "Total number of orders created",
        },
        []string{"payment_method", "seller_tier"},
    )
    
    paymentAmount = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "nexus_payment_amount_rub",
            Help:    "Payment amounts in RUB",
            Buckets: []float64{100, 500, 1000, 3000, 10000, 30000, 100000},
        },
        []string{"payment_method", "status"},
    )
)
```

**Grafana Dashboards (ключевые):**
1. **Business KPIs** — GMV/час, заказы/мин, конверсия, активные пользователи
2. **Service Health** — latency p50/p95/p99 для каждого сервиса
3. **Infrastructure** — CPU/Memory/Disk по нодам
4. **Kafka** — lag по topic/consumer group
5. **Database** — connections, slow queries, replication lag
6. **Payment** — success rate, failure reasons, amount distribution
7. **Antifraud** — blocked transactions, false positives

**Alerting правила (PagerDuty integration):**
```yaml
# Критические алерты (P0 — немедленно будит дежурного)
- alert: PaymentServiceDown
  condition: up{job="payment-service"} == 0
  for: 30s
  severity: critical
  
- alert: HighErrorRate
  condition: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
  for: 2m
  severity: critical
  
- alert: OrderProcessingStuck
  condition: order_processing_lag_seconds > 300
  for: 5m
  severity: warning

# SLA алерты
- alert: P99LatencyExceeded
  condition: histogram_quantile(0.99, http_request_duration_seconds) > 2
  for: 5m
  severity: warning
```

**Distributed Tracing (Jaeger):**
```go
// Инициализация Jaeger трейсинга
tp, err := jaeger.NewTracerProvider(
    jaeger.WithCollectorEndpoint(
        jaeger.WithEndpoint("http://jaeger-collector:14268/api/traces"),
    ),
    trace.WithResource(resource.NewWithAttributes(
        semconv.ServiceNameKey.String("order-service"),
        semconv.ServiceVersionKey.String(version),
        attribute.String("environment", "production"),
    )),
    trace.WithSampler(trace.ParentBased(
        trace.TraceIDRatioBased(0.1), // 10% sampling в production
    )),
)

// Трейсинг SQL запросов
db.AddQueryHook(otelsqlx.NewHook(tracer, otelsqlx.WithAttributes(
    semconv.DBSystemPostgreSQL,
)))
```

### 5.5 ELK Stack — Логирование

```yaml
# Logstash pipeline
input {
  beats {
    port => 5044
  }
}

filter {
  json {
    source => "message"
  }
  
  # Маскировка PII данных
  mutate {
    gsub => [
      "message", "\"phone\":\"[0-9+]{10,14}\"", "\"phone\":\"REDACTED\"",
      "message", "\"card_number\":\"[0-9]{16}\"", "\"card_number\":\"REDACTED\""
    ]
  }
  
  # Структурированные поля
  date {
    match => ["timestamp", "ISO8601"]
    target => "@timestamp"
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "nexus-logs-%{service}-%{+YYYY.MM.dd}"
    template_name => "nexus-logs"
    manage_template => true
  }
}
```

**Retention политика логов:**
- Application logs: 30 дней горячий ES, 1 год cold storage (S3)
- Security logs: 1 год горячий, 5 лет cold (compliance 152-ФЗ)
- Access logs: 90 дней горячий
- Error logs: 90 дней горячий + alerts на критические

### 5.6 Disaster Recovery и SLA 99,99%

**Целевые RTO/RPO:**

| Сценарий | RTO (Recovery Time Objective) | RPO (Recovery Point Objective) |
|---------|-------------------------------|-------------------------------|
| Single service failure | < 30 секунд (auto Kubernetes restart) | 0 (stateless) |
| Database primary failure | < 60 секунд (автоматический failover) | < 5 секунд (streaming rep.) |
| Datacenter failure | < 5 минут (traffic failover to DR site) | < 30 секунд |
| Full region failure | < 30 минут (manual DNS cutover) | < 5 минут |

**Multi-AZ стратегия:**
```
Region: Москва (основной)
├── AZ-1: Datacenter Tier III (ЦОД Ростелеком)
│   ├── K8s Worker Nodes x5
│   ├── PostgreSQL Primary
│   └── Redis Master x3
├── AZ-2: Datacenter Tier III (ЦОД DataLine)
│   ├── K8s Worker Nodes x5
│   ├── PostgreSQL Replica
│   └── Redis Replica x3
└── AZ-3: Cloud (Yandex Cloud)
    ├── K8s Worker Nodes x3 (burst capacity)
    ├── PostgreSQL Hot Standby
    └── Redis Replica x3

DR Region: Санкт-Петербург (холодный резерв)
├── Replication: WAL streaming + Kafka MirrorMaker2
└── Activation: 30 минут при full region failure
```

**99,99% SLA вычисление:**
- 99,99% = 52 минуты простоя в год максимум
- Основные риски: database failover + deployment downtime
- Mitigation: zero-downtime deployment + automated failover < 60 сек

---

## 6. Безопасность

### 6.1 Аутентификация и Авторизация

**OAuth 2.0 + OpenID Connect (KeyCloak):**
```
Провайдеры:
- KeyCloak (собственный) — основной
- Google OAuth 2.0
- VK ID
- Yandex OAuth

JWT структура:
{
  "iss": "https://auth.nexus.ru",
  "sub": "user-uuid",
  "aud": ["api.nexus.ru"],
  "exp": 1703980800,  // 15 минут
  "iat": 1703980800,
  "jti": "unique-token-id",  // для revocation
  "roles": ["buyer"],
  "seller_id": null
}

Refresh Token:
- Срок жизни: 30 дней
- Rotation on use: каждый refresh выдаёт новый refresh token
- Revocation: хранится в Redis (prefix tree для fast lookup)
- Binding: к device fingerprint (смена устройства = logout)
```

**RBAC (Role-Based Access Control):**
```
Роли:
- anonymous                 → публичный каталог, поиск
- buyer                     → покупки, отзывы, профиль
- seller_basic              → добавление товаров, FBS
- seller_standard           → FBO, реклама, статистика
- seller_enterprise         → все функции + Brand Store + B2B API
- admin_support             → просмотр заказов, решение споров
- admin_finance             → финансовые операции
- admin_catalog_moderator   → модерация товаров
- admin_superuser           → полный доступ
```

### 6.2 Двухфакторная Аутентификация

```
Методы 2FA:
1. TOTP (Time-based One-Time Password) — Google Authenticator, Yandex Key
   - Алгоритм: RFC 6238
   - Период: 30 секунд
   - Длина кода: 6 цифр
   
2. SMS OTP — как fallback
   - Алгоритм: HOTP (RFC 4226)
   - Длина: 4 цифры
   
3. Push уведомление — "Подтвердите вход" в приложении NEXUS
   - Использует APNs/FCM
   - Timeout: 2 минуты
   
Обязательно для:
- Продавцов при любых финансовых операциях
- Изменении email/телефона
- Входе с нового устройства (Smart MFA)

Smart MFA (риск-адаптивный):
- Новое устройство → всегда 2FA
- Необычное время → 2FA
- Другая страна → 2FA + email уведомление
- Обычное устройство + обычное поведение → без 2FA
```

### 6.3 Шифрование

**Data at Rest:**
- PostgreSQL: прозрачное шифрование TDE (AES-256)
- S3/MinIO: SSE-S3 (AES-256)
- Backup файлы: AES-256 + отдельный ключ
- Redis: только в памяти (нет encryption at rest, но изолированная сеть)

**Data in Transit:**
- Все внешние соединения: TLS 1.3 minimum
- Межсервисные: mTLS через Istio (TLS 1.3)
- Внутренняя сеть: изолированный VPC, нет доступа снаружи

**Управление секретами:**
- HashiCorp Vault: все credentialis, API ключи, TLS сертификаты
- Rotation: автоматическая ротация database passwords каждые 30 дней
- CI/CD: секреты из Vault никогда не хранятся в git

### 6.4 GDPR / 152-ФЗ Compliance

```
Принципы обработки персональных данных:
1. Согласие: явное на каждый тип обработки
2. Минимизация: только необходимые для цели данные
3. Срок хранения: определён для каждого типа данных
4. Право на доступ: экспорт всех данных за 30 дней
5. Право на удаление: soft delete → физическое удаление через 30 дней
6. Право на переносимость: JSON/CSV экспорт
7. Локализация: персональные данные граждан РФ → серверы в РФ

Категории данных и сроки хранения:
- Профиль пользователя: активный аккаунт + 3 года
- История заказов: 5 лет (налоговые требования)
- Финансовые транзакции: 5 лет (152-ФЗ)
- Логи доступа: 1 год (безопасность)
- Cookie / Tracking: определяется согласием (максимум 2 года)

Оператор персональных данных:
- Уведомление Роскомнадзора: обязательно
- DPO (Data Protection Officer): назначен юридически
- DPIA (Data Protection Impact Assessment): для каждой новой обработки
```

### 6.5 WAF и DDoS-защита

```
Слои защиты:
1. Cloudflare (внешний периметр):
   - DDoS mitigation: L3/L4 + L7
   - WAF: OWASP ruleset + кастомные правила
   - Rate limiting: IP-based и token-based
   - Bot detection: JS challenge + browser integrity
   - Geo-blocking: (настраиваемо)

2. Kong API Gateway (внутренний периметр):
   - Rate limiting per API key / IP / user
   - IP whitelist для seller API
   - Request size limits (max 10MB для загрузки изображений)
   - Circuit breaker для backend services

3. Application layer:
   - SQL injection protection: prepared statements everywhere
   - XSS: Content-Security-Policy headers
   - CSRF: SameSite=Strict cookies + CSRF tokens
   - Input validation: все входящие данные валидируются (Zod/class-validator)

Rate Limits (по умолчанию):
- Public API: 100 req/min per IP
- Authenticated API: 1000 req/min per user
- Seller API: 2000 req/min per seller
- Search: 200 req/min per IP
- Payment: 30 req/min per user (строго)
- OTP request: 5 req/10 min per phone
```

---

*→ Следующий раздел: [Дизайн-система и UX](./04-design-system-ux.md)*
