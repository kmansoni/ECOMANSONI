#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
📊 Monitoring System — Sentry + Prometheus.

Возможности:
- Sentry интеграция
- Error tracking
- Performance monitoring
- Prometheus metrics
- Health checks
"""

import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


@dataclass
class SentryConfig:
    """Sentry конфиг."""
    dsn: str = ""
    environment: str = "production"
    release: str = ""
    sample_rate: float = 1.0


@dataclass
class Metric:
    """Метрика."""
    name: str
    value: float
    tags: dict = field(default_factory=dict)
    timestamp: str = ""


class SentryMonitor:
    """
    Sentry интеграция.

    Отслеживает:
    - Exceptions
    - Performance
    - Release health
    """

    def __init__(self, config: SentryConfig = None):
        self.config = config or SentryConfig()
        self._initialized = False

    def init(self) -> bool:
        """Инициализировать Sentry."""
        try:
            import sentry_sdk
            
            sentry_sdk.init(
                dsn=self.config.dsn,
                environment=self.config.environment,
                release=self.config.release,
                traces_sample_rate=self.config.sample_rate,
                integrations=[],
            )
            
            self._initialized = True
            return True
        except Exception as e:
            logger.warning(f"Sentry init failed: {e}")
            return False

    def capture_exception(self, error: Exception) -> None:
        """Отправить исключение."""
        try:
            import sentry_sdk
            sentry_sdk.capture_exception(error)
        except:
            pass

    def capture_message(self, message: str, level: str = "info") -> None:
        """Отправить сообщение."""
        try:
            import sentry_sdk
            sentry_sdk.capture_message(message, level=level)
        except:
            pass

    def set_tag(self, key: str, value: str) -> None:
        """Установить тег."""
        try:
            import sentry_sdk
            sentry_sdk.set_tag(key, value)
        except:
            pass


class PrometheusMetrics:
    """
    Prometheus metrics.

    Собирает:
    - HTTP requests
    - Custom metrics
    - System metrics
    """

    def __init__(self):
        self.metrics: dict[str, list] = {}
        self._counter = 0

    def gauge(
        self,
        name: str,
        value: float,
        tags: dict = None,
    ) -> None:
        """Гадж."""
        metric = Metric(name=name, value=value, tags=tags or {})
        self.metrics.setdefault(name, []).append(metric)

    def increment(
        self,
        name: str,
        value: float = 1,
        tags: dict = None,
    ) -> None:
        """Инкремент."""
        self.gauge(name, value, tags)

    def histogram(
        self,
        name: str,
        value: float,
        tags: dict = None,
    ) -> None:
        """Гистограмма."""
        self.gauge(name, value, tags)

    def get_metrics(self) -> str:
        """Получить в формате Prometheus."""
        lines = []
        
        for name, metrics in self.metrics.items():
            for m in metrics:
                tags_str = ",".join(
                    f'{k}="{v}"'
                    for k, v in m.tags.items()
                )
                
                if tags_str:
                    lines.append(f"{name}{{{tags_str}}} {m.value}")
                else:
                    lines.append(f"{name} {m.value}")
        
        return "\n".join(lines)

    def export_http(self, handler: Callable) -> Callable:
        """Экспортировать как HTTP handler."""
        def wrapper(*args, **kwargs):
            if kwargs.get("path") == "/metrics":
                return self.get_metrics()
            return handler(*args, **kwargs)
        return wrapper


class HealthChecker:
    """
    Health checker для мониторинга.

    Checks:
    - Server health
    - Database
    - External services
    """

    def __init__(self):
        self._checks = []

    def register_check(self, name: str, check_fn: Callable) -> None:
        """Зарегистрировать проверку."""
        self._checks.append({"name": name, "fn": check_fn})

    def check_all(self) -> dict:
        """Проверить всё."""
        results = {
            "status": "ok",
            "checks": [],
            "timestamp": datetime.now().isoformat(),
        }
        
        for check in self._checks:
            try:
                result = check["fn"]()
                results["checks"].append({
                    "name": check["name"],
                    "status": "ok" if result else "error",
                    "result": result,
                })
            except Exception as e:
                results["checks"].append({
                    "name": check["name"],
                    "status": "error",
                    "error": str(e),
                })
                results["status"] = "degraded"
        
        return results


class MonitoringSystem:
    """
    Главная мониторинг система.

    Combines:
    - Sentry
    - Prometheus
    - Health checks
    """

    def __init__(self):
        self.sentry = SentryMonitor()
        self.prometheus = PrometheusMetrics()
        self.health = HealthChecker()

    def init_sentry(
        self,
        dsn: str = None,
        environment: str = "production",
    ) -> bool:
        """Инициализировать Sentry."""
        dsn = dsn or os.environ.get("SENTRY_DSN")
        
        if not dsn:
            logger.warning("Sentry DSN not provided")
            return False
        
        self.sentry.config.dsn = dsn
        self.sentry.config.environment = environment
        
        return self.sentry.init()

    def track_request(
        self,
        method: str,
        path: str,
        status: int,
        duration: float,
    ) -> None:
        """Отслеживать HTTP запрос."""
        self.prometheus.increment(
            "http_requests_total",
            tags={
                "method": method,
                "path": path,
                "status": str(status),
            },
        )
        
        self.prometheus.histogram(
            "http_request_duration_seconds",
            duration,
            tags={"method": method, "path": path},
        )

    def register_health_check(self, name: str, check_fn: Callable) -> None:
        """Регистрировать health check."""
        self.health.register_check(name, check_fn)

    def get_health(self) -> dict:
        """Получить health status."""
        return self.health.check_all()

    def get_metrics(self) -> str:
        """ПолучитьPrometheus metrics."""
        return self.prometheus.get_metrics()


# =============================================================================
# Quick setup functions
# =============================================================================

def setup_sentry(
    dsn: str = None,
    environment: str = "production",
    release: str = None,
) -> bool:
    """
    Быстрая настройка Sentry.

    Args:
        dsn: Sentry DSN.
        environment: Окружение.
        release: Релиз.

    Returns:
        Успех.
    """
    monitor = MonitoringSystem()
    return monitor.init_sentry(dsn, environment)


# =============================================================================
# Templates
# =============================================================================

def generate_sentry_config() -> str:
    """Сгенерировать Sentry конфиг."""
    return '''
// sentry.client.config.js
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: `messenger@${process.env.npm_package_version}`,
  tracesSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayCanvas(),
    Sentry.browserTracingIntegration(),
  ],
});
'''


def generate_prometheus_metrics() -> str:
    """Сгенерировать Prometheus scrap config."""
    return '''
// prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'app'
    static_configs:
      - targets: ['localhost:3000']
'''


# =============================================================================
# Глобальный instance
# =============================================================================

_monitor: Optional[MonitoringSystem] = None


def get_monitoring_system() -> MonitoringSystem:
    """Получить мониторинг."""
    global _monitor
    if _monitor is None:
        _monitor = MonitoringSystem()
    return _monitor


if __name__ == "__main__":
    monitor = get_monitoring_system()
    
    # Register health check
    monitor.register_health_check("database", lambda: True)
    
    health = monitor.get_health()
    print(f"Health: {health['status']}")