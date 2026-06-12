# Сравнительный анализ: Mansoni vs agency-agents

---

## 🔷 Часть 1: Детальное сравнение оркестраторов

### 1.1 Архитектурные паттерны

| Параметр | Mansoni | agency-agents (Agents Orchestrator) |
|----------|---------|-------------------------------------|
| **Подход к агентам** | Единый AI-оркестратор (Mansoni-core) с подчинёнными агентами | Коллекция из 147+ независимых специализированных агентов |
| **Оркестрация** | Ruflo-first orchestration + skills Mansoni | Agents Orchestrator (отдельный агент) |
| **Декомпозиция** | Mansoni декомпозирует → делегирует через Agent tool | Агент-оркестр управляет Dev-QA циклом task-by-task |
| **Pipeline** | 5-фазный (mansoni-researcher → architect → coder → reviewer → commit) | 4-фазы (PM → Architect → Dev↔QA Loop → Integration) |
| **Quality Gates** | tsc --noEmit → mansoni-reviewer (8 направлений) | EvidenceQA → testing-reality-checker |

---

## 🔷 Часть 2: Детальное сравнение возможностей оркестраторов

### 2.1 Workflow Phases (Фазы рабочего процесса)

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                         MANSONI ORCHESTRATOR                               ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  Фаза 0: Инициализация                                                     ║
║    → Декомпозиция задачи на атомарные шаги                                 ║
║    → Проверка существующего кода (есть ли аналог)                          ║
║                                                                           ║
║  Фаза 1: Исследование (mansoni-researcher)                                ║
║    → Анализ модулей, паттернов, зависимостей                              ║
║    → Поиск существующих решений                                            ║
║                                                                           ║
║  Фаза 2: Архитектура (mansoni-architect)                                  ║
║    → Модели данных, API, UI состояния, edge cases                         ║
║    → Техническая спецификация                                              ║
║                                                                           ║
║  Фаза 3: Реализация (mansoni-coder → codesmith-*)                         ║
║    → Полная реализация кода                                                ║
║    → Типизация, тесты, интеграции                                          ║
║                                                                           ║
║  Фаза 4: Верификация                                                       ║
║    → tsc --noEmit → 0 ошибок                                              ║
║    → mansoni-reviewer: аудит по 8 направлениям                            ║
║    → Цикл fix-review до PASS (макс 3 итерации)                            ║
║    → Коммит                                                               ║
╚═══════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════╗
║                    AGENTS ORCHESTRATOR (agency-agents)                     ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  Phase 1: Project Analysis & Planning                                      ║
║    → Verify project-specs/[project]-setup.md                              ║
║    → Spawn project-manager-senior → task list                              ║
║    → project-tasks/[project]-tasklist.md                                  ║
║                                                                           ║
║  Phase 2: Technical Architecture                                          ║
║    → Spawn ArchitectUX → foundation                                        ║
║    → css/, project-docs/[project]-architecture.md                         ║
║                                                                           ║
║  Phase 3: Development-QA Continuous Loop                                   ║
║    → Для КАЖДОЙ задачи:                                                    ║
║      [Developer Agent → EvidenceQA → PASS/FAIL]                           ║
║      ↓ FAIL: loop back (max 3 retry)                                      ║
║      ↓ PASS: next task                                                    ║
║                                                                           ║
║  Phase 4: Final Integration & Validation                                   ║
║    → testing-reality-checker → final check                                ║
║    → Production readiness assessment                                      ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

---

### 2.2 Decision Logic (Логика принятия решений)

| Аспект | Mansoni | Agents Orchestrator |
|--------|---------|---------------------|
| **Task routing** | На основе типа задачи (фича/баг/рефакторинг/аудит) | На основе task list из project-manager |
| **Agent selection** | Predefined: researcher → architect → coder → reviewer | Динамический: Frontend Dev / Backend Arch / Senior Dev по типу задачи |
| **Validation** | tsc + 8-direction review | Screenshot evidence (EvidenceQA) + pass/fail |
| **Retry logic** | Цикл fix-review до PASS (max 3 итерации) | Task-by-task retry (max 3 attempts) |
| **Escalation** | Эскалация только: git push, удаление таблиц, credentials | Escalate after 3 failed attempts with detailed report |

