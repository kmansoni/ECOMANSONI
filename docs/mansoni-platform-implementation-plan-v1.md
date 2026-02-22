# Mansoni Platform — Implementation Plan v1 (Stage-by-stage, repo-aligned, no code)

Дата: 2026-02-22

Цель документа: дать пошаговый архитектурный план реализации Instagram/TikTok-level платформы внутри текущего репозитория (Supabase + React/Vite), с явным связыванием с уже существующими алгоритмами/логикой (Reels Engine RPC + config gate, сбор событий, idempotency-паттерны из чата).

---

## 0) Ненарушаемые правила (глобально)

### D0.000 — Design Compliance Rule (обязательное)
Каждый новый или изменённый UI-элемент обязан:
- Использовать существующую дизайн-систему проекта (ваши компоненты UI, Tailwind tokens, текущий визуальный язык: dark/navy + violet accents + glass/blur, общие радиусы/отступы).
- Не вводить “отдельные стили под режимы” (Reels/Story/Post/Live — один UI-движок, разные mode flags).
- Учитывать safe-area и 100dvh во всех модальных/полноэкранных поверхностях.
- Быть консистентным для mobile/desktop.

Проверка D0.000 должна быть частью Definition of Done каждого этапа.

### P0.000 — Server-side enforcement
- Любая приватность/блок-листы/видимость/возраст/гео enforced сервером.
- Клиентские проверки (например “90 секунд”) — только UX/предупреждение, не безопасность.

### I0.000 — Idempotency everywhere (переносим из чата на медиа/ленты/события)
Используем тот же принцип, который вы уже применили для сообщений:
- У каждого write-action есть стабильный клиентский ключ (client_*_id / idempotency_key) на ретраи.
- Сервер/БД имеют уникальности/конфликты/дедуп, чтобы дубль физически не появлялся.
- Клиент имеет in-flight guards + optimistic state + reconcile.

### O0.000 — Observability as a feature
- Любой этап, который меняет поведение ранжирования/показа/публикации, обязан иметь метрики, reason-codes и путь расследования.

---

## 1) Текущее состояние репозитория (что уже есть и на что опираемся)

### 1.1 Reels: текущий read-path + события
- Лента берётся из RPC `get_reels_feed_v2` (есть request_id, feed_position, algorithm_version, final_score).
- События/фидбек записываются через RPC вида `record_reel_impression_v2` и аналоги (есть anon session для гостя).
- В UI уже реализованы базовые правила:
  - impression через IntersectionObserver (50% видимость + 1 сек)
  - viewed/watched/skip — прогрессивные события
  - негативный фидбек

Репо-референсы:
- [src/pages/ReelsPage.tsx](src/pages/ReelsPage.tsx)
- [src/hooks/useReels.tsx](src/hooks/useReels.tsx)
- [supabase/migrations/20260221143000_get_reels_feed_v2_fallback_and_visibility.sql](supabase/migrations/20260221143000_get_reels_feed_v2_fallback_and_visibility.sql)

### 1.2 Control-plane ранжирования (конфиги)
- Есть propose/validate/activate контур с gate-валидацией (service_role-only).
- Есть тестовый контракт для `reels_engine_validate_config_v1`.

Репо-референсы:
- [supabase/migrations/20260221132000_reels_engine_control_plane.sql](supabase/migrations/20260221132000_reels_engine_control_plane.sql)
- [supabase/migrations/20260221195000_reels_config_validate_v1.sql](supabase/migrations/20260221195000_reels_config_validate_v1.sql)
- [supabase/migrations/20260221195100_reels_activate_config_gate_v1.sql](supabase/migrations/20260221195100_reels_activate_config_gate_v1.sql)
- [src/test/reels-config-validate-v1.test.ts](src/test/reels-config-validate-v1.test.ts)

### 1.3 Stories/Post/Reels creation: storage buckets используются
Активные buckets: `stories-media`, `chat-media`, `post-media`, `reels-media`.

Репо-референсы:
- [src/hooks/useStories.tsx](src/hooks/useStories.tsx)
- [src/components/feed/StoryEditorFlow.tsx](src/components/feed/StoryEditorFlow.tsx)
- [src/components/feed/CreatePostSheet.tsx](src/components/feed/CreatePostSheet.tsx)
- [src/components/reels/CreateReelSheet.tsx](src/components/reels/CreateReelSheet.tsx)

