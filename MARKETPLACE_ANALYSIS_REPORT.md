# Технический и бизнес-анализ крупнейших маркетплейсов мира
## Amazon · Ozon · Alibaba · Wildberries

> Дата: 2026-03-14 | Контекст: интеграция функционала в super-messenger платформу

---

## 1. АРХИТЕКТУРА BACKEND

### Amazon
| Компонент | Решение | Детали |
|-----------|---------|--------|
| Архитектура | Microservices (4000+ сервисов) | Single-Threaded Service (STS) — каждый сервис имеет одну задачу |
| Языки | Java (75%), Python (ML), Go, Rust (критические пути) | Graviton processors — собственные ARM-чипы AWS |
| Очереди | Amazon SQS + SNS + Kinesis | SQS — 12 млн msg/sec пиковых нагрузок; Kinesis для streaming |
| Кэш | ElastiCache (Redis + Memcached) | Многоуровневый: L1 in-process, L2 Redis cluster, L3 DynamoDB DAX |
| CDN | CloudFront (edge в 310+ локациях) | Собственный CDN на AWS инфраструктуре |
| Балансировка | ALB + NLB (Layer 4/7), Route 53 latency routing | Blue/green через CodeDeploy |
| Failover | Multi-AZ → Multi-Region active-active | Chaos Engineering (GameDay) — регулярные учения отказоустойчивости |

**Уникальные решения:** Amazon pioneered SOA → microservices. Мандат Безоса 2002 года запрещает прямой доступ к БД других сервисов — только через явные API. Это родина concept of event sourcing в e-commerce.

### Ozon
| Компонент | Решение |
|-----------|---------|
| Архитектура | Микросервисы (Go-first) + монолит в процессе декомпозиции |
| Языки | Go (backend), Python (ML/data), TypeScript (frontend) |
| Очереди | Apache Kafka (3000+ брокеров, 15TB/день) |
| Кэш | Redis Cluster + Tarantool (in-memory СУБД) |
| CDN | Собственная CDN + партнёр Akamai |
| Балансировка | Nginx + Envoy Service Mesh |
| Failover | Active-passive DR + circuit breakers (Hystrix/Resilience4j) |

**Уникальные решения:** Tarantool — российская in-memory СУБД от Mail.ru, используется для корзины, сессий, очередей. 50M+ rps на одном узле. Ozon перешёл с .NET на Go в 2019-2021.

### Alibaba
| Компонент | Решение |
|-----------|---------|
| Архитектура | Microservices на Dubbo (собственный Java RPC) |
| Языки | Java (HSF/Dubbo), Go, Python |
| Очереди | RocketMQ (open-source, созданный Alibaba), Kafka для аналитики |
| Кэш | Tair (собственный Redis-совместимый + persistent) |
| CDN | Alibaba Cloud CDN (DCDN — dynamic edge) |
| Балансировка | Tengine (fork Nginx), собственный L7 LB |
| Failover | Same-city dual active +异地灾备 (cross-city DR) |

**Уникальные решения:** 双十一 (Double 11) — крупнейшая нагрузка в мире. 2021: 583,000 заказов/секунду. Alibaba изобрели технику "traffic shifting" — постепенный переход от production к shadow трафику для тестирования.

### Wildberries
| Компонент | Решение |
|-----------|---------|
| Архитектура | Эволюционирует от монолита к сервисам (.NET legacy + Go новые) |
| Языки | C#/.NET (legacy), Go (новые сервисы), Python (аналитика) |
| Очереди | Apache Kafka + RabbitMQ |
| Кэш | Redis |
| CDN | Собственная CDN в РФ + Cloudflare |
| Балансировка | HAProxy + Nginx |
| Failover | Собственные ЦОД в Москве/Подмосковье |

---

## 2. FRONTEND И UX-АРХИТЕКТУРА

### Amazon
- **Рендеринг:** SSR + Client Hydration (Next.js-подобный, собственный фреймворк)
- **Производительность:** TTFB < 100ms для 50-го перцентиля. LCP < 2.5s
- **A/B тестирование:** WebLab platform — 10,000+ экспериментов одновременно
- **Персонализация UI:** Каждый пользователь видит уникальный home page (ML-driven)
- **Мобильное приложение:** React Native (post-2019) + Native модули для критических экранов
- **Offline:** Service Worker для каталога, IndexedDB для корзины

