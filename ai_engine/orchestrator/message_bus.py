#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Message Bus — асинхронный транспорт сообщений между компонентами.

Реализует паттерн Pub/Sub с приоритетными очередями.
In-memory реализация с возможностью замены на Redis Streams.

Топология (из документации):
    swarm/
    ├── orchestrator/inbox
    ├── orchestrator/broadcast
    ├── agents/{agent_id}/inbox
    ├── agents/{agent_id}/status
    ├── tasks/assigned
    ├── tasks/completed
    └── tasks/failed
"""

import asyncio
import logging
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


class MessageType(Enum):
    """Типы сообщений в системе."""
    TASK_ASSIGN = "task_assign"
    TASK_RESULT = "task_result"
    TASK_PROGRESS = "task_progress"
    TASK_FAILED = "task_failed"
    AGENT_HEARTBEAT = "agent_heartbeat"
    AGENT_STATUS = "agent_status"
    CONTEXT_REQUEST = "context_request"
    CONTEXT_RESPONSE = "context_response"
    ESCALATION = "escalation"
    WATCHDOG_ALERT = "watchdog_alert"
    BROADCAST = "broadcast"
    SYNC_BARRIER = "sync_barrier"


@dataclass
class MessageEnvelope:
    """
    Конверт сообщения — метаданные доставки.

    Формат из документации agent-swarm.
    """
    message_id: str = field(default_factory=lambda: f"msg_{uuid.uuid4().hex[:12]}")
    sender_id: str = ""
    sender_role: str = ""
    receiver_id: str = ""
    correlation_id: str = ""
    reply_to: str = ""
    timestamp: str = field(default_factory=lambda: time.time())
    priority: int = 5  # 1-10, 10 = наивысший
    ttl_ms: int = 60000


@dataclass
class Message:
    """
    Сообщение в системе.

    Attributes:
        envelope: Метаданные доставки.
        msg_type: Тип сообщения.
        payload: Тело сообщения.
        metadata: Дополнительные метаданные (trace_id, retry_count, etc.).
    """
    envelope: MessageEnvelope = field(default_factory=MessageEnvelope)
    msg_type: MessageType = MessageType.BROADCAST
    payload: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def is_expired(self) -> bool:
        """Проверить, истёк ли TTL сообщения."""
        age_ms = (time.time() - self.envelope.timestamp) * 1000
        return age_ms > self.envelope.ttl_ms


# Callback для подписчика
MessageHandler = Callable[[Message], None]


class MessageBus:
    """
    In-memory Message Bus с pub/sub и приоритетными очередями.

    Поддерживает:
        - Прямую доставку (direct): отправка конкретному агенту
        - Широковещание (broadcast): отправка всем подписчикам топика
        - Приоритетные очереди
        - TTL сообщений
        - Dead Letter Queue для необработанных сообщений

    Может быть заменён на Redis Streams для production.
    """

    def __init__(self, max_queue_size: int = 1000) -> None:
        self._subscribers: dict[str, list[MessageHandler]] = defaultdict(list)
        self._queues: dict[str, list[Message]] = defaultdict(list)
        self._dead_letter_queue: list[Message] = []
        self._max_queue_size = max_queue_size
        self._message_count = 0
        self._delivered_count = 0
        logger.info("MessageBus инициализирован (max_queue_size=%d)", max_queue_size)

    # ── Public API ─────────────────────────────────────────────────────

    def subscribe(self, topic: str, handler: MessageHandler) -> None:
        """
        Подписаться на топик.

        Args:
            topic: Имя топика (e.g., "orchestrator/inbox", "agents/agent-01/inbox").
            handler: Функция-обработчик сообщений.
        """
        self._subscribers[topic].append(handler)
        logger.debug("Подписка на топик '%s' (всего подписчиков: %d)", topic, len(self._subscribers[topic]))

    def unsubscribe(self, topic: str, handler: MessageHandler) -> None:
        """Отписаться от топика."""
        if topic in self._subscribers:
            self._subscribers[topic] = [h for h in self._subscribers[topic] if h != handler]

    def publish(self, topic: str, message: Message) -> bool:
        """
        Опубликовать сообщение в топик.

        Args:
            topic: Целевой топик.
            message: Сообщение.

        Returns:
            True если доставлено хотя бы одному подписчику.
        """
        if message.is_expired:
            logger.warning("Сообщение %s истекло, отправлено в DLQ", message.envelope.message_id)
            self._dead_letter_queue.append(message)
            return False

        self._message_count += 1
        delivered = False

        # Прямая доставка подписчикам
        for handler in self._subscribers.get(topic, []):
            try:
                handler(message)
                delivered = True
                self._delivered_count += 1
            except Exception as exc:
                logger.error("Ошибка обработчика топика '%s': %s", topic, exc)

        # Если нет подписчиков — добавить в очередь для отложенной обработки
        if not delivered:
            queue = self._queues[topic]
            if len(queue) >= self._max_queue_size:
                # Load shedding: удалить самое старое сообщение с наименьшим приоритетом
                queue.sort(key=lambda m: m.envelope.priority, reverse=True)
                evicted = queue.pop()
                self._dead_letter_queue.append(evicted)
                logger.warning("Queue overflow для '%s', evicted msg %s", topic, evicted.envelope.message_id)
            queue.append(message)

        return delivered

    def send_direct(self, receiver_id: str, message: Message) -> bool:
        """
        Отправить сообщение напрямую агенту.

        Args:
            receiver_id: ID получателя.
            message: Сообщение.

        Returns:
            True если доставлено.
        """
        message.envelope.receiver_id = receiver_id
        topic = f"agents/{receiver_id}/inbox"
        return self.publish(topic, message)

    def broadcast(self, message: Message) -> int:
        """
        Широковещательная рассылка всем подписчикам broadcast-топика.

        Returns:
            Количество получателей.
        """
        message.msg_type = MessageType.BROADCAST
        count = 0
        for handler in self._subscribers.get("orchestrator/broadcast", []):
            try:
                handler(message)
                count += 1
            except Exception as exc:
                logger.error("Ошибка broadcast: %s", exc)
        return count

    def consume(self, topic: str, max_messages: int = 10) -> list[Message]:
        """
        Забрать сообщения из очереди топика (pull-модель).

        Args:
            topic: Топик.
            max_messages: Максимум сообщений за раз.

        Returns:
            Список сообщений.
        """
        queue = self._queues.get(topic, [])
        # Сортировка по приоритету (desc) и времени (asc)
        queue.sort(key=lambda m: (-m.envelope.priority, m.envelope.timestamp))

        messages: list[Message] = []
        remaining: list[Message] = []

        for msg in queue:
            if msg.is_expired:
                self._dead_letter_queue.append(msg)
                continue
            if len(messages) < max_messages:
                messages.append(msg)
            else:
                remaining.append(msg)

        self._queues[topic] = remaining
        return messages

    def get_dead_letters(self) -> list[Message]:
        """Получить и очистить Dead Letter Queue."""
        dlq = list(self._dead_letter_queue)
        self._dead_letter_queue.clear()
        return dlq

    # ── Barrier Points (синхронизация группы агентов) ──────────────────

    def create_barrier(
        self,
        barrier_id: str,
        required_agents: list[str],
        timeout_ms: int = 300000,
    ) -> "BarrierPoint":
        """
        Создать точку барьера для синхронизации группы агентов.

        Args:
            barrier_id: ID барьера.
            required_agents: ID агентов, которые должны отчитаться.
            timeout_ms: Таймаут ожидания.

        Returns:
            BarrierPoint объект.
        """
        return BarrierPoint(
            barrier_id=barrier_id,
            required_agents=set(required_agents),
            timeout_ms=timeout_ms,
        )

    # ── Metrics ────────────────────────────────────────────────────────

    @property
    def stats(self) -> dict[str, Any]:
        """Статистика Message Bus."""
        return {
            "total_messages": self._message_count,
            "delivered": self._delivered_count,
            "queued": sum(len(q) for q in self._queues.values()),
            "dead_letters": len(self._dead_letter_queue),
            "topics": len(self._subscribers),
            "subscriptions": sum(len(s) for s in self._subscribers.values()),
        }


@dataclass
class BarrierPoint:
    """
    Точка барьера — механизм ожидания группы агентов.

    Стратегии (из документации):
        wait_all — ждать все агенты
        wait_majority — достаточно N/2+1
        wait_first — первый завершивший
        proceed_with_available — работать с тем, что есть
    """
    barrier_id: str = ""
    required_agents: set[str] = field(default_factory=set)
    arrived_agents: set[str] = field(default_factory=set)
    results: dict[str, Any] = field(default_factory=dict)
    timeout_ms: int = 300000
    created_at: float = field(default_factory=time.time)

    def arrive(self, agent_id: str, result: Any = None) -> None:
        """Агент прибыл к барьеру с результатом."""
        self.arrived_agents.add(agent_id)
        if result is not None:
            self.results[agent_id] = result

    def is_complete(self, strategy: str = "wait_all") -> bool:
        """Проверить, выполнено ли условие барьера."""
        if strategy == "wait_all":
            return self.arrived_agents >= self.required_agents
        elif strategy == "wait_majority":
            return len(self.arrived_agents) > len(self.required_agents) // 2
        elif strategy == "wait_first":
            return len(self.arrived_agents) >= 1
        elif strategy == "proceed_with_available":
            elapsed = (time.time() - self.created_at) * 1000
            return elapsed > self.timeout_ms or len(self.arrived_agents) >= 1
        return False

    @property
    def is_timed_out(self) -> bool:
        elapsed = (time.time() - self.created_at) * 1000
        return elapsed > self.timeout_ms
