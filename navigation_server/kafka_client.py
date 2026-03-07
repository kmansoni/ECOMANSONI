"""
Navigation Server — Kafka / Redpanda Async Producer
Event envelope schema guarantees trace_id propagation and idempotent replay detection.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import orjson
import structlog
from aiokafka import AIOKafkaProducer
from aiokafka.errors import KafkaError

from config import get_settings

logger = structlog.get_logger(__name__)

_producer: AIOKafkaProducer | None = None


async def init_kafka() -> None:
    """Start the AIOKafka producer. Called once from lifespan."""
    global _producer
    settings = get_settings()

    _producer = AIOKafkaProducer(
        bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
        # value_serializer: we pass bytes directly (orjson)
        value_serializer=None,
        key_serializer=lambda k: k.encode() if isinstance(k, str) else k,
        linger_ms=settings.KAFKA_PRODUCER_LINGER_MS,
        batch_size=settings.KAFKA_PRODUCER_BATCH_SIZE,
        compression_type=settings.KAFKA_PRODUCER_COMPRESSION_TYPE,
        acks="all",              # leader + all ISR replicas must ack
        enable_idempotence=True, # exactly-once producer semantics
        max_in_flight_requests_per_connection=5,
        request_timeout_ms=10_000,
        retry_backoff_ms=200,
    )
    await _producer.start()
    logger.info("kafka.producer_started", brokers=settings.KAFKA_BOOTSTRAP_SERVERS)


async def close_kafka() -> None:
    global _producer
    if _producer is not None:
        await _producer.stop()
        logger.info("kafka.producer_stopped")
        _producer = None


def _get_producer() -> AIOKafkaProducer:
    if _producer is None:
        raise RuntimeError("Kafka producer not initialised. Call init_kafka() first.")
    return _producer


async def produce_event(
    topic: str,
    key: str,
    data: Any,
    *,
    event_type: str,
    trace_id: str | None = None,
) -> None:
    """
    Publish an event to Kafka.

    Envelope:
    {
        "event_type": str,
        "timestamp":  ISO-8601 UTC,
        "trace_id":   str (UUID4),
        "data":       <payload>
    }

    - key is used for partition routing (use entity ID for ordering guarantees)
    - orjson handles datetime, UUID, and custom types
    - KafkaError is logged and re-raised; callers must decide retry strategy
    """
    producer = _get_producer()
    envelope = {
        "event_type": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "trace_id": trace_id or str(uuid.uuid4()),
        "data": data,
    }
    value_bytes = orjson.dumps(envelope)
    try:
        await producer.send_and_wait(topic, value=value_bytes, key=key)
        logger.debug(
            "kafka.event_produced",
            topic=topic,
            event_type=event_type,
            key=key,
            trace_id=envelope["trace_id"],
        )
    except KafkaError as exc:
        logger.error(
            "kafka.produce_failed",
            topic=topic,
            event_type=event_type,
            key=key,
            error=str(exc),
        )
        raise
