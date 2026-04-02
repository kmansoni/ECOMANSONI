#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Модели данных системы оркестрации.

Определяет все структуры данных: задачи, подзадачи, DAG,
агенты, результаты, контекстные снапшоты и сессии.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional


# ── Enums ──────────────────────────────────────────────────────────────

class TaskStatus(Enum):
    """Статус жизненного цикла задачи."""
    RECEIVED = "received"
    ANALYZING = "analyzing"
    PLANNING = "planning"
    RESEARCHING = "researching"
    EXECUTING = "executing"
    SYNTHESIZING = "synthesizing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class SubTaskStatus(Enum):
    """Статус подзадачи в DAG."""
    PENDING = "pending"
    READY = "ready"          # все зависимости выполнены
    ASSIGNED = "assigned"    # назначена агенту
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class AgentRole(Enum):
    """Роли специализированных агентов."""
    CODE_ANALYST = "code_analyst"
    CODER = "coder"
    TEST_WRITER = "test_writer"
    REVIEWER = "reviewer"
    RESEARCHER = "researcher"
    ARCHITECT = "architect"
    DEVOPS = "devops"
    DOCS_WRITER = "docs_writer"
    SYNTHESIZER = "synthesizer"
    DEBUGGER = "debugger"
    DATA_ANALYST = "data_analyst"
    SECURITY_AUDITOR = "security_auditor"


class Priority(Enum):
    """Приоритет задачи."""
    CRITICAL = 10
    HIGH = 8
    NORMAL = 5
    LOW = 3
    BACKGROUND = 1


class EdgeType(Enum):
    """Тип связи в DAG."""
    PRODUCES = "produces"        # A производит артефакт для B
    DEPENDS_ON = "depends_on"    # B зависит от результата A
    INFORMS = "informs"          # A предоставляет контекст для B


# ── Core Models ────────────────────────────────────────────────────────

@dataclass
class Intent:
    """
    Извлечённое намерение из задачи пользователя.

    Attributes:
        action: Тип действия (understand, create, fix, refactor, test, etc.)
        target: Целевой объект действия.
        constraints: Ограничения и требования.
        domain: Предметная область (frontend, backend, database, etc.)
    """
    action: str
    target: str
    constraints: list[str] = field(default_factory=list)
    domain: str = "general"


@dataclass
class Task:
    """
    Задача пользователя — корневая единица работы.

    Attributes:
        task_id: Уникальный идентификатор.
        prompt: Оригинальный текст задачи.
        session_id: ID сессии.
        intents: Извлечённые намерения.
        status: Текущий статус.
        priority: Приоритет.
        created_at: Время создания.
        updated_at: Время последнего обновления.
        metadata: Дополнительные данные.
    """
    task_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    prompt: str = ""
    session_id: str = ""
    intents: list[Intent] = field(default_factory=list)
    status: TaskStatus = TaskStatus.RECEIVED
    priority: Priority = Priority.NORMAL
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class SubTask:
    """
    Атомарная подзадача — узел в DAG.

    Критерии атомарности (из документации):
        - Выполнимость одним агентом
        - Время ≤ 15 минут
        - Единственный тип артефакта на выходе
        - Нет скрытых зависимостей
        - Независимо верифицируема

    Attributes:
        subtask_id: Уникальный ID.
        description: Описание подзадачи.
        agent_role_required: Требуемая роль агента.
        estimated_complexity: Сложность (1-10).
        dependencies: ID подзадач-зависимостей.
        artifacts_in: Входные артефакты.
        artifacts_out: Выходные артефакты.
        status: Текущий статус.
        assigned_agent_id: ID назначенного агента.
        result: Результат выполнения.
        started_at: Время начала.
        completed_at: Время завершения.
    """
    subtask_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    description: str = ""
    agent_role_required: AgentRole = AgentRole.CODER
    estimated_complexity: int = 5
    dependencies: list[str] = field(default_factory=list)
    artifacts_in: list[str] = field(default_factory=list)
    artifacts_out: list[str] = field(default_factory=list)
    status: SubTaskStatus = SubTaskStatus.PENDING
    assigned_agent_id: Optional[str] = None
    result: Optional["TaskResult"] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


