#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Agent Router — маршрутизация подзадач к агентам.

Стратегии назначения (из документации):
    1. Round-Robin с учётом специализации
    2. Weighted Scoring (нагрузка + экспертиза + success_rate)
    3. Work-Stealing для простаивающих агентов

Выбор стратегии зависит от текущей нагрузки системы:
    < 30% → Round-Robin
    30-70% → Weighted Scoring
    > 70% → Weighted Scoring (приоритет экспертизы)
"""

import logging
from typing import Optional

from .models import AgentInfo, AgentRole, DAGNode, SubTask

logger = logging.getLogger(__name__)


class AgentRouter:
    """
    Маршрутизатор задач к агентам.

    Управляет пулом агентов и назначает подзадачи на основе
    роли, экспертизы, нагрузки и доступности.
    """

    # Веса для Weighted Scoring
    WEIGHT_LOAD = 0.30
    WEIGHT_EXPERTISE = 0.40
    WEIGHT_SUCCESS_RATE = 0.20
    WEIGHT_AVAILABILITY = 0.10

    def __init__(self) -> None:
        self._agents: dict[str, AgentInfo] = {}
        self._round_robin_index: int = 0
        logger.info("AgentRouter инициализирован")

    # ── Agent Pool Management ──────────────────────────────────────────

    def register_agent(self, agent: AgentInfo) -> None:
        """Зарегистрировать агента в пуле."""
        self._agents[agent.agent_id] = agent
        logger.info("Агент зарегистрирован: %s (role=%s)", agent.agent_id[:8], agent.role.value)

    def unregister_agent(self, agent_id: str) -> None:
        """Удалить агента из пула."""
        self._agents.pop(agent_id, None)

    def get_agent(self, agent_id: str) -> Optional[AgentInfo]:
        """Получить агента по ID."""
        return self._agents.get(agent_id)

    def list_agents(self, role: Optional[AgentRole] = None) -> list[AgentInfo]:
        """Список агентов (опционально по роли)."""
        agents = list(self._agents.values())
        if role:
            agents = [a for a in agents if a.role == role]
        return agents

    # ── Assignment Strategies ──────────────────────────────────────────

    def assign(self, subtask: SubTask) -> Optional[AgentInfo]:
        """
        Назначить агента для подзадачи (главная функция).

        Автоматически выбирает стратегию в зависимости от нагрузки системы.

        Args:
            subtask: Подзадача для назначения.

        Returns:
            AgentInfo назначенного агента или None если нет доступных.
        """
        system_load = self._get_system_load()

        if system_load < 0.3:
            agent = self._round_robin_with_specialization(subtask)
        else:
            agent = self._weighted_assignment(subtask)

        if agent:
            agent.current_load += 1
            subtask.assigned_agent_id = agent.agent_id
            logger.info(
                "Назначен агент %s (role=%s, load=%.1f) для подзадачи '%s'",
                agent.agent_id[:8], agent.role.value, agent.load_factor,
                subtask.description[:50],
            )
        else:
            logger.warning("Нет доступных агентов для роли %s", subtask.agent_role_required.value)

        return agent

    def release_agent(self, agent_id: str) -> None:
        """Освободить агента после завершения задачи."""
        agent = self._agents.get(agent_id)
        if agent:
            agent.current_load = max(0, agent.current_load - 1)

    def _round_robin_with_specialization(self, subtask: SubTask) -> Optional[AgentInfo]:
        """
        Round-Robin с учётом специализации.

        Используется при низкой нагрузке системы (<30%).
        """
        eligible = [
            a for a in self._agents.values()
            if a.role == subtask.agent_role_required and a.is_available
        ]
        if not eligible:
            # Fallback: любой доступный агент
            eligible = [a for a in self._agents.values() if a.is_available]

        if not eligible:
            return None

        selected = eligible[self._round_robin_index % len(eligible)]
        self._round_robin_index = (self._round_robin_index + 1) % max(len(eligible), 1)
        return selected

    def _weighted_assignment(self, subtask: SubTask) -> Optional[AgentInfo]:
        """
        Weighted Scoring — взвешенное назначение.

        Score = load_factor * 0.30 + expertise * 0.40 + success_rate * 0.20 + availability * 0.10
        """
        best_agent: Optional[AgentInfo] = None
        best_score = -1.0

        for agent in self._agents.values():
            if not agent.is_available:
                continue

            # Компоненты score
            load_factor = 1.0 - agent.load_factor
            expertise = self._get_expertise_score(agent, subtask)
            success_rate = agent.success_rate
            availability = 1.0 if agent.is_available else 0.0

            score = (
                load_factor * self.WEIGHT_LOAD +
                expertise * self.WEIGHT_EXPERTISE +
                success_rate * self.WEIGHT_SUCCESS_RATE +
                availability * self.WEIGHT_AVAILABILITY
            )

            if score > best_score:
                best_score = score
                best_agent = agent

        return best_agent

    def work_stealing(self) -> list[tuple[str, str]]:
        """
        Work-Stealing: переназначение задач от перегруженных к простаивающим.

        Returns:
            Список (task_id, new_agent_id) переназначений.
        """
        idle_agents = [a for a in self._agents.values() if a.current_load == 0 and a.is_available]
        overloaded = [a for a in self._agents.values() if a.load_factor > 0.8]

        reassignments: list[tuple[str, str]] = []

        for idle in idle_agents:
            for overloaded_agent in sorted(overloaded, key=lambda a: a.load_factor, reverse=True):
                if overloaded_agent.role == idle.role:
                    # Можем перебалансировать
                    reassignments.append((overloaded_agent.agent_id, idle.agent_id))
                    break

        return reassignments

    # ── Helpers ────────────────────────────────────────────────────────

    def _get_system_load(self) -> float:
        """Средняя нагрузка системы (0.0 - 1.0)."""
        if not self._agents:
            return 0.0
        return sum(a.load_factor for a in self._agents.values()) / len(self._agents)

    @staticmethod
    def _get_expertise_score(agent: AgentInfo, subtask: SubTask) -> float:
        """
        Оценка экспертизы агента для данной подзадачи.

        1.0 = точное совпадение роли + специализации
        0.7 = совпадение роли
        0.3 = другая роль, но есть общая специализация
        0.1 = нет совпадений
        """
        if agent.role == subtask.agent_role_required:
            # Проверяем специализацию
            subtask_domain = subtask.description.lower()
            for spec in agent.specializations:
                if spec.lower() in subtask_domain:
                    return 1.0
            return 0.7

        # Другая роль, но может быть специализация
        subtask_domain = subtask.description.lower()
        for spec in agent.specializations:
            if spec.lower() in subtask_domain:
                return 0.3

        return 0.1

    @property
    def pool_stats(self) -> dict:
        """Статистика пула агентов."""
        return {
            "total_agents": len(self._agents),
            "available": sum(1 for a in self._agents.values() if a.is_available),
            "busy": sum(1 for a in self._agents.values() if a.current_load > 0),
            "system_load": self._get_system_load(),
            "by_role": {
                role.value: sum(1 for a in self._agents.values() if a.role == role)
                for role in AgentRole
                if any(a.role == role for a in self._agents.values())
            },
        }