### 1.4 Чат: подтверждённый паттерн idempotency + dedupe
Это “эталон” того, как должны работать upload/publish/engagement:
- client_msg_id + уникальность в БД (partial unique index)
- upsert с onConflict
- optimistic UI + reconcile
- in-flight guards

Репо-референсы:
- [src/hooks/useChat.tsx](src/hooks/useChat.tsx)
- [src/lib/chat/sendDmMessage.ts](src/lib/chat/sendDmMessage.ts)
- [supabase/migrations/20260219090000_chat_seq_idempotency.sql](supabase/migrations/20260219090000_chat_seq_idempotency.sql)

---

## 2) Архитектурная цель: Unified Media Hub (эволюция без переписывания всего)

Мы не “ломаем и переписываем”, а делаем миграцию:
- Сейчас: отдельные Create flows (CreateReelSheet/StoryEditorFlow/CreatePostSheet).
- Цель: Global Create Entry → Media Hub Modal → Mode Switch внутри одного контейнера.

Стратегия миграции:
- Stage A: собрать единый Create Surface (модалка) и внутрь подключить существующие flows как “режимы” (без изменения их внутренней логики).
- Stage B: вынести повторяющиеся части (file pick, preview, basic validation, draft save, upload queue) в общие ядровые слои.
- Stage C: подключить UploadSession + processing pipeline + publish orchestrator.

---

## 3) Поэтапный план (Stages 1–16): что именно делать, какие артефакты и какой результат

Ниже каждый этап описан как:
- Цель
- Объём (scope)
- Архитектурные изменения (frontend / backend / DB / ops)
- Интеграция с тем, что уже есть в репо
- Definition of Done (DoD)

### Stage 1 — Feed Read Path (Reels) стабилизация
Цель: стабильные курсоры, дедуп, privacy enforcement, fallback.

Архитектура:
- Зафиксировать контракт feed: cursor-based (или строго определённый offset + request_id semantics) и “versioned feed”.
- Fallback при деградации ранкера: recency+moderation фильтр.

Интеграция:
- Опираемся на `get_reels_feed_v2` и существующие миграции fallback.

Артефакты (что должно появиться после этапа):
- Feed Contract Doc: чёткое описание запроса/ответа ленты (включая `request_id`, `feed_position`, `algorithm_version`, TTL страницы, семантика “повтора”).
- Cursor/Session Policy: правила, когда курсор истекает, и как ведут себя A/B сегменты.
- Privacy Matrix: таблица правил видимости (public/private/friends/subscribers) + блок-листы, применяемые на read-path.

Точки интеграции в репо (без переписывания):
- Read-path остаётся через RPC `get_reels_feed_v2` как основной контракт, а UI продолжает брать `request_id/feed_position` для корреляции.
- Негативный фидбек и suppression учитываются на стороне SQL/RPC (у вас уже есть миграции по coldstart/freq-cap).

Метрики/инварианты Stage 1 (минимум):
- `feed_page_latency_ms` (P50/P95) и error rate.
- `duplicate_suppression_rate` (сколько кандидатов выкинули как повторы).
- `empty_first_page_rate` (сколько раз первая страница пустая и включается fallback).

DoD:
- Нет дублей в пределах сессии (определить окно).
- Курсор/страницы стабильны при A/B и смене config_version.
- Privacy/blocks enforced сервером.
- D0.000: никаких новых UI-паттернов “список ради списка”; любые новые состояния ленты оформляются существующими компонентами.

### Stage 2 — Playback + Event Integrity
Цель: события не накручиваются, корректная последовательность, дедуп ретраев.

Архитектура:
- Формализовать state-machine плеера и правила impression/view_start/view_3s/view_10s/complete.
- Ввести idempotency keys для событий по time-bucket.

Интеграция:
- Текущая реализация в [src/pages/ReelsPage.tsx](src/pages/ReelsPage.tsx) — baseline, который нужно “довести до контракта”.
- Применить тот же подход, что в чате: stable client_event_id + server dedupe.

Артефакты:
- Playback Event Spec: точные определения `impression`, `view_start`, `view_3s`, `view_10s`, `view_complete`, `skip`.
- Event Ordering Rules: какие последовательности допустимы/недопустимы.
- Dedup Rules: по каким ключам и в каких time-bucket события считаются идемпотентными.

Интеграция с текущей логикой:
- Сохраняем IntersectionObserver подход, но фиксируем минимальные пороги (видимость + время) как продуктовый контракт.
- Сохраняем вашу “progressive disclosure” модель (viewed/watched/skip) как основу feature pipeline для ранжирования.

