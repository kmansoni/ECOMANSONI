#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Training Seed 04: DevOps & Infrastructure as Code
==================================================
Паттерн: Программная генерация Docker Compose / K8s манифестов + Prometheus
Архитектурные решения:
  - Dataclass-based builder для типобезопасного описания инфраструктуры
  - Health check встроен в каждый сервис (liveness + readiness)
  - Prometheus metrics endpoint регистрируется декоратором
  - Structured logging (JSON) для совместимости с ELK/Loki
  - Конфиги генерируются программно — версионируются как код, не YAML вручную
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import asdict, dataclass, field
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

import yaml  # pip install pyyaml

# ---------------------------------------------------------------------------
# Structured JSON logger
# ---------------------------------------------------------------------------
class JsonFormatter(logging.Formatter):
    """Форматирует лог-записи как JSON для совместимости с Loki/ELK."""

    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
        }
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj, ensure_ascii=False)


def setup_logging(level: str = "INFO") -> logging.Logger:
    """Настраивает глобальный структурированный логгер."""
    logger = logging.getLogger("app")
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.setLevel(getattr(logging, level.upper()))
    return logger


logger = setup_logging()


# ---------------------------------------------------------------------------
# Docker Compose Generator
# ---------------------------------------------------------------------------
@dataclass
class ServiceConfig:
    """Конфигурация одного Docker-сервиса."""

    name: str
    image: str
    ports: list[str] = field(default_factory=list)
    environment: dict[str, str] = field(default_factory=dict)
    depends_on: list[str] = field(default_factory=list)
    healthcheck_cmd: str = "curl -f http://localhost/health || exit 1"
    restart: str = "unless-stopped"
    volumes: list[str] = field(default_factory=list)
    cpu_limit: str = "0.5"
    memory_limit: str = "512M"


@dataclass
class ComposeConfig:
    """Полная конфигурация Docker Compose v3."""

    services: list[ServiceConfig] = field(default_factory=list)
    version: str = "3.9"
    network_name: str = "app-network"

    def add_service(self, svc: ServiceConfig) -> "ComposeConfig":
        self.services.append(svc)
        return self  # fluent API

    def to_dict(self) -> dict[str, Any]:
        compose: dict[str, Any] = {"version": self.version, "services": {}, "networks": {}}
        for svc in self.services:
            compose["services"][svc.name] = {
                "image": svc.image,
                "restart": svc.restart,
                "ports": svc.ports,
                "environment": svc.environment,
                "depends_on": svc.depends_on,
                "volumes": svc.volumes,
                "deploy": {
                    "resources": {
                        "limits": {"cpus": svc.cpu_limit, "memory": svc.memory_limit}
                    }
                },
                "healthcheck": {
                    "test": ["CMD-SHELL", svc.healthcheck_cmd],
                    "interval": "30s",
                    "timeout": "10s",
                    "retries": 3,
                    "start_period": "40s",
                },
                "networks": [self.network_name],
            }
        compose["networks"][self.network_name] = {"driver": "bridge"}
        return compose

    def render_yaml(self) -> str:
        return yaml.dump(self.to_dict(), default_flow_style=False, sort_keys=True)


def build_production_compose() -> ComposeConfig:
    """Строит Docker Compose конфигурацию для типового web-стека."""
    return (
        ComposeConfig()
        .add_service(ServiceConfig(
            name="api",
            image="myapp/api:latest",
            ports=["8000:8000"],
            environment={"DATABASE_URL": "${DATABASE_URL}", "SECRET_KEY": "${SECRET_KEY}"},
            depends_on=["postgres", "redis"],
            healthcheck_cmd="curl -f http://localhost:8000/health || exit 1",
        ))
        .add_service(ServiceConfig(
            name="postgres",
            image="postgres:16-alpine",
            ports=["5432:5432"],
            environment={"POSTGRES_PASSWORD": "${POSTGRES_PASSWORD}", "POSTGRES_DB": "appdb"},
            volumes=["pgdata:/var/lib/postgresql/data"],
            healthcheck_cmd="pg_isready -U postgres",
        ))
        .add_service(ServiceConfig(
            name="redis",
            image="redis:7-alpine",
            ports=["6379:6379"],
            healthcheck_cmd="redis-cli ping",
        ))
        .add_service(ServiceConfig(
            name="prometheus",
            image="prom/prometheus:latest",
            ports=["9090:9090"],
            volumes=["./prometheus.yml:/etc/prometheus/prometheus.yml:ro"],
            healthcheck_cmd="wget -q --spider http://localhost:9090/-/healthy || exit 1",
        ))
    )


