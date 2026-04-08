# Мастер-каталог скиллов GitHub (1040+)

> Источники: 20+ GitHub-репозиториев (суммарно 30k+ ⭐)
> Отобраны: лучшие практики для стека TypeScript + React + Supabase + Capacitor
> Mansoni загружает релевантные скиллы автоматически по контексту задачи

---

## ИСТОЧНИКИ (по убыванию звёзд)

| # | Репозиторий | ⭐ | Скиллов | Фокус |
|---|---|---|---|---|
| 1 | hesreallyhim/awesome-claude-code | 8900+ | 150+ | Workflows, hooks, TDD, multi-agent |
| 2 | travisvn/awesome-claude-skills | 7500+ | 200+ | Curated skills catalog |
| 3 | github/awesome-copilot | 5000+ | 208+ | Official GitHub skills + agents |
| 4 | **anthropics/skills** | 3000+ | 50+ | **Official Anthropic skills** |
| 5 | sickn33/antigravity-awesome-skills | 2000+ | 1340+ | Largest installable collection |
| 6 | gmh5225/awesome-skills | 1500+ | 739+ | Multi-agent, security, enterprise |
| 7 | alirezarezvani/claude-skills | 1200+ | 220+ | 332 CLI tools, full-stack |
| 8 | levnikolaevich/claude-code-skills | 800+ | 129 | Agile pipeline, audit suite |
| 9 | BehiSecc/awesome-claude-skills | 600+ | 80+ | Security: OWASP 2025, ASVS 5.0 |
| 10 | VoltAgent/awesome-agent-skills | 500+ | 100+ | Microsoft, Google, Sentry, Stripe |
| 11 | Jeffallan/claude-skills | 400+ | 66 | Specialist full-stack |
| 12 | daymade/claude-code-skills | 350+ | 43 | i18n, QA, research, product |
| 13 | viktorbezdek/skillstack | 300+ | 47 | Production-grade patterns |
| 14 | obra/superpowers | 250+ | 30+ | Agentic TDD framework |
| 15 | hookdeck/webhook-skills | 200+ | 24 | Webhook integrations |
| 16 | apollographql/skills | 150+ | 15 | Official Apollo GraphQL |
| 17 | better-auth/skills | 150+ | 12 | Auth: 2FA, RBAC, PKCE |
| 18 | getsentry/sentry-agent-skills | 100+ | 8 | Sentry monitoring |
| 19 | elastic/agent-skills | 100+ | 10 | Elastic observability |
| 20 | stripe/ai | 100+ | 6 | Official Stripe payments |

---

## КАТ. 1: REACT & FRONTEND (95)

### Anthropic (official)
- **react-best-practices** — мемоизация, lazy loading, SSR, code splitting, re-render guard
- **frontend-design** — дизайн-система: типографика, цвета, анимации, responsive
- **component-patterns** — compound, render props, HOC, composition, forwarded refs

### GitHub (awesome-copilot)
- **react-modernization** — legacy → hooks, Suspense, concurrent, React 19
- **react-performance** — Profiler API, why-did-you-render, bundle analyzer
- **react-accessibility** — WCAG 2.2 AA, ARIA, focus management, screen readers
- **react-testing-library** — queries, user events, async, custom renders
- **react-state-management** — Zustand vs Jotai vs Redux, миграция
- **react-forms** — React Hook Form, Zod, complex forms
- **react-animation** — Framer Motion, CSS transitions, spring physics
- **react-suspense** — boundaries, ErrorBoundary, fallback UI
- **storybook-design-system** — component library, auto-docs, visual regression

### antigravity (1340+)
- **react-hook-mastery** — custom hooks: composition, testing, DI
- **react-render-optimization** — useMemo/useCallback правильно, когда НЕ мемоизировать
- **react-error-boundaries** — granular recovery, reporting, fallback hierarchy
- **react-context-patterns** — splitting, selector pattern, provider composition
- **react-portal-patterns** — modals, tooltips, dropdowns, z-index
- **react-lazy-loading** — route/component/image splitting
- **react-virtual-lists** — react-window, react-virtuoso, infinite scroll
- **react-drag-drop** — DnD Kit, sortable, file upload
- **react-i18n-patterns** — i18next, ICU, RTL, plural, date/number
- **react-responsive** — container queries, breakpoints, touch vs pointer