Метрики/инварианты Stage 2:
- `impression_to_view_start_ratio` (аномалии = сигнал накрутки/ошибок клиента).
- `view_start_to_complete_ratio` в разрезе сегментов/устройств.
- `event_dedup_hit_rate` (сколько событий отфильтровано как повтор).
- `invalid_sequence_reject_rate`.

DoD:
- Невозможны “completion без view_start”.
- Повторные отправки событий не множат счётчики.
- D0.000: индикаторы буфера/ошибок/ограничений — только в вашем стиле (glass/violet), без дефолтных браузерных контролов.

### Stage 3 — Upload Reliability + Processing SLA + Cost Shield
Цель: resumable upload, checksum, commit, SLA обработки, экономический щит.

Архитектура:
- UploadSession (как first-class entity): open → parts → commit.
- Processing queue + progressive renditions.
- Лимиты/квоты на транскодинг/объём.

Интеграция:
- Сейчас uploads идут напрямую в buckets (reels-media/stories-media/post-media).
- Миграция: сначала оставить прямую загрузку для MVP, но добавить session tracking и идемпотентность публикации.
- Idempotency паттерн — взять из чата.

Артефакты:
- Upload Protocol Spec: session lifecycle (open→upload parts→commit), требования к retry/backoff, и к checksum.
- Processing SLA Spec: цели по time-to-playable и time-to-HD-ready (с понятными degrade правилами).
- Cost Shield Policy: квоты по пользователям/суткам + профили обработки по trust/сегментам.

Интеграция с текущими bucket’ами:
- На первом проходе не ломаем существующие `stories-media/post-media/reels-media` пути.
- Вводим единые conventions для путей и идентификаторов (как минимум для новых загрузок), чтобы потом унифицировать Storage RLS.

Связь с уже сделанным в чате:
- Использовать тот же принцип стабильного client-id при ретраях: один publish intent/одна upload session не должны создавать дубликаты объектов и строк.
- Для всех commit/publish write-path требовать уникальный ключ и конфликт-стратегию.

Метрики/инварианты Stage 3:
- `upload_resume_success_rate`, `upload_part_retry_rate`.
- `processing_time_to_playable_ms` (P50/P95) и `processing_queue_lag_ms`.
- `transcode_cost_units_per_day` (единица: минута обработки/байты egress, как вы выберете).

DoD:
- Повтор/краш/смена сети не теряет загрузку.
- Есть статус “обрабатывается/готово/ошибка категории”.
- D0.000: экран статуса загрузки/обработки — единый, не отдельные “реелс/стори/пост” варианты.

### Stage 4 — Publish Orchestration + Multi-Target Engine
Цель: один publish создаёт единый объект + targets (reels/story/channel/chat/services).

Архитектура:
- PublishItem как канонический объект.
- PublishTargets как связь “куда опубликовали”.
- Единые политики visibility.

Интеграция:
- Использовать существующие таблицы reels/stories/posts как legacy surfaces до перехода.
- Связать share-to-chat через уже внедрённый `sendDmMessage`.

Артефакты:
- Publish State Machine Spec: `draft→pending→published` + `hidden/archived/removed`.
- Target Matrix: какие target’ы разрешены при каких visibility/policy.
- Share Card Rules: как формируется карточка для чата/канала и какие проверки доступа применяются.

Интеграция с текущим репо:
- Reels остаются как surface, но publish ядро становится единым (и Reels creation начинает вызывать publish-orchestrator концептуально).
- Для DM-sharing используем единый writer (у вас уже есть унификация отправки DM в `sendDmMessage`).

Метрики/инварианты Stage 4:
- `publish_idempotency_collision_rate` (сколько publish попыток схлопнуто в один объект).
- `share_open_denied_rate` (попытки открыть контент без прав — должно быть ненулевым и измеряться).

DoD:
- Publish идемпотентен (двойной тап не создаёт дубль).
- Share не обходит приватность.
- D0.000: UI публикации/выбора targets/видимости — единый компонентный стиль.

### Stage 5 — Ranking v1 (configurable) + cold start + diversity + negative feedback
Цель: TikTok-level по поведению, но “дебажно” и управляемо.

Архитектура:
- Candidate sources и quotas.
- Scoring как функция факторов.
- Rerank constraints.

Интеграция:
- У вас уже есть control-plane конфигов и gate-валидация.
- Увязать новые параметры (diversity окна, caps, penalties) с существующим validate/activate контуром.