---

### 2.3 Quality Gates (Контроль качества)

```
MANSONI QUALITY GATES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Тип: Статический анализ + Review
   • tsc --noEmit → 0 ошибок (строгий TypeScript)
   • 8 направлений review:
     1. Architecture (DDD, паттерны)
     2. Security (RLS, auth, XSS)
     3. Performance (bundle, render)
     4. Accessibility (ARIA, keyboard)
     5. i18n (строки, форматирование)
     6. Error handling (try/catch, fallbacks)
     7. Testing (покрытие, мутации)
     8. Code style (чистота, консистентность)

✅ Критерий PASS:
   • tsc: 0 ошибок
   • review: < 3 critical issues
   • Задача считается завершённой после review

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AGENTS ORCHESTRATOR QUALITY GATES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Тип: Evidence-based + Visual validation
   • EvidenceQA требует скриншот-доказательства
   • testing-reality-checker: финальная проверка
   • Default to "NEEDS WORK" без явных доказательств

✅ Критерий PASS:
   • QA agent выдал PASS с evidence
   • Все задачи прошли QA валидацию
   • Финальная интеграция прошла

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

СРАВНЕНИЕ:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
| Критерий           | Mansoni           | Agents Orchestrator         |
|--------------------|-------------------|----------------------------|
| Автоматизация      | tsc (полностью)   | Частичная (QA agent needs) |
| Coverage           | 8 направлений     | Task-by-task               |
| Evidence           | Code + type check | Screenshot proof           |
| Speed              | Быстро (30 сек)   | Медленнее (QA cycles)      |
| Strictness         | Очень высокая     | Средняя (visual based)     |
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### 2.4 Error Handling & Recovery (Обработка ошибок)

| Параметр | Mansoni | Agents Orchestrator |
|----------|---------|---------------------|
| **Agent spawn failures** | Retry с улучшенным контекстом | Retry up to 2 times, then escalate |
| **Task failures** | fix-review loop (max 3) | Retry with QA feedback (max 3) |
| **Validation failures** | Reviewer даёт feedback → исправление | EvidenceQA даёт feedback → loop back |
| **Recovery** | Self-correction через 5 WHY | Pattern recognition из QA feedback |
| **Escalation trigger** | 3+ failed iterations | 3 failed attempts per task |

---

### 2.5 Status Reporting (Отчётность)

```
MANSONI STATUS FORMAT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANSONI | Задача: {описание}
Тип: {фича | баг | рефакторинг | вопрос | аудит}
Модуль: {мессенджер | соцсеть | такси | ...}
План:
  1. {шаг} → {агент/инструмент}
  2. ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AGENTS ORCHESTRATOR STATUS TEMPLATE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# WorkflowOrchestrator Status Report

## 🚀 Pipeline Progress
**Current Phase**: [PM/ArchitectUX/DevQALoop/Integration/Complete]
**Project**: [project-name]
**Started**: [timestamp]

## 📊 Task Completion Status
**Total Tasks**: [X] | **Completed**: [Y] | **Current Task**: [Z]

## 🔄 Dev-QA Loop Status
**Current Task Attempts**: [1/3] | **Last QA Feedback**: "[feedback]"
**Next Action**: [spawn dev/spawn qa/advance/escalate]

## 📈 Quality Metrics
**Tasks Passed First Attempt**: [X/Y] | **Avg Retries**: [N]

## 🎯 Next Steps
**Immediate**: [action] | **Estimated**: [time] | **Blockers**: [list]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

