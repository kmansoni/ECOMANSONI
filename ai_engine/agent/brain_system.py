#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🧠 Brain System — "единый мозг" агента с самообучением.

Возможности:
- Постоянное исследование и чтение информации из интернета
- Построение "карты знаний" 
- Самообучение через feedback
- Архитектурное проектирование "на 10000 шагов вперёд"
- Маршрутизация между AI провайдерами
- Cost-based routing (бесплатные vs платные AI)
- Критическое мышление и дебаты с самим собой
"""

import json
import logging
import re
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Optional
from collections import defaultdict
import httpx

logger = logging.getLogger(__name__)


class AIProvider(Enum):
    """Доступные AI провайдеры."""
    # Бесплатные
    OLLAMA = "ollama"           # Локальный
    LITELLM_FREE = "litellm"   # Бесплатные лимиты
    TOGETHER_FREE = "together"  # Бесплатные лимиты
    
    # Платные (мощные)
    OPENAI = "openai"          # GPT-4
    ANTHROPIC = "anthropic"    # Claude
    GOOGLE = "google"         # Gemini
    COhere = "cohere"         # Command R
    PERPLEXITY = "perplexity"  # Prose


class TaskComplexity(Enum):
    """Сложность задачи."""
    TRIVIAL = 1      # Простой вопрос
    SIMPLE = 2       # Несложная задача
    MEDIUM = 3       # Средняя сложность
    COMPLEX = 4      # Сложная задача
    IMPOSSIBLE = 5    # Требует исследования


@dataclass
class KnowledgeNode:
    """
    Узел знаний в графе.

    Attributes:
        id: ID узла.
        topic: Тема.
        content: Содержание (может быть огромным).
        connections: Связанные темы.
        source: Откуда получено.
        confidence: Уверенность (0-1).
        last_updated: Последнее обновление.
        metadata: Доп. данные.
    """

    id: str
    topic: str
    content: str = ""
    connections: list[str] = field(default_factory=list)
    source: str = ""
    confidence: float = 0.5
    last_updated: str = field(default_factory=lambda: datetime.now().isoformat())
    metadata: dict = field(default_factory=dict)


@dataclass
class ArchitecturePlan:
    """
    Архитектурный план - "проектирование на 10000 шагов вперёд".

    Attributes:
        id: ID плана.
        name: Название системы.
        problem_statement: Описание проблемы.
        requirements: Требования.
        research_findings: Результаты исследования.
        architecture: Архитектура.
        components: Компоненты.
        data_flow: Потоки данных.
        security_model: Модель безопасности.
        infrastructure: Инфраструктура.
        implementation_steps: Шаги реализации.
        missing_pieces: Недостающие части.
        trade_offs: Компромиссы.
    """

    id: str
    name: str
    problem_statement: str = ""
    requirements: list[str] = field(default_factory=list)
    research_findings: list[str] = field(default_factory=list)
    architecture: str = ""
    components: list[dict] = field(default_factory=list)
    data_flow: str = ""
    security_model: str = ""
    infrastructure: str = ""
    implementation_steps: list[dict] = field(default_factory=list)
    missing_pieces: list[str] = field(default_factory=list)
    trade_offs: list[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


class ResearchResult:
    """
    Результат исследования.

    Attributes:
        topic: Исследуемая тема.
        findings: Найденные факты.
        sources: Источники.
        gaps: Где искать ещё.
        confidence: Уверенность.
    """

    topic: str
    findings: list[str] = field(default_factory=list)
    sources: list[dict] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)
    confidence: float = 0.0


class BrainSystem:
    """
    Brain System — "единый мозг" агента.

    Функции:
    - Исследование (web search + fetch)
    - Построение знаний
    - Архитектурное проектирование
    - Cost-based routing
    - Критическое мышление
    """

    def __init__(
        self,
        llm_callable: Optional[Callable[[str, str], str]] = None,
        web_search: Optional[Callable[[str], list[dict]]] = None,
    ):
        """
        Args:
            llm_callable: LLM функция (prompt, provider) -> response.
            web_search: Веб-поиск (query) -> results.
        """
        self.llm = llm_callable
        self.web_search = web_search
        
        # Карта знаний (graph)
        self.knowledge_graph: dict[str, KnowledgeNode] = {}
        
        # Архитектурные планы
        self.architecture_plans: dict[str, ArchitecturePlan] = {}
        
        # Стоимости провайдеров (за 1K токенов)
        self.provider_costs: dict[AIProvider, dict] = {
            AIProvider.OLLAMA: {"input": 0.0, "output": 0.0, "free": True},
            AIProvider.LITELLM_FREE: {"input": 0.0, "output": 0.0, "free": True},
            AIProvider.TOGETHER_FREE: {"input": 0.0, "output": 0.0, "free": True},
            AIProvider.OPENAI: {"input": 0.01, "output": 0.03, "free": False},
            AIProvider.ANTHROPIC: {"input": 0.015, "output": 0.075, "free": False},
            AIProvider.GOOGLE: {"input": 0.00125, "output": 0.005, "free": False},
            AIProvider.COhere: {"input": 0.001, "output": 0.001, "free": False},
            AIProvider.PERPLEXITY: {"input": 0.002, "output": 0.002, "free": False},
        }
        
        # Статистика
        self._stats = {
            "total_thoughts": 0,
            "total_researches": 0,
            "total_architectures": 0,
            "providers_used": defaultdict(int),
            "total_cost": 0.0,
        }

    def think(
        self,
        problem: str,
        depth: str = "deep",
    ) -> str:
        """
        Агент "думает" над проблемой - исследует и проектирует.

        Args:
            problem: Описание проблемы.
            depth: Глубина ('quick', 'medium', 'deep').

        Returns:
            Результат размышлений.
        """
        self._stats["total_thoughts"] += 1
        
        if depth == "quick":
            return self._think_quick(problem)
        elif depth == "medium":
            return self._think_medium(problem)
        else:
            return self._think_deep(problem)

    def _think_quick(self, problem: str) -> str:
        """Быстрое размышление - простой запрос к LLM."""
        if not self.llm:
            return f"Проблема: {problem}. Требуется LLM для размышлений."
        
        prompt = f"""Ты —超级AI-агент с глубоким пониманием. 
