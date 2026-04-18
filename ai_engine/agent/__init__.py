#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🧠 Super Agent System — полнофункциональный AI агент нового поколения.

Возможности:
- 💾 Долгосрочная память (1000+ запросов)
- 🧠 Единый мозг с самообучением
- 🔬 Глубокое исследование
- 🔐 E2EE шифрование
- 🏗️ Архитектурное проектирование "на 10000 шагов вперёд"
- 💰 Cost-based AI routing
- 💭 Критическое мышление
- 🔧 Auto-code generation
- 🚀 DevOps + Deploy
- 🛡️ Security Scanner
- ⚡ Performance Audit
- 🎙️ Voice AI
- 📊 CI/CD
- 📈 Monitoring (Sentry + Prometheus)

Компоненты:
- memory_system.py: Долгосрочная память
- brain_system.py: Мозг агента
- security_system.py: Безопасность
- research_system.py: Исследования
- auto_code_generator.py: Генерация кода
- devops_system.py: DevOps
- security_scan_system.py: Security Scanner
- performance_audit.py: Performance
- voice_ai_system.py: Voice
- ci_cd_system.py: CI/CD
- monitoring_system.py: Monitoring
"""

# Инструменты и агент
from .tools import Tool, ToolRegistry, ToolResult, tool
from .planner import TaskPlanner, TaskPlan, TaskStep, Complexity
from .react_agent import ReActAgent, AgentResult, AgentStep

# Memory System
from .memory_system import (
    MemoryManager, MemoryStore, ContextWindow,
    MemoryEntry, MemoryType, Importance, Session,
    get_memory_manager,
)

# Brain System
from .brain_system import (
    BrainSystem, ArchitecturePlan, AIProvider,
    TaskComplexity, KnowledgeNode, get_brain_system,
)

# Security System
from .security_system import (
    SecuritySystem, KeyVault, EncryptionService,
    SecurityAuditor, KeyType, SecretLevel,
    get_security_system,
)

# Research System
from .research_system import (
    ResearchManager, WebResearcher, BookReader,
    ResearchSource, ResearchQuery, SourceType,
    get_research_manager,
)

# NEW: Auto Code Generator
from .auto_code_generator import (
    CodeGenerator, SmartCodeGenerator, ProjectSpec,
    GeneratedProject, GeneratedFile,
    Framework, Backend, Database,
    get_code_generator,
)

# NEW: DevOps System
from .devops_system import (
    DevOpsSystem, CommandExecutor, DeploymentManager,
    DatabaseMigrator, HealthChecker,
    DeployTarget, CommandType, CommandResult,
    get_devops,
)

# NEW: Security Scanner
from .security_scan_system import (
    SecurityScanner, DependencyScanner, SSLCertChecker,
    Vulnerability, ScanResult,
    VulnType, Severity,
    get_security_scanner,
)

# NEW: Performance Audit
from .performance_audit import (
    PerformanceAuditor, LighthouseAuditor, BundleAnalyzer,
    PerformanceReport, WebVitalsResult,
    get_performance_auditor,
)

# NEW: Voice AI
from .voice_ai_system import (
    VoiceAI, WhisperSTT, TTSEngine,
    TranscriptionResult, SpeechResult,
    TTSProvider, get_voice_ai,
)

# NEW: CI/CD
from .ci_cd_system import (
    CICDSystem, WorkflowRun, PipelineStatus,
    WorkflowTemplates, get_ci_cd,
)

# NEW: Monitoring
from .monitoring_system import (
    MonitoringSystem, SentryMonitor, PrometheusMetrics,
    HealthChecker, SentryConfig, Metric,
    get_monitoring_system, setup_sentry,
)

from .research_system import (
    ResearchManager,
    WebResearcher,
    BookReader,
    ResearchSource,
    ResearchQuery,
    SourceType,
    get_research_manager,
)

__all__ = [
    # Tools
    "Tool",
    "ToolRegistry",
    "ToolResult",
    "tool",
    
    # Planner
    "TaskPlanner",
    "TaskPlan",
    "TaskStep",
    "Complexity",
    
    # ReAct Agent
    "ReActAgent",
    "AgentResult",
    "AgentStep",
    
    # Memory System
    "MemoryManager",
    "MemoryStore",
    "ContextWindow",
    "MemoryEntry",
    "MemoryType",
    "Importance",
    "Session",
    "get_memory_manager",
    
    # Brain System
    "BrainSystem",
    "ArchitecturePlan",
    "AIProvider",
    "TaskComplexity",
    "KnowledgeNode",
    "get_brain_system",
    
    # Security System
    "SecuritySystem",
    "KeyVault",
    "EncryptionService",
    "SecurityAuditor",
    "KeyType",
    "SecretLevel",
    "get_security_system",
    
    # Research System
    "ResearchManager",
    "WebResearcher",
    "BookReader",
    "ResearchSource",
    "ResearchQuery",
    "SourceType",
    "get_research_manager",
]
