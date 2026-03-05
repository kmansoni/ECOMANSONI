#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Task Planner — декомпозиция задач на под-шаги и выбор инструментов.

Реализует эвристическую декомпозицию + LLM-based планирование
(если LLM callable передан).
"""

import logging
import re
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Optional

logger = logging.getLogger(__name__)


class Complexity(Enum):
    """Уровень сложности задачи."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass
class TaskStep:
    """
    Один шаг плана задачи.

    Attributes:
        step_id: Уникальный идентификатор шага.
        description: Описание действия.
        required_tools: Список инструментов для этого шага.
        dependencies: ID предшествующих шагов.
    """

    step_id: str
    description: str
    required_tools: list[str]
    dependencies: list[str] = field(default_factory=list)


@dataclass
class TaskPlan:
    """
    Полный план выполнения задачи.

    Attributes:
        task: Оригинальная задача.
        steps: Упорядоченный список шагов.
        estimated_duration: Оценочное время в секундах.
        complexity: Уровень сложности.
    """

    task: str
    steps: list[TaskStep]
    estimated_duration: float
    complexity: Complexity


class TaskPlanner:
    """
    Планировщик задач — декомпозиция на шаги с выбором инструментов.

    Алгоритм:
        1. Оценка сложности через эвристику (количество глаголов, подзадач)
        2. Эвристическая декомпозиция по ключевым словам
        3. Если LLM доступен — refinement через LLM
        4. Выбор инструментов по семантике описания шага

    Attributes:
        llm: Опциональный LLM callable для улучшенного планирования.
    """

    # Маппинг ключевых слов -> инструменты
    KEYWORD_TO_TOOLS: dict[str, list[str]] = {
        "вычисл": ["calculator"],
        "считай": ["calculator"],
        "calculate": ["calculator"],
        "math": ["calculator"],
        "дата": ["current_datetime"],
        "время": ["current_datetime"],
        "datetime": ["current_datetime"],
        "поиск": ["web_search_mock"],
        "найди": ["web_search_mock"],
        "search": ["web_search_mock"],
        "код": ["code_executor"],
        "python": ["code_executor"],
        "execute": ["code_executor"],
        "анализ": ["text_analyzer"],
        "analyze": ["text_analyzer"],
        "текст": ["text_analyzer"],
    }

    # Индикаторы сложности
    COMPLEXITY_HIGH_KEYWORDS = ["сравни", "проанализируй", "исследуй", "создай", "разработай", "compare", "analyze", "research"]
    COMPLEXITY_LOW_KEYWORDS = ["что", "когда", "кто", "покажи", "what", "when", "who", "show"]

    def __init__(self, llm: Optional[Callable[[str], str]] = None) -> None:
        """
        Args:
            llm: Опциональный LLM callable для улучшенного планирования.
        """
        self.llm = llm

    def decompose(self, task: str) -> TaskPlan:
        """
        Декомпозировать задачу на под-шаги.

        Args:
            task: Текстовое описание задачи.

        Returns:
            TaskPlan с упорядоченными шагами.
        """
        complexity = self.estimate_complexity(task)

        if self.llm is not None:
            steps = self._llm_decompose(task)
        else:
            steps = self._heuristic_decompose(task)

        # Оценка времени: LOW=10s, MEDIUM=30s, HIGH=60s
        duration_map = {Complexity.LOW: 10.0, Complexity.MEDIUM: 30.0, Complexity.HIGH: 60.0}
        duration = duration_map[complexity] * len(steps)

        return TaskPlan(
            task=task,
            steps=steps,
            estimated_duration=duration,
            complexity=complexity,
        )

    def estimate_complexity(self, task: str) -> Complexity:
        """
        Оценить сложность задачи.

        Args:
            task: Текстовое описание задачи.

        Returns:
            Complexity: LOW, MEDIUM или HIGH.
        """
        lower = task.lower()
        word_count = len(task.split())

        # Счётчик признаков сложности
        high_score = sum(1 for kw in self.COMPLEXITY_HIGH_KEYWORDS if kw in lower)
        low_score = sum(1 for kw in self.COMPLEXITY_LOW_KEYWORDS if kw in lower)

        # Подсчёт потенциальных шагов (запятые, "и", "затем")
        step_indicators = len(re.findall(r",|\bи\b|\bзатем\b|\bпотом\b|\bthen\b|\band\b", lower))

        if high_score >= 2 or step_indicators >= 3 or word_count > 30:
            return Complexity.HIGH
        elif high_score >= 1 or step_indicators >= 1 or word_count > 15 or low_score == 0:
            return Complexity.MEDIUM
        else:
            return Complexity.LOW

    def select_tools(self, task_step: str, available_tools: list[str]) -> list[str]:
        """
        Выбрать подходящие инструменты для шага задачи.

        Args:
            task_step: Описание шага.
            available_tools: Список доступных имён инструментов.

        Returns:
            Отфильтрованный список имён инструментов.
        """
        lower = task_step.lower()
        selected: set[str] = set()

        for keyword, tools in self.KEYWORD_TO_TOOLS.items():
            if keyword in lower:
                for t in tools:
                    if t in available_tools:
                        selected.add(t)

        # Если ничего не найдено — не назначаем инструмент
        return sorted(selected)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _heuristic_decompose(self, task: str) -> list[TaskStep]:
        """Эвристическая декомпозиция по структуре задачи."""
        steps: list[TaskStep] = []

        # Разбить по явным разделителям
        raw_steps = re.split(r"[,;]|\bзатем\b|\bпотом\b|\bthen\b", task, flags=re.IGNORECASE)
        raw_steps = [s.strip() for s in raw_steps if s.strip() and len(s.strip()) > 3]

        if not raw_steps:
            raw_steps = [task]

        prev_id: Optional[str] = None
        for i, desc in enumerate(raw_steps):
            step_id = f"step_{i+1}_{uuid.uuid4().hex[:6]}"
            tools = self.select_tools(desc, list(self.KEYWORD_TO_TOOLS.keys()))
            step = TaskStep(
                step_id=step_id,
                description=desc,
                required_tools=tools,
                dependencies=[prev_id] if prev_id else [],
            )
            steps.append(step)
            prev_id = step_id

        # Всегда добавляем финальный шаг формирования ответа
        final_id = f"step_final_{uuid.uuid4().hex[:6]}"
        steps.append(TaskStep(
            step_id=final_id,
            description="Сформировать финальный ответ на основе собранной информации",
            required_tools=[],
            dependencies=[prev_id] if prev_id else [],
        ))

        return steps

    def _llm_decompose(self, task: str) -> list[TaskStep]:
        """LLM-based декомпозиция с fallback на эвристику."""
        assert self.llm is not None

        prompt = (
            f"Decompose this task into 3-5 sequential steps. "
            f"Output format: one step per line, starting with '- '.\n\n"
            f"Task: {task}\n\nSteps:"
        )

        try:
            response = self.llm(prompt)
            lines = [
                line.lstrip("- •*123456789.").strip()
                for line in response.split("\n")
                if line.strip().startswith(("-", "•", "*")) or re.match(r"^\d+\.", line.strip())
            ]
            lines = [l for l in lines if l]

            if not lines:
                return self._heuristic_decompose(task)

            steps: list[TaskStep] = []
            prev_id: Optional[str] = None
            for i, desc in enumerate(lines):
                step_id = f"step_{i+1}_{uuid.uuid4().hex[:6]}"
                tools = self.select_tools(desc, list(self.KEYWORD_TO_TOOLS.keys()))
                step = TaskStep(
                    step_id=step_id,
                    description=desc,
                    required_tools=tools,
                    dependencies=[prev_id] if prev_id else [],
                )
                steps.append(step)
                prev_id = step_id

            return steps

        except Exception as exc:
            logger.warning("LLM декомпозиция не удалась: %s. Fallback на эвристику.", exc)
            return self._heuristic_decompose(task)


if __name__ == "__main__":
    planner = TaskPlanner()

    tasks = [
        "Найди текущую дату",
        "Вычисли sqrt(144) и затем найди информацию про Python",
        "Проанализируй текст, сравни результаты, создай отчёт и визуализируй данные",
    ]

    for task in tasks:
        plan = planner.decompose(task)
        print(f"\nЗадача: {task}")
        print(f"Сложность: {plan.complexity.value} | Оценка: {plan.estimated_duration:.0f}с")
        for step in plan.steps:
            tools_str = f" [tools: {', '.join(step.required_tools)}]" if step.required_tools else ""
            print(f"  {step.step_id}: {step.description}{tools_str}")