### Ozon
- **Рендеринг:** Nuxt.js (Vue 3 SSR) → переход на React с 2023
- **Производительность:** Core Web Vitals: LCP < 2.0s, CLS < 0.1, FID < 100ms
- **A/B тест:** Собственная ExPlatform, Unleash для feature flags
- **Мобильное приложение:** React Native + нативные модули

### Alibaba (Taobao/Tmall)
- **Рендеринг:** 自研 (собственная) SSR-система, основа на Node.js + Egg.js
- **Производительность:** Предзагрузка по мере скроллинга, WebP everywhere
- **A/B тест:** Alibaba ExP — самая зрелая система, интегрирована с ML
- **Мобильное приложение:** Собственный WeexKit → Flutter

### Wildberries
- **Рендеринг:** React SPA → поэтапный переход на SSR
- **Мобильное приложение:** React Native (iOS/Android)
- **A/B тест:** Самописная, менее зрелая

---

## 3. БАЗЫ ДАННЫХ И ХРАНЕНИЕ

### Amazon
| Задача | СУБД | Обоснование |
|--------|------|-------------|
| Каталог | Amazon Aurora PostgreSQL | ACID, сложные запросы |
| Корзина | Amazon DynamoDB | Миллиарды операций/сек |
| Сессии | Amazon ElastiCache Redis | Sub-ms latency |
| Заказы | Amazon Aurora + DynamoDB | ACID для транзакций |
| Аналитика | Amazon Redshift | Columnar OLAP |
| Поиск | Amazon OpenSearch (Elasticsearch) | Full-text + facets |
| Медиа | Amazon S3 + CloudFront | Неограниченный масштаб |
| ML features | Amazon SageMaker Feature Store | Online/offline store |

**Партиционирование:** DynamoDB автоматически. Aurora — range partitioning по дате.

### Ozon
- **Каталог:** PostgreSQL (sharded) + Elasticsearch для поиска
- **Заказы:** PostgreSQL (write) + ClickHouse (analytics)
- **Сессии/корзина:** Tarantool
- **Медиа:** Собственное S3-совместимое хранилище
- **Аналитика:** ClickHouse (50TB+ данных)

### Alibaba
- **Каталог:** OceanBase (собственная distributed HTAP СУБД)
- **Пользователи:** Lindorm (собственный HBase-подобный)
- **Заказы:** OceanBase + TiDB
- **Поиск:** собственный HA3 (Elasticsearch-подобный)
- **Аналитика:** MaxCompute (аналог BigQuery, 1 EB+ данных)

### Wildberries
- **Основная БД:** Microsoft SQL Server (legacy) + PostgreSQL (новые сервисы)
- **Поиск:** Elasticsearch
- **Аналитика:** ClickHouse
- **Медиа:** Собственные storage

---

## 4. АЛГОРИТМЫ И БИЗНЕС-ЛОГИКА

### Ранжирование товаров

**Amazon A9/A10 Algorithm:**
```
score = relevance_score * conversion_rate * CTR * revenue_per_impression
relevance_score = text_match(title, description, backend_keywords) * field_weight
                 + semantic_similarity(query, product_embedding)
conversion_rate = orders / sessions (trailing 90 days)
```
Факторы ранжирования (подтверждённые публично):
- Sales velocity (скорость продаж) — самый критичный
- Text match score — title > bullets > backend keywords
- Price competitiveness
- Fulfilment method (FBA > FBM)
- Review count + recency + rating (weighted)
- CTR vs competitors для схожих queries

**Ozon Search:**
- Elastic BM25 + ML re-ranking (LightGBM)
- Персонализация через user embeddings (user2vec)
- "Рейтинг для хранения" — учёт качества поставщика
- Boost для FBO (fulfilment Ozon) товаров

**Alibaba Taobao:**
- Deep Interest Network (DIN) — neural CTR prediction
- User behavior sequence modeling (последовательность кликов/покупок)
- Graph Neural Network для item-item similarity
- Real-time bidding для позиций (аукцион)

### Рекомендательные системы

**Amazon:**
Item2Vec → Collaborative Filtering → Deep Neural CTR
- "Customers who bought X also bought Y" — item-item CF
- "Recommended for you" — user-based deep learning
- Real-time recommendations update на каждый pageview
- Contextual bandits для exploration/exploitation баланса

**Ozon:**
- Две модели: offline (большая ALS collaborative filtering) + online (real-time user session)
- Embedding size 128, обучение каждые 6 часов
- A/B тест каждого recommendation block

### Система ценообразования

