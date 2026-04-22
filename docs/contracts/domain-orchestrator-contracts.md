# Domain Orchestrator Contracts

Этот документ сохраняет domain knowledge из архивных `mansoni-orchestrator-*` без оживления их как публичных агентов.

## Статус

- Рабочая маршрутизация идёт через `mansoni` и подчинённых specialists
- Доменные инварианты, протоколы и модульные границы фиксируются здесь как contracts layer после удаления legacy agent-архива

## AI Engine

- Scope: LLM, RAG, embeddings, task DAG, cognitive agent, watchdogs
- Module map: `ai_engine/orchestrator/orchestrator_core.py`, `dag_builder.py`, `cognitive_agent.py`, `research_engine.py`, `watchdog.py`, `message_bus.py`
- Invariants: output validation перед execution, least-privilege tool sandboxing, secrets только через env, async-first execution
- Runtime checks: prompt injection filter, structural validation ответа модели, cost/context/loop watchdogs

## Commerce

- Scope: каталог, корзина, заказы, платежи, продавцы, отзывы, логистика
- Order FSM: `cart -> checkout -> payment_pending -> paid -> processing -> shipped -> delivered | cancelled | refunded`
- Invariants: цена фиксируется при переходе к оплате, каждый payment request идемпотентен, seller/user visibility enforced через RLS, review только после подтверждённой покупки
- Backend rules: stock decrement через `SELECT FOR UPDATE`, payment webhook идемпотентен, критичные операции лучше держать в stored procedures

## CRM

- Scope: лиды, сделки, pipeline, контакты, задачи, аналитика
- Lead FSM: `new_lead -> contacted -> qualified -> proposal_sent -> negotiation -> won | lost | archived`
- Invariants: каждый лид назначен менеджеру, каждое перемещение в воронке аудируется, overdue automation не на клиенте, аналитика считается сервером
- Access model: RLS через `company_id` и `user_id`, audit log обязателен для deals/leads

## Dating

- Scope: matching, swipe, geofencing, профили, матчи, safety, moderation
- Matching contract: геофильтр, исключение уже просмотренных профилей, mutual like создаёт чат, block немедленно убирает рекомендации
- Privacy invariants: точная геолокация не хранится, только агрегированные геоданные/геохеш; список пользователей доступен только авторизованным; report ведёт к auto-hide
- Runtime rules: swipe endpoint rate-limited, optimistic UI допустим только с rollback, premium-only undo не ломает audit trail

## Insurance

- Scope: агрегатор СК, котировки, полисы, комиссия агента, кабинет агента
- Quote pipeline: `input -> validate -> parallel insurer requests -> collect quotes -> compare -> select -> pre-payment check -> payment -> policy issued -> delivery -> storage`
- Invariants: quotation params валидируются на клиенте и сервере, insurer webhooks идемпотентны, agent commission вычисляется только на сервере, policy storage private and encrypted
- Compliance: PII masked в логах, agent access ограничен своими клиентами

## Messenger

- Scope: чаты, каналы, сообщения, delivery, E2EE, calls, push
- Delivery FSM: `SENT -> DELIVERED -> READ -> FAILED`
- E2EE invariants: использовать только `src/lib/e2ee/`, ключи не хранить открыто, forward secrecy на уровне сообщения, read/delivery статусы подтверждаются реальным событием
- Runtime rules: task trace идёт по цепочке UI -> hooks -> Realtime/Broadcast -> RLS; calls проверяются по signaling/SFU boundary

## Real Estate

- Scope: listings, карта, фильтры, search, mortgage calculator, media
- Listing contract: viewport-only loading с padding, full-text search через `tsvector`, listing owner only edits own object, status is `active | sold | archived | pending_moderation`
- Performance rules: map clustering для больших выборок, photo budget max 20, image optimization and signed URLs required
- Finance note: mortgage calculator можно считать на клиенте, если это чистая математика без privileged data

## Social

- Scope: feed, reels, stories, comments, likes, subscriptions, ranking
- Feed contract: subscriptions + recommendations + trending + sponsored; pagination cursor-based
- Reels invariants: autoplay только при focus и 50%+ viewport, next-video preloading, view counter debounce
- Performance rules: long feeds virtualized, media lazy-loaded, video transport tuned for viewport-driven loading

## Streaming

- Scope: live ingest, SFU delivery, chat, donations, DVR, VOD, moderation
- Streaming stack: `OBS/Browser -> WHIP -> mediasoup SFU -> WebRTC viewers`, параллельно `HLS -> Storage -> VOD`
- Invariants: viewer count и live status не через polling, donations строго идемпотентны, stream chat не через Postgres Changes, ingest loss > 60 sec завершает stream
- Storage rules: HLS segments и VOD идут через storage/CDN, moderation выполняется сервером

## Taxi

- Scope: orders, dispatch, drivers, маршруты, тарифы, real-time tracking
- Order FSM: `searching -> driver_found -> driver_en_route -> trip_started -> completed | cancelled`
- Invariants: fare фиксируется при создании заказа, driver sees only own active rides, location broadcast не должен грузить Postgres Changes, heartbeat нужен для offline detection
- Geo rules: nearest-driver lookup через PostGIS, realtime coordinates через Broadcast/WebSocket, every large read bounded with limits

## Usage Rule

- `mansoni` использует этот документ как справочник доменных инвариантов
- Если доменная задача требует имплементации, routing идёт в подходящего specialist-агента, а не в архивный orchestrator
- Новые доменные знания добавляются сюда или в отдельные документы внутри `docs/contracts/`, но не в виде новых user-invocable агентов