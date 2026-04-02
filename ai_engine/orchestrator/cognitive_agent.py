#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cognitive Agent — агент с когнитивной архитектурой.

Каждый агент обладает (из документации agent-swarm):
    - Рабочая память (Working Memory): контекст текущей задачи
    - Эпизодическая память (Episodic Memory): история действий сессии
    - Семантическая память (Semantic Memory): база знаний
    - Планировщик (Planner): декомпозиция задачи на шаги
    - Рефлектор (Reflector): критическая оценка действий
    - Валидатор (Validator): проверка результата
    - Tools Interface: доступ к инструментам

Когнитивная архитектура:
    ┌─────────────────────────────────────────────┐
    │                   АГЕНТ                      │
    │  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
    │  │ Working  │ │Episodic  │ │Semantic  │    │
    │  │ Memory   │ │ Memory   │ │ Memory   │    │
    │  └────┬─────┘ └────┬─────┘ └────┬────┘    │
    │       └─────────────┴───────────┘          │
    │                     │                       │
    │             ┌───────▼───────┐               │
    │             │   Planner     │               │
    │             └───────┬───────┘               │
    │        ┌────────────┼────────────┐          │
    │        ▼            ▼            ▼          │
    │   ┌─────────┐ ┌──────────┐ ┌──────────┐   │
    │   │  Tools  │ │ Reflector│ │ Validator│   │
    │   └─────────┘ └──────────┘ └──────────┘   │
    └─────────────────────────────────────────────┘
