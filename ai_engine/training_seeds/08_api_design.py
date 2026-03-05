#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Training Seed 08: API Design Patterns
=======================================
Паттерны: REST versioning, GraphQL-like resolver, WebSocket handler,
          Rate limiting middleware, OpenAPI documentation
Архитектурные решения:
  - Версионирование через URL prefix (/api/v1/) — обратная совместимость
  - GraphQL resolver pattern с DataLoader для N+1 prevention
  - WebSocket с heartbeat и graceful disconnect
  - Rate limiting per-IP в middleware (до достижения обработчика)
  - OpenAPI документация через декоратор (Schema-first подход)
"""

from __future__ import annotations

import asyncio
import json
import time
from collections import defaultdict, deque
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Callable

# ---------------------------------------------------------------------------
# 1. REST API — Versioning & Resource Blueprint
# ---------------------------------------------------------------------------
@dataclass
class Request:
    method: str
    path: str
    headers: dict[str, str] = field(default_factory=dict)
    body: dict[str, Any] = field(default_factory=dict)
    params: dict[str, str] = field(default_factory=dict)
    client_ip: str = "127.0.0.1"


@dataclass
class Response:
    status: int
    body: Any
    headers: dict[str, str] = field(default_factory=dict)

    def json(self) -> str:
        return json.dumps(self.body, ensure_ascii=False, default=str)


class Router:
    """Минимальный роутер с поддержкой версионирования и middleware."""

    def __init__(self, prefix: str = "") -> None:
        self.prefix = prefix
        self._routes: dict[tuple[str, str], Callable[..., Response]] = {}
        self._middleware: list[Callable[..., Any]] = []

    def route(self, method: str, path: str) -> Callable:
        """Декоратор для регистрации роута."""
        def decorator(fn: Callable) -> Callable:
            self._routes[(method.upper(), self.prefix + path)] = fn
            return fn
        return decorator

    def use(self, middleware: Callable) -> None:
        """Регистрирует middleware (выполняется в порядке добавления)."""
        self._middleware.append(middleware)

    def dispatch(self, request: Request) -> Response:
        """Dispatches request через middleware chain → handler."""
        # Строим цепочку middleware
        handler = self._routes.get((request.method, request.path))
        if handler is None:
            return Response(404, {"error": "Not found"})

        def call_next(req: Request, idx: int = 0) -> Response:
            if idx < len(self._middleware):
                return self._middleware[idx](req, lambda r: call_next(r, idx + 1))
            return handler(req)

        return call_next(request)


# Пример API v1 роутов
v1_router = Router(prefix="/api/v1")


@v1_router.route("GET", "/users/{id}")
def get_user(req: Request) -> Response:
    """
    ---
    summary: Get user by ID
    parameters:
      - name: id
        in: path
        required: true
    responses:
      200:
        description: User object
      404:
        description: Not found
    """
    user_id = req.params.get("id")
    # В проде — запрос к БД через репозиторий
    return Response(200, {"id": user_id, "name": "Alice", "email": "alice@example.com"})


@v1_router.route("POST", "/users")
def create_user(req: Request) -> Response:
    """
    ---
    summary: Create new user
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/UserCreate'
    responses:
      201:
        description: Created
      409:
        description: Email already exists
    """
    email = req.body.get("email", "")
    if not email:
        return Response(400, {"error": "email обязателен"})
    # В проде — через репозиторий + Unit of Work
    return Response(201, {"id": "new-uuid", "email": email})


# ---------------------------------------------------------------------------
# 2. Rate Limiting Middleware
# ---------------------------------------------------------------------------
class RateLimitMiddleware:
    """
    Per-IP rate limiting middleware.
    Sliding window counter. В проде — Redis INCR + EXPIRE.
    """

    def __init__(self, max_rps: int = 100, window: int = 1) -> None:
        self._max = max_rps
        self._window = window
        self._windows: dict[str, deque[float]] = defaultdict(deque)

    def __call__(self, req: Request, next_handler: Callable[[Request], Response]) -> Response:
        ip = req.client_ip
        now = time.monotonic()
        w = self._windows[ip]
        cutoff = now - self._window
        while w and w[0] < cutoff:
            w.popleft()

        if len(w) >= self._max:
            return Response(
                429,
                {"error": "Too Many Requests"},
                headers={"Retry-After": str(self._window)},
            )
        w.append(now)
        response = next_handler(req)
        response.headers["X-RateLimit-Limit"] = str(self._max)
        response.headers["X-RateLimit-Remaining"] = str(self._max - len(w))
        return response


v1_router.use(RateLimitMiddleware(max_rps=50, window=1))


# ---------------------------------------------------------------------------
# 3. GraphQL-like Resolver Pattern
# ---------------------------------------------------------------------------
@dataclass
class GraphQLField:
    """Описание поля GraphQL-схемы."""
    name: str
    type_name: str
    nullable: bool = True
    description: str = ""


class GraphQLResolver:
    """
    Простой GraphQL resolver. Паттерн: Schema → Resolvers → DataLoader.
    DataLoader батчит запросы к БД для предотвращения N+1 проблемы.
    """

    def __init__(self) -> None:
        self._resolvers: dict[str, Callable[..., Any]] = {}

    def resolver(self, type_name: str, field_name: str) -> Callable:
        """Декоратор для регистрации resolver."""
        key = f"{type_name}.{field_name}"
        def decorator(fn: Callable) -> Callable:
            self._resolvers[key] = fn
            return fn
        return decorator

    def resolve(self, type_name: str, field_name: str, parent: Any, **kwargs: Any) -> Any:
        key = f"{type_name}.{field_name}"
        resolver_fn = self._resolvers.get(key)
        if resolver_fn is None:
            # Fallback: вернуть атрибут parent
            return getattr(parent, field_name, None)
        return resolver_fn(parent, **kwargs)


schema = GraphQLResolver()


@schema.resolver("Query", "user")
def resolve_user(_, user_id: str) -> dict[str, Any]:
    return {"id": user_id, "name": "Alice", "email": "alice@example.com"}


@schema.resolver("User", "orders")
def resolve_user_orders(user: dict[str, Any]) -> list[dict[str, Any]]:
    # В проде: DataLoader.load_many(user["id"]) — batch запрос к БД
    return [{"id": "order-1", "amount": 99.99, "status": "completed"}]


# ---------------------------------------------------------------------------
# 4. WebSocket Handler с heartbeat
# ---------------------------------------------------------------------------
class WebSocketState(Enum):
    CONNECTING = "connecting"
    OPEN = "open"
    CLOSING = "closing"
    CLOSED = "closed"


class WebSocketConnection:
    """
    Абстракция WebSocket соединения.
    Паттерн: heartbeat для обнаружения мёртвых соединений без TCP keepalive.
    """

    def __init__(self, connection_id: str) -> None:
        self.id = connection_id
        self.state = WebSocketState.CONNECTING
        self._last_pong = time.monotonic()
        self._subscriptions: set[str] = set()
        self._message_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)

    async def on_connect(self) -> None:
        self.state = WebSocketState.OPEN
        print(f"[WS] Connected: {self.id}")

    async def on_message(self, data: dict[str, Any]) -> None:
        """Обрабатывает входящее сообщение."""
        msg_type = data.get("type")
        if msg_type == "pong":
            self._last_pong = time.monotonic()
        elif msg_type == "subscribe":
            channel = data.get("channel", "")
            self._subscriptions.add(channel)
            await self.send({"type": "subscribed", "channel": channel})
        elif msg_type == "unsubscribe":
            self._subscriptions.discard(data.get("channel", ""))

    async def send(self, data: dict[str, Any]) -> None:
        """Отправляет сообщение клиенту (non-blocking через очередь)."""
        if self.state != WebSocketState.OPEN:
            return
        try:
            self._message_queue.put_nowait(data)
        except asyncio.QueueFull:
            # Slow consumer — принудительно закрываем соединение
            await self.close(code=1008, reason="Message queue full")

    async def close(self, code: int = 1000, reason: str = "") -> None:
        self.state = WebSocketState.CLOSING
        print(f"[WS] Closing {self.id}: {code} {reason}")
        self.state = WebSocketState.CLOSED

    def is_alive(self, timeout: float = 30.0) -> bool:
        return time.monotonic() - self._last_pong < timeout


class WebSocketManager:
    """Управляет всеми активными WebSocket соединениями."""

    def __init__(self) -> None:
        self._connections: dict[str, WebSocketConnection] = {}

    def connect(self, conn: WebSocketConnection) -> None:
        self._connections[conn.id] = conn

    def disconnect(self, conn_id: str) -> None:
        self._connections.pop(conn_id, None)

    async def broadcast(self, channel: str, data: dict[str, Any]) -> None:
        """Рассылает сообщение всем подписчикам канала."""
        dead: list[str] = []
        for conn_id, conn in self._connections.items():
            if not conn.is_alive():
                dead.append(conn_id)
                continue
            if channel in conn._subscriptions:
                await conn.send(data)
        for conn_id in dead:
            self.disconnect(conn_id)

    async def heartbeat_loop(self, interval: float = 15.0) -> None:
        """Периодически отправляет ping всем соединениям."""
        while True:
            await asyncio.sleep(interval)
            for conn in list(self._connections.values()):
                if not conn.is_alive(timeout=interval * 2):
                    await conn.close(code=1001, reason="Heartbeat timeout")
                    self.disconnect(conn.id)
                else:
                    await conn.send({"type": "ping"})


# ---------------------------------------------------------------------------
# Точка входа / демонстрация
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=== REST API ===")
    req = Request("GET", "/api/v1/users/{id}", params={"id": "user-123"}, client_ip="10.0.0.1")
    resp = v1_router.dispatch(req)
    print(f"GET /users/123: {resp.status} {resp.json()}")

    print("\n=== Rate Limiting ===")
    limiter_mw = RateLimitMiddleware(max_rps=3, window=1)
    for i in range(5):
        r = limiter_mw(req, lambda r: Response(200, {"ok": True}))
        print(f"Request {i+1}: {r.status}")

    print("\n=== GraphQL Resolvers ===")
    user = schema.resolve("Query", "user", None, user_id="user-123")
    orders = schema.resolve("User", "orders", user)
    print(f"User: {user}")
    print(f"Orders: {orders}")

    print("\n=== WebSocket (async) ===")
    async def demo_ws() -> None:
        manager = WebSocketManager()
        conn = WebSocketConnection("ws-001")
        await conn.on_connect()
        manager.connect(conn)
        await conn.on_message({"type": "subscribe", "channel": "updates"})
        await manager.broadcast("updates", {"type": "update", "data": {"msg": "Hello"}})
        msg = await conn._message_queue.get()
        print(f"Received: {msg}")

    asyncio.run(demo_ws())
