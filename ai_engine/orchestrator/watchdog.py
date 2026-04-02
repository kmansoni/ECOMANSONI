#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Watchdog System — обнаружение и коррекция патологических состояний.

Из документации orchestrator-core, секция 3:
    3.1 Циклические рассуждения (Circular Reasoning)
    3.2 Избыточный анализ (Analysis Paralysis)
    3.3 Дрейф области видимости (Scope Creep)
    3.4 Галлюцинации фактов (Fact Hallucination)
    3.5 Deadlock агентов (Agent Deadlock)
    3.6 Каскадный сбой (Cascading Failure)
"""

import hashlib
import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger(__name__)


class PathologyType(Enum):
    """Типы патологических состояний."""
    CIRCULAR_REASONING = "circular_reasoning"
    ANALYSIS_PARALYSIS = "analysis_paralysis"
    SCOPE_CREEP = "scope_creep"
    FACT_HALLUCINATION = "fact_hallucination"
    AGENT_DEADLOCK = "agent_deadlock"
    CASCADING_FAILURE = "cascading_failure"


class Severity(Enum):
    """Серьёзность обнаруженной патологии."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class WatchdogAlert:
    """Алерт от watchdog-процесса."""
    alert_id: str = ""
    pathology: PathologyType = PathologyType.CIRCULAR_REASONING
    severity: Severity = Severity.MEDIUM
    agent_id: str = ""
    description: str = ""
    recommended_action: str = ""
    timestamp: float = field(default_factory=time.time)
    metadata: dict[str, Any] = field(default_factory=dict)


# ── 3.1 Circular Reasoning Watchdog ───────────────────────────────────

class CircularReasoningWatchdog:
    """
    Обнаружение циклических рассуждений.

    Отслеживает хеши шагов рассуждений в кольцевом буфере.
    Если один и тот же хеш встречается >= THRESHOLD раз — патология.
    """
    BUFFER_CAPACITY = 20
    REPEAT_THRESHOLD = 3

    def __init__(self) -> None:
        self._buffers: dict[str, deque] = defaultdict(lambda: deque(maxlen=self.BUFFER_CAPACITY))

    def on_reasoning_step(self, agent_id: str, step_data: dict) -> Optional[WatchdogAlert]:
        """
        Зарегистрировать шаг рассуждения и проверить на цикл.

        Args:
            agent_id: ID агента.
            step_data: Данные шага (hypothesis, action_type, parameters).

        Returns:
            WatchdogAlert если обнаружен цикл, иначе None.
        """
        step_hash = hashlib.sha256(
            str(sorted(step_data.items())).encode()
        ).hexdigest()[:16]

        buffer = self._buffers[agent_id]
        repeat_count = sum(1 for h in buffer if h == step_hash)

        if repeat_count >= self.REPEAT_THRESHOLD:
            alert = WatchdogAlert(
                alert_id=f"cr_{agent_id}_{int(time.time())}",
                pathology=PathologyType.CIRCULAR_REASONING,
                severity=Severity.HIGH,
                agent_id=agent_id,
                description=f"Агент повторяет шаг {repeat_count + 1} раз (hash={step_hash})",
                recommended_action="force_new_approach",
                metadata={"repeated_hash": step_hash, "repeat_count": repeat_count + 1},
            )
            logger.warning("Circular reasoning detected: agent=%s, repeats=%d", agent_id[:8], repeat_count + 1)
            return alert

        buffer.append(step_hash)
        return None

    def get_metrics(self, agent_id: str) -> dict:
        """Метрики для агента."""
        buffer = self._buffers.get(agent_id, deque())
        if not buffer:
            return {"cycle_ratio": 0.0, "unique_state_ratio": 1.0}

        unique = len(set(buffer))
        total = len(buffer)
        return {
            "cycle_ratio": 1.0 - (unique / total) if total > 0 else 0.0,
            "unique_state_ratio": unique / total if total > 0 else 1.0,
        }

    def reset(self, agent_id: str) -> None:
        """Сбросить буфер агента."""
        self._buffers.pop(agent_id, None)


# ── 3.2 Analysis Paralysis Watchdog ───────────────────────────────────

