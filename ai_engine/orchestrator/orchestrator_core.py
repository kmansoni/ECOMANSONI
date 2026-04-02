#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Orchestrator Core — главный координатор мультиагентной системы.

Реализует полный цикл обработки задачи (из документации):
    Фаза 1 — Приём и анализ (Reception & Analysis)
    Фаза 2 — Исследование (Research Phase)
    Фаза 3 — Планирование (Planning)
    Фаза 4 — Параллельное выполнение (Parallel Execution)
    Фаза 5 — Синтез и запись (Synthesis & Write)

Принципы:
    - Нулевая импульсивность: не выполнять без анализа
    - Персистентная память: сохранение между сессиями
    - Полная контекстная осведомлённость
    - Непрерывное обучение через Training Signals
"""

import logging
import time
import uuid
from datetime import datetime
from typing import Any, Callable, Optional

from .models import (
    AgentInfo,
    AgentRole,
    ContextSnapshot,
    DAG,
    Priority,
    SessionState,
    SubTask,
    SubTaskStatus,
    Task,
    TaskResult,
    TaskStatus,
    TrainingSignal,
)
from .dag_builder import DAGBuilder
from .agent_router import AgentRouter
from .execution_supervisor import ExecutionSupervisor
from .result_synthesizer import ResultSynthesizer, SynthesisResult
from .message_bus import Message, MessageBus, MessageEnvelope, MessageType
from .watchdog import WatchdogSystem
from .cognitive_agent import CognitiveAgent
from .research_engine import ResearchEngine

logger = logging.getLogger(__name__)


class OrchestratorCore:
    """
    Ядро оркестратора — главный координатор.

    Компоненты (из C4 Component diagram):
        - Task Receiver: приём и валидация задач
        - Intent Extractor: извлечение намерений (внутри DAGBuilder)
        - DAG Builder: построение графа зависимостей
        - Agent Router: назначение агентов
        - Execution Supervisor: мониторинг выполнения
        - Result Synthesizer: агрегация результатов
        - Watchdog System: обнаружение патологий
        - Session Manager: управление сессиями

    Attributes:
        dag_builder: Строитель графов зависимостей.
        agent_router: Маршрутизатор задач к агентам.
        supervisor: Супервизор выполнения.
        synthesizer: Синтезатор результатов.
        watchdog: Система watchdog-процессов.
        message_bus: Шина сообщений.
    """

    def __init__(
        self,
        llm: Optional[Callable[[str], str]] = None,
        memory_manager: Optional[Any] = None,
        project_root: Optional[str] = None,
    ) -> None:
        """
        Args:
            llm: LLM callable для Intent Extraction и синтеза.
            memory_manager: Менеджер памяти (ai_engine.memory.MemoryManager).
            project_root: Корневая директория проекта (для Research Engine).
        """
        self.llm = llm
        self.memory_manager = memory_manager
        self.project_root = project_root

        # Компоненты
        self.message_bus = MessageBus()
        self.dag_builder = DAGBuilder(llm=llm)
        self.agent_router = AgentRouter()
        self.supervisor = ExecutionSupervisor(message_bus=self.message_bus)
        self.synthesizer = ResultSynthesizer(llm=llm)
        self.watchdog = WatchdogSystem()

        # Research Engine (индексация кодовой базы)
        self.research_engine: Optional[ResearchEngine] = None
        if project_root:
            self.research_engine = ResearchEngine(
                project_root=project_root,
                llm=llm,
            )

        # Когнитивные агенты (пул по ролям)
        self._cognitive_agents: dict[AgentRole, CognitiveAgent] = {}

        # Состояние
        self._sessions: dict[str, SessionState] = {}
        self._training_signals: list[TrainingSignal] = []
        self._task_history: list[Task] = []

        # Подписка на события
        self._setup_subscriptions()

        logger.info("OrchestratorCore инициализирован (llm=%s)", "yes" if llm else "no")

    # ── Public API ─────────────────────────────────────────────────────

    def process_task(
        self,
        prompt: str,
        session_id: Optional[str] = None,
        priority: Priority = Priority.NORMAL,
        agent_executor: Optional[Callable[[SubTask, Optional[AgentInfo]], TaskResult]] = None,
    ) -> SynthesisResult:
        """
        Обработать задачу пользователя — полный цикл.

        Это главная точка входа. Реализует все 5 фаз из документации.

        Args:
            prompt: Текст задачи от пользователя.
            session_id: ID сессии (создаётся если None).
            priority: Приоритет задачи.
            agent_executor: Функция выполнения подзадач агентами.
                            Если None — используется default executor.

        Returns:
            SynthesisResult с финальным ответом и метриками.
        """
        start_time = time.time()

        # ── Фаза 1: Приём и анализ ────────────────────────────────────
        task = self._receive_task(prompt, session_id, priority)
        logger.info("═══ Фаза 1: Приём задачи '%s' (id=%s) ═══", prompt[:60], task.task_id[:8])

        # Контекст из памяти
        if self.memory_manager:
            self.memory_manager.process_message("user", prompt)

        # ── Фаза 1.5: Исследование кодовой базы ──────────────────────
        research_context = ""
        if self.research_engine:
            task.status = TaskStatus.RESEARCHING
            logger.info("═══ Фаза 1.5: Исследование кодовой базы ═══")

            # Индексировать проект (инкрементально)
            stats = self.research_engine.incremental_index()
            logger.info(
                "Индексация: %d файлов → %d чанков (%.0f мс)",
                stats.files_indexed, stats.chunks_created, stats.time_ms,
            )

            # Поиск релевантного кода по запросу
            search_results = self.research_engine.search_code(prompt, top_k=5)
            if search_results:
                snippets = []
                for sr in search_results:
                    snippets.append(
                        f"[{sr.chunk.file_path}:{sr.chunk.line_start}] "
                        f"({sr.chunk.chunk_type} '{sr.chunk.name}', score={sr.score:.2f})"
                    )
                research_context = "Релевантный код:\n" + "\n".join(snippets)
                logger.info("Найдено %d релевантных фрагментов кода", len(search_results))

            # Поиск в библиотеке знаний
            knowledge = self.research_engine.search_knowledge(prompt)
            if knowledge:
                research_context += f"\nЗнания из библиотеки: {len(knowledge)} записей"
                logger.info("Найдено %d записей в библиотеке знаний", len(knowledge))

            # Обогатить задачу контекстом
            if research_context:
                task.metadata["research_context"] = research_context

        # ── Фаза 2: Планирование (включает анализ намерений) ──────────
        task.status = TaskStatus.PLANNING
        logger.info("═══ Фаза 2: Планирование ═══")

        dag = self.dag_builder.build(task)
        session = self._get_or_create_session(task.session_id)
        session.active_dag = dag

        # Установить scope для watchdog
        scope_keywords = set()
        for intent in task.intents:
            scope_keywords.add(intent.action)
            scope_keywords.add(intent.target.lower())
            scope_keywords.add(intent.domain)
        self.watchdog.scope.set_original_scope(task.task_id, scope_keywords)

        logger.info(
            "DAG построен: %d подзадач, complexity=%d, critical_path=%d узлов",
            len(dag.nodes), dag.estimated_total_complexity, len(dag.critical_path),
        )

        # ── Фаза 3: Назначение агентов ────────────────────────────────
        logger.info("═══ Фаза 3: Назначение агентов ═══")
        self._assign_agents(dag)

        # ── Фаза 4: Выполнение ────────────────────────────────────────
        task.status = TaskStatus.EXECUTING
        logger.info("═══ Фаза 4: Выполнение DAG ═══")

        executor = agent_executor or self._default_agent_executor
        results = self.supervisor.execute_dag(task, dag, executor)

        # ── Фаза 5: Синтез ────────────────────────────────────────────
        task.status = TaskStatus.SYNTHESIZING
        logger.info("═══ Фаза 5: Синтез результатов ═══")

        synthesis = self.synthesizer.synthesize(task, dag, results)

        # Обучение
        if synthesis.training_signal:
            synthesis.training_signal.time_to_complete_ms = int((time.time() - start_time) * 1000)
            self._training_signals.append(synthesis.training_signal)

        # Сохранение в память
        if self.memory_manager:
            self.memory_manager.process_message("assistant", synthesis.final_output[:500])

        # История
        self._task_history.append(task)
        task.updated_at = datetime.now().isoformat()

        elapsed = time.time() - start_time
        logger.info(
            "═══ Задача завершена за %.1fs (status=%s, quality=%.2f) ═══",
            elapsed, task.status.value,
            synthesis.quality_report.overall_score if synthesis.quality_report else 0,
        )

        return synthesis

    # ── Agent Management ───────────────────────────────────────────────

    def register_agent(self, agent: AgentInfo) -> None:
        """Зарегистрировать агента в системе."""
        self.agent_router.register_agent(agent)
        # Подписать агента на его inbox
        topic = f"agents/{agent.agent_id}/inbox"
        self.message_bus.subscribe(topic, lambda msg: None)

    def register_default_agents(self) -> None:
        """Зарегистрировать набор агентов по умолчанию (для быстрого старта)."""
        default_roles = [
            (AgentRole.RESEARCHER, ["code", "architecture", "patterns"]),
            (AgentRole.CODE_ANALYST, ["frontend", "backend", "database"]),
            (AgentRole.CODER, ["typescript", "python", "react"]),
            (AgentRole.TEST_WRITER, ["unit", "integration", "e2e"]),
            (AgentRole.REVIEWER, ["code_quality", "security", "performance"]),
            (AgentRole.DEBUGGER, ["runtime", "logic", "performance"]),
            (AgentRole.ARCHITECT, ["system_design", "api", "database"]),
            (AgentRole.SYNTHESIZER, ["aggregation", "summary"]),
            (AgentRole.DOCS_WRITER, ["api_docs", "readme", "guides"]),
        ]

        for role, specs in default_roles:
            agent = AgentInfo(
                role=role,
                specializations=specs,
                max_concurrent_tasks=3,
            )
            self.register_agent(agent)

            # Создать когнитивного агента для каждой роли
            cognitive = CognitiveAgent(
                role=role,
                llm=self.llm,
                specializations=specs,
            )
            self._cognitive_agents[role] = cognitive

        logger.info("Зарегистрировано %d агентов по умолчанию (с когнитивной архитектурой)", len(default_roles))

    # ── Session Management ─────────────────────────────────────────────

    def _get_or_create_session(self, session_id: str) -> SessionState:
        """Получить или создать сессию."""
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionState(session_id=session_id)
        return self._sessions[session_id]

    def get_session(self, session_id: str) -> Optional[SessionState]:
        """Получить состояние сессии."""
        return self._sessions.get(session_id)

    def end_session(self, session_id: str) -> None:
        """Завершить сессию."""
        session = self._sessions.pop(session_id, None)
        if session and self.memory_manager:
            self.memory_manager.end_session(session_id)

    # ── Private Methods ────────────────────────────────────────────────

    def _receive_task(self, prompt: str, session_id: Optional[str], priority: Priority) -> Task:
        """Фаза 1: приём и валидация задачи."""
        task = Task(
            prompt=prompt,
            session_id=session_id or str(uuid.uuid4()),
            priority=priority,
            status=TaskStatus.ANALYZING,
        )

        # Публикация события
        self.message_bus.publish("orchestrator/inbox", Message(
            msg_type=MessageType.TASK_ASSIGN,
            payload={"task_id": task.task_id, "prompt": prompt[:200]},
        ))

        return task

    def _assign_agents(self, dag: DAG) -> None:
        """Назначить агентов для всех узлов DAG."""
        for node in dag.nodes.values():
            agent = self.agent_router.assign(node.subtask)
            if agent:
                node.subtask.assigned_agent_id = agent.agent_id

    def _default_agent_executor(self, subtask: SubTask, agent: Optional[AgentInfo]) -> TaskResult:
        """
        Исполнитель подзадач по умолчанию.

        Использует CognitiveAgent (Plan→Execute→Reflect→Validate) если доступен,
        иначе — простая эвристика + опциональный LLM.
        """
        agent_id = subtask.assigned_agent_id or "default"
        role = subtask.agent_role_required

        # Watchdog: начало фазы анализа
        self.watchdog.report_phase(agent_id, "analysis", start=True)

        # Попробовать когнитивного агента
        cognitive = self._cognitive_agents.get(role)
        if cognitive:
            try:
                self.watchdog.report_phase(agent_id, "analysis", start=False)
                self.watchdog.report_phase(agent_id, "action", start=True)

                result = cognitive.execute(subtask)

                self.watchdog.report_phase(agent_id, "action", start=False)
                self.watchdog.report_agent_success(agent_id)

                logger.info(
                    "CognitiveAgent [%s] выполнил '%s' (quality=%.2f)",
                    role.value, subtask.description[:40], result.quality_score,
                )
                return result

            except Exception as exc:
                logger.warning("CognitiveAgent [%s] сбой: %s. Fallback.", role.value, exc)
                self.watchdog.report_agent_error(agent_id)
                # Fallback к базовому исполнителю

        # Базовый исполнитель (fallback)
        start = time.time()
        try:
            if self.llm:
                prompt = (
                    f"Выполни подзадачу:\n"
                    f"Описание: {subtask.description}\n"
                    f"Роль: {subtask.agent_role_required.value}\n"
                    f"Входные артефакты: {subtask.artifacts_in}\n\n"
                    f"Дай конкретный результат:"
                )
                output = self.llm(prompt)
                quality = 0.8
            else:
                output = f"[{subtask.agent_role_required.value}] Выполнено: {subtask.description}"
                quality = 0.7

            self.watchdog.report_phase(agent_id, "analysis", start=False)
            self.watchdog.report_phase(agent_id, "action", start=True)
            self.watchdog.report_phase(agent_id, "action", start=False)
            self.watchdog.report_agent_success(agent_id)

            elapsed_ms = int((time.time() - start) * 1000)
            return TaskResult(
                subtask_id=subtask.subtask_id,
                agent_id=agent_id,
                success=True,
                output=output,
                artifacts=subtask.artifacts_out,
                execution_time_ms=elapsed_ms,
                quality_score=quality,
                tokens_used=len(output) // 4,
            )

        except Exception as exc:
            self.watchdog.report_agent_error(agent_id)
            elapsed_ms = int((time.time() - start) * 1000)
            return TaskResult(
                subtask_id=subtask.subtask_id,
                agent_id=agent_id,
                success=False,
                error=str(exc),
                execution_time_ms=elapsed_ms,
            )

    def _setup_subscriptions(self) -> None:
        """Настроить подписки на события."""
        self.message_bus.subscribe("orchestrator/inbox", self._on_orchestrator_message)

    def _on_orchestrator_message(self, message: Message) -> None:
        """Обработчик входящих сообщений оркестратора."""
        logger.debug("Orchestrator получил сообщение: %s", message.msg_type.value)

    # ── Metrics & Diagnostics ──────────────────────────────────────────

    @property
    def stats(self) -> dict[str, Any]:
        """Статистика оркестратора."""
        return {
            "sessions": len(self._sessions),
            "tasks_processed": len(self._task_history),
            "training_signals": len(self._training_signals),
            "agent_pool": self.agent_router.pool_stats,
            "cognitive_agents": {
                role.value: agent.stats
                for role, agent in self._cognitive_agents.items()
            },
            "message_bus": self.message_bus.stats,
            "watchdog": self.watchdog.stats,
            "avg_reward": (
                sum(s.reward for s in self._training_signals) / len(self._training_signals)
                if self._training_signals else 0.0
            ),
        }

    def get_training_signals(self) -> list[TrainingSignal]:
        """Получить все Training Signals для обучения."""
        return list(self._training_signals)