КЛЮЧЕВОЕ ОТЛИЧИЕ:
• Mansoni: Фокус на структурированный план с агентами
• Orchestrator: Детальный трекинг прогресса + метрики качества
```

---

### 2.6 Available Agents Pool (Доступные агенты)

| Категория | Mansoni (в проекте) | Agents Orchestrator (147+) |
|-----------|-------------------|---------------------------|
| **Research** | mansoni-researcher | product-trend-researcher, UX Researcher |
| **Architecture** | mansoni-architect | ArchitectUX, Software Architect |
| **Development** | mansoni-coder + codesmith-* | Frontend Dev, Backend Arch, Senior Dev, AI Engineer |
| **Review** | mansoni-reviewer (8 направлений) | Code Reviewer, testing-reality-checker, EvidenceQA |
| **Debug** | mansoni-debugger | — |
| **Security** | mansoni-security-engineer | Security Engineer, Threat Detection Engineer |
| **Testing** | — | EvidenceQA, API Tester, Performance Benchmarker |
| **Operations** | — | DevOps Automator, Infrastructure Maintainer |
| **Product** | — | Sprint Prioritizer, Feedback Synthesizer |
| **Design** | — | UI Designer, Brand Guardian, Whimsy Injector |
| **Specialized** | — | MCP Builder, Database Optimizer, 40+ других |

---

### 2.7 Memory & Learning (Память и обучение)

| Параметр | Mansoni | Agents Orchestrator |
|----------|---------|---------------------|
| **Memory location** | /memories/repo/ — traps, bugs, decisions | Agent memory в каждом агенте |
| **Root cause** | 5 WHY для deep analysis | QA feedback pattern analysis |
| **Session** | /memories/session/ — checkpoints | Pattern recognition: bottlenecks, optimal strategies |
| **Context preservation** | Через Agent tool + state | Context-aware agent spawning |

---

### 2.8 Communication Style (Стиль коммуникации)

```
MANSONI:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Systematic: "Фаза 1 завершена, перехожу к архитектуре"
• Evidence-based: "Вердикт подкреплён файлом:строкой"
• Decision-focused: "Принимаю решение X → выполняю Y"
• Format: Структурированный план с агентами