class AnalysisParalysisWatchdog:
    """
    Обнаружение избыточного анализа без перехода к действиям.

    Триггеры:
        - Фаза анализа > 10 минут без действий
        - Соотношение анализ/действие > 5:1
    """
    ACTION_THRESHOLD_S = 600       # 10 минут
    RATIO_THRESHOLD = 5.0

    def __init__(self) -> None:
        self._analysis_start: dict[str, float] = {}
        self._analysis_time: dict[str, float] = defaultdict(float)
        self._action_time: dict[str, float] = defaultdict(float)

    def on_phase_start(self, agent_id: str, phase_type: str) -> None:
        """Начало фазы (analysis или action)."""
        if phase_type == "analysis":
            self._analysis_start[agent_id] = time.time()

    def on_phase_end(self, agent_id: str, phase_type: str) -> None:
        """Конец фазы."""
        if phase_type == "analysis" and agent_id in self._analysis_start:
            duration = time.time() - self._analysis_start[agent_id]
            self._analysis_time[agent_id] += duration
            del self._analysis_start[agent_id]
        elif phase_type == "action":
            self._action_time[agent_id] += 1.0  # каждое действие = 1 единица

    def check(self, agent_id: str) -> Optional[WatchdogAlert]:
        """Проверить на Analysis Paralysis."""
        # Проверка длительности текущего анализа
        if agent_id in self._analysis_start:
            duration = time.time() - self._analysis_start[agent_id]
            if duration > self.ACTION_THRESHOLD_S:
                return WatchdogAlert(
                    alert_id=f"ap_{agent_id}_{int(time.time())}",
                    pathology=PathologyType.ANALYSIS_PARALYSIS,
                    severity=Severity.MEDIUM,
                    agent_id=agent_id,
                    description=f"Анализ длится {duration:.0f}с без действий (порог: {self.ACTION_THRESHOLD_S}с)",
                    recommended_action="force_action_with_best_available",
                    metadata={"duration_s": duration},
                )

        # Проверка соотношения
        analysis = self._analysis_time.get(agent_id, 0)
        action = max(self._action_time.get(agent_id, 0), 0.001)
        ratio = analysis / action

        if ratio > self.RATIO_THRESHOLD and analysis > 60:
            return WatchdogAlert(
                alert_id=f"ap_ratio_{agent_id}_{int(time.time())}",
                pathology=PathologyType.ANALYSIS_PARALYSIS,
                severity=Severity.MEDIUM,
                agent_id=agent_id,
                description=f"Соотношение анализ/действие: {ratio:.1f}:1 (порог: {self.RATIO_THRESHOLD}:1)",
                recommended_action="force_action_with_best_available",
                metadata={"ratio": ratio},
            )

        return None

    def reset(self, agent_id: str) -> None:
        self._analysis_start.pop(agent_id, None)
        self._analysis_time.pop(agent_id, None)
        self._action_time.pop(agent_id, None)


# ── 3.3 Scope Creep Watchdog ──────────────────────────────────────────

class ScopeCreepWatchdog:
    """
    Обнаружение дрейфа области видимости.

    Сравнивает затрагиваемые компоненты с оригинальной задачей.
    Использует Jaccard similarity для оценки расстояния.
    """
    DISTANCE_THRESHOLD = 0.35

    def __init__(self) -> None:
        self._original_scope: dict[str, set[str]] = {}

    def set_original_scope(self, task_id: str, scope_keywords: set[str]) -> None:
        """Установить оригинальную область видимости задачи."""
        self._original_scope[task_id] = {kw.lower() for kw in scope_keywords}

    def check_action(self, task_id: str, affected_components: list[str]) -> Optional[WatchdogAlert]:
        """
        Проверить, не выходит ли действие за рамки задачи.

        Args:
            task_id: ID задачи.
            affected_components: Затрагиваемые компоненты.

        Returns:
            WatchdogAlert если обнаружен scope creep.
        """
        original = self._original_scope.get(task_id)
        if not original:
            return None

        affected_set = {c.lower() for c in affected_components}
        distance = self._semantic_distance(original, affected_set)

        if distance > self.DISTANCE_THRESHOLD:
            return WatchdogAlert(
                alert_id=f"sc_{task_id}_{int(time.time())}",
                pathology=PathologyType.SCOPE_CREEP,
                severity=Severity.HIGH,
                description=f"Scope creep: distance={distance:.2f} > {self.DISTANCE_THRESHOLD}",
                recommended_action="rollback_to_aligned_checkpoint",
                metadata={
                    "original_scope": list(original)[:10],
                    "affected": list(affected_set)[:10],
                    "distance": distance,
                },
            )

        return None

    @staticmethod
    def _semantic_distance(set_a: set[str], set_b: set[str]) -> float:
        """Jaccard distance между двумя множествами."""
        if not set_a and not set_b:
            return 0.0
        intersection = set_a & set_b
        union = set_a | set_b
        jaccard_similarity = len(intersection) / len(union) if union else 0.0
        return 1.0 - jaccard_similarity


# ── 3.5 Agent Deadlock Watchdog ───────────────────────────────────────

