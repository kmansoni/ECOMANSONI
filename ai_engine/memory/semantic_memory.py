#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Semantic Memory — база знаний о предметной области.

Хранит факты с уровнем уверенности (confidence), организованные по темам.
Поддерживает обновление убеждений (belief revision) при получении
новой информации.
"""

import json
import logging
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class Fact:
    """
    Один факт в семантической памяти.

    Attributes:
        fact_id: Уникальный идентификатор факта.
        topic: Тема/категория факта.
        content: Содержание факта.
        source: Источник информации.
        confidence: Уровень уверенности [0.0, 1.0].
        timestamp: Время добавления.
    """

    fact_id: str
    topic: str
    content: str
    source: str
    confidence: float
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def __post_init__(self) -> None:
        self.confidence = float(max(0.0, min(1.0, self.confidence)))


class SemanticMemory:
    """
    Семантическая память — база знаний о предметной области.

    Организация: dict[topic -> list[Fact]].
    Поддерживает belief revision через update_belief().

    Attributes:
        facts: Все факты по всем темам.
    """

    def __init__(self) -> None:
        self._facts: dict[str, list[Fact]] = {}  # topic -> list[Fact]
        self._fact_index: dict[str, Fact] = {}    # fact_id -> Fact

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def store_fact(
        self,
        topic: str,
        fact: str,
        source: str = "unknown",
        confidence: float = 1.0,
    ) -> str:
        """
        Сохранить факт.

        Args:
            topic: Тема/категория.
            fact: Содержание факта.
            source: Источник.
            confidence: Уверенность [0.0, 1.0].

        Returns:
            fact_id нового факта.
        """
        fact_id = str(uuid.uuid4())
        topic_normalized = topic.strip().lower()

        new_fact = Fact(
            fact_id=fact_id,
            topic=topic_normalized,
            content=fact,
            source=source,
            confidence=confidence,
        )

        if topic_normalized not in self._facts:
            self._facts[topic_normalized] = []

        self._facts[topic_normalized].append(new_fact)
        self._fact_index[fact_id] = new_fact

        logger.debug("SemanticMemory: факт '%s' сохранён в тему '%s'", fact_id[:8], topic_normalized)
        return fact_id

    def query(self, topic: str) -> list[Fact]:
        """
        Получить все факты по теме.

        Args:
            topic: Тема для запроса.

        Returns:
            Список фактов (пустой если тема не найдена).
        """
        topic_normalized = topic.strip().lower()
        facts = self._facts.get(topic_normalized, [])
        # Сортировка по убыванию confidence
        return sorted(facts, key=lambda f: f.confidence, reverse=True)

    def query_all(self, min_confidence: float = 0.0) -> list[Fact]:
        """
        Получить все факты с уверенностью >= min_confidence.

        Args:
            min_confidence: Минимальный порог.

        Returns:
            Список всех фактов.
        """
        result: list[Fact] = []
        for facts in self._facts.values():
            result.extend(f for f in facts if f.confidence >= min_confidence)
        return sorted(result, key=lambda f: f.confidence, reverse=True)

    def update_belief(self, fact_id: str, new_confidence: float) -> bool:
        """
        Обновить уровень уверенности в факте (belief revision).

        Args:
            fact_id: Идентификатор факта.
            new_confidence: Новый уровень уверенности [0.0, 1.0].

        Returns:
            True если факт найден и обновлён, False иначе.
        """
        fact = self._fact_index.get(fact_id)
        if fact is None:
            logger.warning("Факт '%s' не найден для обновления.", fact_id)
            return False

        old_confidence = fact.confidence
        fact.confidence = float(max(0.0, min(1.0, new_confidence)))
        logger.info(
            "Belief revision: факт '%s': %.2f -> %.2f",
            fact_id[:8], old_confidence, fact.confidence,
        )
        return True

    def get_topics(self) -> list[str]:
        """Список всех тем."""
        return sorted(self._facts.keys())

    def export(self) -> dict:
        """
        Экспортировать все факты в dict.

        Returns:
            Словарь {topic: [fact_dict, ...]}
        """
        return {
            topic: [asdict(f) for f in facts]
            for topic, facts in self._facts.items()
        }

    def import_from(self, data: dict) -> None:
        """
        Импортировать факты из dict.

        Args:
            data: Словарь {topic: [fact_dict, ...]}.
        """
        self._facts = {}
        self._fact_index = {}

        for topic, facts_data in data.items():
            for fd in facts_data:
                try:
                    fact = Fact(**fd)
                    if topic not in self._facts:
                        self._facts[topic] = []
                    self._facts[topic].append(fact)
                    self._fact_index[fact.fact_id] = fact
                except (TypeError, KeyError) as e:
                    logger.error("Ошибка импорта факта: %s", e)

        logger.info(
            "SemanticMemory: импортировано %d фактов по %d темам",
            len(self._fact_index), len(self._facts),
        )

    def save(self, path: str) -> None:
        """Сохранить в JSON."""
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.export(), f, ensure_ascii=False, indent=2)

    def load(self, path: str) -> None:
        """Загрузить из JSON."""
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        self.import_from(data)


if __name__ == "__main__":
    mem = SemanticMemory()

    fid1 = mem.store_fact("python", "Python поддерживает duck typing", source="docs", confidence=1.0)
    fid2 = mem.store_fact("python", "Python — интерпретируемый язык", source="wiki", confidence=0.95)
    mem.store_fact("ml", "Трансформеры используют attention mechanism", source="paper", confidence=0.9)
    mem.store_fact("ml", "RAG улучшает точность LLM ответов", source="research", confidence=0.85)

    print("Темы:", mem.get_topics())

    python_facts = mem.query("python")
    print(f"\nФакты о Python ({len(python_facts)}):")
    for f in python_facts:
        print(f"  [{f.confidence:.2f}] {f.content}")

    # Belief revision
    mem.update_belief(fid2, new_confidence=0.6)
    print(f"\nПосле belief revision:")
    for f in mem.query("python"):
        print(f"  [{f.confidence:.2f}] {f.content}")

    # Export/import
    exported = mem.export()
    mem2 = SemanticMemory()
    mem2.import_from(exported)
    print(f"\nПосле import: {len(mem2.query_all())} фактов")