AGENTS ORCHESTRATOR:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Progress tracking: "Task 3 of 8 failed QA (attempt 2/3)"
• Metrics-driven: "Pipeline 75% complete, 2 tasks remaining"
• Loop-aware: "Looping back to dev with feedback"
• Format: Детальный статус-отчёт + метрики
```

---

### 2.9 Advanced Capabilities (Продвинутые возможности)

| Возможность | Mansoni | Agents Orchestrator |
|-------------|---------|---------------------|
| **ReAct reasoning** | cognitive_agent.py: Plan→Execute→Reflect→Validate | Quality trend analysis |
| **DAG building** | dag_builder.py — граф зависимостей | Task list → workflow graph |
| **Message bus** | message_bus.py — pub/sub | Agent handoffs с контекстом |
| **Watchdog** | 6 детекторов патологий | QA pattern detection |
| **Intelligent retry** | Через fix-review цикл | Learn from QA feedback patterns |
| **Context-aware spawning** | Да (через Agent tool) | Да (Include specific feedback) |

---

## 🔷 Часть 3: Сравнение по ключевым параметрам

| Параметр | Mansoni | agency-agents |
|----------|---------|---------------|
| **Frontend** | React 18 + TypeScript strict + Vite + TailwindCSS + Capacitor | Не определён (зависит от агента) |
| **State** | TanStack Query + Zustand | Не определён |
| **Backend** | Supabase (PostgreSQL + RLS + Edge Functions + Realtime) | Не определён |
| **AI Engine** | Python (ai_engine/) — ReAct agent, TaskPlanner, Orchestrator, Memory Manager | Зависит от AI Engineer агента |
| **ML Stack** | — | TensorFlow, PyTorch, Scikit-learn, HuggingFace, OpenAI API |

---

## 3. Модульная структура

### Mansoni — Super Platform (10 модулей)
| Модуль | Аналог | Функционал |
|--------|--------|------------|
| Мессенджер | Telegram, Signal | Чат, звонки (E2EE) |
| Соцсеть/Reels | Instagram, TikTok | Лента, короткие видео |
| Знакомства | Tinder, Bumble | Люди поблизости |
| Такси | Uber, Bolt | Маршрутизация, заказы |
| Маркетплейс | Wildberries, Ozon | Товары, магазин |
| CRM | AmoCRM | Управление клиентами |
| Стриминг | YouTube Live | Live-трансляции |
| Недвижимость | ЦИАН | Объекты недвижимости |
| Страхование | InsSmart | Сравнение страховок |
| E2EE Звонки | Signal | Зашифрованные вызовы |

### agency-agents — 16+ Дивизий
| Дивизия | Количество агентов |
|---------|-------------------|
| Engineering | 21 |
| Marketing | 30+ |
| Specialized | 40+ |
| Sales | 9 |
| Design | 7 |
| Paid Media | 7 |
| Product | 6 |
| Project Management | 7 |
| Testing | 8 |
| Support | 6 |
| Spatial Computing | 6 |

---

## 🔷 Часть 5: Детальный анализ Skills/Agents

### 5.1 Mansoni Skills (в проекте)

```
.mansoni/.claude/skills/ — 7 основных навыков
```

| Skill | Описание | Ключевые возможности |
|-------|----------|---------------------|
| **verification-quality** | Truth scoring, verification, auto-rollback | Truth Score 0.0-1.0, 8 verification criteria, auto-rollback, dashboard |
| **swarm-orchestration** | Multi-agent coordination | Mesh/Hierarchical/Adaptive topology, load balancing, fault tolerance |
| **pair-programming** | AI pair programming | Driver/Navigator/Switch/TDD/Review/Mentor/Debug modes, real-time verification |
| **skill-builder** | Создание новых скиллов | YAML frontmatter, progressive disclosure, templates |
| **stream-chain** | Потоковая обработка данных | Stream processing, chaining |
| **sparc-methodology** | Методология SPARC | Structured problem analysis |
| **swarm-advanced** | Расширенная оркестрация | Advanced swarm patterns |

```
.mansoni/.kilo/skills/ — 3 навыка
```

| Skill | Описание |
|-------|----------|
| **dev-browser-hidden** | Работа со скрытым браузером |
| **image-enhancer** | Улучшение изображений |
| **domain-name-brainstormer** | Генерация доменных имён |

```
.mansoni/.github/skills/ — 70+ специализированных навыков
```

**Security**: zero-trust-audit, e2ee-audit, vulnerable-component-detector, xss-scanner, csrf-protection-audit, clickjacking-prevention, csp-header-generator, cors-policy-auditor, broken-access-control-audit, authentication-failure-audit, cryptographic-failures-audit, business-logic-vulnerability, deserialization-scanner, agentic-ai-security, threat-modeling

**Database**: database-migration-planner, database-backup-strategy, connection-pool-optimizer, dbt, dbt-migration, data-archival

**Performance**: core-web-vitals-optimizer, bundle-analyzer, caching-strategy, websocket-scaling, virtual-scroll-optimizer, web-worker-patterns

**Architecture**: zustand-architecture, cqrs-pattern-builder, event-sourcing-architect, circuit-breaker, api-rate-limiter, distributed-lock

**Frontend**: form-builder-patterns, component-library-builder, design-token-generator, css-animation-patterns, data-visualization, web-design-guidelines, figma-implement-design, frontend-design

**Testing**: webapp-testing, browser-test-engineer, angular-testing

**Angular**: angular-component, angular-di, angular-directives, angular-forms, angular-http, angular-routing, angular-signals, angular-ssr, angular-tooling

**DevOps**: vercel-deploy, vercel-composition-patterns, webhook-patterns

**Content**: content-research-writer, changelog-generator, doc-writer, competitive-ads-extractor, youtube-downloader

**Other**: code-review, code-humanizer, code-simplifier, completion-checker, coherence-checker, audit-log-generator, compliance-reporter, api-versioning, file-upload-pipeline, file-upload-security, font-loading-strategy, file-organizer, theme-factory, create-pull-request, artifact-builder, agent-mastery, agent-md-refactor

---

### 5.2 Agency-agents Agents (147+ агентов)

| Дивизия | Количество | Ключевые агенты |
|---------|-----------|-----------------|
| **Engineering** | 21 | Frontend Developer, Backend Architect, Mobile App Builder, AI Engineer, DevOps Automator, Security Engineer, Database Optimizer, Code Reviewer, SRE, Embedded Firmware Engineer, Solidity Engineer |
| **Design** | 7 | UI Designer, UX Researcher, Brand Guardian, Whimsy Injector, Visual Storyteller |
| **Marketing** | 30+ | Growth Hacker, Content Creator, Twitter Engager, TikTok Strategist, SEO Specialist, China Market (Douyin, Xiaohongshu, WeChat) |
| **Sales** | 9 | Outbound Strategist, Discovery Coach, Deal Strategist, Sales Engineer, Pipeline Analyst |
| **Paid Media** | 7 | PPC Campaign Strategist, Search Query Analyst, Paid Media Auditor, Tracking Specialist |
| **Product** | 6 | Sprint Prioritizer, Trend Researcher, Feedback Synthesizer, Behavioral Nudge Engine |
| **Project Management** | 7 | Studio Producer, Project Shepherd, Experiment Tracker, Jira Workflow Steward |
| **Testing** | 8 | EvidenceQA, Reality Checker, Performance Benchmarker, API Tester, Accessibility Auditor |
| **Support** | 6 | Support Responder, Analytics Reporter, Finance Tracker, Legal Compliance Checker |
| **Spatial Computing** | 6 | XR Interface Architect, Vision Pro Engineer, WebXR Developer |
| **Specialized** | 40+ | **Agents Orchestrator**, **MCP Builder**, Blockchain Security Auditor, Compliance Auditor, ZK Steward, Salesforce Architect |

---

### 5.3 Сравнение по ключевым capability

```
╔═══════════════════════════════════════════════════════════════════════════════════╗
║                           SKILL CAPABILITY MATRIX                                 ║
╠════════════════════╦═══════════════════════════════════╦════════════════════════╣
║   CAPABILITY       ║           MANSONI                  ║     AGENCY-AGENTS       ║
╠════════════════════╬═══════════════════════════════════╬════════════════════════╣
║ QUALITY ASSURANCE  ║                                   ║                         ║
║ ─────────────────  ║                                   ║                         ║
║ • Truth Scoring   ║ ✅ verification-quality            ║ EvidenceQA (visual)    ║
║ • Auto-Rollback   ║ ✅ truth ≥ 0.95 threshold          ║ ✅ testing-reality-check║
║ • Code Review     ║ ✅ 8 directions review            ║ ✅ Code Reviewer        ║
║ • Security Scan   ║ ✅ 15+ security skills            ║ ✅ Security Engineer    ║
║ • Performance     ║ ✅ core-web-vitals-optimizer      ║ ✅ Performance Benchmark║
║ • Testing         ║ ✅ browser-test-engineer           ║ ✅ API Tester, EvidenceQA║
╠════════════════════╬═══════════════════════════════════╬════════════════════════╣
║ MULTI-AGENT        ║                                   ║                         ║
║ ─────────────────  ║                                   ║                         ║
║ • Orchestration   ║ ✅ swarm-orchestration            ║ ✅ Agents Orchestrator  ║
║ • Topology        ║ ✅ mesh/hierarchical/adaptive     ║ task-by-task loop       ║
║ • Load Balancing  ║ ✅ dynamic metrics                ║ implied                 ║
║ • Fault Tolerance ║ ✅ retry with backoff             ║ ✅ 3 retry max          ║
║ • Memory Sharing ║ ✅ swarm.memory.store/retrieve    ║ context preservation    ║
╠════════════════════╬═══════════════════════════════════╬════════════════════════╣
║ PAIR PROGRAMMING   ║                                   ║                         ║
║ ─────────────────  ║                                   ║                         ║
║ • Driver Mode     ║ ✅ pair-programming               ║ N/A                     ║
║ • Navigator Mode  ║ ✅                                 ║ N/A                     ║
║ • TDD Mode        ║ ✅                                 ║ N/A                     ║
║ • Switch Mode     ║ ✅ auto-switch (configurable)     ║ N/A                     ║
║ • Mentor Mode     ║ ✅ learning-focused               ║ N/A                     ║
║ • Debug Mode      ║ ✅                                 ║ N/A                     ║
╠════════════════════╬═══════════════════════════════════╬════════════════════════╣
║ SKILL BUILDING     ║                                   ║                         ║
║ ─────────────────  ║                                   ║                         ║
║ • YAML Frontmatter║ ✅ skill-builder                  ║ ✅ Agent definition     ║
║ • Templates       ║ ✅ 3 template types               ║ ✅ Agent template      ║
║ • Validation     ║ ✅ verification checklist          ║ Agent spec format      ║
╠════════════════════╬═══════════════════════════════════╬════════════════════════╣
║ SPECIALIZED DOMAINS║                                   ║                         ║
║ ─────────────────  ║                                   ║                         ║
║ • Database        ║ ✅ dbt, migration, backup         ║ ✅ Database Optimizer  ║
║ • Security        ║ ✅ 15+ security skills            ║ ✅ Security Engineer   ║
║ • Frontend        ║ ✅ 30+ frontend skills            ║ ✅ Frontend Developer  ║
║ • DevOps          ║ ✅ vercel, webhook patterns       ║ ✅ DevOps Automator    ║
║ • ML/AI           ║ N/A                               ║ ✅ AI Engineer         ║
║ • Blockchain      ║ N/A                               ║ ✅ Solidity Engineer   ║
║ • MCP Servers     ║ N/A                               ║ ✅ MCP Builder         ║
║ • China Market    ║ N/A                               ║ ✅ 8+ China agents     ║
║ • Spatial         ║ N/A                               ║ ✅ Vision Pro, WebXR   ║
╠════════════════════╬═══════════════════════════════════╬════════════════════════╣
║ VERIFICATION       ║                                   ║                         ║
║ ─────────────────  ║                                   ║                         ║
║ • Type Checking   ║ ✅ tsc --noEmit                   ║ N/A (external)         ║
║ • Visual QA       ║ N/A                               ║ ✅ EvidenceQA          ║
║ • Integration     ║ ✅ CI/CD integration              ║ ✅ test-reality-check  ║
║ • Metrics         ║ ✅ dashboard + trends             ║ ✅ status templates    ║
╠════════════════════╬═══════════════════════════════════╬════════════════════════╣
║ SUMMARY            ║                                   ║                         ║
║ ─────────────────  ║                                   ║                         ║
║ Total Skills/Agents║ ~80+ (70 project + 7 core)       ║ 147+                   ║
║ Coverage           ║ Full-stack, Security, DevOps     ║ Wide, но fragmentary   ║
║ Integration        ║ Deep (в проект)                   ║ External (reference)   ║
╚════════════════════╩═══════════════════════════════════╩════════════════════════╝
```

---

### 5.4 Перекрёстные capabilities (одинаковые скиллы/агенты)

| Категория | Mansoni Skill | Agency-agents Agent |
|-----------|---------------|---------------------|
| **Quality Assurance** | verification-quality | EvidenceQA, testing-reality-checker |
| **Multi-agent Orchestration** | swarm-orchestration | Agents Orchestrator |
| **Code Review** | code-review | Code Reviewer |
| **Security Audit** | zero-trust-audit, e2ee-audit, xss-scanner | Security Engineer, Threat Detection Engineer |
| **Database** | connection-pool-optimizer, dbt | Database Optimizer |
| **Performance** | core-web-vitals-optimizer, bundle-analyzer | Performance Benchmarker |
| **Testing** | browser-test-engineer, webapp-testing | API Tester, EvidenceQA |
| **DevOps** | vercel-deploy, webhook-patterns | DevOps Automator |
| **Frontend** | 30+ frontend skills | Frontend Developer |
| **Backend** | — | Backend Architect |
| **Security (широко)** | 15+ security skills | Security Engineer |

### 5.5 Ключевые отличия (skills/agents)

| Аспект | Mansoni | agency-agents |
|--------|---------|---------------|
| **Модель** | Один супер-агент (multi-domain) | Рой из 147+ специализированных агентов |
| **Специализация** | 10 модулей в одном агенте | Каждый агент — эксперт в одной области |
| **Управление** | 1 оркестратор | Требуется выбирать правильного агента под задачу |
| **Quality Gates** | tsc + 8-direction review | Evidence-based (visual QA) |
| **Скорость** | Быстро (часто ~30 сек на микро-шаг) | Медленнее из-за QA циклов |

---

## 6. Память и обучение

| Параметр | Mansoni | agency-agents |
|----------|---------|---------------|
| **Memory** | /memories/repo/ — traps, bugs, decisions, patterns | Agent memory в каждом агенте |
| **Context** | 5 WHY для root cause analysis | Learn from QA feedback patterns |
| **Session** | /memories/session/ — checkpoints, audit | Pattern recognition в оркестраторе |

---

## 7. Ключевые отличия

| Аспект | Mansoni | agency-agents |
|--------|---------|---------------|
| **Модель** | Один супер-агент с доменной экспертизой | Рой специализированных агентов |
| **Специализация** | Multi-domain (10 модулей в одном) | Mono-domain (каждый агент — эксперт в одной области) |
| **Гибкость** | Высокая (один агент может всё) | Высокая (нужный агент для конкретной задачи) |
| **Сложность** | Проще в управлении (1 оркестратор) | Сложнее (нужно выбирать правильного агента) |
| **Интеграция** | Встроенная (Supabase, React, Python) | Внешняя (подключается к Claude Code, Copilot, и т.д.) |

---

## 🔷 Часть 4: Итоговый анализ и рекомендации

### 4.1 Ключевые отличия

| Аспект | Mansoni | Agents Orchestrator |
|--------|---------|---------------------|
| **Модель** | Один супер-агент с доменной экспертизой | Рой специализированных агентов |
| **Специализация** | Multi-domain (10 модулей в одном) | Mono-domain (каждый агент — эксперт в одной области) |
| **Гибкость** | Высокая (один агент может всё) | Высокая (нужный агент для конкретной задачи) |
| **Сложность** | Проще в управлении (1 оркестратор) | Сложнее (нужно выбирать правильного агента) |
| **Интеграция** | Встроенная (Supabase, React, Python) | Внешняя (подключается к Claude Code, Copilot) |

---

### 4.2 Итоговая оценка

| Критерий | Mansoni | agency-agents |
|----------|---------|---------------|
| **Производительность в одном проекте** | ⭐⭐⭐⭐⭐ (единая точка входа) | ⭐⭐⭐ (нужен правильный агент) |
| **Глубина экспертизы** | ⭐⭐⭐ (универсал) | ⭐⭐⭐⭐⭐ (145+ экспертов) |
| **Автономия** | ⭐⭐⭐⭐⭐ (полная) | ⭐⭐⭐⭐ (оркестр управляет) |
| **Качество кода** | ⭐⭐⭐⭐⭐ (7 законов + 10 правил) | ⭐⭐⭐⭐ (production-ready agents) |
| **Масштабируемость** | ⭐⭐⭐ (10 модулей) | ⭐⭐⭐⭐⭐ (147+ агентов) |
| **Контроль качества** | ⭐⭐⭐⭐⭐ (автоматический tsc + 8-dir review) | ⭐⭐⭐⭐ (QA-driven с evidence) |
| **Скорость** | ⭐⭐⭐⭐⭐ (быстрые переходы) | ⭐⭐⭐ (медленнее из-за QA циклов) |
| **Гибкость выбора агентов** | ⭐⭐⭐ (predefined routes) | ⭐⭐⭐⭐⭐ (динамический выбор) |

---

### 4.3 Рекомендация

**Для действующего Mansoni проекта**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ТЕКУЩАЯ МОДЕЛЬ (работает) → НЕ ЛОМАТЬ                                      │
│                                                                             │
│  + agency-agents = РАСШИРЕНИЕ, не замена                                    │
│                                                                             │
│  ├── Использовать для:                                                      │
│  │   ├── Внешние аудиты (security, performance)                            │
│  │   ├── Deep expertise (ML, blockchain, DB optimization)                 │
│  │   ├── Quick validation (EvidenceQA pattern для UI тестов)              │
│  │   └── Специализированные задачи (MCP Builder, Threat Detection)       │
│  │                                                                        │
│  └── Mansoni остаётся главным оркестратором                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Как безопасно внедрить

| Этап | Действие | Безопасность |
|------|----------|--------------|
| **1. Параллельный** | Скопировать roster как reference | ✅ Безопасно |
| **2. Fallback** | Добавить fallback в Mansoni | ⚠️ Тестировать на low-risk |
| **3. QA Loop** | Интегрировать EvidenceQA чек | ⚠️ Опционально |
| **4. Замена** | Заменить компонент | ❌ Не рекомендуется |

---

### 4.5 Гибридная модель (рекомендуемая)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Mansoni (Главный Оркестратор)                       │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  5-фазный пайплайн: Research → Architect → Coder → Review → Commit   │  │
│  │  7 железных законов + tsc + 8-dir review                             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                         +---------+---------+                              │
│                         │                   │                              │
│                         ▼                   ▼                              │
│              ┌──────────────────┐  ┌──────────────────┐                  │
│              │ Mansoni Agents    │  │ agency-agents    │                  │
│              │ (в проекте)       │  │ Roster (ref)     │                  │
│              │ • codesmith-react │  │ • AI Engineer   │                  │
│              │ • codesmith-supabase │ • DB Optimizer  │                  │
│              │ • mansoni-debugger│  │ • Security Eng  │                  │
│              │ • и др.          │  │ • и 140+ других │                  │
│              └──────────────────┘  └──────────────────┘                  │
│                                    │                                        │
│                         Использовать для:                                  │
│                         • Сложные задачи (ML, Security)                   │
│                         • Внешний аудит                                    │
│                         • Узкая специализация                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.6 Включить mansoni-agent

Для боевого контура рекомендуется явно включить `mansoni-agent` как единую входную точку маршрутизации:

1. `mansoni-agent` принимает все входящие задачи и выполняет первичную классификацию.
2. Стандартные задачи остаются во внутреннем пайплайне Mansoni (research → architect → coder → reviewer).
3. Узкоспециализированные задачи делегируются во внешний roster agency-agents как вызов внешнего эксперта.
4. Финальный контроль качества и решение о merge остаются за `mansoni-agent`.

Минимальное правило маршрутизации:

| Тип задачи | Исполнитель по умолчанию | Эскалация |
|------------|---------------------------|-----------|
| Feature/Bug/Refactor в текущем домене | mansoni-agent | Только при 2+ неуспешных итерациях |
| Security/Performance external audit | agency-agents specialist | Вернуть результат в mansoni-agent для финального вердикта |
| ML/Blockchain/MCP deep task | agency-agents specialist | Обязательная обратная валидация через mansoni-agent |

---

**Файл**: `mansoni/docs/comparison/MANSONI_VS_AGENCY_AGENTS.md`