### levnikolaevich (129)
- **component-decomposition** — max 400 LOC, single responsibility
- **css-architecture** — Tailwind patterns, @apply, design tokens
- **responsive-design-system** — mobile-first, fluid typography

### alirezarezvani (220+)
- **design-systems** — токены, темизация, варианты, документация
- **ux-research** — персоны, customer journey, юзабилити-тесты
- **prd-writing** — PRD: шаблоны, приоритеты, метрики
- **micro-frontend** — module federation, shared deps

### daymade (43)
- **i18n-expert** — locale parity, missing keys, pluralization, RTL
- **product-analysis** — метрики, retention, funnel, A/B testing
- **competitors-analysis** — feature matrix, SWOT, positioning

---

## КАТ. 2: TYPESCRIPT & КАЧЕСТВО (85)

### Anthropic
- **typescript-strict** — strict mode, no any, discriminated unions, exhaustive
- **code-quality** — cyclomatic complexity, DRY, SOLID, metrics

### GitHub
- **typescript-pro** — generics, conditional types, mapped types, template literals
- **typescript-migration** — JS → TS, gradual typing
- **conventional-commit** — structured messages, changelog

### antigravity
- **ts-utility-types** — Pick, Omit, Record, Exclude + custom
- **ts-type-guards** — narrowing, predicates, assertion functions
- **ts-generics-mastery** — constraints, inference, conditional distribution
- **ts-enums-alternatives** — const objects, discriminated unions
- **ts-error-handling** — Result type, typed errors, exhaustive matching
- **ts-module-patterns** — barrel exports, lazy, circular detection
- **ts-branded-types** — nominal typing, opaque types
- **ts-config-mastery** — tsconfig deep dive, project references
- **ts-path-aliases** — @/ aliases, Vite integration

### alirezarezvani
- **code-review-automation** — AST analysis, anti-pattern detection
- **dead-code-elimination** — tree-shaking, unused exports, orphans
- **dependency-auditor** — CVE scan, licensing

### obra (superpowers)
- **writing-plans** — 2-5 min tasks, файлы + код + верификация
- **subagent-driven-dev** — dispatch → двухфазный review
- **brainstorming** — pre-code design: вопросы, альтернативы
- **self-improving-agent** — оценка → тесты → итерация
- **self-eval** — качество, полнота, корректность

### viktorbezdek (47)
- **code-health-score** — tech debt quantification, hotspot analysis
- **refactoring-patterns** — extract, inline, move, safe transforms
- **complexity-reducer** — McCabe reduction, guard clauses

---

## КАТ. 3: ТЕСТИРОВАНИЕ (80)

### Anthropic
- **test-driven-dev** — Red-Green-Refactor, test-first, mutation testing
- **integration-testing** — API contract testing, database testing

### GitHub
- **ts-testing** — Vitest unit, Testing Library, Playwright E2E
- **webapp-testing** — exploratory, smoke, a11y, e-commerce
- **unit-test-generation** — мультиагентный пайплайн
- **playwright-generate-test** — E2E из описания
- **playwright-explore-website** — навигация + скриншоты

### antigravity
- **vitest-mastery** — snapshots, mocks, spies, timers, concurrent
- **playwright-mastery** — selectors, auto-wait, fixtures, video
- **testing-strategy** — пирамида, coverage targets, when to mock
- **contract-testing** — Pact, schema validation, backward compat
- **load-testing** — k6, Artillery, SLA verification
- **visual-regression** — Percy, Chromatic, pixel diff
- **test-data-factory** — Faker, seeds, cleanup
- **mutation-testing** — Stryker, killed mutants, test strength
- **accessibility-testing** — axe-core, pa11y, keyboard
- **snapshot-testing** — when to use, serializers

### levnikolaevich
- **test-audit-suite** — 7 аудиторов: coverage, isolation, e2e priority
- **webapp-uat** — Playwright + WCAG 2.2 AA + i18n + responsive + triage

---

## КАТ. 4: БЕЗОПАСНОСТЬ (120)

### Anthropic
- **security-review** — OWASP Top 10, code-level vulnerabilities
- **secret-scanning** — API keys, passwords, tokens leak prevention
- **ai-prompt-safety-review** — injection, jailbreak, bias detection

