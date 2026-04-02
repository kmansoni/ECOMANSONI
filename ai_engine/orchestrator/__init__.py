#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Orchestrator — ядро системы координации мультиагентов.

Компоненты:
    - OrchestratorCore: главный координатор
    - TaskReceiver: приём и валидация задач
    - IntentExtractor: извлечение намерений
    - DAGBuilder: построение графа зависимостей
    - AgentRouter: маршрутизация задач к агентам
    - ExecutionSupervisor: мониторинг выполнения
    - ResultSynthesizer: агрегация результатов
    - MessageBus: межагентская коммуникация
"""

__version__ = "1.0.0"

from .models import (
    Task,
    TaskStatus,
    SubTask,
    DAG,
    DAGNode,
    DAGEdge,
    Intent,
    AgentRole,
    AgentInfo,
    TaskResult,
    SessionState,
    ContextSnapshot,
)
from .message_bus import MessageBus, Message, MessageType
from .dag_builder import DAGBuilder
from .agent_router import AgentRouter
from .execution_supervisor import ExecutionSupervisor
from .result_synthesizer import ResultSynthesizer
from .watchdog import WatchdogSystem
from .cognitive_agent import (
    CognitiveAgent,
    AgentWorkingMemory,
    AgentEpisodicMemory,
    Reflector,
    ReflectionResult,
    Validator,
    ValidationResult,
)
from .research_engine import ResearchEngine, CodeIndexer, KnowledgeLibrary, CodeChunk, SearchResult, KnowledgeEntry
from .orchestrator_core import OrchestratorCore

__all__ = [
    "OrchestratorCore",
    "Task",
    "TaskStatus",
    "SubTask",
    "DAG",
    "DAGNode",
    "DAGEdge",
    "Intent",
    "AgentRole",
    "AgentInfo",
    "TaskResult",
    "SessionState",
    "ContextSnapshot",
    "MessageBus",
    "Message",
    "MessageType",
    "DAGBuilder",
    "AgentRouter",
    "ExecutionSupervisor",
    "ResultSynthesizer",
    "WatchdogSystem",
    "CognitiveAgent",
    "AgentWorkingMemory",
    "AgentEpisodicMemory",
    "Reflector",
    "ReflectionResult",
    "Validator",
    "ValidationResult",
    "ResearchEngine",
    "CodeIndexer",
    "KnowledgeLibrary",
    "CodeChunk",
    "SearchResult",
    "KnowledgeEntry",
]
