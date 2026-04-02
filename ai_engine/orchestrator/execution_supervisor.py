#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Execution Supervisor — мониторинг и управление выполнением DAG.

Отвечает за:
    - Отслеживание статуса подзадач
    - Управление параллельным выполнением
    - Обработку таймаутов и перезапусков
    - Создание контекстных снапшотов (чекпоинтов)
    - Эскалацию при обнаружении проблем
"""

import logging
import time
from datetime import datetime
from typing import Callable, Optional

from .models import (
    AgentInfo,
    ContextSnapshot,
    DAG,
    DAGNode,
    SubTask,
    SubTaskStatus,
    Task,
    TaskResult,
    TaskStatus,
)
from .message_bus import Message, MessageBus, MessageEnvelope, MessageType

logger = logging.getLogger(__name__)


class ExecutionSupervisor:
    """
    Управляет выполнением DAG: назначение, мониторинг, чекпоинты.

    Жизненный цикл выполнения:
        1. Получить DAG от DAGBuilder
        2. Определить готовые к выполнению узлы (get_ready_nodes)
        3. Назначить агентов (через AgentRouter)
        4. Мониторить прогресс
        5. При завершении узла — обновить статус и запустить зависимые
        6. При ошибке — retry или эскалация
        7. Создание чекпоинтов на каждом этапе

    Attributes:
        message_bus: Шина сообщений.
        max_retries: Максимальное количество повторных попыток.
        subtask_timeout_ms: Таймаут на подзадачу.
    """

    DEFAULT_TIMEOUT_MS = 900_000  # 15 минут (из документации: атомарная задача ≤ 15 мин)
    CHECKPOINT_INTERVAL_S = 300   # 5 минут

    def __init__(
        self,
        message_bus: Optional[MessageBus] = None,
        max_retries: int = 3,
        subtask_timeout_ms: int = DEFAULT_TIMEOUT_MS,
    ) -> None:
        self.message_bus = message_bus or MessageBus()
        self.max_retries = max_retries
        self.subtask_timeout_ms = subtask_timeout_ms
        self._retry_counts: dict[str, int] = {}
        self._start_times: dict[str, float] = {}
        self._snapshots: list[ContextSnapshot] = []
        self._sequence_counter = 0
        logger.info("ExecutionSupervisor инициализирован (max_retries=%d)", max_retries)

    # ── Execution Control ──────────────────────────────────────────────

    def execute_dag(
        self,
        task: Task,
        dag: DAG,
        agent_executor: Callable[[SubTask, Optional[AgentInfo]], TaskResult],
    ) -> list[TaskResult]:
        """
        Выполнить DAG — главный метод.

        Итеративно выбирает готовые узлы и выполняет их.
        Параллельные узлы выполняются последовательно в этой in-process версии.
        (В production — через asyncio/message bus)

        Args:
            task: Корневая задача.
            dag: Граф зависимостей.
            agent_executor: Функция выполнения подзадачи агентом.

        Returns:
            Список результатов всех подзадач.
        """
        logger.info("Начало выполнения DAG %s (%d узлов)", dag.dag_id[:8], len(dag.nodes))
        task.status = TaskStatus.EXECUTING
        results: list[TaskResult] = []

        # Создать начальный чекпоинт
        self._create_checkpoint(task, dag, "execution_start")

        max_iterations = len(dag.nodes) * (self.max_retries + 1) + 1
        iteration = 0

        while iteration < max_iterations:
            iteration += 1

            # Проверить, все ли узлы завершены
            if self._all_completed(dag):
                logger.info("DAG %s выполнен полностью", dag.dag_id[:8])
                break

            # Проверить фатальные ошибки
            if self._has_fatal_failure(dag):
                logger.error("DAG %s: обнаружена фатальная ошибка", dag.dag_id[:8])
                task.status = TaskStatus.FAILED
                break

            # Получить готовые узлы
            ready_nodes = dag.get_ready_nodes()
            if not ready_nodes:
                # Нет готовых узлов, но не все завершены — возможен deadlock
                logger.warning("DAG %s: нет готовых узлов, но не все завершены. Возможен deadlock.", dag.dag_id[:8])
                break

            # Выполнить готовые узлы
            for node in ready_nodes:
                subtask = node.subtask
                subtask.status = SubTaskStatus.IN_PROGRESS
                subtask.started_at = datetime.now().isoformat()
                self._start_times[subtask.subtask_id] = time.time()

                logger.info(
                    "Выполнение узла '%s' (agent_role=%s, complexity=%d)",
                    subtask.description[:50],
                    subtask.agent_role_required.value,
                    subtask.estimated_complexity,
                )

                # Публикация события в message bus
                self._publish_event(MessageType.TASK_ASSIGN, {
                    "subtask_id": subtask.subtask_id,
                    "description": subtask.description,
                    "agent_role": subtask.agent_role_required.value,
                })

                # Выполнение
                try:
                    result = agent_executor(subtask, None)
                    self._handle_result(dag, subtask, result, results)
                except Exception as exc:
                    logger.error("Ошибка выполнения узла '%s': %s", subtask.subtask_id[:8], exc)
                    self._handle_failure(dag, subtask, str(exc), results, agent_executor)

            # Чекпоинт после каждого раунда
            self._create_checkpoint(task, dag, f"round_{iteration}")

        # Финальный чекпоинт
        if self._all_completed(dag):
            task.status = TaskStatus.SYNTHESIZING
        self._create_checkpoint(task, dag, "execution_end")

        return results

    def _handle_result(
        self,
        dag: DAG,
        subtask: SubTask,
        result: TaskResult,
        results: list[TaskResult],
    ) -> None:
        """Обработать результат выполнения подзадачи."""
        elapsed = time.time() - self._start_times.get(subtask.subtask_id, time.time())
        result.execution_time_ms = int(elapsed * 1000)

        if result.success:
            subtask.status = SubTaskStatus.COMPLETED
            subtask.completed_at = datetime.now().isoformat()
            subtask.result = result
            results.append(result)

            self._publish_event(MessageType.TASK_RESULT, {
                "subtask_id": subtask.subtask_id,
                "success": True,
                "execution_time_ms": result.execution_time_ms,
            })

            logger.info(
                "Узел '%s' завершён успешно (%.1fs, quality=%.2f)",
                subtask.description[:40],
                elapsed,
                result.quality_score,
            )
        else:
            logger.warning(
                "Узел '%s' завершился с ошибкой: %s",
                subtask.description[:40], result.error,
            )
            self._handle_failure(dag, subtask, result.error, results, None)

    def _handle_failure(
        self,
        dag: DAG,
        subtask: SubTask,
        error: str,
        results: list[TaskResult],
        agent_executor: Optional[Callable],
    ) -> None:
        """Обработать сбой: retry или эскалация."""
        retry_count = self._retry_counts.get(subtask.subtask_id, 0)

        if retry_count < self.max_retries and agent_executor:
            self._retry_counts[subtask.subtask_id] = retry_count + 1
            logger.info(
                "Retry %d/%d для узла '%s'",
                retry_count + 1, self.max_retries, subtask.description[:40],
            )
            subtask.status = SubTaskStatus.PENDING  # Вернуть в очередь
            self._publish_event(MessageType.TASK_PROGRESS, {
                "subtask_id": subtask.subtask_id,
                "retry": retry_count + 1,
                "error": error,
            })
        else:
            subtask.status = SubTaskStatus.FAILED
            subtask.completed_at = datetime.now().isoformat()

            fail_result = TaskResult(
                subtask_id=subtask.subtask_id,
                success=False,
                error=f"Failed after {retry_count} retries: {error}",
            )
            subtask.result = fail_result
            results.append(fail_result)

            self._publish_event(MessageType.TASK_FAILED, {
                "subtask_id": subtask.subtask_id,
                "error": error,
                "retries_exhausted": True,
            })

    # ── Checkpointing ──────────────────────────────────────────────────

    def _create_checkpoint(self, task: Task, dag: DAG, label: str) -> ContextSnapshot:
        """Создать контекстный снапшот."""
        self._sequence_counter += 1

        snapshot = ContextSnapshot(
            session_id=task.session_id,
            task_id=task.task_id,
            sequence_number=self._sequence_counter,
            broader_goal=task.prompt,
            completed_nodes=[
                nid for nid, n in dag.nodes.items()
                if n.subtask.status == SubTaskStatus.COMPLETED
            ],
            artifacts_produced=[
                artifact
                for n in dag.nodes.values()
                if n.subtask.result
                for artifact in n.subtask.result.artifacts
            ],
        )

        self._snapshots.append(snapshot)
        logger.debug("Чекпоинт #%d: %s (%d completed)", self._sequence_counter, label, len(snapshot.completed_nodes))
        return snapshot

    def get_snapshots(self) -> list[ContextSnapshot]:
        """Получить все снапшоты текущего выполнения."""
        return list(self._snapshots)

    # ── Status Checks ──────────────────────────────────────────────────

    @staticmethod
    def _all_completed(dag: DAG) -> bool:
        """Проверить, все ли узлы завершены."""
        return all(
            n.subtask.status in (SubTaskStatus.COMPLETED, SubTaskStatus.SKIPPED)
            for n in dag.nodes.values()
        )

    @staticmethod
    def _has_fatal_failure(dag: DAG) -> bool:
        """
        Проверить наличие фатальной ошибки.

        Фатальная ошибка = сбой узла на критическом пути.
        """
        for node in dag.nodes.values():
            if node.subtask.status == SubTaskStatus.FAILED:
                if node.node_id in dag.critical_path:
                    return True
        return False

    def check_timeouts(self, dag: DAG) -> list[str]:
        """Проверить таймауты выполняющихся подзадач."""
        timed_out: list[str] = []
        for node in dag.nodes.values():
            if node.subtask.status == SubTaskStatus.IN_PROGRESS:
                start_time = self._start_times.get(node.subtask.subtask_id)
                if start_time:
                    elapsed_ms = (time.time() - start_time) * 1000
                    if elapsed_ms > self.subtask_timeout_ms:
                        timed_out.append(node.subtask.subtask_id)
                        logger.warning(
                            "Таймаут для узла '%s' (%.1f s)",
                            node.subtask.description[:40],
                            elapsed_ms / 1000,
                        )
        return timed_out

    # ── Message Bus Integration ────────────────────────────────────────

    def _publish_event(self, msg_type: MessageType, payload: dict) -> None:
        """Опубликовать событие в message bus."""
        message = Message(
            envelope=MessageEnvelope(
                sender_id="execution_supervisor",
                sender_role="supervisor",
            ),
            msg_type=msg_type,
            payload=payload,
        )
        self.message_bus.publish(f"tasks/{msg_type.value}", message)