class DeadlockWatchdog:
    """
    Обнаружение deadlock между агентами.

    Строит граф ожиданий (wait-for graph) и ищет циклы.
    """
    SYNC_TIMEOUT_S = 30

    def __init__(self) -> None:
        self._wait_graph: dict[str, set[str]] = defaultdict(set)
        self._wait_start: dict[str, float] = {}

    def on_agent_wait(self, agent_id: str, waiting_for: str) -> Optional[WatchdogAlert]:
        """Зарегистрировать ожидание агента."""
        self._wait_graph[agent_id].add(waiting_for)
        self._wait_start.setdefault(agent_id, time.time())

        cycle = self._find_cycle()
        if cycle:
            return WatchdogAlert(
                alert_id=f"dl_{agent_id}_{int(time.time())}",
                pathology=PathologyType.AGENT_DEADLOCK,
                severity=Severity.CRITICAL,
                agent_id=agent_id,
                description=f"Deadlock обнаружен: {' → '.join(cycle)}",
                recommended_action="kill_lowest_progress_agent",
                metadata={"cycle": cycle},
            )
        return None

    def on_agent_done(self, agent_id: str) -> None:
        """Агент завершил работу — убрать из графа."""
        self._wait_graph.pop(agent_id, None)
        self._wait_start.pop(agent_id, None)
        for deps in self._wait_graph.values():
            deps.discard(agent_id)

    def check_timeouts(self) -> list[WatchdogAlert]:
        """Проверить таймауты ожидания."""
        alerts: list[WatchdogAlert] = []
        now = time.time()
        for agent_id, start in list(self._wait_start.items()):
            if now - start > self.SYNC_TIMEOUT_S:
                alerts.append(WatchdogAlert(
                    alert_id=f"dl_timeout_{agent_id}_{int(now)}",
                    pathology=PathologyType.AGENT_DEADLOCK,
                    severity=Severity.HIGH,
                    agent_id=agent_id,
                    description=f"Таймаут ожидания: {now - start:.0f}с > {self.SYNC_TIMEOUT_S}с",
                    recommended_action="force_proceed_or_reassign",
                ))
        return alerts

    def _find_cycle(self) -> Optional[list[str]]:
        """Найти цикл в графе ожиданий (DFS)."""
        WHITE, GRAY, BLACK = 0, 1, 2
        color: dict[str, int] = defaultdict(int)
        parent: dict[str, Optional[str]] = {}

        def dfs(node: str) -> Optional[list[str]]:
            color[node] = GRAY
            for neighbor in self._wait_graph.get(node, set()):
                if color[neighbor] == GRAY:
                    # Цикл обнаружен — восстановить путь
                    cycle = [neighbor, node]
                    current = node
                    while parent.get(current) and parent[current] != neighbor:
                        current = parent[current]
                        cycle.append(current)
                    return list(reversed(cycle))
                if color[neighbor] == WHITE:
                    parent[neighbor] = node
                    result = dfs(neighbor)
                    if result:
                        return result
            color[node] = BLACK
            return None

        for node in list(self._wait_graph.keys()):
            if color[node] == WHITE:
                result = dfs(node)
                if result:
                    return result
        return None


# ── 3.6 Cascading Failure Watchdog ────────────────────────────────────

class CascadingFailureWatchdog:
    """
    Обнаружение каскадных сбоев.

    Отслеживает error rate каждого агента в скользящем окне.
    При превышении порога — изолирует агента (circuit breaker OPEN).
    """
    ERROR_RATE_THRESHOLD = 0.5
    ERROR_WINDOW_S = 60

    def __init__(self) -> None:
        self._errors: dict[str, list[float]] = defaultdict(list)
        self._circuit_state: dict[str, str] = {}  # CLOSED | OPEN | HALF_OPEN
        self._open_since: dict[str, float] = {}
        self.RECOVERY_TIMEOUT_S = 30

    def on_agent_error(self, agent_id: str) -> Optional[WatchdogAlert]:
        """Зарегистрировать ошибку агента."""
        now = time.time()
        self._errors[agent_id].append(now)

        # Очистить старые записи за пределами окна
        cutoff = now - self.ERROR_WINDOW_S
        self._errors[agent_id] = [t for t in self._errors[agent_id] if t > cutoff]

        error_count = len(self._errors[agent_id])
        # Допустим минимум 3 запроса для расчёта rate
        if error_count >= 3:
            error_rate = error_count / max(error_count + 2, 5)  # приближённый rate
            if error_rate > self.ERROR_RATE_THRESHOLD:
                self._circuit_state[agent_id] = "OPEN"
                self._open_since[agent_id] = now
                return WatchdogAlert(
                    alert_id=f"cf_{agent_id}_{int(now)}",
                    pathology=PathologyType.CASCADING_FAILURE,
                    severity=Severity.CRITICAL,
                    agent_id=agent_id,
                    description=f"Каскадный сбой: error_rate={error_rate:.2f} за {self.ERROR_WINDOW_S}с",
                    recommended_action="isolate_and_fallback",
                    metadata={"error_count": error_count, "error_rate": error_rate},
                )
        return None

    def on_agent_success(self, agent_id: str) -> None:
        """Зарегистрировать успех агента."""
        state = self._circuit_state.get(agent_id, "CLOSED")
        if state == "HALF_OPEN":
            self._circuit_state[agent_id] = "CLOSED"
            self._open_since.pop(agent_id, None)
            logger.info("Circuit breaker CLOSED для агента %s", agent_id[:8])

    def is_agent_available(self, agent_id: str) -> bool:
        """Проверить, доступен ли агент (circuit breaker)."""
        state = self._circuit_state.get(agent_id, "CLOSED")
        if state == "CLOSED":
            return True
        if state == "OPEN":
            # Проверить recovery timeout
            open_since = self._open_since.get(agent_id, 0)
            if time.time() - open_since > self.RECOVERY_TIMEOUT_S:
                self._circuit_state[agent_id] = "HALF_OPEN"
                return True  # Пробный запрос
            return False
        # HALF_OPEN — разрешаем пробный запрос
        return True

    def get_circuit_state(self, agent_id: str) -> str:
        return self._circuit_state.get(agent_id, "CLOSED")