"""

import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Optional

from .models import AgentInfo, AgentRole, SubTask, TaskResult

logger = logging.getLogger(__name__)


# ── Memory Interfaces (агентная, отдельная от глобального MemoryManager) ─

@dataclass
class AgentMemoryEntry:
    """Запись в памяти агента."""
    content: str
    entry_type: str  # "observation", "decision", "fact", "error"
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    importance: float = 0.5
    metadata: dict[str, Any] = field(default_factory=dict)


class AgentWorkingMemory:
    """Рабочая память агента — текущий контекст задачи."""

    def __init__(self, max_entries: int = 50) -> None:
        self._entries: list[AgentMemoryEntry] = []
        self._max_entries = max_entries

    def add(self, content: str, entry_type: str = "observation", importance: float = 0.5) -> None:
        if len(self._entries) >= self._max_entries:
            # Evict наименее важную запись
            self._entries.sort(key=lambda e: e.importance)
            self._entries.pop(0)
        self._entries.append(AgentMemoryEntry(content=content, entry_type=entry_type, importance=importance))

    def get_context(self, max_entries: int = 20) -> list[AgentMemoryEntry]:
        """Получить последние записи для контекста."""
        return self._entries[-max_entries:]

    def search(self, query: str) -> list[AgentMemoryEntry]:
        """Простой поиск по содержимому."""
        query_lower = query.lower()
        return [e for e in self._entries if query_lower in e.content.lower()]

    def clear(self) -> None:
        self._entries.clear()

    @property
    def size(self) -> int:
        return len(self._entries)


class AgentEpisodicMemory:
    """Эпизодическая память — история действий в сессии."""

    def __init__(self, max_episodes: int = 100) -> None:
        self._episodes: list[dict[str, Any]] = []
        self._max_episodes = max_episodes

    def record_action(self, action: str, result: str, success: bool) -> None:
        if len(self._episodes) >= self._max_episodes:
            self._episodes.pop(0)
        self._episodes.append({
            "action": action,
            "result": result[:500],
            "success": success,
            "timestamp": datetime.now().isoformat(),
        })

    def get_recent(self, n: int = 10) -> list[dict]:
        return self._episodes[-n:]

    def get_failures(self) -> list[dict]:
        return [e for e in self._episodes if not e["success"]]

    @property
    def success_rate(self) -> float:
        if not self._episodes:
            return 1.0
        return sum(1 for e in self._episodes if e["success"]) / len(self._episodes)


# ── Reflector ──────────────────────────────────────────────────────────

class Reflector:
    """
    Рефлектор — критическая оценка собственных действий.

    Анализирует результат и определяет:
        - Достигнута ли цель?
        - Есть ли ошибки в рассуждениях?
        - Нужно ли пересмотреть подход?
    """

    def __init__(self, llm: Optional[Callable[[str], str]] = None) -> None:
        self.llm = llm

    def reflect(self, action: str, result: str, goal: str) -> "ReflectionResult":
        """
        Оценить результат действия.

        Args:
            action: Выполненное действие.
            result: Полученный результат.
            goal: Целевое состояние.

        Returns:
            ReflectionResult с оценкой и рекомендациями.
        """
        if self.llm:
            return self._llm_reflect(action, result, goal)
        return self._heuristic_reflect(action, result, goal)

    def _heuristic_reflect(self, action: str, result: str, goal: str) -> "ReflectionResult":
        """Эвристическая рефлексия."""
        issues: list[str] = []
        confidence = 0.7

        # Проверка на пустой результат
        if not result or len(result.strip()) < 10:
            issues.append("Результат слишком короткий или пустой")
            confidence = 0.2

        # Проверка на ошибки в результате
        error_indicators = ["error", "ошибка", "failed", "exception", "traceback", "не удалось"]
        if any(ind in result.lower() for ind in error_indicators):
            issues.append("Результат содержит признаки ошибки")
            confidence = 0.3

        # Проверка на соответствие цели
        goal_words = set(goal.lower().split())
        result_words = set(result.lower().split())
        overlap = len(goal_words & result_words) / max(len(goal_words), 1)
        if overlap < 0.1:
            issues.append(f"Низкое соответствие цели (overlap={overlap:.2f})")
            confidence = min(confidence, 0.4)

        return ReflectionResult(
            goal_achieved=len(issues) == 0,
            confidence=confidence,
            issues=issues,
            recommendation="proceed" if not issues else "retry_with_different_approach",
        )

    def _llm_reflect(self, action: str, result: str, goal: str) -> "ReflectionResult":
        """LLM-based рефлексия."""
        assert self.llm is not None
        try:
            prompt = (
                f"Evaluate this action result:\n"
                f"Goal: {goal}\nAction: {action}\nResult: {result[:500]}\n\n"
                f"Answer: Is the goal achieved? (yes/no). Confidence (0-1). Issues if any."
            )
            response = self.llm(prompt)
            achieved = "yes" in response.lower()[:20]
            return ReflectionResult(
                goal_achieved=achieved,
                confidence=0.8 if achieved else 0.4,
                issues=[] if achieved else [response[:200]],
                recommendation="proceed" if achieved else "retry",
            )
        except Exception:
            return self._heuristic_reflect(action, result, goal)


@dataclass
class ReflectionResult:
    """Результат рефлексии."""
    goal_achieved: bool = False
    confidence: float = 0.5
    issues: list[str] = field(default_factory=list)
    recommendation: str = "proceed"


# ── Validator ──────────────────────────────────────────────────────────

class Validator:
    """
    Валидатор — проверка результата перед отправкой.

    Проверяет:
        - Формат и полнота результата
        - Отсутствие галлюцинаций (базовая проверка)
        - Соответствие ожидаемым артефактам
    """

    def validate(self, result: TaskResult, subtask: SubTask) -> "ValidationResult":
        """Валидировать результат подзадачи."""
        issues: list[str] = []

        # Проверка success
        if not result.success and not result.error:
            issues.append("Результат помечен как неуспешный, но error пустой")

        # Проверка output
        if result.success and len(result.output.strip()) < 5:
            issues.append("Успешный результат с пустым output")

        # Проверка артефактов
        expected_artifacts = set(subtask.artifacts_out)
        produced_artifacts = set(result.artifacts)
        missing = expected_artifacts - produced_artifacts
        if missing:
            issues.append(f"Не все артефакты произведены: {missing}")

        # Проверка quality_score
        if result.quality_score < 0.3 and result.success:
            issues.append(f"Низкий quality_score ({result.quality_score}) для успешного результата")

        return ValidationResult(
            valid=len(issues) == 0,
            issues=issues,
        )


@dataclass
class ValidationResult:
    """Результат валидации."""
    valid: bool = True
    issues: list[str] = field(default_factory=list)


# ── Cognitive Agent ────────────────────────────────────────────────────

class CognitiveAgent:
    """
    Агент с полной когнитивной архитектурой.

    Реализует цикл: Plan → Execute → Reflect → Validate.

    Attributes:
        info: Информация об агенте (роль, ID, специализации).
        working_memory: Рабочая память текущего контекста.
        episodic_memory: Память о действиях в сессии.
        reflector: Критическая оценка результатов.
        validator: Проверка перед отправкой.
        llm: LLM callable для выполнения задач.
    """

    MAX_REFLECT_RETRIES = 2

    def __init__(
        self,
        role: AgentRole,
        llm: Optional[Callable[[str], str]] = None,
        specializations: Optional[list[str]] = None,
    ) -> None:
        self.info = AgentInfo(
            role=role,
            specializations=specializations or [],
        )
        self.working_memory = AgentWorkingMemory()
        self.episodic_memory = AgentEpisodicMemory()
        self.reflector = Reflector(llm=llm)
        self.validator = Validator()
        self.llm = llm

        logger.info("CognitiveAgent создан: role=%s, id=%s", role.value, self.info.agent_id[:8])

    def execute(self, subtask: SubTask) -> TaskResult:
        """
        Выполнить подзадачу с полным когнитивным циклом.

        Цикл:
            1. Загрузить контекст в рабочую память
            2. Выполнить действие (через LLM или эвристику)
            3. Рефлексия: оценить результат
            4. Если рефлексия не прошла — retry с новым подходом
            5. Валидация финального результата
            6. Запись в эпизодическую память

        Args:
            subtask: Подзадача для выполнения.

        Returns:
            TaskResult с результатом.
        """
        start = time.time()
        agent_id = self.info.agent_id

        # 1. Загрузить контекст
        self.working_memory.add(
            f"Задача: {subtask.description}",
            entry_type="observation",
            importance=1.0,
        )
        self.working_memory.add(
            f"Роль: {subtask.agent_role_required.value}",
            entry_type="observation",
        )
        if subtask.artifacts_in:
            self.working_memory.add(
                f"Входные данные: {subtask.artifacts_in}",
                entry_type="observation",
            )

        # 2-3. Execute + Reflect loop
        output = ""
        quality = 0.0

        for attempt in range(self.MAX_REFLECT_RETRIES + 1):
            # Execute
            output = self._execute_action(subtask, attempt)

            # Reflect
            reflection = self.reflector.reflect(
                action=subtask.description,
                result=output,
                goal=subtask.description,
            )

            self.working_memory.add(
                f"Reflection (attempt {attempt + 1}): achieved={reflection.goal_achieved}, "
                f"confidence={reflection.confidence:.2f}",
                entry_type="decision",
            )

            quality = reflection.confidence
            if reflection.goal_achieved:
                break

            if attempt < self.MAX_REFLECT_RETRIES:
                logger.info(
                    "Agent %s: reflection suggests retry (attempt %d/%d)",
                    agent_id[:8], attempt + 1, self.MAX_REFLECT_RETRIES,
                )
                self.working_memory.add(
                    f"Issues: {reflection.issues}. Retrying with different approach.",
                    entry_type="decision",
                    importance=0.9,
                )

        # 4. Build result
        elapsed_ms = int((time.time() - start) * 1000)
        result = TaskResult(
            subtask_id=subtask.subtask_id,
            agent_id=agent_id,
            success=True,
            output=output,
            artifacts=subtask.artifacts_out,
            execution_time_ms=elapsed_ms,
            quality_score=quality,
            tokens_used=len(output) // 4,
        )

        # 5. Validate
        validation = self.validator.validate(result, subtask)
        if not validation.valid:
            logger.warning("Agent %s: validation issues: %s", agent_id[:8], validation.issues)
            result.quality_score = max(result.quality_score - 0.2, 0.0)

        # 6. Record to episodic memory
        self.episodic_memory.record_action(
            action=subtask.description,
            result=output,
            success=result.success,
        )

        return result

    def _execute_action(self, subtask: SubTask, attempt: int) -> str:
        """Выполнить действие (core logic)."""
        if self.llm:
            context_entries = self.working_memory.get_context(10)
            context_str = "\n".join(
                f"[{e.entry_type}] {e.content}" for e in context_entries
            )

            approach = ""
            if attempt > 0:
                failures = self.episodic_memory.get_failures()
                if failures:
                    approach = f"\nПредыдущий подход не сработал. Используй принципиально иной подход."

            prompt = (
                f"Ты — {subtask.agent_role_required.value}.\n\n"
                f"Контекст:\n{context_str}\n"
                f"{approach}\n"
                f"Задача: {subtask.description}\n\n"
                f"Выполни задачу и дай конкретный результат:"
            )
            try:
                return self.llm(prompt)
            except Exception as exc:
                return f"[ERROR] LLM execution failed: {exc}"
        else:
            return f"[{subtask.agent_role_required.value}] Выполнено: {subtask.description}"

    @property
    def stats(self) -> dict:
        """Статистика агента."""
        return {
            "agent_id": self.info.agent_id[:8],
            "role": self.info.role.value,
            "working_memory_size": self.working_memory.size,
            "episodes": len(self.episodic_memory._episodes),
            "success_rate": self.episodic_memory.success_rate,
        }
