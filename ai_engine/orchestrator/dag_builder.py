#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DAG Builder — построение графа зависимостей подзадач.

Алгоритм (из документации orchestrator-core):
    1. Анализ задачи → извлечение доменов
    2. Разбивка по доменам → подзадачи
    3. Проверка атомарности каждой подзадачи
    4. Построение рёбер зависимостей
    5. Обнаружение циклов
    6. Оценка сложности
    7. Нахождение критического пути
"""

import logging
import re
from typing import Callable, Optional

from .models import (
    AgentRole,
    DAG,
    DAGNode,
    EdgeType,
    Intent,
    SubTask,
    SubTaskStatus,
    Task,
)

logger = logging.getLogger(__name__)


# ── Intent Extraction ──────────────────────────────────────────────────

class IntentExtractor:
    """
    Извлекает намерения из текста задачи.

    Работает в двух режимах:
        - Эвристический (без LLM): по ключевым словам
        - LLM-based: через LLM callable
    """

    # Маппинг ключевых слов -> action
    ACTION_KEYWORDS: dict[str, list[str]] = {
        "understand": ["разобраться", "понять", "объясни", "что такое", "как работает", "explain", "understand", "describe"],
        "create": ["создай", "добавь", "реализуй", "напиши", "create", "add", "implement", "build", "write"],
        "fix": ["исправь", "почини", "баг", "ошибка", "fix", "bug", "error", "crash"],
        "refactor": ["рефакторинг", "упрости", "оптимизируй", "декомпозиция", "refactor", "simplify", "optimize"],
        "test": ["тест", "проверь", "протестируй", "test", "verify", "validate"],
        "review": ["ревью", "аудит", "проверь код", "review", "audit"],
        "research": ["исследуй", "найди", "проанализируй", "research", "analyze", "explore", "find"],
        "deploy": ["задеплой", "разверни", "deploy", "release", "publish"],
        "document": ["документация", "опиши", "задокументируй", "document", "docs"],
    }

    # Маппинг ключевых слов -> domain
    DOMAIN_KEYWORDS: dict[str, list[str]] = {
        "frontend": ["компонент", "ui", "css", "стиль", "react", "tsx", "jsx", "component", "page", "layout", "button"],
        "backend": ["api", "сервер", "endpoint", "маршрут", "server", "route", "handler", "middleware"],
        "database": ["бд", "база данных", "миграция", "sql", "таблица", "database", "migration", "schema", "query"],
        "auth": ["авторизация", "аутентификация", "jwt", "token", "auth", "login", "register", "password"],
        "testing": ["тест", "test", "spec", "jest", "pytest", "e2e", "unit"],
        "devops": ["docker", "ci", "cd", "deploy", "kubernetes", "k8s", "pipeline"],
        "security": ["безопасность", "xss", "injection", "csrf", "security", "vulnerability"],
    }

    def __init__(self, llm: Optional[Callable[[str], str]] = None) -> None:
        self.llm = llm

    def extract(self, task: Task) -> list[Intent]:
        """
        Извлечь намерения из задачи.

        Args:
            task: Задача пользователя.

        Returns:
            Список Intent.
        """
        if self.llm is not None:
            return self._llm_extract(task)
        return self._heuristic_extract(task)

    def _heuristic_extract(self, task: Task) -> list[Intent]:
        """Эвристическое извлечение по ключевым словам."""
        text = task.prompt.lower()
        intents: list[Intent] = []

        # Определить actions
        actions_found: list[str] = []
        for action, keywords in self.ACTION_KEYWORDS.items():
            if any(kw in text for kw in keywords):
                actions_found.append(action)

        if not actions_found:
            actions_found = ["create"]  # default action

        # Определить domain
        domain = "general"
        for dom, keywords in self.DOMAIN_KEYWORDS.items():
            if any(kw in text for kw in keywords):
                domain = dom
                break

        # Извлечь target (упрощённо: значимые существительные из задачи)
        target = self._extract_target(task.prompt)

        # Извлечь constraints
        constraints = self._extract_constraints(task.prompt)

        for action in actions_found:
            intents.append(Intent(
                action=action,
                target=target,
                constraints=constraints,
                domain=domain,
            ))

        return intents

    def _llm_extract(self, task: Task) -> list[Intent]:
        """LLM-based извлечение с fallback."""
        assert self.llm is not None
        try:
            prompt = (
                f"Analyze this task and extract intents.\n"
                f"Task: {task.prompt}\n\n"
                f"Output JSON array of objects with fields: action, target, domain, constraints.\n"
                f"Actions: understand, create, fix, refactor, test, review, research, deploy, document"
            )
            response = self.llm(prompt)
            # Простой парсинг — попытаться найти JSON
            import json
            # Найти JSON массив в ответе
            match = re.search(r'\[.*\]', response, re.DOTALL)
            if match:
                data = json.loads(match.group())
                return [
                    Intent(
                        action=item.get("action", "create"),
                        target=item.get("target", task.prompt[:50]),
                        domain=item.get("domain", "general"),
                        constraints=item.get("constraints", []),
                    )
                    for item in data
                ]
        except Exception as exc:
            logger.warning("LLM intent extraction failed: %s. Fallback to heuristic.", exc)

        return self._heuristic_extract(task)

    @staticmethod
    def _extract_target(text: str) -> str:
        """Извлечь целевой объект из текста (упрощённо)."""
        # Убрать глаголы-действия и взять оставшееся
        cleaned = re.sub(
            r'\b(создай|добавь|исправь|напиши|реализуй|проверь|найди|разобраться|'
            r'create|add|fix|write|implement|check|find|build)\b',
            '',
            text,
            flags=re.IGNORECASE,
        )
        cleaned = cleaned.strip(" .,;:-")
        return cleaned[:100] if cleaned else text[:100]

    @staticmethod
    def _extract_constraints(text: str) -> list[str]:
        """Извлечь ограничения из текста."""
        constraints: list[str] = []
        # Паттерны ограничений
        constraint_patterns = [
            r'не более (\d+)',
            r'максимум (\d+)',
            r'без (.+?)(?:\.|,|$)',
            r'только (.+?)(?:\.|,|$)',
            r'используя (.+?)(?:\.|,|$)',
        ]
        for pattern in constraint_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            constraints.extend(matches)
        return constraints


# ── Action -> AgentRole Mapping ────────────────────────────────────────

ACTION_TO_AGENT_ROLE: dict[str, AgentRole] = {
    "understand": AgentRole.CODE_ANALYST,
    "create": AgentRole.CODER,
    "fix": AgentRole.DEBUGGER,
    "refactor": AgentRole.CODER,
    "test": AgentRole.TEST_WRITER,
    "review": AgentRole.REVIEWER,
    "research": AgentRole.RESEARCHER,
    "deploy": AgentRole.DEVOPS,
    "document": AgentRole.DOCS_WRITER,
}


# ── DAG Builder ────────────────────────────────────────────────────────

class DAGBuilder:
    """
    Строит DAG (Directed Acyclic Graph) из задачи.

    Алгоритм:
        1. IntentExtractor извлекает намерения
        2. Каждое намерение → подзадачи по доменам
        3. Построение зависимостей между подзадачами
        4. Валидация: нет циклов, все зависимости разрешимы
        5. Расчёт критического пути

    Attributes:
        intent_extractor: Экстрактор намерений.
    """

    def __init__(self, llm: Optional[Callable[[str], str]] = None) -> None:
        self.intent_extractor = IntentExtractor(llm=llm)

    def build(self, task: Task) -> DAG:
        """
        Построить DAG из задачи.

        Args:
            task: Задача пользователя.

        Returns:
            DAG с подзадачами и зависимостями.

        Raises:
            ValueError: Если обнаружен цикл в графе.
        """
        logger.info("DAGBuilder.build(): задача '%s'", task.prompt[:80])

        # Шаг 1: Извлечение намерений
        intents = self.intent_extractor.extract(task)
        task.intents = intents
        logger.debug("Извлечено намерений: %d", len(intents))

        # Шаг 2: Создание DAG
        dag = DAG(root_task_id=task.task_id)

        # Шаг 3: Генерация подзадач
        subtasks = self._generate_subtasks(task, intents)

        # Шаг 4: Добавление узлов
        for subtask in subtasks:
            dag.add_node(subtask)

        # Шаг 5: Построение рёбер зависимостей
        self._build_edges(dag, subtasks)

        # Шаг 6: Валидация
        if dag.has_cycle():
            raise ValueError("Обнаружен цикл в DAG. Невозможно построить граф зависимостей.")

        # Шаг 7: Расчёт сложности и критического пути
        dag.estimated_total_complexity = sum(
            node.subtask.estimated_complexity for node in dag.nodes.values()
        )
        dag.find_critical_path()

        logger.info(
            "DAG построен: %d узлов, %d рёбер, complexity=%d, critical_path=%d",
            len(dag.nodes), len(dag.edges),
            dag.estimated_total_complexity, len(dag.critical_path),
        )

        return dag

    def _generate_subtasks(self, task: Task, intents: list[Intent]) -> list[SubTask]:
        """Генерация подзадач на основе намерений."""
        subtasks: list[SubTask] = []

        # Для сложных задач с несколькими намерениями — декомпозиция
        if len(intents) >= 2 or any(i.action == "research" for i in intents):
            # Исследовательская фаза
            research_subtask = SubTask(
                description=f"Исследовать контекст: {task.prompt[:100]}",
                agent_role_required=AgentRole.RESEARCHER,
                estimated_complexity=3,
            )
            subtasks.append(research_subtask)

        # Основные подзадачи из намерений
        for intent in intents:
            if intent.action == "research" and subtasks:
                # Уже добавлена исследовательская подзадача
                continue

            agent_role = ACTION_TO_AGENT_ROLE.get(intent.action, AgentRole.CODER)
            complexity = self._estimate_intent_complexity(intent)

            subtask = SubTask(
                description=f"{intent.action}: {intent.target}",
                agent_role_required=agent_role,
                estimated_complexity=complexity,
                artifacts_out=[f"result:{intent.action}:{intent.domain}"],
            )

            # Зависимость от исследования
            if subtasks and subtasks[0].agent_role_required == AgentRole.RESEARCHER:
                subtask.dependencies.append(subtasks[0].subtask_id)
                subtask.artifacts_in.append(f"result:research:{intent.domain}")

            subtasks.append(subtask)

        # Синтезирующая подзадача (если > 1 основной подзадачи)
        main_subtasks = [s for s in subtasks if s.agent_role_required != AgentRole.RESEARCHER]
        if len(main_subtasks) > 1:
            synth_subtask = SubTask(
                description=f"Синтезировать результаты: {task.prompt[:60]}",
                agent_role_required=AgentRole.SYNTHESIZER,
                estimated_complexity=2,
                dependencies=[s.subtask_id for s in main_subtasks],
            )
            subtasks.append(synth_subtask)

        return subtasks

    def _build_edges(self, dag: DAG, subtasks: list[SubTask]) -> None:
        """Построить рёбра зависимостей на основе dependencies подзадач."""
        for subtask in subtasks:
            for dep_id in subtask.dependencies:
                if dep_id in dag.nodes:
                    dag.add_edge(dep_id, subtask.subtask_id, EdgeType.DEPENDS_ON)

        # Дополнительные зависимости по артефактам
        artifact_producers: dict[str, str] = {}
        for subtask in subtasks:
            for artifact in subtask.artifacts_out:
                artifact_producers[artifact] = subtask.subtask_id

        for subtask in subtasks:
            for artifact in subtask.artifacts_in:
                producer_id = artifact_producers.get(artifact)
                if producer_id and producer_id != subtask.subtask_id:
                    # Проверить, нет ли уже такого ребра
                    existing = any(
                        e.from_node == producer_id and e.to_node == subtask.subtask_id
                        for e in dag.edges
                    )
                    if not existing:
                        dag.add_edge(producer_id, subtask.subtask_id, EdgeType.PRODUCES)

    @staticmethod
    def _estimate_intent_complexity(intent: Intent) -> int:
        """Оценить сложность намерения (1-10)."""
        complexity_map: dict[str, int] = {
            "understand": 3,
            "create": 7,
            "fix": 5,
            "refactor": 6,
            "test": 5,
            "review": 4,
            "research": 3,
            "deploy": 6,
            "document": 4,
        }
        base = complexity_map.get(intent.action, 5)

        # Модификаторы
        if len(intent.constraints) > 2:
            base = min(base + 1, 10)
        if intent.domain in ("security", "auth"):
            base = min(base + 1, 10)

        return base
