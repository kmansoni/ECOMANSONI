# Architecture — Task Management API

## Hexagonal Architecture (Ports & Adapters)

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  FastAPI     │  │  Middleware  │  │  OpenAPI/Swagger   │  │
│  │  Routers     │  │  (CORS, RL,  │  │  Documentation    │  │
│  │  (api.py)    │  │   Error)     │  │                   │  │
│  └──────┬───────┘  └──────────────┘  └───────────────────┘  │
└─────────┼───────────────────────────────────────────────────┘
          │ DTOs (Pydantic)
┌─────────▼───────────────────────────────────────────────────┐
│                   APPLICATION LAYER                          │
│  ┌──────────────────────┐  ┌──────────────────────────────┐  │
│  │   TaskService        │  │   UserService                │  │
│  │   (use cases)        │  │   (use cases)                │  │
│  │                      │  │                              │  │
│  │  create_task()       │  │  register()                  │  │
│  │  update_task()       │  │  authenticate()              │  │
│  │  assign_task()       │  │  get_profile()               │  │
│  │  complete_task()     │  │                              │  │
│  └──────────┬───────────┘  └──────────────────────────────┘  │
│             │ Domain Models                                   │
└─────────────┼───────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│                     DOMAIN LAYER                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   Task       │  │   User       │  │   Project         │  │
│  │   Project    │  │   UserRole   │  │   DomainEvents    │  │
│  │   Enums      │  │   Email VO   │  │   Exceptions      │  │
│  └──────────────┘  └──────────────┘  └───────────────────┘  │
│                                                              │
│  Pure Python. Zero dependencies on frameworks or DB.         │
└─────────────────────────────────────────────────────────────┘
              ▲
              │ Repository Interfaces (Ports)
┌─────────────┴───────────────────────────────────────────────┐
│                 INFRASTRUCTURE LAYER                         │
│  ┌──────────────────────┐  ┌──────────────────────────────┐  │
│  │  SQLAlchemy Repos    │  │   Security                   │  │
│  │  (Adapters)          │  │   JWT + bcrypt + RBAC        │  │
│  │                      │  │                              │  │
│  │  PostgreSQL          │  │   Token creation             │  │
│  │  AsyncSession        │  │   Password hashing           │  │
│  └──────────────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Create Task

```
Client
  │
  │  POST /api/v1/tasks  {title, description, priority}
  ▼
Middleware (rate limit check, auth token validation)
  │
  ▼
api.py → create_task(request: CreateTaskRequest, current_user: User)
  │
  │  Validate DTO (Pydantic)
  ▼
TaskService.create(dto, owner_id)
  │
  │  Validate business rules (title not empty, valid priority)
  │  Construct domain Task object
  │  Emit TaskCreated event
  ▼
SQLAlchemyTaskRepository.save(task)
  │
  │  Map domain → ORM model
  │  INSERT INTO tasks ...
  │  RETURNING id, created_at
  │  Map ORM → domain
  ▼
TaskService returns Task domain object
  │
  ▼
api.py maps Task → TaskResponse DTO
  │
  ▼
  201 Created  {"id": "...", "title": "...", ...}
```

---

## Layers: Responsibilities and Boundaries

### Domain Layer
- **What**: Pure business logic, entities, value objects, domain events, domain exceptions
- **What NOT**: No HTTP, no SQL, no JWT, no external I/O
- **Files**: `domain/models.py`, `domain/events.py`, `domain/exceptions.py`
- **Dependencies**: stdlib only (dataclasses, datetime, uuid, enum)

### Application Layer
- **What**: Use cases, orchestration, business workflows
- **What NOT**: No HTTP status codes, no SQL queries, no framework-specific code
- **Files**: `application/services.py`, `application/dto.py`
- **Dependencies**: Domain layer + Repository interfaces (abstract)

### Infrastructure Layer
- **What**: Technical implementations — DB, security, external APIs
- **What NOT**: No business logic
- **Files**: `infrastructure/database.py`, `infrastructure/repositories.py`, `infrastructure/security.py`
- **Dependencies**: SQLAlchemy, asyncpg, PyJWT, bcrypt

### Presentation Layer
- **What**: HTTP protocol handling, auth middleware, OpenAPI docs
- **What NOT**: No business logic, no SQL
- **Files**: `presentation/api.py`, `presentation/middleware.py`, `main.py`
- **Dependencies**: FastAPI, Application services (via DI)

---

## Architecture Decision Records (ADR)

### ADR-001: Async-first (asyncio)
**Decision**: All I/O operations are async (SQLAlchemy AsyncSession, httpx).  
**Rationale**: Task APIs are I/O-bound. Async allows 10x more concurrent connections with same resources.  
**Trade-off**: More complex testing (pytest-asyncio), no sync ORM idioms.

### ADR-002: Repository Pattern over direct ORM usage
**Decision**: Services never import SQLAlchemy. They use abstract Repository interfaces.  
**Rationale**: Domain layer stays pure. Infrastructure can be swapped (Postgres → MongoDB) without touching services.  
**Trade-off**: More boilerplate (abstract + concrete implementations).

### ADR-003: Domain Events over direct side effects
**Decision**: State changes emit DomainEvent objects collected in aggregate roots.  
**Rationale**: Decouples side effects (emails, notifications, audit logs) from core logic.  
**Trade-off**: Events must be dispatched after transaction commit to avoid half-published events.

### ADR-004: Pydantic v2 for DTOs
**Decision**: All input/output contracts use Pydantic BaseModel.  
**Rationale**: Auto-validation, JSON serialization, OpenAPI schema generation, clear error messages.  
**Trade-off**: DTOs ≠ Domain models; mapping code required.

### ADR-005: JWT RS256 over HS256
**Decision**: Asymmetric signing (RS256) for JWT tokens.  
**Rationale**: Public key can be distributed to microservices without sharing the secret.  
**Trade-off**: Key rotation more complex; requires PKI infrastructure.

### ADR-006: RBAC at presentation layer
**Decision**: Role checks happen in FastAPI dependency functions, not in services.  
**Rationale**: Services remain reusable across different frontends. Auth is a cross-cutting concern.  
**Trade-off**: Services must receive `current_user` context explicitly.

---

## Concurrency and Safety

| Scenario | Protection |
|---|---|
| Duplicate task creation | Idempotency key header + DB unique constraint |
| Race on task status update | Optimistic locking via `updated_at` comparison |
| Token replay after logout | JWT blacklist in Redis (token `jti` claim) |
| Rate limit bypass via distributed clients | Redis sliding window counter per (user_id, endpoint) |
| SQL injection | SQLAlchemy parameterized queries only, no raw string interpolation |
| Mass assignment | Pydantic `model_fields` whitelist, no `**request.dict()` on ORM |

---

## Scalability

- **Stateless API nodes**: No in-process state. All state in PostgreSQL + Redis.
- **Connection pooling**: asyncpg pool (min=5, max=20 per node).
- **Read replicas**: Repository can be initialized with separate read/write engines.
- **Pagination**: Keyset pagination (cursor-based) for large result sets, not OFFSET.
- **Index strategy**: Composite index on `(project_id, status, created_at)` for list queries.