**Amazon Dynamic Pricing:**
- 2.5 млн изменений цен в день (2014 данные, сейчас больше)
- Алгоритм: конкурентный мониторинг (Marketplace) + AI demand forecasting
- Surge pricing для срочных товаров
- Floor price protection (не ниже себестоимости + margin)

**Wildberries — уникальная механика:**
- "Скидка продавца" + "Скидка WB" — раздельно
- WB может дополнительно субсидировать скидку за счёт комиссии
- Участие в акциях обязательно с угрозой снижения позиций

### Антифрод и верификация

**Amazon:**
- Seller Verification: document check + video call + bank account verification
- Fake review detection: ML на текстовых паттернах + network graph analysis
  (если 100 аккаунтов с похожим IP оставили 5★ → удаление)
- Brand Registry: защита торговых марок через USPTO/Роспатент verification
- ASIN abuse detection: анализ velocity изменений листингов

**Ozon:**
- Верификация продавца через ЭДО (электронный документооборот)
- ML-скоринг отзывов: spammer detection + similarity clustering
- Автоматические штрафы за фрод (SPM — seller performance metric)

---

## 5. ЛОГИСТИКА И CARGO

### FBA (Fulfillment by Amazon)
**Механика:**
1. Продавец отправляет товар на Amazon FC (Fulfillment Center)
2. Amazon принимает на склад, проводит инвентаризацию
3. При заказе: FC pick → pack → ship (в 98% случаев за <24ч)
4. Return handling: Amazon обрабатывает возвраты за продавца

**Алгоритм распределения запасов:**
- Demand forecasting по регионам → товар разделяется по 5-10 FC
- "Inventory Placement Service" — $0.30/unit за централизованное хранение
- Reorder point = leadtime_mean + z * leadtime_std * demand_std

**WMS (Warehouse Management System):**
- Amazon Robotics (бывший Kiva) — 750,000+ роботов
- Stow algorithm: chaotic storage (случайное место, записывается в DB)
- Pick algorithm: zone picking + batch picking + wave picking
- SLAM (Sort, Label, Apply, Manifest) — автоматическая сортировка

### FBO (Fulfillment by Ozon)
- Аналог FBA с особенностями для РФ
- Кросс-докинг + прямая доставка (XDock)
- Real-time tracking через Ozon API → до конечного потребителя
- "Экспресс" — доставка за 2-6 часов (собственные курьеры + партнёры)

### Wildberries Logistics
- 1500+ ПВЗ (пунктов выдачи заказов) — крупнейшая сеть в РФ
- WB Transit — собственная служба доставки
- Склад-сортировочный центр: автоматизированные конвейеры
- WB использует инновацию: продавец возит на ближайший склад WB, дальше — сами

---

## 6. SELLER API

### Amazon Seller Central API (SP-API)
- **Протокол:** REST, JSON + LWA (Login with Amazon) OAuth2
- **Endpoints:** 30+ разделов: Products, Orders, Inventory, Fulfillment, Finance, Reports, Advertising
- **Rate limits:** По типу: CreateReport — 0.0222 req/s (1 каждые 45 сек)
  ListOrders — 6 req/min burst 60
- **Webhooks:** Amazon SQS-based notifications (не вебхуки в классическом смысле)
- **SDK:** официальные Python SDK, Java SDK
- **Sandbox:** полная симуляция с тестовыми ASIN/Order IDs

**Ключевые Endpoints продавца:**
```
GET  /catalog/2022-04-01/items/{asin}           — product data
POST /feeds/2021-06-30/feeds                   — bulk product upload
GET  /orders/v0/orders                         — order list
PATCH/orders/v0/orders/{orderId}/buyerInfo     — update order
POST /fba/inbound/v0/shipments                 — FBA inbound
GET  /finances/v0/financialEventGroups         — financial reports
GET  /reports/2021-06-30/reports               — analytics reports
```

### Ozon Seller API
- **Протокол:** REST JSON, API Key + Client ID (не OAuth)
- **Rate limits:** 100 requests/min для большинства методов, 1 req/min для тяжёлых
- **Webhooks:** поддерживаются (POST на URL продавца)
- **SDK:** Python, PHP, Go
- **Особенности:** FBO/FBS раздельные endpoints, реквизиты для выплат, ЭДО

### Alibaba Open Platform
- **Протокол:** TOP (Taobao Open Platform) — собственный RPC-lite, REST
- **Auth:** OAuth2 + App Key + App Secret
- **ISV ecosystem:** 60,000+ ISV (Independent Software Vendors)

