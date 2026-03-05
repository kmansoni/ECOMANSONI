#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ReAct Agent — реализация паттерна Reasoning + Acting.

Цикл: Thought -> Action -> Observation -> Thought -> ... -> Final Answer.

Защиты:
    - max_steps: прерывание бесконечного цикла
    - Timeout инструментов (в ToolRegistry)
    - Парсинг LLM ответа с fallback на Final Answer
"""

import json
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Optional

from .tools import ToolRegistry

logger = logging.getLogger(__name__)

# ReAct промпт шаблон
REACT_SYSTEM_PROMPT = """You are a helpful AI assistant that solves tasks step by step.
You have access to the following tools:
{tools}

Use the following format EXACTLY:
Thought: [your reasoning about what to do next]
Action: [tool_name]
Action Input: {{"key": "value"}}
Observation: [tool result will be inserted here]

Repeat Thought/Action/Action Input/Observation as needed.
When you have the final answer, use:
Thought: I now know the final answer.
Final Answer: [your complete answer]

Begin! Task: {task}

{scratchpad}"""


@dataclass
class AgentStep:
    """
    Один шаг ReAct цикла.

    Attributes:
        thought: Рассуждение агента.
        action: Название вызванного инструмента (или "Final Answer").
        action_input: Параметры инструмента.
        observation: Результат выполнения инструмента.
        timestamp: Время шага.
    """

    thought: str
    action: str
    action_input: dict
    observation: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class AgentResult:
    """
    Финальный результат работы агента.

    Attributes:
        final_answer: Итоговый ответ.
        steps: Все выполненные шаги.
        total_tokens_used: Приближённое количество токенов (4 символа = 1 токен).
        success: Завершился ли успешно (не по timeout/error).
    """

    final_answer: str
    steps: list[AgentStep]
    total_tokens_used: int
    success: bool


class ReActAgent:
    """
    ReAct агент — основной класс.

    Реализует итеративный цикл Thought-Action-Observation
    до получения Final Answer или достижения max_steps.

    Архитектурные гарантии:
        1. max_steps защищает от бесконечного loop
        2. Каждый шаг логируется с timestamp для аудита
        3. Ошибки инструментов не прерывают цикл — агент адаптируется
        4. LLM парсинг с fallback: если не распознан формат -> финальный ответ

    Attributes:
        llm: LLM callable (prompt: str) -> str.
        tool_registry: Реестр доступных инструментов.
        max_steps: Максимум шагов перед принудительным завершением.
    """

    def __init__(
        self,
        llm_callable: Callable[[str], str],
        tool_registry: Optional[ToolRegistry] = None,
        max_steps: int = 10,
    ) -> None:
        """
        Args:
            llm_callable: LLM функция с сигнатурой (prompt: str) -> str.
            tool_registry: Реестр инструментов. Создаётся автоматически если None.
            max_steps: Максимальное число итераций Thought-Action-Observation.
        """
        self.llm = llm_callable
        self.tool_registry = tool_registry or ToolRegistry()
        self.max_steps = max_steps

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self, task: str) -> AgentResult:
        """
        Выполнить задачу через ReAct цикл.

        Args:
            task: Текстовое описание задачи.

        Returns:
            AgentResult с финальным ответом и историей шагов.
        """
        logger.info("ReActAgent.run(): задача = %s", task[:100])

        steps: list[AgentStep] = []
        total_chars = 0
        tools_description = self.tool_registry.format_for_prompt()

        for iteration in range(self.max_steps):
            scratchpad = self._format_scratchpad(steps)

            prompt = REACT_SYSTEM_PROMPT.format(
                tools=tools_description,
                task=task,
                scratchpad=scratchpad,
            )

            logger.debug("Итерация %d/%d", iteration + 1, self.max_steps)

            try:
                llm_response = self.llm(prompt)
            except Exception as exc:
                logger.error("LLM ошибка на шаге %d: %s", iteration + 1, exc)
                return AgentResult(
                    final_answer=f"Ошибка LLM: {exc}",
                    steps=steps,
                    total_tokens_used=total_chars // 4,
                    success=False,
                )

            total_chars += len(prompt) + len(llm_response)

            # Проверка на Final Answer
            final_answer = self._extract_final_answer(llm_response)
            if final_answer is not None:
                logger.info("Агент завершил задачу за %d шагов", len(steps))
                return AgentResult(
                    final_answer=final_answer,
                    steps=steps,
                    total_tokens_used=total_chars // 4,
                    success=True,
                )

            # Парсинг Thought/Action/Action Input
            parsed = self._parse_react_output(llm_response)
            if parsed is None:
                # LLM не следует формату -> принимаем весь ответ как Financial Answer
                logger.warning("LLM не следует ReAct формату. Принимаем ответ как Final Answer.")
                return AgentResult(
                    final_answer=llm_response.strip(),
                    steps=steps,
                    total_tokens_used=total_chars // 4,
                    success=True,
                )

            thought, action_name, action_input = parsed

            # Выполняем инструмент
            observation = self.step(thought, action_name, action_input)

            agent_step = AgentStep(
                thought=thought,
                action=action_name,
                action_input=action_input,
                observation=observation.observation,
            )
            steps.append(agent_step)

            logger.info(
                "Шаг %d: action=%s, success=%s, time=%.2fs",
                len(steps), action_name,
                "ok" if "[ERROR]" not in observation.observation else "fail",
                0.0,
            )

        # Превышен max_steps
        logger.warning("Достигнут лимит шагов (%d). Принудительное завершение.", self.max_steps)
        last_observations = "\n".join(
            f"Step {i+1}: {s.observation[:100]}"
            for i, s in enumerate(steps[-3:])
        )
        forced_answer = (
            f"[MAX_STEPS_REACHED] Достигнут лимит {self.max_steps} шагов. "
            f"Последние наблюдения:\n{last_observations}"
        )
        return AgentResult(
            final_answer=forced_answer,
            steps=steps,
            total_tokens_used=total_chars // 4,
            success=False,
        )

    def step(
        self,
        thought: str,
        action: str,
        action_input: dict,
    ) -> "Observation":
        """
        Выполнить один шаг: вызвать инструмент и получить Observation.

        Args:
            thought: Рассуждение агента.
            action: Имя инструмента.
            action_input: Параметры.

        Returns:
            Observation объект с результатом.
        """
        result = self.tool_registry.execute(action, **action_input)
        obs_text = result.result if result.success else f"[ERROR] {result.error}"
        return Observation(observation=obs_text, success=result.success)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _format_scratchpad(steps: list[AgentStep]) -> str:
        """Форматировать историю шагов для промпта."""
        if not steps:
            return ""

        lines = []
        for step in steps:
            lines.append(f"Thought: {step.thought}")
            lines.append(f"Action: {step.action}")
            lines.append(f"Action Input: {json.dumps(step.action_input, ensure_ascii=False)}")
            lines.append(f"Observation: {step.observation}")
            lines.append("")

        return "\n".join(lines)

    @staticmethod
    def _extract_final_answer(text: str) -> Optional[str]:
        """Извлечь Final Answer из LLM ответа."""
        # Паттерн: "Final Answer: ..."
        match = re.search(
            r"Final\s+Answer\s*:\s*(.+?)(?:\n(?:Thought|Action)|$)",
            text,
            re.IGNORECASE | re.DOTALL,
        )
        if match:
            return match.group(1).strip()
        return None

    @staticmethod
    def _parse_react_output(text: str) -> Optional[tuple[str, str, dict]]:
        """
        Парсить Thought/Action/Action Input из LLM ответа.

        Returns:
            Tuple (thought, action_name, action_input) или None если не распознан.
        """
        # Извлечь Thought
        thought_match = re.search(r"Thought\s*:\s*(.+?)(?=\nAction\s*:|$)", text, re.IGNORECASE | re.DOTALL)
        thought = thought_match.group(1).strip() if thought_match else ""

        # Извлечь Action
        action_match = re.search(r"Action\s*:\s*(\w+)", text, re.IGNORECASE)
        if not action_match:
            return None
        action_name = action_match.group(1).strip()

        # Извлечь Action Input (JSON)
        input_match = re.search(
            r"Action\s+Input\s*:\s*(\{.+?\})",
            text,
            re.IGNORECASE | re.DOTALL,
        )
        action_input: dict = {}
        if input_match:
            try:
                action_input = json.loads(input_match.group(1))
            except json.JSONDecodeError:
                # Попытка исправить битый JSON
                raw = input_match.group(1)
                # Найти key: value пары
                pairs = re.findall(r'"(\w+)"\s*:\s*"([^"]*)"', raw)
                action_input = {k: v for k, v in pairs}

        return thought, action_name, action_input


@dataclass
class Observation:
    """Результат выполнения шага агента."""
    observation: str
    success: bool


if __name__ == "__main__":
    # Mock LLM для демонстрации ReAct
    _step_counter = [0]

    def mock_react_llm(prompt: str) -> str:
        _step_counter[0] += 1
        step = _step_counter[0]

        if step == 1:
            return (
                'Thought: I need to calculate 15 * 7 first.\n'
                'Action: calculator\n'
                'Action Input: {"expression": "15 * 7"}'
            )
        elif step == 2:
            return (
                'Thought: 15 * 7 = 105. Now I know the answer.\n'
                'Final Answer: 15 умножить на 7 равно 105.'
            )
        return "Final Answer: Задача выполнена."

    registry = ToolRegistry()
    agent = ReActAgent(llm_callable=mock_react_llm, tool_registry=registry, max_steps=5)

    result = agent.run("Вычисли 15 * 7")

    print(f"Финальный ответ: {result.final_answer}")
    print(f"Шагов выполнено: {len(result.steps)}")
    print(f"Успешно: {result.success}")
    print(f"Использовано токенов ~{result.total_tokens_used}")

    for i, step in enumerate(result.steps, 1):
        print(f"\n--- Шаг {i} ---")
        print(f"Thought: {step.thought}")
        print(f"Action: {step.action}({step.action_input})")
        print(f"Observation: {step.observation}")
