#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Training Seed 12: System Design Patterns
==========================================
Паттерны: Load Balancer, Circuit Breaker, LRU Cache, Message Queue, Service Registry
Архитектурные решения:
  - Circuit Breaker предотвращает каскадные отказы
    (три состояния: CLOSED, OPEN, HALF_OPEN)
  - LRU Cache — O(1) get/put через dict + doubly-linked list
  - Message Queue с backpressure (max_size) и dead letter queue
  - Service Registry с health-check и automatic deregistration
  - Load balancer — Round Robin (предсказуемо) и Least Connections (оптимально)
"""

from __future__ import annotations

import asyncio
import random
import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from threading import Lock
from typing import Any, Callable, TypeVar

T = TypeVar("T")


# ---------------------------------------------------------------------------
# 1. LRU Cache — O(1) через OrderedDict
# ---------------------------------------------------------------------------
from collections import OrderedDict


class LRUCache:
    """
    LRU (Least Recently Used) Cache.
    Time: O(1) get, O(1) put
    Space: O(capacity)
    Потокобезопасен через Lock.
    """

    def __init__(self, capacity: int) -> None:
        if capacity <= 0:
            raise ValueError("Capacity должен быть > 0")
        self._capacity = capacity
        self._cache: OrderedDict[str, Any] = OrderedDict()
        self._lock = Lock()
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Any | None:
        with self._lock:
            if key not in self._cache:
                self._misses += 1
                return None
            self._cache.move_to_end(key)  # Помечаем как recently used
            self._hits += 1
            return self._cache[key]

    def put(self, key: str, value: Any, ttl: float | None = None) -> None:
        """TTL в секундах (опционально). Expired-элементы удаляются при get."""
        with self._lock:
            entry = {"value": value, "expires": time.monotonic() + ttl if ttl else None}
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = entry
            if len(self._cache) > self._capacity:
                self._cache.popitem(last=False)  # Evict LRU

    def get_with_ttl(self, key: str) -> Any | None:
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                self._misses += 1
                return None
            if entry["expires"] and time.monotonic() > entry["expires"]:
                del self._cache[key]
                self._misses += 1
                return None
            self._cache.move_to_end(key)
            self._hits += 1
            return entry["value"]

    @property
    def hit_rate(self) -> float:
        total = self._hits + self._misses
        return self._hits / total if total > 0 else 0.0

    def __len__(self) -> int:
        return len(self._cache)


# ---------------------------------------------------------------------------
# 2. Circuit Breaker
# ---------------------------------------------------------------------------
class CircuitState(Enum):
    CLOSED = "closed"        # Нормальная работа
    OPEN = "open"            # Отказы: все вызовы отклоняются без выполнения
    HALF_OPEN = "half_open"  # Пробный вызов для проверки восстановления


class CircuitBreakerOpen(Exception):
    """Исключение при открытом circuit breaker."""


class CircuitBreaker:
    """
    Circuit Breaker паттерн.
    Предотвращает каскадные отказы при недоступности внешних сервисов.

    State transitions:
    CLOSED → OPEN: при достижении failure_threshold за window_seconds
    OPEN → HALF_OPEN: после recovery_timeout секунд
    HALF_OPEN → CLOSED: при успешном вызове
    HALF_OPEN → OPEN: при неуспешном вызове
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        window_seconds: float = 60.0,
    ) -> None:
        self._threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._window = window_seconds
        self._state = CircuitState.CLOSED
        self._failures: deque[float] = deque()
        self._opened_at: float | None = None
        self._lock = Lock()

    @property
    def state(self) -> CircuitState:
        return self._state

    def call(self, fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        """Выполняет fn через circuit breaker."""
        with self._lock:
            self._maybe_transition_to_half_open()
            if self._state == CircuitState.OPEN:
                raise CircuitBreakerOpen(f"Circuit breaker OPEN for {fn.__name__}")

        try:
            result = fn(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise

    def _on_success(self) -> None:
        with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.CLOSED
                self._failures.clear()
                print("[CircuitBreaker] → CLOSED (recovered)")

    def _on_failure(self) -> None:
        with self._lock:
            now = time.monotonic()
            self._failures.append(now)
            # Удаляем старые ошибки за пределами окна
            cutoff = now - self._window
            while self._failures and self._failures[0] < cutoff:
                self._failures.popleft()

            if self._state == CircuitState.HALF_OPEN or len(self._failures) >= self._threshold:
                self._state = CircuitState.OPEN
                self._opened_at = now
                print(f"[CircuitBreaker] → OPEN ({len(self._failures)} failures)")

    def _maybe_transition_to_half_open(self) -> None:
        if (
            self._state == CircuitState.OPEN
            and self._opened_at is not None
            and time.monotonic() - self._opened_at >= self._recovery_timeout
        ):
            self._state = CircuitState.HALF_OPEN
            print("[CircuitBreaker] → HALF_OPEN (probing)")


# ---------------------------------------------------------------------------
# 3. Message Queue с backpressure
# ---------------------------------------------------------------------------
@dataclass
class Message:
    id: str
    payload: Any
    timestamp: float = field(default_factory=time.time)
    retries: int = 0
    max_retries: int = 3


class MessageQueue:
    """
    In-memory message queue с backpressure и dead letter queue.
    В проде: RabbitMQ / Kafka / SQS.
    Backpressure: publisher блокируется если очередь переполнена.
    """

    def __init__(self, max_size: int = 1000) -> None:
        self._queue: asyncio.Queue[Message] = asyncio.Queue(maxsize=max_size)
        self._dlq: list[Message] = []  # Dead Letter Queue

    async def publish(self, message: Message, timeout: float = 5.0) -> bool:
        """Публикует сообщение. Возвращает False при переполнении."""
        try:
            await asyncio.wait_for(self._queue.put(message), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            print(f"[MQ] Backpressure: queue full, dropping message {message.id}")
            return False

    async def consume(self, handler: Callable[[Message], Any], timeout: float = 1.0) -> None:
        """Консьюмер с retry и dead letter queue."""
        try:
            message = await asyncio.wait_for(self._queue.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return

        try:
            await asyncio.coroutine(handler)(message) if asyncio.iscoroutinefunction(handler) else handler(message)
            self._queue.task_done()
        except Exception as e:
            message.retries += 1
            if message.retries <= message.max_retries:
                await self._queue.put(message)  # Requeue
            else:
                self._dlq.append(message)  # Dead Letter
                print(f"[MQ] Message {message.id} moved to DLQ after {message.retries} retries")
            self._queue.task_done()

    @property
    def dlq_size(self) -> int:
        return len(self._dlq)

    @property
    def queue_size(self) -> int:
        return self._queue.qsize()


# ---------------------------------------------------------------------------
# 4. Service Registry + Load Balancer
# ---------------------------------------------------------------------------
@dataclass
class ServiceInstance:
    host: str
    port: int
    healthy: bool = True
    active_connections: int = 0
    last_health_check: float = field(default_factory=time.time)

    @property
    def address(self) -> str:
        return f"{self.host}:{self.port}"


class ServiceRegistry:
    """
    Service Registry для service discovery.
    В проде: Consul / etcd / Kubernetes DNS.
    """

    def __init__(self) -> None:
        self._services: dict[str, list[ServiceInstance]] = {}
        self._rr_index: dict[str, int] = {}

    def register(self, service_name: str, instance: ServiceInstance) -> None:
        if service_name not in self._services:
            self._services[service_name] = []
        self._services[service_name].append(instance)
        print(f"[Registry] Registered {service_name} @ {instance.address}")

    def deregister(self, service_name: str, address: str) -> None:
        if service_name in self._services:
            self._services[service_name] = [
                i for i in self._services[service_name] if i.address != address
            ]

    def healthy_instances(self, service_name: str) -> list[ServiceInstance]:
        return [i for i in self._services.get(service_name, []) if i.healthy]

    def round_robin(self, service_name: str) -> ServiceInstance | None:
        """Round Robin балансировка — предсказуемое распределение нагрузки."""
        instances = self.healthy_instances(service_name)
        if not instances:
            return None
        idx = self._rr_index.get(service_name, 0) % len(instances)
        self._rr_index[service_name] = (idx + 1) % len(instances)
        return instances[idx]

    def least_connections(self, service_name: str) -> ServiceInstance | None:
        """Least Connections — оптимальна при разной длительности запросов."""
        instances = self.healthy_instances(service_name)
        if not instances:
            return None
        return min(instances, key=lambda i: i.active_connections)


# ---------------------------------------------------------------------------
# Точка входа
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # LRU Cache
    print("=== LRU Cache ===")
    cache = LRUCache(capacity=3)
    for k, v in [("a", 1), ("b", 2), ("c", 3)]:
        cache.put(k, v)
    cache.get("a")  # a becomes recently used
    cache.put("d", 4)  # evicts "b" (LRU)
    print(f"'b' in cache: {cache.get('b') is not None}")  # False
    print(f"'a' in cache: {cache.get('a') is not None}")  # True
    print(f"Hit rate: {cache.hit_rate:.2f}")

    # Circuit Breaker
    print("\n=== Circuit Breaker ===")
    cb = CircuitBreaker(failure_threshold=3, recovery_timeout=1.0)
    call_count = 0

    def flaky_service() -> str:
        global call_count
        call_count += 1
        if call_count <= 3:
            raise ConnectionError("Service unavailable")
        return "OK"

    for i in range(6):
        try:
            result = cb.call(flaky_service)
            print(f"Call {i+1}: {result} (state: {cb.state.value})")
        except CircuitBreakerOpen:
            print(f"Call {i+1}: BLOCKED by circuit breaker")
        except ConnectionError as e:
            print(f"Call {i+1}: Error - {e} (state: {cb.state.value})")

    # Service Registry
    print("\n=== Service Registry ===")
    registry = ServiceRegistry()
    for i in range(3):
        registry.register("api-service", ServiceInstance(f"10.0.0.{i+1}", 8080))

    print("Round Robin:")
    for _ in range(5):
        inst = registry.round_robin("api-service")
        print(f"  → {inst.address if inst else 'none'}")

    # Message Queue
    print("\n=== Message Queue ===")
    async def run_mq() -> None:
        mq = MessageQueue(max_size=10)
        processed: list[str] = []

        async def handler(msg: Message) -> None:
            processed.append(msg.id)

        for i in range(3):
            await mq.publish(Message(id=f"msg-{i}", payload={"data": i}))

        for _ in range(3):
            await mq.consume(handler)

        print(f"Processed: {processed}")

    asyncio.run(run_mq())