### BehiSecc (80+ security — **лучший security-репо**)
- **owasp-security-2025** — OWASP Top 10:2025, ASVS 5.0, Agentic AI
- **injection-prevention** — SQL, NoSQL, LDAP, OS command, XPath
- **xss-prevention** — stored, reflected, DOM-based, CSP
- **csrf-protection** — token patterns, SameSite, double submit
- **authentication-security** — hashing, session management, MFA
- **authorization-patterns** — RBAC, ABAC, policy engines
- **cryptography-best-practices** — algorithm selection, key rotation
- **api-security** — OAuth 2.0, JWT, rate limiting, CORS
- **input-validation** — allowlists, sanitization, type coercion
- **output-encoding** — context-aware encoding, template escaping
- **file-upload-security** — MIME, path traversal, virus scanning
- **dependency-security** — SCA, Renovate, CVE monitoring
- **supply-chain-security** — SBOM, provenance, signed commits
- **logging-security** — masking, tamper-proof audit trail
- **session-management** — fixation, timeout, concurrent, invalidation
- **cors-security** — origin validation, credentials, preflight
- **csp-builder** — Content-Security-Policy construction
- **subresource-integrity** — SRI hashes for CDN

### GitHub
- **shannon-pentest** — автономный пентест: 96% success, 50+ типов
- **gdpr-compliant** — GDPR: consent, retention, right to erasure
- **agent-governance** — AI safety, trust controls
- **semgrep-sast** — SAST сканирование

### better-auth
- **better-auth-integration** — email/password, OAuth, RBAC
- **better-auth-2fa** — TOTP, SMS, passkeys/WebAuthn
- **better-auth-security** — rate limiting, CSRF, PKCE

---

## КАТ. 5: БАЗА ДАННЫХ & SUPABASE (75)

### Anthropic
- **database-design** — schema, normalization, indexing
- **migration-safety** — additive-only, zero-downtime, rollback

### antigravity
- **postgresql-mastery** — CTEs, window functions, JSONB, FTS
- **postgresql-optimization** — EXPLAIN ANALYZE, index strategy, vacuum
- **postgresql-rls** — Row Level Security patterns, policy composition
- **postgresql-triggers** — event triggers, audit tables, computed
- **postgresql-partitioning** — range, list, hash, maintenance
- **supabase-auth** — auth flows, RLS integration, custom claims
- **supabase-realtime** — channels, broadcast, presence, reconnect
- **supabase-edge-functions** — Deno.serve(), CORS, JWT verification
- **supabase-storage** — bucket policies, transformations, CDN
- **database-monitoring** — pg_stat_statements, slow query, alerts
- **connection-pooling** — PgBouncer, pool sizing, transaction modes
- **database-backup** — pg_dump, WAL archiving, PITR
- **data-modeling** — star, snowflake, graph, document

### alirezarezvani
- **database-designer** — full lifecycle: schema, indexing, replication
- **migration-architect** — strategy, rollback, data integrity

### levnikolaevich
- **sql-code-review** — антипаттерны, N+1, missing indexes
- **sql-optimization** — query plans, materialized views, partial indexes

---

## КАТ. 6: API & BACKEND (90)

### Anthropic
- **api-design** — REST, GraphQL, versioning, pagination, errors
- **edge-function-patterns** — Deno Deploy, cold starts, streaming

### hookdeck (24 webhook skills)
- **webhook-handler-patterns** — idempotency, retry, async, signatures
- **stripe-webhooks** — checkout.session.completed, payments, subscriptions
- **github-webhooks** — push, PR, issues, signature verification
- **sendgrid-webhooks** — bounce, open, click, spam
- **hookdeck-event-gateway** — guaranteed delivery, rate limiting, replay
- **twilio-webhooks** — SMS, voice, status callbacks
- **shopify-webhooks** — orders, products, HMAC verification
- **slack-webhooks** — slash commands, interactive, events API
- **clerk-webhooks** — user, session, organization events
- **resend-webhooks** — email delivery, bounce, complaint

### apollographql (official)
- **graphql-schema-design** — types, naming, pagination, federation
- **apollo-client-react** — caching, local state, optimistic UI
- **graphql-operations** — queries, mutations, fragments
- **graphql-subscriptions** — real-time, connection management

### Jeffallan
- **api-designer** — OpenAPI 3.1, HATEOAS, JWT, RFC 7807
- **websocket-engineer** — WebSockets, Socket.IO, reconnection
- **microservices-architect** — service mesh, event-driven, saga
- **spec-miner** — reverse-engineering спецификаций

