#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ARIAMetrics — Prometheus-совместимые метрики и встроенная аналитика.
====================================================================

Метрики:
    inference_requests_total       Counter: всего запросов к /v1/chat/completions
    inference_latency_seconds      Histogram: latency по перцентилям
    inference_tokens_total         Counter: generated/prompt токены
    cache_hits_total               Counter: cache hit (exact/semantic)
    cache_misses_total             Counter: cache miss
    safety_blocks_total            Counter: заблокированных запросов по level
    training_runs_total            Counter: training прогонов (success/failed)
    feedback_records_total         Counter: записей feedback
    crawl_pages_total              Counter: просканированных страниц
    model_safety_score             Gauge: последний safety score из eval
    model_distinct_1               Gauge: последний distinct-1 из eval
    active_users_1h                Gauge: уникальных пользователей за час

Формат:
    Совместим с Prometheus text format (exposition format).
    Endpoint: GET /metrics (без auth) для prometheus scrape.
    Fallback: JSON формат если prometheus_client не установлен.

OpenTelemetry:
    При наличии opentelemetry-api — создаёт spans для inference pipeline:
        - span: aria.generate
        - span: aria.rag.retrieve
        - span: aria.safety.check
        - span: aria.cache.get

Масштабирование:
    Метрики in-memory (thread-safe с mutex).
    В multi-process деплое используйте prometheus_client с multiprocess mode.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Prometheus client (optional) ────────────────────────────────────────────

try:
    from prometheus_client import (
        Counter, Histogram, Gauge,
        generate_latest, CONTENT_TYPE_LATEST,
        CollectorRegistry, REGISTRY,
    )
    _PROM_AVAILABLE = True
except ImportError:
    _PROM_AVAILABLE = False
    logger.info("prometheus_client not installed, using built-in metrics")


# ─── OpenTelemetry (optional) ────────────────────────────────────────────────

try:
    from opentelemetry import trace as otel_trace
    from opentelemetry.trace import SpanKind
    _OTEL_AVAILABLE = True
    _tracer = otel_trace.get_tracer("aria.ai", "1.0.0")
except ImportError:
    _OTEL_AVAILABLE = False
    _tracer = None


# ─── Built-in metrics store ──────────────────────────────────────────────────

@dataclass
class _CounterValue:
    value: float = 0.0
    lock: threading.Lock = field(default_factory=threading.Lock)

    def inc(self, amount: float = 1.0) -> None:
        with self.lock:
            self.value += amount

    def get(self) -> float:
        with self.lock:
            return self.value


@dataclass
class _GaugeValue:
    value: float = 0.0
    lock: threading.Lock = field(default_factory=threading.Lock)

    def set(self, v: float) -> None:
        with self.lock:
            self.value = v

    def get(self) -> float:
        with self.lock:
            return self.value


class _HistogramValue:
    """Lightweight histogram: buckets [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, +Inf]."""

    BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, float("inf")]

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counts = [0] * len(self.BUCKETS)
        self._sum = 0.0
        self._total = 0

    def observe(self, value: float) -> None:
        with self._lock:
            self._sum += value
            self._total += 1
            for i, b in enumerate(self.BUCKETS):
                if value <= b:
                    self._counts[i] += 1

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "buckets": list(zip(self.BUCKETS, self._counts)),
                "sum": self._sum,
                "count": self._total,
                "p50": self._percentile(0.50),
                "p95": self._percentile(0.95),
                "p99": self._percentile(0.99),
            }

    def _percentile(self, p: float) -> float:
        if self._total == 0:
            return 0.0
        target = self._total * p
        cumulative = 0
        for i, (bucket, cnt) in enumerate(zip(self.BUCKETS, self._counts)):
            cumulative += cnt
            if cumulative >= target:
                return bucket
        return self.BUCKETS[-2]


# ─── Main metrics class ───────────────────────────────────────────────────────

