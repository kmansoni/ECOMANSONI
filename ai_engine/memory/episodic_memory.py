#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Episodic Memory — долгосрочная память взаимодействий.

Хранит резюме прошлых сессий и строит агрегированный профиль пользователя.
Поиск по релевантности: cosine similarity на TF-IDF векторах.
"""

import json
import logging
import re
import uuid
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Попытка импорта sklearn
_SKLEARN_AVAILABLE = False
try:
    from sklearn.feature_extraction.text import TfidfVectorizer  # type: ignore
    from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine  # type: ignore
    _SKLEARN_AVAILABLE = True
except ImportError:
    logger.warning("scikit-learn недоступен. Episodic поиск будет использовать keyword matching.")


@dataclass
class Episode:
    """
    Эпизод взаимодействия.

    Attributes:
        session_id: Идентификатор сессии.
        timestamp: Время завершения сессии.
        summary: Краткое резюме сессии.
        key_facts: Ключевые факты из сессии.
        importance_score: Оценка важности [0.0, 1.0].
    """

    session_id: str
    timestamp: str
    summary: str
    key_facts: list[str]
    importance_score: float = 0.5


@dataclass
class UserProfile:
    """
    Агрегированный профиль пользователя.

    Attributes:
        interests: Топик-интересы пользователя.
        expertise_level: Уровень: "beginner", "intermediate", "expert".
        communication_style: Стиль: "formal", "casual", "technical".
        preferences: Произвольные предпочтения.
    """

    interests: list[str]
    expertise_level: str
    communication_style: str
    preferences: dict


class EpisodicMemory:
    """
    Долгосрочная эпизодическая память — хранит резюме прошлых сессий.

    Поиск: TF-IDF cosine similarity (sklearn) или keyword fallback.
    Профилирование: агрегация ключевых фактов по всем эпизодам.

    Attributes:
        episodes: Список сохранённых эпизодов.
    """

    def __init__(self) -> None:
        self._episodes: list[Episode] = []
        self._tfidf: Optional[object] = None
        self._tfidf_matrix: Optional[np.ndarray] = None
        self._tfidf_dirty: bool = True

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def store_episode(
        self,
        session_id: str,
        summary: str,
        key_facts: Optional[list[str]] = None,
        importance_score: float = 0.5,
    ) -> None:
        """
        Сохранить эпизод взаимодействия.

        Args:
            session_id: ID сессии.
            summary: Краткое резюме.
            key_facts: Ключевые факты.
            importance_score: Оценка важности [0.0, 1.0].
        """
        episode = Episode(
            session_id=session_id,
            timestamp=datetime.now().isoformat(),
            summary=summary,
            key_facts=key_facts or [],
            importance_score=float(max(0.0, min(1.0, importance_score))),
        )
        self._episodes.append(episode)
        self._tfidf_dirty = True
        logger.debug("Сохранён эпизод '%s': %d фактов", session_id, len(episode.key_facts))

    def recall(self, query: str, top_k: int = 5) -> list[Episode]:
        """
        Найти релевантные эпизоды по запросу.

        Args:
            query: Поисковый запрос.
            top_k: Максимальное количество результатов.

        Returns:
            Список эпизодов, отсортированных по релевантности.
        """
        if not self._episodes:
            return []

        if _SKLEARN_AVAILABLE:
            return self._tfidf_search(query, top_k)
        else:
            return self._keyword_search(query, top_k)

    def get_user_profile(self) -> UserProfile:
        """
        Построить агрегированный профиль пользователя из всех эпизодов.

        Returns:
            UserProfile с агрегированными характеристиками.
        """
        if not self._episodes:
            return UserProfile(
                interests=[],
                expertise_level="unknown",
                communication_style="neutral",
                preferences={},
            )

        # Собираем все ключевые факты
        all_facts: list[str] = []
        for ep in self._episodes:
            all_facts.extend(ep.key_facts)

        # Определяем интересы по частоте ключевых слов
        words = re.findall(r"\b[a-zа-яё]{4,}\b", " ".join(all_facts).lower())
        # Стоп-слова
        stop_words = {"это", "такой", "также", "который", "what", "that", "this", "with", "from"}
        filtered_words = [w for w in words if w not in stop_words]
        word_freq = Counter(filtered_words)
        interests = [w for w, _ in word_freq.most_common(10)]

        # Определяем уровень экспертизы (эвристика)
        tech_terms = {"алгоритм", "архитектура", "framework", "api", "модель", "векторный", "трансформер"}
        tech_score = sum(1 for w in filtered_words if w in tech_terms)
        if tech_score >= 5:
            expertise = "expert"
        elif tech_score >= 2:
            expertise = "intermediate"
        else:
            expertise = "beginner"

        # Определяем стиль общения
        formal_terms = {"пожалуйста", "будьте добры", "please", "could you"}
        casual_terms = {"привет", "хей", "окей", "ок", "hi", "hey", "ok"}
        all_text = " ".join(ep.summary.lower() for ep in self._episodes)
        formal_score = sum(1 for t in formal_terms if t in all_text)
        casual_score = sum(1 for t in casual_terms if t in all_text)
        if formal_score > casual_score:
            style = "formal"
        elif casual_score > formal_score:
            style = "casual"
        else:
            style = "neutral"

        return UserProfile(
            interests=interests,
            expertise_level=expertise,
            communication_style=style,
            preferences={"session_count": len(self._episodes)},
        )

    def save(self, path: str) -> None:
        """
        Сохранить эпизоды в JSON файл.

        Args:
            path: Путь к файлу.
        """
        data = [asdict(ep) for ep in self._episodes]
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        logger.info("EpisodicMemory: сохранено %d эпизодов в '%s'", len(self._episodes), path)

    def load(self, path: str) -> None:
        """
        Загрузить эпизоды из JSON файла.

        Args:
            path: Путь к файлу.
        """
        with open(path, encoding="utf-8") as f:
            data = json.load(f)

        self._episodes = []
        for item in data:
            try:
                self._episodes.append(Episode(**item))
            except (TypeError, KeyError) as e:
                logger.error("Ошибка загрузки эпизода: %s", e)

        self._tfidf_dirty = True
        logger.info("EpisodicMemory: загружено %d эпизодов из '%s'", len(self._episodes), path)

    # ------------------------------------------------------------------
    # Private search implementations
    # ------------------------------------------------------------------

    def _tfidf_search(self, query: str, top_k: int) -> list[Episode]:
        """TF-IDF поиск через sklearn."""
        if self._tfidf_dirty or self._tfidf is None:
            self._rebuild_tfidf()

        if self._tfidf is None or self._tfidf_matrix is None:
            return self._keyword_search(query, top_k)

        try:
            query_vec = self._tfidf.transform([query])  # type: ignore[attr-defined]
            scores = sklearn_cosine(query_vec, self._tfidf_matrix)[0]
            # Взвешиваем на importance_score
            weighted = [
                (scores[i] * ep.importance_score, ep)
                for i, ep in enumerate(self._episodes)
            ]
            weighted.sort(key=lambda x: x[0], reverse=True)
            return [ep for _, ep in weighted[:top_k] if _ > 0]
        except Exception as exc:
            logger.error("TF-IDF поиск не удался: %s", exc)
            return self._keyword_search(query, top_k)

    def _rebuild_tfidf(self) -> None:
        """Перестроить TF-IDF матрицу."""
        if not _SKLEARN_AVAILABLE:
            return
        corpus = [ep.summary + " " + " ".join(ep.key_facts) for ep in self._episodes]
        try:
            self._tfidf = TfidfVectorizer(max_features=512)
            self._tfidf_matrix = self._tfidf.fit_transform(corpus).toarray()  # type: ignore[attr-defined]
            self._tfidf_dirty = False
        except Exception as exc:
            logger.error("Ошибка построения TF-IDF: %s", exc)
            self._tfidf = None
            self._tfidf_matrix = None

    def _keyword_search(self, query: str, top_k: int) -> list[Episode]:
        """Простой keyword matching как fallback."""
        query_words = set(query.lower().split())
        scored: list[tuple[float, Episode]] = []

        for ep in self._episodes:
            text = ep.summary.lower() + " " + " ".join(ep.key_facts).lower()
            ep_words = set(text.split())
            intersection = query_words & ep_words
            score = len(intersection) / max(len(query_words), 1) * ep.importance_score
            if score > 0:
                scored.append((score, ep))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [ep for _, ep in scored[:top_k]]


if __name__ == "__main__":
    mem = EpisodicMemory()

    mem.store_episode(
        "sess_001",
        "Пользователь спрашивал про Python и машинное обучение.",
        key_facts=["Интересуется Python", "Изучает ML", "Знает основы алгоритмов"],
        importance_score=0.8,
    )
    mem.store_episode(
        "sess_002",
        "Обсуждали архитектуру трансформеров и RAG pipeline.",
        key_facts=["Знаком с трансформерами", "Интересует RAG", "Работает с векторными БД"],
        importance_score=0.9,
    )
    mem.store_episode(
        "sess_003",
        "Вопросы о best practices в Python разработке.",
        key_facts=["Пишет production код", "Интересуется архитектурой"],
        importance_score=0.6,
    )

    results = mem.recall("что такое трансформеры и RAG", top_k=2)
    print(f"Найдено эпизодов: {len(results)}")
    for ep in results:
        print(f"  [{ep.session_id}]: {ep.summary[:60]}")

    profile = mem.get_user_profile()
    print(f"\nПрофиль:")
    print(f"  Интересы: {profile.interests[:5]}")
    print(f"  Уровень: {profile.expertise_level}")
    print(f"  Стиль: {profile.communication_style}")