Думай о siguiente проблеме кратко и по существу.

Проблема: {problem}

Дай ответ из 2-3 предложений:"""

        return self._call_llm(prompt, self._select_provider(TaskComplexity.SIMPLE))

    def _think_medium(self, problem: str) -> str:
        """Среднее размышление — сsmall research."""
        # Быстрый поиск
        if self.web_search:
            results = self.web_search(problem)
            research = f"Найдено {len(results)} источников. "
        else:
            research = "Нет поиска. "
        
        # LLM с контекстом
        if self.llm:
            prompt = f"""Ты —超级AI-агент с глубоким пониманием.

Контекст исследования:
{research}

Проблема: {problem}

Проанализируй и дай структурированный ответ:"""
            
            return self._call_llm(prompt, self._select_provider(TaskComplexity.MEDIUM))
        
        return research + f"Проблема: {problem}"

    def _think_deep(self, problem: str) -> str:
        """Глубокое размышление — полное исследование + архитектура."""
        self._stats["total_thoughts"] += 1
        
        # Этап 1: Исследование
        research = self._deep_research(problem)
        
        # Этап 2: Архитектурное проектирование
        architecture = self._design_architecture(problem, research)
        
        # Этап 3: Генерация документации
        docs = self._generate_docs(architecture)
        
        # Сохраняем план
        self.architecture_plans[architecture.id] = architecture
        
        return docs

    def _deep_research(self, problem: str) -> ResearchResult:
        """
        Глубокое исследование проблемы.

        Args:
            problem: Описание проблемы.

        Returns:
            ResearchResult с findings.
        """
        self._stats["total_researches"] += 1
        
        topic = problem
        result = ResearchResult(topic=topic)
        
        # Формируем поисковые запросы
        queries = self._generate_search_queries(problem)
        
        all_findings = []
        
        if self.web_search:
            for query in queries[:5]:  # Ограничиваем
                try:
                    results = self.web_search(query)
                    result.sources.extend(results)
                    
                    # Извлекаем факты
                    for r in results[:3]:
                        all_findings.append(r.get("snippet", ""))
                except Exception as e:
                    logger.warning(f"Search error for '{query}': {e}")
        
        result.findings = all_findings
        
        # Определяем gaps
        result.gaps = self._identify_gaps(problem, all_findings)
        
        # Уверенность
        result.confidence = min(1.0, len(all_findings) / 10)
        
        # Сохраняем в графе знаний
        self._add_to_knowledge_graph(topic, all_findings, result.sources)
        
        return result

    def _generate_search_queries(self, problem: str) -> list[str]:
        """Генерировать поисковые запросы для исследования."""
        if not self.llm:
            # Простой fallback
            return [problem]
        
        prompt = f"""Сгенерируй 5-10 поисковых запросов для глубокого исследования проблемы.

Проблема: {problem}