### VoltAgent
- **stripe-best-practices** — checkout, subscriptions, webhooks
- **stripe-upgrade** — SDK upgrade, API version migration
- **courier-notifications** — email, SMS, push через Courier

### alirezarezvani
- **api-design-reviewer** — контракты, версионирование, errors
- **api-test-suite-builder** — endpoint coverage, edge cases
- **observability-designer** — logging, метрики, трейсинг
- **incident-commander** — triage, escalation, post-mortem
- **rag-architect** — chunking, embedding, retrieval
- **env-secrets-manager** — vault, rotation, audit

---

## КАТ. 7: DevOps & CI/CD (85)

### Anthropic
- **github-actions** — workflow patterns, matrix, caching
- **docker-best-practices** — multi-stage, layer caching, security

### levnikolaevich
- **project-bootstrap** — Clean Architecture scaffold
- **docker-generator** — Dockerfile + docker-compose + health checks
- **cicd-generator** — GitHub Actions: build, test, deploy, matrix
- **logging-configurator** — structured JSON: Winston, Pino
- **error-handler-setup** — global exception, classification, retry
- **healthcheck-setup** — K8s readiness/liveness probes
- **api-docs-generator** — Swagger/OpenAPI auto-generation

### alirezarezvani
- **ci-cd-builder** — pipeline setup, build automation
- **senior-devops** — CI/CD, containers, monitoring
- **release-manager** — semantic versioning, changelog, rollback
- **changelog-generator** — auto-changelog, conventional commits
- **tech-debt-tracker** — scoring, prioritization, ROI
- **codebase-onboarding** — architecture, getting started
- **runbook-generator** — deployment, incident response, monitoring

### antigravity
- **github-actions-mastery** — custom actions, reusable workflows, OIDC
- **kubernetes-patterns** — deployments, services, HPA, PDB
- **monitoring-stack** — Prometheus, Grafana, alerting
- **secret-management** — Vault, KMS, rotation
- **blue-green-deployment** — zero-downtime, traffic switching
- **canary-deployment** — progressive rollout, metrics-based
- **chaos-engineering** — fault injection, resilience
- **disaster-recovery** — RTO/RPO, backup, failover

### Jeffallan
- **sre-engineer** — SLO/SLA, incident response, capacity
- **chaos-engineer** — fault injection, resilience

---

## КАТ. 8: АРХИТЕКТУРА (70)

### Anthropic
- **architecture-patterns** — clean, hexagonal, CQRS, event sourcing
- **system-design** — distributed systems, CAP, consistency

### GitHub
- **cloud-architecture-patterns** — 42 паттерна: reliability, performance
- **app-workflow-docs** — auto-detection → blueprints
- **architecture-blueprint** — arch docs из кодовой базы
- **adr-creator** — Architecture Decision Records

### levnikolaevich
- **architecture-audit** — patterns, coupling (Ca/Ce/I), contracts
- **agile-pipeline-orchestrator** — scope → stories → tasks → QG
- **multi-agent-validator** — 20 criteria, 8 groups
- **codebase-audit-suite** — 9 parallel auditors

### antigravity
- **clean-architecture** — dependency inversion, use cases
- **hexagonal-architecture** — ports & adapters
- **event-driven-arch** — event bus, CQRS, projections
- **domain-driven-design** — bounded contexts, aggregates
- **modular-monolith** — module boundaries, migration to micro
- **api-gateway-patterns** — rate limiting, auth, routing
- **caching-strategies** — cache-aside, write-through, CDN
- **message-queue-patterns** — pub/sub, dead letter, ordering
- **circuit-breaker** — open/closed/half-open, fallback
- **saga-pattern** — choreography vs orchestration

---

## КАТ. 9: ПРОИЗВОДИТЕЛЬНОСТЬ (65)

### Anthropic
- **performance-profiling** — Chrome DevTools, Lighthouse, React Profiler
- **bundle-optimization** — tree-shaking, code splitting, dynamic imports

### GitHub
- **web-perf-audit** — Core Web Vitals: LCP, CLS, INP
- **code-observability** — OTEL/APM, risky code detection

### levnikolaevich
- **performance-audit** — N+1, transaction scope, blocking IO
- **full-stack-performance-optimizer** — profiling → plan → execute
- **bundle-optimizer** — tree-shaking, splitting, lazy loading
- **dependency-upgrader** — upgrade, breaking changes, audit

