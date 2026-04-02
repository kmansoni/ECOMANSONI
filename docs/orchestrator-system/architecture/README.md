# Архитектура системы оркестрации (System Architecture)

> Детальное описание архитектуры по модели C4, архитектурных паттернов, модели развёртывания, потоков данных и механизмов отказоустойчивости.

---

## Содержание

- [C4 Model — уровень Context](#c4-model--уровень-context)
- [C4 Model — уровень Container](#c4-model--уровень-container)
- [C4 Model — уровень Component](#c4-model--уровень-component)
- [Архитектурные паттерны](#архитектурные-паттерны)
- [Модель развёртывания](#модель-развёртывания)
- [Потоки данных](#потоки-данных)
- [Модель конкурентности](#модель-конкурентности)
- [Масштабируемость](#масштабируемость)
- [Отказоустойчивость](#отказоустойчивость)

---

## C4 Model — уровень Context

Система в максимально широком окружении: пользователи и внешние системы.

```mermaid
C4Context
    title Orchestration System — Context Level

    Person(dev, "Разработчик", "Основной пользователь. Ставит задачи через VS Code, CLI или голос.")
    Person(admin, "Администратор платформы", "Управляет системой, мониторит SLO, настраивает агентов.")

    System_Boundary(sys, "Orchestration Platform") {
        System(orch, "Orchestration System", "Когнитивный оркестратор. Принимает задачи, координирует рой агентов, персистентная память, синтез результатов.")
    }

    System_Ext(vscode, "VS Code IDE", "Среда разработки. Расширение обеспечивает чтение/запись файлов, интегрированный терминал, Language Server Protocol.")
    System_Ext(github, "GitHub / GitLab", "Платформы контроля версий. Исследование репозиториев, анализ истории коммитов, работа с Pull Requests.")
    System_Ext(riva, "NVIDIA Riva", "Speech AI Platform. ASR (Automatic Speech Recognition) и TTS (Text-to-Speech) для голосового интерфейса ARIA.")
    System_Ext(mcp, "MCP Серверы", "Model Context Protocol. Стандартизированные серверы инструментов: браузер, БД, файловая система, внешние API.")
    System_Ext(llm, "LLM Providers", "Языковые модели: OpenAI GPT-4o, Anthropic Claude, локальные модели через Ollama. Исполнение агентных рассуждений.")
    System_Ext(telemetry, "Observability Stack", "Prometheus, Grafana, Jaeger. Метрики, трассировки, алерты.")

    Rel(dev, orch, "Задачи, уточнения, обратная связь", "Extension API / gRPC / WebSocket")
    Rel(admin, orch, "Конфигурация, мониторинг, управление агентами", "Admin REST API")
    Rel(orch, vscode, "Чтение/запись файлов, выполнение команд", "VS Code Extension API")
    Rel(orch, github, "Клонирование, поиск, анализ кода", "REST API v4 / Git protocol")
    Rel(orch, riva, "ASR/TTS запросы", "gRPC streaming")
    Rel(orch, mcp, "Вызов инструментов", "JSON-RPC 2.0 / MCP Protocol")
    Rel(orch, llm, "Inference запросы", "OpenAI-compatible REST API")
    Rel(orch, telemetry, "Метрики, трейсы, логи", "OTLP gRPC")
```

---

## C4 Model — уровень Container

Внутренние контейнеры системы и их взаимодействие.

```mermaid
C4Container
    title Orchestration System — Container Level

    Person(dev, "Разработчик")

    System_Boundary(platform, "Orchestration Platform") {

        Container(gateway, "API Gateway", "Node.js / Fastify", "Единая точка входа. Аутентификация, rate limiting, маршрутизация к сервисам.")
        Container(orch_core, "Orchestrator Core", "Python / asyncio", "Главный координатор. Декомпозиция задач, построение DAG, управление жизненным циклом агентов.")
        Container(agent_pool, "Agent Swarm Pool", "Python / asyncio", "Пул специализированных агентов: Code Analyst, Test Writer, Researcher, Synthesizer, Terminal Executor и другие.")
        Container(memory_mgr, "Memory Manager", "Python", "Управление трёхуровневой памятью: Working → Episodic → Semantic. Приоритизация контекста.")
        Container(research_engine, "Research Engine", "Python", "Исследование кодовых баз, индексация репозиториев, семантический поиск по коду.")
        Container(terminal_exec, "Terminal Executor", "Node.js", "Sandbox-выполнение команд, управление процессами, потоковый вывод.")
        Container(vscode_ext, "VS Code Extension", "TypeScript", "Расширение IDE. Мост между оркестратором и файловой системой/терминалом VS Code.")
        Container(aria_core, "ARIA Core", "Python", "Голосовой интерфейс. NLU pipeline, диалоговый менеджер, интеграция с NVIDIA Riva.")
        Container(message_bus, "Message Bus", "Redis Streams", "Асинхронный транспорт сообщений между компонентами. Гарантированная доставка, consumer groups.")
        Container(vector_store, "Vector Store", "Qdrant", "Хранилище векторных эмбеддингов. Семантический поиск по кодовой базе и истории сессий.")
        Container(persistent_db, "Persistent DB", "PostgreSQL", "Реляционное хранилище: задачи, агенты, сессии, события, конфигурация.")
        Container(cache, "Cache Layer", "Redis", "Кэш рабочей памяти, сессий, лимитов rate limiting.")
    }

    System_Ext(llm, "LLM Providers")
    System_Ext(mcp, "MCP Серверы")
    System_Ext(vscode, "VS Code IDE")

    Rel(dev, gateway, "HTTPS / WebSocket")
    Rel(gateway, orch_core, "gRPC")
    Rel(orch_core, message_bus, "Publish задачи агентам", "Redis Streams")
    Rel(message_bus, agent_pool, "Consume задачи", "Redis Streams")
    Rel(agent_pool, memory_mgr, "Запрос/запись контекста", "gRPC")
    Rel(agent_pool, llm, "Inference", "HTTPS")
    Rel(agent_pool, mcp, "Вызов инструментов", "JSON-RPC")
    Rel(memory_mgr, vector_store, "Векторный поиск/запись", "gRPC")
    Rel(memory_mgr, persistent_db, "Чтение/запись памяти", "SQL")
    Rel(memory_mgr, cache, "Рабочая память (TTL)", "Redis protocol")
    Rel(research_engine, vector_store, "Индексация кода", "gRPC")
    Rel(terminal_exec, vscode_ext, "Команды терминала", "WebSocket")
    Rel(vscode_ext, vscode, "Extension API", "VS Code API")
    Rel(aria_core, gateway, "Голосовые события", "WebSocket")
    Rel(orch_core, persistent_db, "Состояние задач", "SQL")
    Rel(orch_core, cache, "Сессии, rate limits", "Redis protocol")
```

---

## C4 Model — уровень Component

### Orchestrator Core — компоненты

```mermaid
C4Component
    title Orchestrator Core — Component Level

    Container_Boundary(orch_core, "Orchestrator Core") {
        Component(task_receiver, "Task Receiver", "asyncio coroutine", "Принимает задачи от Gateway, валидирует, присваивает ID, эмитирует событие task.received.")
        Component(intent_extractor, "Intent Extractor", "LLM-based", "Извлекает намерения, ограничения и требования из текста задачи. Строит структурированный план.")
        Component(dag_builder, "DAG Builder", "Python / networkx", "Строит граф зависимостей подзадач (Directed Acyclic Graph). Определяет параллельные и последовательные цепочки.")
        Component(agent_router, "Agent Router", "rule-based + semantic", "Назначает подзадачи агентам на основе семантического совпадения и доступности в пуле.")
        Component(execution_supervisor, "Execution Supervisor", "asyncio", "Отслеживает статус подзадач. Обрабатывает таймауты, перезапуски, circuit breaker события.")
        Component(result_synthesizer, "Result Synthesizer", "LLM-based", "Собирает результаты агентов, устраняет противоречия, формирует финальный ответ.")
        Component(session_manager, "Session Manager", "stateful", "Управляет жизненным циклом сессии: создание, сохранение状态, завершение, восстановление.")
        Component(invariant_checker, "Invariant Checker", "rule engine", "Проверяет предусловия перед деструктивными операциями. Реализует принцип нулевой импульсивности.")
    }

    Rel(task_receiver, intent_extractor, "Передаёт сырой текст задачи")
    Rel(intent_extractor, dag_builder, "Передаёт структурированный план")
    Rel(dag_builder, agent_router, "Передаёт граф подзадач")
    Rel(agent_router, execution_supervisor, "Назначенные агенты + подзадачи")
    Rel(execution_supervisor, result_synthesizer, "Результаты выполненных подзадач")
    Rel(execution_supervisor, invariant_checker, "Проверка перед деструктивными операциями")
    Rel(session_manager, task_receiver, "Восстановление контекста сессии")
    Rel(result_synthesizer, session_manager, "Сохранение результата сессии")
```

### Memory Manager — компоненты

```mermaid
C4Component
    title Memory Manager — Component Level

    Container_Boundary(mem, "Memory Manager") {
        Component(working_mem, "Working Memory", "Redis TTL", "Краткосрочная память текущей сессии. TTL = длительность сессии. Мгновенный доступ O(1).")
        Component(episodic_mem, "Episodic Memory", "PostgreSQL", "Память о прошлых сессиях и их результатах. Структурированные события с временными метками.")
        Component(semantic_mem, "Semantic Memory", "Qdrant + PostgreSQL", "Долгосрочные знания: паттерны, концепции, решения. Семантический поиск по эмбеддингам.")
        Component(context_builder, "Context Builder", "Python", "Собирает контекстное окно для агента: Working + релевантный Episodic + Semantic по запросу.")
        Component(compression_engine, "Compression Engine", "LLM Summarization", "Сжимает старые события Working Memory в Episodic сводки при приближении к лимиту токенов.")
        Component(embedding_service, "Embedding Service", "text-embedding-3-large", "Генерирует векторные представления для семантического поиска и упорядочивания памяти.")
        Component(retrieval_engine, "Retrieval Engine", "hybrid search", "BM25 + векторный поиск с RRF-fusion для точного извлечения релевантных фрагментов памяти.")
    }

    Rel(context_builder, working_mem, "Читает текущую сессию")
    Rel(context_builder, retrieval_engine, "Запрашивает релевантный контекст")
    Rel(retrieval_engine, episodic_mem, "BM25 поиск по событиям")
    Rel(retrieval_engine, semantic_mem, "Векторный поиск")
    Rel(compression_engine, working_mem, "Читает старые события")
    Rel(compression_engine, episodic_mem, "Записывает сводки")
    Rel(embedding_service, semantic_mem, "Индексирует эмбеддинги")
```

---

## Архитектурные паттерны

### Event Sourcing

Все изменения состояния системы записываются как **неизменяемые события** в журнал. Текущее состояние — это проекция (projection) всех событий с начала времени.

```
TaskReceived → IntentExtracted → DAGBuilt → AgentAssigned → SubtaskCompleted → ResultSynthesized → SessionClosed
```

**Преимущества:** полный аудит, воспроизводимость, отладка, восстановление после сбоев.

### CQRS (Command Query Responsibility Segregation)

Команды (изменение состояния) и запросы (чтение) разделены на отдельные модели:

- **Command side**: `TaskCommandHandler`, `AgentCommandHandler` → записывает в Event Store
- **Query side**: `TaskQueryHandler`, `SessionQueryHandler` → читает из оптимизированных проекций (PostgreSQL read replicas, Redis)

### Actor Model

Каждый агент реализован как **актор (Actor)** с изолированным состоянием и собственным почтовым ящиком (mailbox). Акторы взаимодействуют исключительно через асинхронные сообщения. Supervision Tree управляет жизненным циклом акторов и обработкой сбоев.

```
OrchestratorSupervisor
├── TaskReceiverActor
├── AgentPoolSupervisor
│   ├── CodeAnalystActor[1..N]
│   ├── TestWriterActor[1..N]
│   ├── ResearcherActor[1..N]
│   └── SynthesizerActor[1..N]
└── MemoryManagerActor
```

### Circuit Breaker

Каждый внешний вызов (LLM, GitHub, MCP сервер) защищён автоматом с тремя состояниями:

| Состояние | Условие перехода | Поведение |
|---|---|---|
| **CLOSED** | Норма | Все запросы проходят |
| **OPEN** | ≥5 ошибок за 60 сек | Быстрый отказ (fast fail), fallback |
| **HALF-OPEN** | Через 30 сек после OPEN | Пробный запрос; успех → CLOSED, ошибка → OPEN |

### Saga Pattern

Для распределённых транзакций (например, создание задачи + резервация агента + выделение памяти) используется **Choreography-based Saga**: каждый сервис слушает события и эмитирует следующие. При сбое запускаются компенсирующие транзакции.

---

## Модель развёртывания

```mermaid
graph TB
    subgraph k8s["Kubernetes Cluster"]
        subgraph ingress_ns["ingress-nginx namespace"]
            ING[Ingress Controller\nNGINX]
        end

        subgraph system_ns["orchestrator-system namespace"]
            GW[API Gateway\n2-4 replicas\nHPA: CPU>60%]
            OC[Orchestrator Core\n2-3 replicas\nHPA: queue depth]
            AP[Agent Pool\n4-16 replicas\nHPA: pending tasks]
            MM[Memory Manager\n2 replicas\nAntiAffinity: zone]
            RE[Research Engine\n2-4 replicas]
            TE[Terminal Executor\n2-4 replicas\nPodSecurityPolicy: restricted]
            AC[ARIA Core\n1-2 replicas]
        end

        subgraph data_ns["orchestrator-data namespace"]
            PG[(PostgreSQL\nHA Cluster\n Primary + 2 Replicas)]
            RD[(Redis Cluster\n3 masters + 3 replicas)]
            QD[(Qdrant\n3-node cluster)]
        end

        subgraph obs_ns["observability namespace"]
            PROM[Prometheus]
            GRAF[Grafana]
            JAE[Jaeger]
        end
    end

    subgraph ext["External Services"]
        LLM[LLM Providers\nOpenAI / Anthropic]
        RIVA[NVIDIA Riva\ngRPC endpoint]
        GH[GitHub / GitLab\nREST API]
        MCP_SRV[MCP Servers\nJSON-RPC]
    end

    ING --> GW
    GW --> OC
    OC --> AP
    OC --> MM
    AP --> MM
    AP --> RE
    AP --> TE
    AP --> LLM
    AP --> MCP_SRV
    RE --> GH
    RE --> QD
    MM --> PG
    MM --> RD
    MM --> QD
    AC --> RIVA
    system_ns --> obs_ns
```

### Политики auto-scaling

| Компонент | Min | Max | Триггер |
|---|---|---|---|
| API Gateway | 2 | 4 | CPU > 60% |
| Orchestrator Core | 2 | 3 | Queue depth > 10 задач |
| Agent Pool | 4 | 16 | Pending tasks > 5 / агент |
| Research Engine | 2 | 4 | CPU > 70% |
| Terminal Executor | 2 | 4 | Active sessions > 8 / pod |

---

## Потоки данных

### 1. Приём и обработка задачи пользователя

```mermaid
sequenceDiagram
    actor Dev as Разработчик
    participant GW as API Gateway
    participant OC as Orchestrator Core
    participant MM as Memory Manager
    participant MB as Message Bus
    participant DB as PostgreSQL

    Dev->>GW: POST /v1/tasks {prompt, session_id}
    GW->>GW: Auth + Rate limit check
    GW->>OC: gRPC TaskCreate(prompt, session_id)

    OC->>MM: GetContext(session_id)
    MM->>DB: SELECT session_history
    MM-->>OC: ContextBundle{working_mem, relevant_history}

    OC->>OC: IntentExtractor.extract(prompt + context)
    OC->>OC: DAGBuilder.build(intents)
    OC->>DB: INSERT task_event(TaskReceived)
    OC->>MB: XADD tasks_stream {task_id, dag, priority}

    OC-->>GW: TaskCreated{task_id, estimated_steps}
    GW-->>Dev: 202 Accepted {task_id, ws_url}
    Dev->>GW: WebSocket connect(ws_url)
    Note over Dev,GW: Далее — потоковые обновления статуса
```

### 2. Исследовательская фаза

```mermaid
sequenceDiagram
    participant AP as Agent Pool
    participant RA as Research Agent
    participant RE as Research Engine
    participant GH as GitHub API
    participant QD as Qdrant
    participant MM as Memory Manager

    AP->>RA: AssignTask{type: research, target: "auth module"}

    RA->>RE: IndexRepository(repo_url, patterns)
    RE->>GH: GET /repos/{owner}/{repo}/contents/auth
    GH-->>RE: FileTree + file contents

    loop Для каждого файла
        RE->>RE: Chunk + embed(file_content)
        RE->>QD: Upsert(vectors, metadata)
    end

    RA->>RE: SemanticSearch("authentication flow", top_k=20)
    RE->>QD: Search(query_vector, filters)
    QD-->>RE: TopK relevant chunks
    RE-->>RA: SearchResults{chunks, scores}

    RA->>MM: WriteWorkingMemory(session_id, research_results)
    RA-->>AP: TaskCompleted{research_summary, indexed_files: N}
```

### 3. Декомпозиция и параллельное выполнение

```mermaid
sequenceDiagram
    participant OC as Orchestrator Core
    participant MB as Message Bus
    participant CA as Code Analyst Agent
    participant TW as Test Writer Agent
    participant SY as Synthesizer Agent

    OC->>MB: XADD {subtask: analyze_patterns, depends_on: []}
    OC->>MB: XADD {subtask: write_unit_tests, depends_on: [analyze_patterns]}
    OC->>MB: XADD {subtask: write_integration_tests, depends_on: [analyze_patterns]}
    OC->>MB: XADD {subtask: synthesize_report, depends_on: [write_unit_tests, write_integration_tests]}

    MB->>CA: XREADGROUP analyze_patterns
    CA->>CA: Анализ кода + LLM inference
    CA-->>MB: XACK + publish result(analyze_patterns.done)

    par Параллельное выполнение
        MB->>TW: XREADGROUP write_unit_tests
        TW->>TW: Генерация unit тестов
        TW-->>MB: XACK + publish result(unit_tests.done)
    and
        MB->>TW: XREADGROUP write_integration_tests
        TW->>TW: Генерация integration тестов
        TW-->>MB: XACK + publish result(integration_tests.done)
    end

    MB->>SY: XREADGROUP synthesize_report
    SY->>SY: Сборка финального результата
    SY-->>OC: TaskCompleted{result}
```

### 4. Запись результатов в VS Code

```mermaid
sequenceDiagram
    participant OC as Orchestrator Core
    participant VE as VS Code Extension
    participant FS as File System
    participant MM as Memory Manager
    participant DB as PostgreSQL

    OC->>VE: WriteFiles([{path, content}, ...])
    VE->>FS: createFile(path, content)
    FS-->>VE: OK
    VE->>VE: Refresh file explorer
    VE-->>OC: FilesWritten{paths: [...]}

    OC->>MM: PersistSession(session_id, result)
    MM->>DB: INSERT episodic_memory(session_summary)
    MM->>DB: INSERT task_events(SessionClosed)
    MM-->>OC: OK

    OC-->>VE: StreamEvent{type: task_complete, summary}
    VE-->>VE: Show notification "Task completed"
```

---

## Модель конкурентности

Система использует **гибрид Actor Model + CSP (Communicating Sequential Processes)**:

### Actor Model (для агентов)

- Каждый агент — изолированный актор с собственным **mailbox** (очередь входящих сообщений)
- Агенты не разделяют изменяемое состояние — только обмен сообщениями
- **Supervision Tree** управляет иерархией акторов и стратегиями перезапуска

```
Стратегии перезапуска:
  - ONE_FOR_ONE: перезапуск только упавшего актора
  - ONE_FOR_ALL: перезапуск всей группы при падении одного (для связанных агентов)
  - REST_FOR_ONE: перезапуск актора и всех зависимых от него
```

### CSP (для внутренних пайплайнов)

- Компоненты внутри одного контейнера взаимодействуют через **каналы (channels)** с буферизацией
- Backpressure реализован через блокирующие каналы фиксированного размера
- Timeout через `asyncio.wait_for` с настраиваемым дедлайном на каждый тип операции

### Mailbox архитектура

| Тип mailbox | Размер буфера | Политика при переполнении |
|---|---|---|
| High-priority tasks | 100 | Block producer |
| Normal tasks | 1000 | Block producer |
| Background indexing | 10000 | Drop oldest (FIFO eviction) |
| Dead letter queue | Unbounded | Alert + persist |

---

## Масштабируемость

### Горизонтальное масштабирование агентов

Agent Pool реализован как stateless воркеры, потребляющие из Redis Streams consumer group. Добавление новых реплик автоматически распределяет нагрузку без координации:

```
Новая реплика → XREADGROUP JOIN consumer_group → начинает получать задачи
```

### Auto-scaling политики (Kubernetes HPA)

```yaml
# Пример HPA для Agent Pool
metrics:
  - type: External
    external:
      metric:
        name: redis_stream_pending_messages
        selector:
          matchLabels:
            stream: tasks_stream
      target:
        type: AverageValue
        averageValue: "5"  # 5 pending задач на реплику
```

### Load Shedding

При превышении `max_queue_depth` (настраивается, default: 500) система:
1. Отклоняет новые задачи с `429 Too Many Requests`
2. Добавляет задачи в приоритетную очередь ожидания
3. Отправляет пользователю estimated wait time

---

## Отказоустойчивость

### Circuit Breakers

```python
# Конфигурация Circuit Breaker для LLM
CircuitBreakerConfig(
    failure_threshold=5,          # 5 ошибок открывают автомат
    success_threshold=2,          # 2 успеха закрывают из HALF-OPEN
    timeout=30.0,                 # секунд до попытки HALF-OPEN
    expected_exception=(TimeoutError, APIError),
    fallback=use_fallback_model   # fallback на резервную модель
)
```

### Retry Policies

| Операция | Max attempts | Backoff | Jitter |
|---|---|---|---|
| LLM inference | 3 | Exponential (1s, 2s, 4s) | ±20% |
| GitHub API | 5 | Linear (500ms step) | ±10% |
| MCP tool call | 2 | Fixed 1s | — |
| Redis operations | 10 | Exponential (50ms, 100ms...) | ±30% |
| PostgreSQL write | 5 | Exponential (100ms...) | ±20% |

### Graceful Degradation

При недоступности компонентов система продолжает работу в ограниченном режиме:

| Недоступный компонент | Деградация | Функциональность |
|---|---|---|
| Vector Store (Qdrant) | Без семантического поиска | Работает на рабочей памяти и BM25 |
| Research Engine | Без индексации новых репозиториев | Использует кэшированные данные |
| ARIA Core | Без голосового интерфейса | Только текстовый ввод |
| GitHub API | Без исследования внешних репозиториев | Работает с локальными файлами |

### Dead Letter Queue (DLQ)

Задачи, завершившиеся с ошибкой после всех попыток повтора, помещаются в DLQ:
- Сохранение полного контекста: задача, все попытки, трейс ошибки
- Алерт администратору через PagerDuty/Alertmanager
- Ручной повтор или анализ через Admin Dashboard
- Автоматическая очистка через 30 дней

---

*Последнее обновление: 2026-03-31 | Версия: 1.0.0 | Следующий раздел: [Ядро оркестратора](../orchestrator-core/README.md)*