Выве только запросы, по одному на строку, без нумерации:"""

        response = self._call_llm(prompt, AIProvider.OLLAMA)
        
        # Парсим
        queries = [line.strip() for line in response.split("\n") if line.strip()]
        
        return queries[:10]

    def _identify_gaps(self, problem: str, findings: list[str]) -> list[str]:
        """Определить недостающую информацию."""
        prompt = f"""Проанализируй и найди недостающую информацию для полного решения.

Проблема: {problem}

Найдено: {', '.join(findings[:5])}

Какая информация отсутствует? Выве список:"""

        response = self._call_llm(prompt, self._select_provider(TaskComplexity.MEDIUM))
        
        gaps = [line.strip() for line in response.split("\n") if line.strip()]
        
        return gaps

    def _design_architecture(
        self,
        problem: str,
        research: ResearchResult,
    ) -> ArchitecturePlan:
        """
        Спр��ектировать архитектуру "на 10000 шагов вперёд".

        Args:
            problem: Проблема.
            research: Результат исследования.

        Returns:
            ArchitecturePlan.
        """
        import uuid
        
        self._stats["total_architectures"] += 1
        
        plan_id = f"arch_{uuid.uuid4().hex[:8]}"
        
        # Создаём детальный промпт для архитектуры
        prompt = f"""Ты — архитектор систем уровня enterprise. 
Спроектируй полную архитектуру для следующей системы.

ПРОБЛЕМА:
{problem}

ИССЛЕДОВАНИЕ:
{chr(10).join(research.findings[:10])}

ВЫВОДЫ:
{chr(10).join(research.gaps)}

Требуется создать ИДЕАЛЬНУЮ систему "от А до Я":
1. Полная архитектура (все компоненты)
2. Потоки данных
3. Модель безопасности (E2EE, ключи, сертификаты)
4. Инфраструктура (DNS, CDN, веб-серверы)
5. Все необходимые функции
6. Что НЕ хватает (missing pieces)
7. Компромиссы и trade-offs
8. Реализация шаг за шагом

Выве в формате JSON:"""

        architecture_json = self._call_llm(prompt, self._select_provider(TaskComplexity.COMPLEX))
        
        # Парсим JSON
        try:
            arch_data = json.loads(architecture_json)
        except:
            arch_data = {"raw": architecture_json}
        
        plan = ArchitecturePlan(
            id=plan_id,
            name=problem[:50],
            problem_statement=problem,
            research_findings=research.findings,
            **arch_data,
        )
        
        return plan

    def _generate_docs(self, plan: ArchitecturePlan) -> str:
        """Генерировать документацию."""
        lines = [
            "# 🏗️ АРХИТЕКТУРНЫЙ ПЛАН",
            "",
            f"## Проблема",
            plan.problem_statement,
            "",
            f"## Требования",
            *plan.requirements,
            "",
            "## 🔍 Результаты исследования",
            *[f"- {f}" for f in plan.research_findings],
            "",
            "## 🏗️ Архитектура",
            plan.architecture,
            "",
            "## 🔐 Компоненты",
        ]
        
        for comp in plan.components:
            lines.append(f"### {comp.get('name', 'Component')}")
            lines.append(f"- Назначение: {comp.get('purpose', 'N/A')}")
            lines.append(f"- Технологии: {comp.get('tech', 'N/A')}")
        
        lines.extend([
            "",
            f"## 🔒 Модель безопасности",
            plan.security_model,
            "",
            f"## 🌍 Инфраструктура",
            plan.infrastructure,
            "",
            "## 📝 Реализация",
        ])
        
        for i, step in enumerate(plan.implementation_steps, 1):
            lines.append(f"{i}. {step.get('description', 'Шаг')}")
        
        if plan.missing_pieces:
            lines.extend([
                "",
                "## ❓ Недостающие части",
                *[f"- {m}" for m in plan.missing_pieces],
            ])
        
        if plan.trade_offs:
            lines.extend([
                "",
                "## ��️ Trade-offs",
                *[f"- {t}" for t in plan.trade_offs],
            ])
        
        return "\n".join(lines)

    def _add_to_knowledge_graph(
        self,
        topic: str,
        findings: list[str],
        sources: list[dict],
    ) -> None:
        """Добавить в граф знаний."""
        import uuid
        
        node_id = uuid.uuid4().hex[:8]
        
        node = KnowledgeNode(
            id=node_id,
            topic=topic,
            content="\n".join(findings),
            source=", ".join(s.get("url", "unknown") for s in sources[:3]),
            confidence=min(1.0, len(findings) / 10),
            connections=[],
        )
        
        self.knowledge_graph[topic] = node

    def _select_provider(
        self,
        complexity: TaskComplexity,
    ) -> AIProvider:
        """
        Выбрать провайдера на основе сложности и стоимости.

        Args:
            complexity: Сложность задачи.

        Returns:
            AIProvider.
        """
        # Простые задачи — бесплатные провайдеры
        if complexity in (TaskComplexity.TRIVIAL, TaskComplexity.SIMPLE):
            self._stats["providers_used"][AIProvider.OLLAMA] += 1
            return AIProvider.OLLAMA
        
        # Средние — тоже бесплатные
        if complexity == TaskComplexity.MEDIUM:
            self._stats["providers_used"][AIProvider.OLLAMA] += 1
            return AIProvider.OLLAMA
        
        # Сложные — мощные провайдеры
        if complexity == TaskComplexity.COMPLEX:
            self._stats["providers_used"][AIProvider.OPENAI] += 1
            return AIProvider.OPENAI
        
        # И невозможные — самые мощные
        self._stats["providers_used"][AIProvider.ANTHROPIC] += 1
        return AIProvider.ANTHROPIC

    def _call_llm(
        self,
        prompt: str,
        provider: AIProvider,
    ) -> str:
        """
        Вызвать LLM через выбранный провайдер.

        Args:
            prompt: Промпт.
            provider: Провайдер.

        Returns:
            Ответ LLM.
        """
        if not self.llm:
            return f"Требуется LLM callable для провайдера {provider}"
        
        try:
            response = self.llm(prompt, provider.value)
            
            # Считаем стоимость
            cost = (
                len(prompt) / 1000 * self.provider_costs[provider]["input"] +
                len(response) / 1000 * self.provider_costs[provider]["output"]
            )
            self._stats["total_cost"] += cost
            
            return response
        except Exception as e:
            logger.error(f"LLM error ({provider}): {e}")
            return f"Ошибка: {e}"

    def debate(self, topic: str, position: str) -> str:
        """
        Критические дебаты с самим собой.

        Args:
            topic: Тема дебатов.
            position: Позиция для защиты.

        Returns:
            Результат дебатов.
        """
        prompt = f"""Ты участвуешь в интеллектуальных дебатах.