# ── DAG Models ─────────────────────────────────────────────────────────

@dataclass
class DAGNode:
    """Узел DAG — обёртка вокруг SubTask."""
    node_id: str
    subtask: SubTask
    depth: int = 0  # глубина в графе


@dataclass
class DAGEdge:
    """Ребро DAG — зависимость между подзадачами."""
    from_node: str
    to_node: str
    edge_type: EdgeType = EdgeType.DEPENDS_ON


@dataclass
class DAG:
    """
    Directed Acyclic Graph — граф зависимостей подзадач.

    Attributes:
        dag_id: Уникальный ID.
        root_task_id: ID корневой задачи.
        nodes: Узлы графа (подзадачи).
        edges: Рёбра (зависимости).
        critical_path: ID узлов критического пути.
        estimated_total_complexity: Суммарная сложность.
    """
    dag_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    root_task_id: str = ""
    nodes: dict[str, DAGNode] = field(default_factory=dict)
    edges: list[DAGEdge] = field(default_factory=list)
    critical_path: list[str] = field(default_factory=list)
    estimated_total_complexity: int = 0

    def add_node(self, subtask: SubTask) -> DAGNode:
        """Добавить узел в граф."""
        node = DAGNode(node_id=subtask.subtask_id, subtask=subtask)
        self.nodes[node.node_id] = node
        return node

    def add_edge(self, from_id: str, to_id: str, edge_type: EdgeType = EdgeType.DEPENDS_ON) -> None:
        """Добавить ребро."""
        self.edges.append(DAGEdge(from_node=from_id, to_node=to_id, edge_type=edge_type))

    def get_ready_nodes(self) -> list[DAGNode]:
        """Получить узлы, готовые к выполнению (все зависимости завершены)."""
        ready = []
        for node_id, node in self.nodes.items():
            if node.subtask.status != SubTaskStatus.PENDING:
                continue
            # Проверить все входящие зависимости
            deps_satisfied = True
            for edge in self.edges:
                if edge.to_node == node_id:
                    dep_node = self.nodes.get(edge.from_node)
                    if dep_node and dep_node.subtask.status != SubTaskStatus.COMPLETED:
                        deps_satisfied = False
                        break
            if deps_satisfied:
                ready.append(node)
        return ready

    def has_cycle(self) -> bool:
        """Проверить наличие циклов (DFS)."""
        WHITE, GRAY, BLACK = 0, 1, 2
        color: dict[str, int] = {nid: WHITE for nid in self.nodes}

        adj: dict[str, list[str]] = {nid: [] for nid in self.nodes}
        for edge in self.edges:
            if edge.from_node in adj:
                adj[edge.from_node].append(edge.to_node)

        def dfs(node_id: str) -> bool:
            color[node_id] = GRAY
            for neighbor in adj.get(node_id, []):
                if color.get(neighbor) == GRAY:
                    return True
                if color.get(neighbor) == WHITE and dfs(neighbor):
                    return True
            color[node_id] = BLACK
            return False

        for nid in self.nodes:
            if color[nid] == WHITE:
                if dfs(nid):
                    return True
        return False

    def topological_sort(self) -> list[str]:
        """Топологическая сортировка узлов."""
        in_degree: dict[str, int] = {nid: 0 for nid in self.nodes}
        adj: dict[str, list[str]] = {nid: [] for nid in self.nodes}

        for edge in self.edges:
            if edge.to_node in in_degree:
                in_degree[edge.to_node] += 1
            if edge.from_node in adj:
                adj[edge.from_node].append(edge.to_node)

        queue = [nid for nid, deg in in_degree.items() if deg == 0]
        result: list[str] = []

        while queue:
            node_id = queue.pop(0)
            result.append(node_id)
            for neighbor in adj.get(node_id, []):
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        return result

    def find_critical_path(self) -> list[str]:
        """Найти критический путь (самый длинный путь по сложности)."""
        sorted_nodes = self.topological_sort()
        if not sorted_nodes:
            return []

        dist: dict[str, int] = {nid: 0 for nid in self.nodes}
        prev: dict[str, Optional[str]] = {nid: None for nid in self.nodes}

        adj: dict[str, list[str]] = {nid: [] for nid in self.nodes}
        for edge in self.edges:
            if edge.from_node in adj:
                adj[edge.from_node].append(edge.to_node)

        for node_id in sorted_nodes:
            node = self.nodes[node_id]
            for neighbor in adj.get(node_id, []):
                weight = self.nodes[neighbor].subtask.estimated_complexity
                if dist[node_id] + weight > dist[neighbor]:
                    dist[neighbor] = dist[node_id] + weight
                    prev[neighbor] = node_id

        # Найти узел с максимальной дистанцией
        end_node = max(dist, key=lambda k: dist[k])
        path: list[str] = []
        current: Optional[str] = end_node
        while current is not None:
            path.append(current)
            current = prev[current]

        self.critical_path = list(reversed(path))
        return self.critical_path