---

## 7. ПЛАТЁЖНАЯ СИСТЕМА

### Amazon
- **Шлюзы:** Amazon Pay (собственный) + Stripe + PayPal + BNPL (Affirm)
- **Escrow:** Не используется (Amazon — прямой seller, доверие = бренд)
- **Fraud:** автоматическое удержание средств до подтверждения доставки
- **Payouts:** Net 7/14 дней после подтверждения доставки
- **Chargeback:** Amazon покрывает unauthorized chargebacks (A-to-Z guarantee)

### Ozon
- **Шлюзы:** Tinkoff, Sber, Alfabank, СБП
- **Escrow:** Средства удерживаются до подтверждения получения покупателем
- **Fraud:** ML-скоринг платежей (Ozon Pay)
- **Payouts:** Ежедневные выплаты (FBO: T+2, FBS: T+14 после возврат-окна)

### Alibaba (Alipay/Escrow)
- **Alipay:** крупнейший платёжный сервис в мире, ~1B пользователей
- **Escrow:** обязательный для C2C (Taobao): деньги → Alipay → подтверждение → продавец
- **Fraud:** Sesame Credit — альтернативный кредитный скоринг
- **Cross-border:** Alipay + локальные шлюзы в каждой стране

---

## 8. УВЕДОМЛЕНИЯ И КОММУНИКАЦИИ

### Amazon
- **Email:** SES (Simple Email Service), персонализированные
- **Push:** SNS → FCM/APNS
- **In-app:** Messaging API (продавец-покупатель через маскированные адреса)
- **Голос:** Alexa Order Status

### Ozon
- **Email + Push + SMS:** собственная система поверх SMSC + FastMail
- **Ozon Live Chat:** чат продавца с покупателем через платформу (не прямой контакт)
- **Автоматизированные ответы:** боты для типовых вопросов (статус заказа)
- **Реальный трекинг:** push при каждом изменении статуса

### Wildberries
- **Push + Email + SMS:** партнёрские шлюзы
- **Нет чата:** покупатель → продавец коммуникация очень ограничена
- Это воспринимается как weakness конкурентное

---

## 9. АНАЛИТИКА И ML-ИНФРАСТРУКТУРА

### Amazon
- **ETL/ELT:** AWS Glue (Spark), Kinesis → S3 → Redshift
- **Demand forecasting:** Prophet + LSTM для сезонных паттернов, по 300M SKU
- **ML Platform:** Amazon SageMaker, 10,000+ production ML models
- **Ad Platform:** Amazon Advertising — DSP + Search + Display
  Механизм: Second-price auction + quality score

### Ozon
- **Data Platform:** Apache Spark на YARN + ClickHouse для real-time аналитики
- **Demand forecasting:** Ozon собственная модель: gradient boosted trees + temporal features
- **Seller Analytics:** real-time dashboard, ABC-анализ, оборачиваемость

### Alibaba
- **Data Platform:** MaxCompute (1 EB+), DataWorks (ETL orchestration)
- **ML Platform:** PAI (Platform for AI) — 1M+ jobs/day
- **Ad System:** Bidding на keyword level, Quality Score = CTR × Bid × Ad Quality

---

## 10. БЕЗОПАСНОСТЬ

### Amazon
- **DDoS:** AWS Shield Advanced + CloudFront WAF
- **Data encryption:** AES-256 at rest, TLS 1.3 in transit
- **Compliance:** PCI DSS Level 1, ISO 27001, SOC 2 Type II, GDPR
- **Secrets:** AWS Secrets Manager + IAM fine-grained roles

### Ozon
- **DDoS:** Qrator.net + Cloudflare
- **Compliance:** 152-ФЗ (ПДн), PCI DSS, ГОСТ Р 57580
- **Шифрование:** TLS 1.2+ обязательно, AES-256 данные платёжных карт
- **Data residency:** серверы только в РФ (требование 242-ФЗ)

### Alibaba
- **DDoS:** Alibaba Cloud Anti-DDoS (защита до 10 Tbps)
- **Compliance:** GDPR (EU), PIPL (Китайский закон о персональных данных), PCI DSS
- **Шифрование:** собственные HSM, Key Management Service

### Wildberries
- **DDoS:** Cloudflare + собственная защита
- **Compliance:** 152-ФЗ, 54-ФЗ (онлайн-кассы), PCI DSS

---

## СРАВНИТЕЛЬНАЯ ТАБЛИЦА