Артефакты:
- Ranking Spec v1: источники кандидатов + quotas + scoring factors + rerank constraints.
- Explainability Spec: reason-codes и что сохраняется для QA/admin.
- Experimentation Rules: сегменты, rollout %, guardrails и авто-rollback.

Требование к сигналам (обязательно для масштабирования):
- Online signals: сессионные/последние действия пользователя (минуты/часы) для адаптации выдачи.
- Nearline signals: агрегаты за час/день (просмотры/досмотры/сейвы/репорты) для устойчивого скоринга.
- Offline signals: тяжёлые признаки (темы/эмбеддинги/кластеризация) и периодические пересчёты.

Интеграция с уже существующим Reels Engine:
- Расширяем уже существующий конфиг (через validate/activate) параметрами diversity/penalties.
- Используем `algorithm_version`/`request_id` уже проходящие через `get_reels_feed_v2` как “сквозной идентификатор выдачи”.
- Учитываем уже существующие миграции по coldstart tuning как baseline поведения (не переписывать, а расширять).

Метрики/инварианты Stage 5:
- `creator_diversity_index` в окне выдачи.
- `not_interested_effectiveness` (как быстро после сигнала падает доля похожего контента).
- `report_rate_per_1k_impressions` + guardrails.

DoD:
- Negative feedback меняет выдачу.
- Diversity constraints работают.
- Есть reason-codes и версия алгоритма в payload.
- D0.000: “почему показано” и “не интересно” — ваши glass панели, без чужих диалогов.

### Stage 6 — Anti-Abuse + Trust score + Progressive enforcement
Цель: ранжирование и метрики защищены от накрутки.

Архитектура:
- Trust score влияет на reach/лимиты/вес сигналов.
- Progressive enforcement уровни.

Интеграция:
- События из Stage 2/5 дают базу для trust-сигналов.

Артефакты:
- Trust Score Spec: входные сигналы, уровни, влияния (лимиты/дистрибуция/вес событий).
- Progressive Enforcement Spec: уровни ограничений и условия переходов.
- Appeals/Support hooks: минимальные требования к восстановлению/обжалованию.

Интеграция с существующей логикой:
- Использовать event integrity из Stage 2 как фильтр “качества” событий перед тем, как они влияют на ranking/monetization.
- Idempotency/дедуп подход из чата применить к enforcement actions и журналированию.

Метрики:
- `suspected_bot_session_rate`, `rate_limit_trigger_rate`.
- `false_positive_appeal_rate` (если апелляций слишком много — правила слишком жёсткие).

DoD:
- Вводятся лимиты и алармы, не ломая UX.
- D0.000: любые ограничения показываются нейтрально, в вашем стиле, с понятным next-action.

### Stage 7 — Moderation system (queues + SLA + borderline policy)
Цель: безопасность без убийства роста.

Архитектура:
- Auto allow/restrict/block + needs-review.
- Borderline distribution: не в рекомендации.
- Appeal flow + audit.

Интеграция:
- Текущие поля moderation_status в reels уже есть (baseline).

Артефакты:
- Moderation Decision Taxonomy: allow/restrict/needs_review/block + коды причин.
- Queue SLA Spec: SLA по очередям и приоритизации (в т.ч. массовые репорты/низкий trust).
- Borderline Policy Spec: правила “можно смотреть по ссылке/подписчикам, но не рекомендовать”.
- Appeals Spec: минимальный цикл апелляции + аудит.

Метрики:
- `moderation_queue_lag_minutes` (P50/P95), `appeal_turnaround_hours`.
- `borderline_distribution_leak_rate` (сколько раз borderline попал в explore — должно быть ~0).
- `report_to_action_time_minutes`.

DoD:
- Очереди не выходят из SLA.
- Админ-панель умеет расследовать и аудировать.
- D0.000: пользовательские тексты ограничений нейтральны; админские панели в том же визуальном ядре (если они внутри продукта).

### Stage 8 — Observability + SLO + kill-switches
Цель: операционная зрелость.

Архитектура:
- SLO на feed/playback/upload/processing/moderation.
- Kill-switches: ranking, comments, upload, live, discovery.

Интеграция:
- Конфиги ранжирования уже имеют gate; расширить на emergency режим.

