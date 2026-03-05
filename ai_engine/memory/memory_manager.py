#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Memory Manager — единый интерфейс ко всем типам памяти.

Координирует Working Memory (текущая сессия), Episodic Memory
(долгосрочная история) и Semantic Memory (база знаний).
Автоматически сохраняет данные между сессиями.
"""

import logging
import os
import uuid
from dataclasses import dataclass
from typing import Optional

from .working_memory import WorkingMemory, Message
from .episodic_memory import EpisodicMemory, Episode, UserProfile
from .semantic_memory import SemanticMemory, Fact

logger = logging.getLogger(__name__)


@dataclass
class MemoryContext:
    """
    Агрегированный контекст из всех типов памяти.

    Attributes:
        working_history: История текущей сессии (context window).
        relevant_episodes: Релевантные прошлые эпизоды.
        relevant_facts: Релевантные факты из семантической памяти.
        user_profile: Агрегированный профиль пользователя.
    """

    working_history: list[Message]
    relevant_episodes: list[Episode]
    relevant_facts: list[Fact]
    user_profile: UserProfile


class MemoryManager:
    """
    Memory Manager — центральный координатор всех типов памяти.

    Жизненный цикл сессии:
        1. __init__: Загрузка сохранённых данных из storage_path
        2. process_message(): добавление сообщений в working memory
        3. get_relevant_context(): агрегация контекста для LLM
        4. end_session(): завершение, автосохранение в episodic memory
        5. Персистентность через JSON файлы в storage_path

    Attributes:
        storage_path: Директория для хранения данных памяти.
        working: WorkingMemory текущей сессии.
        episodic: EpisodicMemory долгосрочная.
        semantic: SemanticMemory база знаний.
        current_session_id: ID текущей сессии.
    """

    EPISODIC_FILE = "episodic_memory.json"
    SEMANTIC_FILE = "semantic_memory.json"

    def __init__(
        self,
        storage_path: str = "/tmp/ai_memory",
        max_working_tokens: int = 4096,
    ) -> None:
        """
        Args:
            storage_path: Директория для персистентных данных.
            max_working_tokens: Лимит токенов рабочей памяти.
        """
        self.storage_path = storage_path
        self.working = WorkingMemory(max_tokens=max_working_tokens)
        self.episodic = EpisodicMemory()
        self.semantic = SemanticMemory()
        self.current_session_id = str(uuid.uuid4())

        self._ensure_storage_dir()
        self._load_persistent_data()

        logger.info(
            "MemoryManager инициализирован. Сессия: %s",
            self.current_session_id[:8],
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_message(self, role: str, content: str) -> None:
        """
        Обработать входящее сообщение.

        Добавляет в рабочую память и автоматически извлекает факты
        из ответов ассистента.

        Args:
            role: "user", "assistant" или "system".
            content: Текст сообщения.
        """
        self.working.add_message(role, content)

        # Автоматическая экстракция потенциальных фактов из ответов
        if role == "assistant" and len(content) > 50:
            self._auto_extract_facts(content)

    def get_relevant_context(
        self,
        query: str,
        max_episodes: int = 3,
        max_facts: int = 5,
    ) -> MemoryContext:
        """
        Получить релевантный контекст из всех типов памяти.

        Args:
            query: Текущий запрос пользователя.
            max_episodes: Максимум эпизодов из episodic memory.
            max_facts: Максимум фактов из semantic memory.

        Returns:
            MemoryContext с агрегированным контекстом.
        """
        # Working memory: последнее контекстное окно
        working_history = self.working.get_context_window()

        # Episodic: релевантные прошлые сессии
        relevant_episodes = self.episodic.recall(query, top_k=max_episodes)

        # Semantic: факты из всех тем (топ по confidence)
        relevant_facts = self.semantic.query_all(min_confidence=0.5)[:max_facts]

        # User profile
        user_profile = self.episodic.get_user_profile()

        return MemoryContext(
            working_history=working_history,
            relevant_episodes=relevant_episodes,
            relevant_facts=relevant_facts,
            user_profile=user_profile,
        )

    def end_session(self, session_id: Optional[str] = None) -> None:
        """
        Завершить текущую сессию и сохранить в episodic memory.

        Args:
            session_id: Переопределить ID сессии (если None — используется current_session_id).
        """
        sid = session_id or self.current_session_id
        summary = self.working.summarize()
        key_facts = self._extract_key_facts_from_working()

        self.episodic.store_episode(
            session_id=sid,
            summary=summary,
            key_facts=key_facts,
            importance_score=self._estimate_session_importance(),
        )

        # Сохраняем на диск
        self._save_persistent_data()

        logger.info("Сессия '%s' завершена и сохранена.", sid[:8])

        # Подготовка к следующей сессии
        self.working.clear()
        self.current_session_id = str(uuid.uuid4())

    def get_enriched_prompt(self, base_prompt: str, query: str) -> str:
        """
        Обогатить базовый промпт данными из памяти.

        Args:
            base_prompt: Исходный системный промпт.
            query: Текущий запрос для поиска релевантного контекста.

        Returns:
            Обогащённый промпт с контекстом памяти.
        """
        context = self.get_relevant_context(query)

        memory_parts: list[str] = [base_prompt]

        # Добавляем профиль пользователя
        profile = context.user_profile
        if profile.interests:
            interests_str = ", ".join(profile.interests[:5])
            memory_parts.append(
                f"\n[User Profile] Expertise: {profile.expertise_level}. "
                f"Interests: {interests_str}. "
                f"Style: {profile.communication_style}."
            )

        # Добавляем релевантные прошлые эпизоды
        if context.relevant_episodes:
            episodes_str = " | ".join(
                ep.summary[:80] for ep in context.relevant_episodes
            )
            memory_parts.append(f"\n[Past Context] {episodes_str}")

        # Добавляем релевантные факты
        if context.relevant_facts:
            facts_str = "; ".join(
                f.content for f in context.relevant_facts[:3]
            )
            memory_parts.append(f"\n[Known Facts] {facts_str}")

        return "\n".join(memory_parts)

    def add_knowledge(self, topic: str, fact: str, source: str = "user", confidence: float = 1.0) -> str:
        """
        Добавить знание в семантическую память.

        Args:
            topic: Тема.
            fact: Факт.
            source: Источник.
            confidence: Уверенность.

        Returns:
            fact_id.
        """
        return self.semantic.store_fact(topic, fact, source, confidence)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _ensure_storage_dir(self) -> None:
        os.makedirs(self.storage_path, exist_ok=True)

    def _load_persistent_data(self) -> None:
        episodic_path = os.path.join(self.storage_path, self.EPISODIC_FILE)
        semantic_path = os.path.join(self.storage_path, self.SEMANTIC_FILE)

        if os.path.exists(episodic_path):
            try:
                self.episodic.load(episodic_path)
            except Exception as exc:
                logger.error("Ошибка загрузки episodic memory: %s", exc)

        if os.path.exists(semantic_path):
            try:
                self.semantic.load(semantic_path)
            except Exception as exc:
                logger.error("Ошибка загрузки semantic memory: %s", exc)

    def _save_persistent_data(self) -> None:
        try:
            self.episodic.save(os.path.join(self.storage_path, self.EPISODIC_FILE))
        except Exception as exc:
            logger.error("Ошибка сохранения episodic memory: %s", exc)

        try:
            self.semantic.save(os.path.join(self.storage_path, self.SEMANTIC_FILE))
        except Exception as exc:
            logger.error("Ошибка сохранения semantic memory: %s", exc)

    def _extract_key_facts_from_working(self) -> list[str]:
        """Извлечь ключевые факты из рабочей памяти (эвристика)."""
        facts: list[str] = []
        for msg in self.working.get_history():
            if msg.role == "user" and len(msg.content) > 10:
                facts.append(f"User asked: {msg.content[:100]}")
        return facts[:10]

    def _estimate_session_importance(self) -> float:
        """Оценить важность сессии по количеству сообщений."""
        count = self.working.message_count
        if count >= 10:
            return 0.9
        elif count >= 5:
            return 0.7
        elif count >= 2:
            return 0.5
        return 0.3

    def _auto_extract_facts(self, content: str) -> None:
        """Автоматически извлечь факты из ответа ассистента."""
        # Простая эвристика: предложения с утвердительными конструкциями
        import re
        sentences = re.split(r"[.!?]", content)
        for sentence in sentences[:3]:
            sentence = sentence.strip()
            if len(sentence) > 30 and any(
                kw in sentence.lower()
                for kw in ["является", "это", "means", "is a", "refers to", "defined as"]
            ):
                # Определяем топик из первого слова
                words = sentence.split()
                topic = words[0].lower() if words else "general"
                self.semantic.store_fact(
                    topic=topic,
                    fact=sentence,
                    source="assistant_response",
                    confidence=0.7,
                )


if __name__ == "__main__":
    import tempfile

    with tempfile.TemporaryDirectory() as tmpdir:
        manager = MemoryManager(storage_path=tmpdir)

        # Симуляция сессии
        manager.process_message("system", "Ты полезный AI ассистент.")
        manager.process_message("user", "Что такое RAG?")
        manager.process_message("assistant", "RAG (Retrieval-Augmented Generation) — это метод, который улучшает LLM ответы за счёт поиска по базе знаний.")
        manager.process_message("user", "Как это работает?")
        manager.process_message("assistant", "RAG встраивает запрос в вектор, ищет похожие документы и добавляет их в промпт.")

        # Добавляем знание вручную
        manager.add_knowledge("rag", "RAG состоит из retriever и generator компонентов", confidence=0.95)

        # Получаем обогащённый промпт
        enriched = manager.get_enriched_prompt("Ты AI ассистент.", "как работает RAG")
        print("Обогащённый промпт:")
        print(enriched[:400])

        # Завершаем сессию
        manager.end_session()

        print(f"\nПамять сохранена в: {tmpdir}")
        print(f"Эпизодов: 1")
        print(f"Фактов: {len(manager.semantic.query_all())}")