# ── Agent Models ───────────────────────────────────────────────────────

@dataclass
class AgentInfo:
    """
    Информация о зарегистрированном агенте.

    Attributes:
        agent_id: Уникальный ID.
        role: Роль агента.
        specializations: Дополнительные специализации.
        current_load: Текущая нагрузка (0.0 - 1.0).
        max_concurrent_tasks: Максимум параллельных задач.
        success_rate: Исторический показатель успеха.
        is_available: Доступен ли для назначения задач.
    """
    agent_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    role: AgentRole = AgentRole.CODER
    specializations: list[str] = field(default_factory=list)
    current_load: float = 0.0
    max_concurrent_tasks: int = 3
    success_rate: float = 1.0
    is_available: bool = True

    @property
    def load_factor(self) -> float:
        """Фактор нагрузки (0=свободен, 1=полностью загружен)."""
        return self.current_load / max(self.max_concurrent_tasks, 1)


# ── Result Models ──────────────────────────────────────────────────────

@dataclass
class TaskResult:
    """
    Результат выполнения подзадачи.

    Attributes:
        result_id: ID результата.
        subtask_id: ID подзадачи.
        agent_id: ID агента-исполнителя.
        success: Успешно ли выполнена.
        output: Результат работы.
        artifacts: Созданные артефакты (пути к файлам, etc.).
        error: Описание ошибки (если success=False).
        execution_time_ms: Время выполнения в миллисекундах.
        quality_score: Оценка качества (0.0 - 1.0).
        tokens_used: Примерное количество использованных токенов.
    """
    result_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    subtask_id: str = ""
    agent_id: str = ""
    success: bool = True
    output: str = ""
    artifacts: list[str] = field(default_factory=list)
    error: str = ""
    execution_time_ms: int = 0
    quality_score: float = 0.0
    tokens_used: int = 0


# ── Session & Context Models ──────────────────────────────────────────

@dataclass
class ContextSnapshot:
    """
    Контекстный снапшот — состояние в точке времени.

    Используется для чекпоинтов и восстановления.
    """
    snapshot_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str = ""
    task_id: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    sequence_number: int = 0
    broader_goal: str = ""
    completed_nodes: list[str] = field(default_factory=list)
    artifacts_produced: list[str] = field(default_factory=list)
    reasoning_chain: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class SessionState:
    """
    Состояние сессии оркестрации.

    Attributes:
        session_id: ID сессии.
        tasks: Задачи в сессии.
        active_dag: Текущий DAG.
        snapshots: Контекстные снапшоты.
        created_at: Время создания.
        last_checkpoint: Время последнего чекпоинта.
    """
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    tasks: list[Task] = field(default_factory=list)
    active_dag: Optional[DAG] = None
    snapshots: list[ContextSnapshot] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    last_checkpoint: str = field(default_factory=lambda: datetime.now().isoformat())


# ── Training Signal Models (Continual Learning) ───────────────────────

@dataclass
class TrainingSignal:
    """
    Сигнал для обучения из завершённой задачи.

    Используется для адаптации стратегий оркестратора.
    """
    signal_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    task_id: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    outcome: str = "success"  # success | partial | failure
    time_to_complete_ms: int = 0
    token_efficiency: float = 0.0
    quality_score: float = 0.0
    retry_count: int = 0
    strategy_used: dict[str, str] = field(default_factory=dict)
    reward: float = 0.0