Артефакты:
- SLO Registry: список SLO по доменам (feed/playback/upload/processing/moderation/ranking).
- Kill-switch Catalog: перечень выключателей и их деградационные режимы.
- Incident Playbooks: P0/P1 сценарии и шаги реагирования.
- Reason-code Registry: единый справочник кодов причин (ranking/moderation/abuse).

Метрики:
- `ranker_timeout_rate` и доля fallback выдач.
- `playback_start_failure_rate`, `rebuffer_rate`.
- `upload_success_rate`, `processing_failure_rate`.
- `cost_anomaly_alert_rate`.

DoD:
- Есть измеримость и быстрый откат.
- D0.000: все “системные статусы” (деградация/ограничения) отображаются фирменно, без «сырого» тех-UI.

### Stage 9 — Live architecture (отдельная система)
Цель: tiered scaling, latency targets, чат/реакции, запись→VOD.

Архитектура:
- Развести control-plane и data-plane.
- Гибрид SFU/LL-HLS стратегия.

Интеграция:
- Live включать только после Stage 6–8 (anti-abuse + ops).

Артефакты:
- Live Tier Model: уровни масштабирования (интерактивный/массовый) и правила перехода.
- Live Latency Budget: целевые задержки по tier и метод измерения.
- Live Moderation Spec: политики и роли (host/mod/admin) + аудит.
- VOD Orchestration Spec: запись → превращение в обычный publish item.

Метрики:
- `live_start_success_rate`, `live_end_reason_distribution`.
- `live_viewer_latency_ms` (по tier), `live_rebuffer_rate`.
- `live_chat_rate_limit_trigger_rate`.

DoD:
- Live деградирует красиво и не падает.
- D0.000: live-экраны не вводят “новую тему”; используют те же панельные/стеклянные элементы.

### Stage 10 — Creator ecosystem (music/effects/templates/rights)
Цель: липкость создателей + юридическая устойчивость.

Архитектура:
- Права/лицензии/атрибуция.
- Remix permissions + цепочка авторства.

Интеграция:
- Влияет на publish и moderation, а также ranking (signals).

Артефакты:
- Rights Model Spec: музыка/эффекты/шаблоны как сущности с региональными и форматными ограничениями.
- Reuse Permissions Spec: remix/duet/reuse политики на уровне publish.
- Attribution Rules: как отображаются источники (аудио/шаблон/оригинал).
- Claim/DMCA Flow Spec: claim, counter-claim, repeat infringer.

Метрики:
- `licensed_audio_usage_rate` vs `unlicensed_detection_rate`.
- `claims_per_1k_uploads` и `false_claim_rate` (через апелляции).

DoD:
- Нельзя использовать запрещённую музыку по региону.
- D0.000: библиотека музыки/эффектов/шаблонов — в вашем UI-паттерне, не «маркетплейс чужой библиотеки».

### Stage 11 — Search/Discovery/Hashtags/Trends
Цель: pull-каналы роста.

Архитектура:
- Trend engine на velocity+trust-weighted signals.
- Anti-hijack.

Интеграция:
- Данные событий уже собираются; нужно materialize для поиска.

Артефакты:
- Search Entities Spec: что ищем (users/items/tags/audio/channels/live/services).
- Hashtag Canonicalization Rules: нормализация/модерация тегов.
- Trend Engine Spec: velocity + trust-weighted signals + decay.
- Anti-hijack Spec: защита от stuffing и hijack трендов.

Метрики:
- `search_success_rate` (клики/время до результата), `search_latency_ms`.
- `trend_anomaly_flag_rate`.

DoD:
- Тренды нельзя накрутить дёшево.
- D0.000: discovery surfaces используют те же карточки контента, что и feed.

### Stage 12 — Monetization (ads + creator revenue)
Цель: доход без разрушения UX и безопасности.

Архитектура:
- Ads как first-class feed items.
- Brand safety + ad fraud защита.

Интеграция:
- Ads невозможны без Stage 2,6,7,8 (integrity+trust+moderation+ops).

Артефакты:
- Ad Item Spec: реклама как first-class item (caps, таргетинг, brand safety).
- Ad Fraud Spec: invalid impression/click detection.
- Creator Revenue Spec: eligibility, payout, прозрачность.
- Sponsored Content Policy: обязательная маркировка.

Метрики:
- `ads_frequency_cap_hit_rate`.
- `invalid_impression_rate`, `invalid_click_rate`.
- `creator_revenue_accuracy` (расхождения/оспаривания).