### antigravity
- **react-rendering-perf** — reconciliation, fiber, concurrent
- **image-optimization** — WebP/AVIF, responsive, lazy, CDN
- **font-optimization** — subsetting, preloading, swap, variable
- **css-performance** — critical CSS, containment, layers
- **network-optimization** — HTTP/2, preconnect, prefetch, SW
- **memory-leak-detection** — heap snapshots, WeakRef, cleanup
- **animation-performance** — rAF, GPU layers, FLIP
- **database-query-perf** — EXPLAIN, index adviser, cache
- **api-response-optimization** — compression, pagination, fields

---

## КАТ. 10: МОБИЛЬНАЯ РАЗРАБОТКА (50)

### GitHub
- **react-native-best-practices** — performance, native modules, offline
- **app-store-optimization** — ASO: App Store + Play Store

### antigravity
- **capacitor-patterns** — plugin system, native bridge, web view
- **capacitor-push** — FCM/APNs, token management, deep links
- **capacitor-offline** — SQLite, sync strategy, conflict resolution
- **capacitor-camera** — photo/video capture, permissions
- **capacitor-geolocation** — background tracking, geofencing
- **mobile-ux-patterns** — bottom sheets, gestures, haptics, safe areas
- **mobile-performance** — FPS, memory management, startup time
- **mobile-security** — certificate pinning, secure storage, biometrics
- **pwa-patterns** — service worker, cache strategies, install
- **deep-linking** — universal links, app links, deferred
- **mobile-testing** — device clouds, responsive, gestures
- **mobile-ci-cd** — Fastlane, App Center, OTA updates

---

## КАТ. 11: AI & LLM (55)

### Anthropic (official)
- **prompt-engineering** — few-shot, chain-of-thought, system prompts
- **agent-patterns** — ReAct, tool use, multi-step reasoning
- **claude-api-best-practices** — streaming, retries, token management
- **function-calling** — tool definitions, parameter validation

### GitHub
- **copilot-sdk** — agentic apps, tools, MCP
- **agent-customization** — .agent.md, .instructions.md creation

### antigravity
- **embedding-patterns** — OpenAI/Cohere, vector stores, similarity
- **vector-database** — Pinecone, Weaviate, pgvector, hybrid search
- **llm-caching** — semantic cache, dedup, cost optimization
- **llm-evaluation** — BLEU, ROUGE, human eval, A/B
- **ai-safety** — guardrails, output filtering, hallucination
- **multi-agent-orchestration** — handoffs, shared memory, debate
- **tool-use-patterns** — function calling, structured output
- **context-window-management** — summarization, sliding window
- **ai-memory-patterns** — short/long-term, retrieval, forgetting

### daymade
- **deep-research** — multi-source, synthesis, verification
- **fact-checker** — claims, cross-check, confidence
- **prompt-optimizer** — EARS: role, context, examples

---

## КАТ. 12: UX & ДИЗАЙН (45)

### Anthropic
- **ux-heuristics** — Нильсен 10, cognitive walkthrough
- **accessibility-audit** — WCAG 2.2, contrast, focus, screen readers

### GitHub
- **a11y-audit** — WCAG: 4.5:1, focus rings, ARIA, keyboard
- **excalidraw-diagram** — диаграммы из natural language
- **figma-implement-design** — Figma → production code
- **figma-generate-library** — component library из Figma

### antigravity
- **color-system** — HSL-based palettes, dark mode, contrast
- **typography-system** — type scale, line height, responsive
- **spacing-system** — 4px/8px grid, tokens
- **icon-system** — SVG sprites, tree-shaking
- **motion-design** — easing, duration tokens, reduced motion
- **dark-mode** — theme switching, system preference
- **mobile-navigation** — tab bar, drawer, stack, bottom sheet
- **form-ux** — inline validation, error messages, autofill
- **loading-patterns** — skeleton, shimmer, progressive, optimistic
- **empty-states** — illustrations, CTAs, onboarding
- **error-pages** — 404, 500, offline, permission denied
- **onboarding-flows** — tooltips, walkthroughs
- **notification-ux** — toast, banner, badge, sound

---

## КАТ. 13: OBSERVABILITY & SRE (50)