| Метрика | Amazon | Ozon | Alibaba | Wildberries |
|---------|--------|------|---------|-------------|
| **GMV (2024)** | ~$600B | ~$7B | ~$1.3T | ~$30B |
| **SKU каталог** | 400M+ | 90M+ | 1B+ | 200M+ |
| **Заказов/сутки** | 30M+ | 2M+ | 25M+ (Double11: 50M/час) | 5M+ |
| **Продавцов** | 2M | 200K | 10M+ | 750K+ |
| **Языки backend** | Java/Go/Python | Go/Python | Java/Go | C#/Go |
| **Очередь сообщений** | SQS/Kinesis | Kafka | RocketMQ | Kafka/RabbitMQ |
| **In-memory DB** | Redis/DAX | Tarantool | Tair | Redis |
| **DWH** | Redshift | ClickHouse | MaxCompute | ClickHouse |
| **Search engine** | OpenSearch | Elastic | HA3 (custom) | Elastic |
| **ML ranking** | Deep Learning | LightGBM | DIN/GNN | ML (unknown) |
| **Logistics owned** | Amazon Logistics | Ozon Express | Cainiao | WB Transit |
| **FBA-like** | FBA | FBO | Tmall Super | FBO WB |
| **Seller API** | SP-API (REST) | REST | TOP/REST | REST |
| **Escrow** | A-to-Z Guarantee | Да | Alipay Escrow | Нет (прямой) |
| **AR/3D product** | ✅ Amazon AR View | ❌ | ✅ Taobao AR | ❌ |
| **Live Shopping** | ✅ Prime Video | ✅ | ✅ Taobao Live | ✅ |
| **Чат продавец-покупатель** | ✅ Masked | ✅ Platform only | ✅ Wangwang | Ограничен |
| **Мобильный conversion** | 2.5% | 3.1% | 2.8% | 3.5% |

---

## УНИКАЛЬНЫЕ ТЕХНИЧЕСКИЕ РЕШЕНИЯ

### Amazon (⭐ Benchmarks)
- **AWS** — Amazon создала облако как инфраструктуру для себя, затем монетизировала
- **Dynamo** (2007) — изобрел NoSQL с eventual consistency; влияние на весь industry
- **Aurora** — re-inventioned relational DB: storage и compute разделены
- **Graviton** — собственные ARM процессоры: 40% дешевле x86 за ту же производительность

### Ozon (⭐ Российские инновации)
- **Tarantool** — в-памяти СУБД 50M rps на одном узле, Russian-made
- **XDock (cross-docking)** — товар не хранится, сразу транзитируется на доставку
- **Ozon Fresh Express** — 2-часовая доставка через dark stores в Москве/СПб

### Alibaba (⭐ Scale Mastery)
- **OceanBase** — самая масштабируемая HTAP распределённая СУБД в мире
- **Double 11 architecture** — единственная в мире система, обрабатывающая 583K заказов/сек
- **Alipay/Ant Group** — финтех-компания, выросшая из escrow-сервиса маркетплейса

### Wildberries (⭐ Unit Economics)
- **ПВЗ как marketplace** — пункты выдачи = profit center, не cost center
- **Seller-funded discounts** — WB заставляет продавцов участвовать в акциях → unit economics
- **Automated returns processing** — самая дешёвая обработка возвратов в РФ

---

## АНАЛИЗ РАЗРЫВОВ vs НАША ПЛАТФОРМА

### Текущее состояние (наш проект)
**Есть:**
- ProductCard, ProductCollection (базовые)
- ProductVariantPicker
- ProductReviews (статичные)
- OrderTracking (4-шаговый)
- LiveShoppingOverlay
- CreateShopSheet

**Критически отсутствует:**
1. **Поиск с фильтрами** — нет elasticsearch/поисковой системы
2. **Корзина с постоянством** — нет IndexedDB/Supabase persistence
3. **Checkout flow** — нет адреса, платёжного шага
4. **Ранжирование товаров** — нет scoring
5. **Рекомендации** — нет ML/CF моделей
6. **Seller API** — нет эндпоинтов для продавцов
7. **Динамическое ценообразование** — статичные цены
8. **FBO/FBS логистика** — нет системы хранения/доставки
9. **Чат продавец-покупатель** — нет (наш чат есть, но не интегрирован с магазином)
10. **Антифрод отзывов** — нет модерации
11. **Seller Analytics** — нет дашборда
12. **Escrow** — нет механики удержания средств