# ── Unified Watchdog System ───────────────────────────────────────────

class WatchdogSystem:
    """
    Единая система watchdog-процессов.

    Агрегирует все watchdog и предоставляет единый API.
    """

    def __init__(self) -> None:
        self.circular = CircularReasoningWatchdog()
        self.paralysis = AnalysisParalysisWatchdog()
        self.scope = ScopeCreepWatchdog()
        self.deadlock = DeadlockWatchdog()
        self.cascade = CascadingFailureWatchdog()
        self._alerts: list[WatchdogAlert] = []
        logger.info("WatchdogSystem инициализирован (6 watchdog-процессов)")

    def report_reasoning_step(self, agent_id: str, step_data: dict) -> Optional[WatchdogAlert]:
        """Отчёт о шаге рассуждения (Circular Reasoning check)."""
        alert = self.circular.on_reasoning_step(agent_id, step_data)
        if alert:
            self._alerts.append(alert)
        return alert

    def report_phase(self, agent_id: str, phase_type: str, start: bool = True) -> Optional[WatchdogAlert]:
        """Отчёт о начале/конце фазы (Analysis Paralysis check)."""
        if start:
            self.paralysis.on_phase_start(agent_id, phase_type)
        else:
            self.paralysis.on_phase_end(agent_id, phase_type)
        alert = self.paralysis.check(agent_id)
        if alert:
            self._alerts.append(alert)
        return alert

    def check_scope(self, task_id: str, affected: list[str]) -> Optional[WatchdogAlert]:
        """Проверка Scope Creep."""
        alert = self.scope.check_action(task_id, affected)
        if alert:
            self._alerts.append(alert)
        return alert

    def report_agent_wait(self, agent_id: str, waiting_for: str) -> Optional[WatchdogAlert]:
        """Отчёт об ожидании агента (Deadlock check)."""
        alert = self.deadlock.on_agent_wait(agent_id, waiting_for)
        if alert:
            self._alerts.append(alert)
        return alert

    def report_agent_error(self, agent_id: str) -> Optional[WatchdogAlert]:
        """Отчёт об ошибке агента (Cascading Failure check)."""
        alert = self.cascade.on_agent_error(agent_id)
        if alert:
            self._alerts.append(alert)
        return alert

    def report_agent_success(self, agent_id: str) -> None:
        """Отчёт об успехе агента."""
        self.cascade.on_agent_success(agent_id)
        self.deadlock.on_agent_done(agent_id)

    def is_agent_healthy(self, agent_id: str) -> bool:
        """Проверить здоровье агента (все watchdog)."""
        if not self.cascade.is_agent_available(agent_id):
            return False
        metrics = self.circular.get_metrics(agent_id)
        if metrics["cycle_ratio"] > 0.3:
            return False
        return True

    def get_all_alerts(self) -> list[WatchdogAlert]:
        """Все накопленные алерты."""
        return list(self._alerts)

    def get_recent_alerts(self, seconds: int = 300) -> list[WatchdogAlert]:
        """Алерты за последние N секунд."""
        cutoff = time.time() - seconds
        return [a for a in self._alerts if a.timestamp > cutoff]

    def clear_alerts(self) -> None:
        self._alerts.clear()

    def reset_agent(self, agent_id: str) -> None:
        """Полный сброс всех watchdog для агента."""
        self.circular.reset(agent_id)
        self.paralysis.reset(agent_id)
        self.deadlock.on_agent_done(agent_id)

    @property
    def stats(self) -> dict:
        return {
            "total_alerts": len(self._alerts),
            "by_type": {
                pt.value: sum(1 for a in self._alerts if a.pathology == pt)
                for pt in PathologyType
            },
        }