### elastic (official)
- **elastic-observability** — OpenTelemetry, LLM monitoring
- **elastic-apm** — APM, distributed tracing
- **elastic-security** — SIEM, threat detection

### getsentry (official)
- **sentry-find-bugs** — production error analysis
- **sentry-performance** — transaction monitoring
- **sentry-releases** — release health, regression

### antigravity
- **opentelemetry** — traces, metrics, logs, auto-instrumentation
- **prometheus-patterns** — PromQL, recording rules, alerts
- **grafana-dashboards** — panels, variables, alerting
- **log-correlation** — trace ID propagation, structured logging
- **alerting-patterns** — sensitivity, escalation, noise
- **slo-engineering** — error budgets, burn rate
- **incident-management** — on-call, runbooks, post-mortem
- **capacity-planning** — forecasting, load testing, scaling
- **distributed-tracing** — context propagation, sampling
- **health-check-patterns** — liveness, readiness, startup

---

## КАТ. 14: ПЛАТЕЖИ & E-COMMERCE (35)

### Stripe (official)
- **stripe-checkout** — hosted, custom, embedded
- **stripe-subscriptions** — plans, billing, proration, trials
- **stripe-webhooks** — events, idempotency, retry
- **stripe-connect** — marketplace, transfers, onboarding

### antigravity
- **payment-security** — PCI DSS, tokenization, 3D Secure
- **cart-patterns** — add/remove, persistence, merge
- **checkout-flow** — multi-step, address, tax
- **order-management** — status machine, fulfillment, returns
- **inventory-management** — real-time stock, reservations
- **pricing-engine** — discounts, coupons, tiered

---

## КАТ. 15: REAL-TIME & WebSocket (30)

### antigravity
- **websocket-patterns** — lifecycle, heartbeat, reconnect
- **sse-patterns** — Server-Sent Events, retry, last-event-id
- **webrtc-patterns** — signaling, ICE, TURN, media
- **presence-patterns** — online status, typing, last seen
- **real-time-sync** — CRDT, OT, conflict resolution, offline first
- **push-notifications** — FCM, APNs, Web Push, subscription
- **event-streaming** — Kafka, partitioning, consumer groups
- **pub-sub-patterns** — topic routing, fan-out, dead letter
- **live-updates** — polling, long-polling, SSE, WS tradeoffs

---

## КАТ. 16: ДОКУМЕНТАЦИЯ (40)

### Anthropic
- **technical-writing** — architecture docs, API docs, tutorials
- **code-documentation** — JSDoc, README, ADR

### antigravity
- **api-documentation** — OpenAPI 3.1, examples, versioning
- **adr-patterns** — format, status lifecycle, search
- **runbook-writing** — troubleshooting trees, escalation
- **changelog-patterns** — Keep A Changelog, automation
- **readme-patterns** — badges, quick start, FAQ
- **diagram-as-code** — Mermaid, PlantUML, D2

---

## КАТ. 17: ЮРИДИЧЕСКОЕ & COMPLIANCE (25)

- **gdpr-compliant** — consent, retention, right to erasure
- **agent-governance** — AI safety, trust, audit trail
- **privacy-by-design** — data minimization, pseudonymization
- **cookie-consent** — banner, categories, compliance
- **data-retention** — TTL, archival, deletion
- **content-moderation** — automated + manual, appeals

---

## КАТ. 18: ИССЛЕДОВАНИЕ (20)

- **autoresearch** — итеративный исследовательский цикл
- **doublecheck** — 3-слойная верификация
- **structured-planning** — PRD, 3 варианта, risk analysis
- **deep-research** — multi-source synthesis
- **fact-checker** — claims, cross-check, confidence

---

## ИТОГО: 1040+ скиллов

| Категория | Кол-во |
|---|---|
| React & Frontend | 95 |
| TypeScript & Качество | 85 |
| Тестирование | 80 |
| Безопасность | 120 |
| БД & Supabase | 75 |
| API & Backend | 90 |
| DevOps & CI/CD | 85 |
| Архитектура | 70 |
| Производительность | 65 |
| Мобильная разработка | 50 |
| AI & LLM | 55 |
| UX & Дизайн | 45 |
| Observability & SRE | 50 |
| Платежи & E-Commerce | 35 |
| Real-time & WebSocket | 30 |
| Документация | 40 |
| Юридическое | 25 |
| Исследование | 20 |
| **ВСЕГО** | **1040+** |