Защищай позицию, но будь готов признать ошибки.

ПОЗИЦИЯ: {position}
ТОПИК: {topic}

Аргументируй ЗА, затем аргументируй ПРОТИВ, затем дай ИТОГОВУЮ позицию:"""

        return self._call_llm(prompt, self._select_provider(TaskComplexity.COMPLEX))

    def get_plan(self, plan_id: str) -> Optional[ArchitecturePlan]:
        """Получить архитектурный план."""
        return self.architecture_plans.get(plan_id)

    def get_all_plans(self) -> list[ArchitecturePlan]:
        """Получить все планы."""
        return list(self.architecture_plans.values())

    def get_knowledge(self, topic: str) -> Optional[KnowledgeNode]:
        """Получить знания по теме."""
        return self.knowledge_graph.get(topic)

    def get_stats(self) -> dict:
        """Получить статистику."""
        return {
            **self._stats,
            "knowledge_nodes": len(self.knowledge_graph),
            "architecture_plans": len(self.architecture_plans),
            "total_cost_usd": round(self._stats["total_cost"], 4),
        }


# =============================================================================
# Глобальный实例
# =============================================================================

_brain: Optional[BrainSystem] = None


def get_brain_system(
    llm_callable: Optional[Callable] = None,
    web_search: Optional[Callable] = None,
) -> BrainSystem:
    """Получить глобальный экземпляр мозга."""
    global _brain
    if _brain is None:
        _brain = BrainSystem(llm_callable, web_search)
    return _brain


# =============================================================================
# Пример: Создание мессенджера "на 10000 шагов вперёд"
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # Пример LLM callable
    def mock_llm(prompt: str, provider: str = "ollama") -> str:
        return f"[Mock response for: {prompt[:50]}...]"
    
    # Пример web search
    def mock_search(query: str) -> list[dict]:
        return [{"snippet": f"Result for {query}", "url": "example.com"}]
    
    # Создаём мозг
    brain = BrainSystem(mock_llm, mock_search)
    
    # Думаем о мессенджере
    problem = "Создай безопасный мессенджер с E2EE шифрованием"
    
    print("🧠 Думаем о проблеме...")
    result = brain.think(problem, depth="deep")
    
    print(result[:2000])
    
    # Дебаты
    print("\n\n💬 Дебаты:")
    debate_result = brain.debate(problem, "Мессенджер должен быть децентрализованным")
    print(debate_result[:500])
    
    print(f"\n📊 Статистика: {brain.get_stats()}")