DoD:
- Есть caps, brand safety, прозрачная аналитика.
- D0.000: sponsored бейджи/пейволлы/дашборды выглядят нативно.

### Stage 13 — Multi-region + compliance + data governance
Цель: глобальная устойчивость.

Архитектура:
- Data residency.
- DR drills + RTO/RPO.

DoD:
- Документированные политики, тест восстановления.

Артефакты:
- Data Classification Spec: PII/sensitive/public/telemetry.
- Residency Rules: где что хранится и как реплицируется.
- DR Plan: RTO/RPO + регулярные drills.
- Legal Mode Spec: emergency compliance switches.

Метрики:
- `cross_region_failover_time_seconds`.
- `backup_restore_test_pass_rate`.

### Stage 14 — AI integration layer
Цель: multimodal понимание контента, safety, creator tools.

Архитектура:
- Версионирование моделей.
- Explainability и human override.

DoD:
- AI не нарушает приватность и имеет rollback.

Артефакты:
- Model Registry Spec: версии, выкатывание, откат.
- AI Explainability Spec: reason-codes для автоматических решений.
- Privacy Boundaries Spec: что нельзя анализировать (например приватные чаты без явного режима).
- Human Override Spec: кто и как может отменять решения.

Метрики:
- `ai_moderation_precision_recall` (на размеченной выборке), `ai_escalation_rate`.

### Stage 15 — Super-platform integration (services)
Цель: контент → конверсия в сервисы + чат как слой сделки.

Архитектура:
- Business objects как targets.
- Unified analytics и revenue attribution.

DoD:
- Нет “перехода в другое приложение” — единый UX.

Артефакты:
- Target Extensibility Spec: как добавлять новый service-target без изменения ядра.
- Conversion Attribution Spec: связь feed→service→chat→deal.
- Trust Unification Spec: как trust влияет на marketplace/realty/insurance flows.

Метрики:
- `service_conversion_rate_by_surface`.
- `chat_initiation_rate_from_content`.

### Stage 16 — Ultimate hardening (zero-trust + threat modeling + legal shield)
Цель: инвестиционная/аудиторская зрелость.

Архитектура:
- Threat models на домены.
- Immutable admin audit.
- Emergency compliance mode.

DoD:
- Регулярные drills + pen-test процесс.

Артефакты:
- Threat Model Pack: STRIDE на ключевые домены.
- RBAC/SOD Spec: разделение ролей и привилегий.
- Immutable Audit Spec: невозможность “стереть след”.
- Security Test Plan: pen-test, bug bounty, chaos drills.

Метрики:
- `privileged_action_audit_coverage`.
- `security_incident_mttd_minutes`, `security_incident_mttr_minutes`.

---

## 4) Как именно “внедрить в наши алгоритмы и логики, которые уже сделали ранее”

### 4.1 Прямое наследование idempotency-паттерна из чата
Сделать обязательным во всех write-контурах медиа:
- UploadSession: idempotency_key на создание сессии и commit.
- Publish: client_publish_id на один publish intent.
- Engagement: client_event_id + server dedupe.
- Share-to-chat: использовать существующую unified DM-отправку (у вас уже есть общий helper).

### 4.2 Привязка к существующему Reels Engine control-plane
- Любые новые параметры ранжирования вводить только через:
  - propose → validate → activate gate
  - сегменты/окружения
  - reason-codes и version stamping

### 4.3 ReelsPage/useReels: что сохранить как baseline поведения
- IntersectionObserver impression logic
- progressive disclosure events
- негативный сигнал

Дальше это формализуется в контракт Stage 2 (event integrity) и Stage 5 (ranking).

---

## 5) Минимальный “сквозной” E2E поток (что обязательно собрать в первую очередь)

Без расширений в сервисы/ads/live:
- Global Create Entry → Media Hub
- Reel creation (upload + publish)
- Processing (минимальный)
- Moderation (минимальный)
- Feed выдача
- Playback + корректные события
- Ranking v1 через активный конфиг
- Admin explain (минимальный)

Это даёт данные и позволяет итеративно растить платформу.

---

## 6) Глоссарий результата (что считается “Instagram/TikTok-level” в вашем контексте)

- Поведение ленты и событий: корректность + антинакрутка.
- Единый create-хаб: одна модалка, режимы, без 3 разных камер.
- Черновики и устойчивость: не теряется работа.
- Уровень контроля: конфиги с gate и откат.
- Безопасность: приватность enforced сервером.
- Наблюдаемость: можно объяснить и откатить.
