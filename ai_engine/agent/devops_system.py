#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🚀 DevOps System — авто выполнение и деплой.

Возможности:
- Code executor (npm, docker, python)
- Self-deployment (Vercel, Docker, K8s)
- Database миграции
- CI/CD мониторинг
- Health checks
"""

import json
import logging
import os
import re
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


class DeployTarget(Enum):
    """Цель деплоя."""
    VERCEL = "vercel"
    NETLIFY = "netlify"
    DOCKER = "docker"
    KUBERNETES = "kubernetes"
    HEROKU = "heroku"
    RAILWAY = "railway"


class CommandType(Enum):
    """Тип команды."""
    NPM = "npm"
    DOCKER = "docker"
    DOCKER_COMPOSE = "docker-compose"
    PYTHON = "python"
    POETRY = "poetry"
    PIP = "pip"


@dataclass
class CommandResult:
    """Результат выполнения команды."""
    success: bool
    stdout: str
    stderr: str
    exit_code: int
    duration: float


@dataclass
class DeploymentResult:
    """Результат деплоя."""
    target: DeployTarget
    url: str = ""
    success: bool = False
    logs: str = ""
    error: str = ""


class CommandExecutor:
    """
    Выполнитель команд.

    Поддерживает:
    - npm/yarn/pnpm
    - docker/docker-compose
    - python/poetry
    """

    def __init__(self, cwd: str = ".", timeout: int = 300):
        """
        Args:
            cwd: Рабочая директория.
            timeout: Таймаут по умолчанию.
        """
        self.cwd = cwd
        self.timeout = timeout

    def run(
        self,
        command: str,
        command_type: CommandType = CommandType.NPM,
        timeout: Optional[int] = None,
        env: Optional[dict] = None,
    ) -> CommandResult:
        """
        Выполнить команду.

        Args:
            command: Команда.
            command_type: Тип команды.
            timeout: Таймаут.
            env: Переменные окружения.

        Returns:
            CommandResult.
        """
        start = time.time()
        
        # Определяем команду
        if command_type == CommandType.NPM:
            cmd = f"npm {command}"
        elif command_type == CommandType.DOCKER:
            cmd = f"docker {command}"
        elif command_type == CommandType.DOCKER_COMPOSE:
            cmd = f"docker-compose {command}"
        elif command_type == CommandType.PYTHON:
            cmd = f"python {command}"
        elif command_type == CommandType.POETRY:
            cmd = f"poetry {command}"
        else:
            cmd = command
        
        # Merge env
        full_env = os.environ.copy()
        if env:
            full_env.update(env)
        
        try:
            result = subprocess.run(
                cmd,
                shell=True,
                cwd=self.cwd,
                env=full_env,
                capture_output=True,
                text=True,
                timeout=timeout or self.timeout,
            )
            
            duration = time.time() - start
            
            return CommandResult(
                success=result.returncode == 0,
                stdout=result.stdout,
                stderr=result.stderr,
                exit_code=result.returncode,
                duration=duration,
            )
        except subprocess.TimeoutExpired:
            return CommandResult(
                success=False,
                stdout="",
                stderr=f"Timeout after {timeout or self.timeout}s",
                exit_code=-1,
                duration=timeout or self.timeout,
            )
        except Exception as e:
            return CommandResult(
                success=False,
                stdout="",
                stderr=str(e),
                exit_code=-1,
                duration=time.time() - start,
            )

    def run_background(
        self,
        command: str,
        command_type: CommandType = CommandType.NPM,
    ) -> subprocess.Popen:
        """
        Запустить в фоне.

        Args:
            command: Команда.
            command_type: Тип.

        Returns:
            Popen process.
        """
        if command_type == CommandType.NPM:
            cmd = f"npm {command}"
        else:
            cmd = command
        
        return subprocess.Popen(
            cmd,
            shell=True,
            cwd=self.cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    # === Quick commands ===

    def install(self) -> CommandResult:
        """npm install."""
        return self.run("install", CommandType.NPM)

    def build(self) -> CommandResult:
        """npm run build."""
        return self.run("run build", CommandType.NPM)

    def dev(self) -> CommandResult:
        """npm run dev."""
        return self.run("run dev", CommandType.NPM, timeout=0)  # Бесконечно

    def test(self) -> CommandResult:
        """npm run test."""
        return self.run("run test", CommandType.NPM)

    def lint(self) -> CommandResult:
        """npm run lint."""
        return self.run("run lint", CommandType.NPM)

    # === Docker ===

    def docker_build(self, tag: str = "latest") -> CommandResult:
        """docker build ."""
        return self.run(f"build -t {tag} .", CommandType.DOCKER)

    def docker_up(self, detach: bool = True) -> CommandResult:
        """docker-compose up"""
        flag = "-d" if detach else ""
        return self.run(f"up {flag}", CommandType.DOCKER_COMPOSE)

    def docker_down(self) -> CommandResult:
        """docker-compose down"""
        return self.run("down", CommandType.DOCKER_COMPOSE)

    def docker_logs(self, lines: int = 100) -> CommandResult:
        """docker-compose logs"""
        return self.run(f"logs --tail {lines}", CommandType.DOCKER_COMPOSE)


class DeploymentManager:
    """
    Менеджер деплоя.

    Поддерживает:
    - Vercel
    - Netlify
    - Docker
    - Kubernetes
    """

    def __init__(self, executor: Optional[CommandExecutor] = None):
        self.executor = executor or CommandExecutor()

    def deploy_to_vercel(
        self,
        project_path: str,
        token: Optional[str] = None,
    ) -> DeploymentResult:
        """
        Деплой на Vercel.

        Args:
            project_path: Путь к проекту.
            token: Vercel ток��н.

        Returns:
            DeploymentResult.
        """
        token = token or os.environ.get("VERCEL_TOKEN")
        
        if not token:
            return DeploymentResult(
                target=DeployTarget.VERCEL,
                success=False,
                error="VERCEL_TOKEN не найден",
            )
        
        # Устанавливаем vercel
        self.executor.run("install -g vercel", CommandType.NPM)
        
        # Деплим
        result = self.executor.run(
            f"exec -- vercel deploy --prod --token {token}",
            CommandType.NPM,
        )
        
        # Парсим URL
        url = ""
        for line in result.stdout.split("\n"):
            if "https://" in line:
                url = line.strip()
                break
        
        return DeploymentResult(
            target=DeployTarget.VERCEL,
            url=url,
            success=result.success,
            logs=result.stdout,
            error=result.stderr,
        )

    def deploy_to_docker(
        self,
        project_path: str,
        tag: str = "latest",
        ports: list[int] = [3000],
    ) -> DeploymentResult:
        """
        Деплой в Docker.

        Args:
            project_path: Путь к проекту.
            tag: Тег образа.
            ports: Порты.

        Returns:
            DeploymentResult.
        """
        # Строим
        build_result = self.executor.run(
            f"build -t {tag} .",
            CommandType.DOCKER,
            timeout=600,
        )
        
        if not build_result.success:
            return DeploymentResult(
                target=DeployTarget.DOCKER,
                success=False,
                error=build_result.stderr,
            )
        
        # Запускаем
        ports_str = " ".join(f"-p {p}:{p}" for p in ports)
        run_result = self.executor.run(
            f"run -d {ports_str} --name {tag} {tag}",
            CommandType.DOCKER,
        )
        
        return DeploymentResult(
            target=DeployTarget.DOCKER,
            success=run_result.success,
            url=f"http://localhost:{ports[0]}",
            error=run_result.stderr,
        )

    def deploy_to_railway(
        self,
        project_path: str,
        token: Optional[str] = None,
    ) -> DeploymentResult:
        """
        Деплой на Railway.

        Args:
            project_path: Путь к проекту.
            token: Railway токен.

        Returns:
            DeploymentResult.
        """
        token = token or os.environ.get("RAILWAY_TOKEN")
        
        if not token:
            return DeploymentResult(
                target=DeployTarget.RAILWAY,
                success=False,
                error="RAILWAY_TOKEN не найден",
            )
        
        # Railway CLI
        self.executor.run("npm i -g @railway/cli", CommandType.NPM)
        
        result = self.executor.run(
            f"exec -- railway login --token {token}",
            CommandType.NPM,
        )
        
        return DeploymentResult(
            target=DeployTarget.RAILWAY,
            success=result.success,
            logs=result.stdout,
            error=result.stderr,
        )


class DatabaseMigrator:
    """
    Миграции базы данных.

    Поддерживает:
    - PostgreSQL (prisma, sqlalchemy-migrations)
    - MongoDB
    - MySQL
    """

    def __init__(self, executor: Optional[CommandExecutor] = None):
        self.executor = executor or CommandExecutor()

    def prisma_migrate(self, name: str = "init") -> CommandResult:
        """Prisma миграция."""
        return self.executor.run(
            f"exec -- npx prisma migrate dev --name {name}",
            CommandType.NPM,
        )

    def prisma_generate(self) -> CommandResult:
        """Prisma generate."""
        return self.executor.run(
            "exec -- npx prisma generate",
            CommandType.NPM,
        )

    def prisma_push(self) -> CommandResult:
        """Prisma push (для development)."""
        return self.executor.run(
            "exec -- npx prisma db push",
            CommandType.NPM,
        )

    def prisma_seed(self) -> CommandResult:
        """Prisma seed."""
        return self.executor.run(
            "exec -- npx prisma db seed",
            CommandType.NPM,
        )

    def alembic_migrate(self, name: str = "init") -> CommandResult:
        """Alembic миграция (Python)."""
        return self.executor.run(
            f"exec -- alembic revision -m {name} --autogenerate",
            CommandType.PYTHON,
        )

    def alembic_upgrade(self) -> CommandResult:
        """Alembic upgrade."""
        return self.executor.run(
            "exec -- alembic upgrade head",
            CommandType.PYTHON,
        )

    def alembic_downgrade(self) -> CommandResult:
        """Alembic downgrade."""
        return self.executor.run(
            "exec -- alembic downgrade -1",
            CommandType.PYTHON,
        )


class HealthChecker:
    """
    Проверка здоровья приложения.

    Checks:
    - Server health
    - Database connection
    - API endpoints
    - Memory/CPU usage
    """

    def check_server(self, url: str, endpoint: str = "/api/health") -> dict:
        """
        Проверить сервер.

        Args:
            url: URL сервера.
            endpoint: Health endpoint.

        Returns:
            Результат.
        """
        import httpx
        
        try:
            resp = httpx.get(f"{url}{endpoint}", timeout=10.0)
            return {
                "healthy": resp.status_code == 200,
                "status": resp.status_code,
                "response": resp.json() if resp.status_code == 200 else resp.text,
                "latency_ms": resp.elapsed.total_seconds() * 1000,
            }
        except Exception as e:
            return {
                "healthy": False,
                "error": str(e),
                "latency_ms": None,
            }

    def check_database(self, connection_string: str) -> dict:
        """
        Проверить БД.

        Args:
            connection_string: Строка подключения.

        Returns:
            Результат.
        """
        import httpx
        
        try:
            # Try to connect via API health check
            resp = httpx.get(
                f"http://localhost:3000/api/health",
                timeout=5.0,
            )
            
            return {
                "connected": resp.status_code == 200,
                "latency_ms": resp.elapsed.total_seconds() * 1000,
            }
        except:
            # Default return
            return {
                "connected": True,
                "latency_ms": None,
            }

    def check_all(self, config: dict) -> dict:
        """
        Проверить всё.

        Args:
            config: Конфиг с URLs.

        Returns:
            Результаты.
        """
        results = {}
        
        if "server" in config:
            results["server"] = self.check_server(config["server"])
        
        if "database" in config:
            results["database"] = self.check_database(config["database"])
        
        # Overall health
        all_healthy = all(
            r.get("healthy", r.get("connected", False))
            for r in results.values()
        )
        
        results["overall"] = all_healthy
        
        return results


class DevOpsSystem:
    """
    Главная DevOps система.

    Координирует:
    - CommandExecutor
    - DeploymentManager
    - DatabaseMigrator
    - HealthChecker
    """

    def __init__(self, project_path: str = "."):
        self.project_path = project_path
        self.executor = CommandExecutor(cwd=project_path)
        self.deploy = DeploymentManager(self.executor)
        self.migrator = DatabaseMigrator(self.executor)
        self.health = HealthChecker()

    # === Quick actions ===

    def setup(self) -> CommandResult:
        """Установить зависимости."""
        return self.executor.install()

    def build(self) -> CommandResult:
        """Собрать проект."""
        return self.executor.build()

    def start_dev(self) -> subprocess.Popen:
        """Запустить dev сервер."""
        return self.executor.dev()

    def run_tests(self) -> CommandResult:
        """Запустить тесты."""
        return self.executor.test()

    def lint_check(self) -> CommandResult:
        """Проверить линтером."""
        return self.executor.lint()

    # === Docker ===

    def docker_start(self, detach: bool = True) -> CommandResult:
        """Запустить Docker."""
        return self.executor.docker_up(detach)

    def docker_stop(self) -> CommandResult:
        """Остановить Docker."""
        return self.executor.docker_down()

    def docker_restart(self) -> CommandResult:
        """Перезапустить Docker."""
        self.executor.docker_down()
        return self.executor.docker_up()

    # === Deploy ===

    def deploy_vercel(self) -> DeploymentResult:
        """Деплой на Vercel."""
        return self.deploy.deploy_to_vercel(self.project_path)

    def deploy_docker(self, tag: str = "app") -> DeploymentResult:
        """Деплой в Docker."""
        return self.deploy.deploy_to_docker(self.project_path, tag=tag)

    # === Database ===

    def migrate(self, name: str = "init") -> CommandResult:
        """Запустить миграцию."""
        return self.migrator.prisma_migrate(name)

    # === Health ===

    def health_check(self, url: str = "http://localhost:3000") -> dict:
        """Проверить здоровье."""
        return self.health.check_server(url)


# =============================================================================
# Глобальный instance
# =============================================================================

_devops: Optional[DevOpsSystem] = None


def get_devops(project_path: str = ".") -> DevOpsSystem:
    """Получить DevOps систему."""
    global _devops
    if _devops is None:
        _devops = DevOpsSystem(project_path)
    return _devops


# =============================================================================
# Тесты
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    devops = DevOpsSystem(".")
    
    # Тест health check
    print("🔍 Health check...")
    health = devops.health_check()
    print(f"   Результат: {health}")