class ARIAMetrics:
    """
    Thread-safe метрики ARIA AI engine.

    Usage:
        metrics = ARIAMetrics()
        
        # In inference handler:
        with metrics.inference_timer():
            response = generate(prompt)
        metrics.record_inference(
            prompt_tokens=100,
            completion_tokens=200,
            cached=False,
        )
        
        # In safety handler:
        metrics.record_safety_block(level=2)
        
        # Export:
        print(metrics.export_prometheus())   # Prometheus text format
        print(metrics.export_json())          # JSON
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()

        if _PROM_AVAILABLE:
            self._init_prometheus()
        else:
            self._init_builtin()

        # Sliding window для active users (1h)
        self._recent_user_actions: deque = deque()  # (timestamp, user_hash)
        self._active_users_1h: _GaugeValue = _GaugeValue()

    def _init_prometheus(self) -> None:
        """Инициализация Prometheus метрик."""
        self._prom_inference_total = Counter(
            "aria_inference_requests_total",
            "Total inference requests",
            ["status"],  # success|blocked|error
        )
        self._prom_latency = Histogram(
            "aria_inference_latency_seconds",
            "Inference latency",
            buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0],
        )
        self._prom_tokens = Counter(
            "aria_inference_tokens_total",
            "Total tokens processed",
            ["type"],  # prompt|completion
        )
        self._prom_cache_hits = Counter(
            "aria_cache_hits_total", "Cache hits", ["type"]  # exact|semantic
        )
        self._prom_cache_misses = Counter("aria_cache_misses_total", "Cache misses")
        self._prom_safety_blocks = Counter(
            "aria_safety_blocks_total", "Blocked requests", ["level"]
        )
        self._prom_training_runs = Counter(
            "aria_training_runs_total", "Training runs", ["status"]
        )
        self._prom_feedback = Counter(
            "aria_feedback_records_total", "Feedback records", ["rating"]
        )
        self._prom_crawl_pages = Counter(
            "aria_crawl_pages_total", "Crawled pages"
        )
        self._prom_safety_score = Gauge(
            "aria_model_safety_score", "Latest eval safety score"
        )
        self._prom_distinct1 = Gauge(
            "aria_model_distinct_1", "Latest eval distinct-1"
        )
        self._prom_active_users = Gauge(
            "aria_active_users_1h", "Unique users in last 1 hour"
        )
        logger.info("ARIAMetrics: Prometheus client initialized")

    def _init_builtin(self) -> None:
        """Инициализация встроенных метрик (без prometheus_client)."""
        self._c_inference_success = _CounterValue()
        self._c_inference_blocked = _CounterValue()
        self._c_inference_error   = _CounterValue()
        self._h_latency           = _HistogramValue()
        self._c_tokens_prompt     = _CounterValue()
        self._c_tokens_completion = _CounterValue()
        self._c_cache_exact       = _CounterValue()
        self._c_cache_semantic    = _CounterValue()
        self._c_cache_miss        = _CounterValue()
        self._c_safety_l0         = _CounterValue()
        self._c_safety_l1         = _CounterValue()
        self._c_safety_l2         = _CounterValue()
        self._c_training_done     = _CounterValue()
        self._c_training_failed   = _CounterValue()
        self._c_feedback          = _CounterValue()
        self._c_crawl_pages       = _CounterValue()
        self._g_safety_score      = _GaugeValue()
        self._g_distinct1         = _GaugeValue()

    # ── Record methods ────────────────────────────────────────────────────────

    def record_inference(
        self,
        latency_s: float,
        prompt_tokens: int,
        completion_tokens: int,
        status: str = "success",   # success|blocked|error
        cache_type: Optional[str] = None,  # exact|semantic|None
        user_hash: str = "",
    ) -> None:
        """Записать метрики одного inference запроса."""
        if _PROM_AVAILABLE:
            self._prom_inference_total.labels(status=status).inc()
            self._prom_latency.observe(latency_s)
            self._prom_tokens.labels(type="prompt").inc(prompt_tokens)
            self._prom_tokens.labels(type="completion").inc(completion_tokens)
            if cache_type:
                self._prom_cache_hits.labels(type=cache_type).inc()
            elif status == "success":
                self._prom_cache_misses.inc()
        else:
            counter = {
                "success": self._c_inference_success,
                "blocked": self._c_inference_blocked,
                "error":   self._c_inference_error,
            }.get(status, self._c_inference_success)
            counter.inc()
            self._h_latency.observe(latency_s)
            self._c_tokens_prompt.inc(prompt_tokens)
            self._c_tokens_completion.inc(completion_tokens)
            if cache_type == "exact":
                self._c_cache_exact.inc()
            elif cache_type == "semantic":
                self._c_cache_semantic.inc()
            elif status == "success":
                self._c_cache_miss.inc()

        # Active users tracking
        if user_hash:
            now = time.time()
            cutoff = now - 3600
            with self._lock:
                self._recent_user_actions.append((now, user_hash))
                while self._recent_user_actions and self._recent_user_actions[0][0] < cutoff:
                    self._recent_user_actions.popleft()
                unique = len({h for _, h in self._recent_user_actions})
            self._active_users_1h.set(unique)
            if _PROM_AVAILABLE:
                self._prom_active_users.set(unique)

    def record_safety_block(self, level: int) -> None:
        """Записать заблокированный запрос."""
        if _PROM_AVAILABLE:
            self._prom_safety_blocks.labels(level=str(level)).inc()
        else:
            {0: self._c_safety_l0, 1: self._c_safety_l1, 2: self._c_safety_l2}.get(
                level, self._c_safety_l2
            ).inc()

    def record_training_run(self, success: bool) -> None:
        if _PROM_AVAILABLE:
            self._prom_training_runs.labels(status="done" if success else "failed").inc()
        else:
            (self._c_training_done if success else self._c_training_failed).inc()

    def record_feedback(self, rating: int) -> None:
        if _PROM_AVAILABLE:
            self._prom_feedback.labels(rating=str(rating)).inc()
        else:
            self._c_feedback.inc()

    def record_crawl_page(self, n: int = 1) -> None:
        if _PROM_AVAILABLE:
            self._prom_crawl_pages.inc(n)
        else:
            self._c_crawl_pages.inc(n)

    def update_eval_metrics(self, safety_score: float, distinct_1: float) -> None:
        if _PROM_AVAILABLE:
            self._prom_safety_score.set(safety_score)
            self._prom_distinct1.set(distinct_1)
        else:
            self._g_safety_score.set(safety_score)
            self._g_distinct1.set(distinct_1)

    # ── Export ────────────────────────────────────────────────────────────────

    def export_prometheus(self) -> str:
        """Экспорт в Prometheus text exposition format."""
        if _PROM_AVAILABLE:
            return generate_latest(REGISTRY).decode("utf-8")
        return self._export_prometheus_manual()

    def _export_prometheus_manual(self) -> str:
        """Ручной экспорт Prometheus формата без библиотеки."""
        lines = []

        def counter(name: str, value: float, help_text: str) -> None:
            lines.append(f"# HELP {name} {help_text}")
            lines.append(f"# TYPE {name} counter")
            lines.append(f"{name} {value}")

        def gauge(name: str, value: float, help_text: str) -> None:
            lines.append(f"# HELP {name} {help_text}")
            lines.append(f"# TYPE {name} gauge")
            lines.append(f"{name} {value}")

        counter("aria_inference_requests_success_total",
                self._c_inference_success.get(), "Successful inference requests")
        counter("aria_inference_requests_blocked_total",
                self._c_inference_blocked.get(), "Blocked inference requests")
        counter("aria_inference_requests_error_total",
                self._c_inference_error.get(), "Failed inference requests")
        counter("aria_inference_tokens_prompt_total",
                self._c_tokens_prompt.get(), "Prompt tokens")
        counter("aria_inference_tokens_completion_total",
                self._c_tokens_completion.get(), "Completion tokens")
        counter("aria_cache_hits_exact_total",
                self._c_cache_exact.get(), "Exact cache hits")
        counter("aria_cache_hits_semantic_total",
                self._c_cache_semantic.get(), "Semantic cache hits")
        counter("aria_cache_misses_total",
                self._c_cache_miss.get(), "Cache misses")
        counter("aria_safety_blocks_l0_total",
                self._c_safety_l0.get(), "Level 0 safety blocks")
        counter("aria_safety_blocks_l2_total",
                self._c_safety_l2.get(), "Level 2 safety blocks")
        counter("aria_training_runs_total",
                self._c_training_done.get() + self._c_training_failed.get(), "Training runs")
        counter("aria_crawl_pages_total",
                self._c_crawl_pages.get(), "Crawled pages")
        gauge("aria_model_safety_score",
              self._g_safety_score.get(), "Model safety score")
        gauge("aria_model_distinct_1",
              self._g_distinct1.get(), "Model distinct-1")
        gauge("aria_active_users_1h",
              self._active_users_1h.get(), "Active users last 1h")

        snap = self._h_latency.snapshot()
        lines.append("# HELP aria_inference_latency_seconds Inference latency")
        lines.append("# TYPE aria_inference_latency_seconds histogram")
        for bucket, count in snap["buckets"]:
            le = "+Inf" if bucket == float("inf") else str(bucket)
            lines.append(f'aria_inference_latency_seconds_bucket{{le="{le}"}} {count}')
        lines.append(f"aria_inference_latency_seconds_sum {snap['sum']}")
        lines.append(f"aria_inference_latency_seconds_count {snap['count']}")

        return "\n".join(lines) + "\n"

    def export_json(self) -> dict:
        """Экспорт метрик в JSON для /v1/learning/stats."""
        if _PROM_AVAILABLE:
            # Prometheus клиент не имеет простого JSON API, работаем с builtin
            return {"prometheus_enabled": True}

        snap = self._h_latency.snapshot()
        return {
            "inference": {
                "success":   self._c_inference_success.get(),
                "blocked":   self._c_inference_blocked.get(),
                "error":     self._c_inference_error.get(),
                "latency_p50": snap["p50"],
                "latency_p95": snap["p95"],
                "latency_p99": snap["p99"],
            },
            "tokens": {
                "prompt":     self._c_tokens_prompt.get(),
                "completion": self._c_tokens_completion.get(),
            },
            "cache": {
                "hits_exact":    self._c_cache_exact.get(),
                "hits_semantic": self._c_cache_semantic.get(),
                "misses":        self._c_cache_miss.get(),
            },
            "safety": {
                "blocks_l0": self._c_safety_l0.get(),
                "blocks_l1": self._c_safety_l1.get(),
                "blocks_l2": self._c_safety_l2.get(),
            },
            "training": {
                "runs_done":   self._c_training_done.get(),
                "runs_failed": self._c_training_failed.get(),
            },
            "crawl": {
                "pages_total": self._c_crawl_pages.get(),
            },
            "model": {
                "safety_score": self._g_safety_score.get(),
                "distinct_1":   self._g_distinct1.get(),
            },
            "active_users_1h": self._active_users_1h.get(),
        }

    # ── Context manager for timing ────────────────────────────────────────────

    def inference_timer(self):
        """Context manager для измерения latency inference."""
        return _InferenceTimer(self)

    # ── OTel span ─────────────────────────────────────────────────────────────

    def start_span(self, name: str, attributes: Optional[dict] = None):
        """Создать OpenTelemetry span если доступен."""
        if _OTEL_AVAILABLE and _tracer:
            return _tracer.start_as_current_span(name, attributes=attributes or {})
        return _NoOpSpan()


class _InferenceTimer:
    """Context manager: замеряет время и записывает в histogram."""

    def __init__(self, metrics: ARIAMetrics) -> None:
        self._metrics = metrics
        self._start = 0.0
        self.elapsed = 0.0

    def __enter__(self):
        self._start = time.perf_counter()
        return self

    def __exit__(self, *_):
        self.elapsed = time.perf_counter() - self._start


class _NoOpSpan:
    """No-op span если OTel недоступен."""
    def __enter__(self): return self
    def __exit__(self, *_): pass


# ─── Global singleton ─────────────────────────────────────────────────────────

_global_metrics: Optional[ARIAMetrics] = None
_metrics_lock = threading.Lock()


def get_metrics() -> ARIAMetrics:
    """Получить глобальный singleton ARIAMetrics."""
    global _global_metrics
    if _global_metrics is None:
        with _metrics_lock:
            if _global_metrics is None:
                _global_metrics = ARIAMetrics()
    return _global_metrics