# ---------------------------------------------------------------------------
# Kubernetes Manifest Generator
# ---------------------------------------------------------------------------
def k8s_deployment(name: str, image: str, replicas: int = 2, port: int = 8000) -> dict[str, Any]:
    """Генерирует K8s Deployment манифест с resource limits и health probes."""
    return {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": name, "labels": {"app": name}},
        "spec": {
            "replicas": replicas,
            "selector": {"matchLabels": {"app": name}},
            "template": {
                "metadata": {"labels": {"app": name}},
                "spec": {
                    "containers": [{
                        "name": name,
                        "image": image,
                        "ports": [{"containerPort": port}],
                        "resources": {
                            "requests": {"cpu": "100m", "memory": "128Mi"},
                            "limits": {"cpu": "500m", "memory": "512Mi"},
                        },
                        "livenessProbe": {
                            "httpGet": {"path": "/health", "port": port},
                            "initialDelaySeconds": 30,
                            "periodSeconds": 10,
                        },
                        "readinessProbe": {
                            "httpGet": {"path": "/ready", "port": port},
                            "initialDelaySeconds": 5,
                            "periodSeconds": 5,
                        },
                        "envFrom": [{"secretRef": {"name": f"{name}-secrets"}}],
                    }]
                },
            },
        },
    }


# ---------------------------------------------------------------------------
# Health Check + Prometheus Metrics HTTP сервер
# ---------------------------------------------------------------------------
_metrics: dict[str, float] = {"requests_total": 0, "errors_total": 0, "latency_sum": 0.0}


def track_request(handler: Any) -> Any:
    """Декоратор: автоматически обновляет Prometheus-метрики для обработчика."""
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        start = time.monotonic()
        _metrics["requests_total"] += 1
        try:
            result = handler(*args, **kwargs)
            return result
        except Exception:
            _metrics["errors_total"] += 1
            raise
        finally:
            _metrics["latency_sum"] += time.monotonic() - start
    return wrapper


class AppHandler(BaseHTTPRequestHandler):
    """Минимальный HTTP-обработчик с health, ready и metrics эндпоинтами."""

    def log_message(self, fmt: str, *args: Any) -> None:
        logger.info(f"HTTP {args}")

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"status": "ok", "timestamp": time.time()})
        elif self.path == "/ready":
            # В проде — проверить подключение к БД
            self._json(200, {"status": "ready"})
        elif self.path == "/metrics":
            # Prometheus text format
            body = "\n".join([
                "# HELP requests_total Total HTTP requests",
                "# TYPE requests_total counter",
                f"requests_total {_metrics['requests_total']}",
                "# HELP errors_total Total HTTP errors",
                f"errors_total {_metrics['errors_total']}",
            ])
            self._text(200, body)
        else:
            self._json(404, {"error": "Not found"})

    def _json(self, code: int, data: dict[str, Any]) -> None:
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _text(self, code: int, text: str) -> None:
        body = text.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(body)


# ---------------------------------------------------------------------------
# Точка входа
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # Демо: генерация конфигов
    compose = build_production_compose()
    print("=== Docker Compose ===")
    print(compose.render_yaml()[:800], "...\n")

    manifest = k8s_deployment("api", "myapp/api:latest", replicas=3)
    print("=== K8s Deployment ===")
    print(yaml.dump(manifest, default_flow_style=False)[:600], "...\n")

    # Запуск health-check сервера
    port = 8080
    print(f"Запуск health-check сервера на порту {port}")
    print(f"  GET http://localhost:{port}/health")
    print(f"  GET http://localhost:{port}/metrics")
    server = HTTPServer(("0.0.0.0", port), AppHandler)
    server.serve_forever()
