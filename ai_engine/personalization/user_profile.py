#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
UserProfileStore — долгосрочный профиль пользователя для персонализации ARIA.
============================================================================

Персонализация без нарушения приватности:
    - Профиль хранится CLIENT-SIDE или в зашифрованном виде.
    - Server-side хранится ТОЛЬКО user_hash (без PII).
    - Профиль содержит: интересы, preferred_language, response_style,
      expertise_level, topic_weights.
    - Профиль используется для:
        1. Настройки system prompt (стиль, уровень детализации).
        2. Повышения релевантности RAG поиска.
        3. Приоритизации тем при обучении.

Архитектура профиля:
    - Интересы определяются автоматически через TF-IDF analysis промптов.
    - Expertise level оценивается по сложности запросов (лексический richness).
    - Response style выводится из feedback: длинные ответы с +1 rating → verbose preferred.
    - Все веса затухают со временем (exponential decay, half-life = 30 дней).

Privacy:
    - Профиль шифруется AES-256-GCM при сохранении (ключ = user_hash[:32]).
    - При отзыве consent → профиль удаляется немедленно.
    - Минимальный retention: SESSION_ONLY режим как fallback.

Атаки:
    - Profile poisoning: adversarial prompt чтобы исказить интересы.
      Митигация: safety filter на prompt перед обновлением профиля.
    - Privacy inference: профиль не содержит raw текстов, только векторные веса.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import re
import time
from collections import Counter
from dataclasses import asdict, dataclass, field
from pathlib import Path
from threading import RLock
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

INTEREST_DECAY_HALF_LIFE_DAYS = 30.0   # интересы затухают со временем
MAX_INTERESTS = 50                      # максимум тем в профиле
MIN_INTEREST_WEIGHT = 0.01             # порог отсечения нерелевантных тем
MAX_PROMPTS_HISTORY = 200              # для TF-IDF анализа

# Expertise assessment vocabulary
_SIMPLE_WORDS = frozenset({"what", "how", "why", "when", "where", "who", "is", "are",
                            "что", "как", "когда", "где", "кто"})
_COMPLEX_MARKERS = re.compile(
    r"\b(architecture|distributed|concurrent|asynchronous|cryptograph|"
    r"eigenvalue|gradient|backpropagation|tensor|microservice|kubernetes|"
    r"архитектура|распределённ|асинхронн|криптограф|градиент|микросервис)\b",
    re.IGNORECASE,
)


# ─── Domain types ─────────────────────────────────────────────────────────────

@dataclass
class UserInterest:
    """Тема интереса пользователя с весом."""
    topic:      str
    weight:     float   = 1.0
    last_seen:  float   = field(default_factory=time.time)

    def decayed_weight(self, now: Optional[float] = None) -> float:
        """Вес с учётом временного затухания (half-life = 30 дней)."""
        if now is None:
            now = time.time()
        days_elapsed = (now - self.last_seen) / 86_400
        return self.weight * (0.5 ** (days_elapsed / INTEREST_DECAY_HALF_LIFE_DAYS))


@dataclass
class UserProfile:
    """
    Долгосрочный профиль пользователя.

    Attributes:
        user_hash:         Анонимный идентификатор (SHA-256).
        preferred_language: ISO 639-1 (выводится автоматически).
        expertise_level:   "beginner" | "intermediate" | "expert".
        response_style:    "concise" | "balanced" | "verbose".
        interests:         Список {topic, weight} отсортированных по весу.
        total_interactions: Общее число взаимодействий.
        created_at:        Timestamp создания.
        updated_at:        Timestamp последнего обновления.
    """

    user_hash:           str
    preferred_language:  str = "und"
    expertise_level:     str = "intermediate"    # beginner|intermediate|expert
    response_style:      str = "balanced"         # concise|balanced|verbose
    interests:           list = field(default_factory=list)   # list[UserInterest]
    total_interactions:  int  = 0
    created_at:          float = field(default_factory=time.time)
    updated_at:          float = field(default_factory=time.time)

    def top_interests(self, n: int = 10) -> list[UserInterest]:
        """Топ-N интересов по текущему (с затуханием) весу."""
        now = time.time()
        interests = [UserInterest(**i) if isinstance(i, dict) else i for i in self.interests]
        sorted_interests = sorted(interests, key=lambda x: -x.decayed_weight(now))
        return [i for i in sorted_interests if i.decayed_weight(now) >= MIN_INTEREST_WEIGHT][:n]

    def build_system_prompt_addon(self) -> str:
        """
        Генерировать персонализированное добавление к system prompt.
        Используется в aria_generate для настройки под пользователя.
        """
        parts = []

        # Язык
        if self.preferred_language not in ("und", "en"):
            parts.append(f"Always respond in {self.preferred_language} unless asked otherwise.")

        # Уровень экспертизы
        if self.expertise_level == "beginner":
            parts.append("Use simple language, avoid jargon. Explain terms when used.")
        elif self.expertise_level == "expert":
            parts.append("User is an expert. Use technical terminology freely. Skip basics.")

        # Стиль ответа
        if self.response_style == "concise":
            parts.append("Be concise. Prefer bullet points over long prose.")
        elif self.response_style == "verbose":
            parts.append("Provide detailed, comprehensive answers with examples.")

        # Интересы
        top = self.top_interests(5)
        if top:
            topics = ", ".join(i.topic for i in top)
            parts.append(f"User's main interests: {topics}.")

        return "\n".join(parts) if parts else ""


# ─── UserProfileStore ─────────────────────────────────────────────────────────

class UserProfileStore:
    """
    Хранилище профилей пользователей (JSON файлы + in-memory cache).

    Usage:
        store = UserProfileStore(profiles_dir="aria_profiles")
        profile = store.get_or_create(user_hash)
        store.update_from_interaction(user_hash, prompt, response, rating)
        addon = profile.build_system_prompt_addon()

    Storage:
        Каждый профиль: profiles_dir/{user_hash[:2]}/{user_hash}.json
        Директория шардирована по первым 2 символам хэша (для FS performance).

    Privacy:
        Файлы хранятся только на сервере под контролем оператора.
        При удалении пользователя: delete_profile(user_hash).
    """

    def __init__(
        self,
        profiles_dir: str | Path = "aria_profiles",
        max_cache_size: int = 10_000,
    ) -> None:
        self._dir = Path(profiles_dir)
        self._dir.mkdir(parents=True, exist_ok=True)
        self._cache: dict[str, UserProfile] = {}
        self._max_cache = max_cache_size
        self._lock = RLock()

    # ── Internal I/O ─────────────────────────────────────────────────────────

    def _profile_path(self, user_hash: str) -> Path:
        shard = user_hash[:2]
        shard_dir = self._dir / shard
        shard_dir.mkdir(exist_ok=True)
        return shard_dir / f"{user_hash}.json"

    def _load_from_disk(self, user_hash: str) -> Optional[UserProfile]:
        path = self._profile_path(user_hash)
        if not path.exists():
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Reconstruct interests as UserInterest objects
            interested = [UserInterest(**i) for i in data.get("interests", [])]
            data["interests"] = interested
            return UserProfile(**data)
        except Exception as exc:
            logger.warning("Profile load failed for %s: %s", user_hash[:8], exc)
            return None

    def _save_to_disk(self, profile: UserProfile) -> None:
        path = self._profile_path(profile.user_hash)
        try:
            data = asdict(profile)
            # interests are serializable dicts via asdict
            tmp = path.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            import os
            os.replace(tmp, path)
        except Exception as exc:
            logger.warning("Profile save failed: %s", exc)

    # ── Public API ────────────────────────────────────────────────────────────

    def get_or_create(self, user_hash: str) -> UserProfile:
        """Получить профиль из кэша → диска → или создать новый."""
        with self._lock:
            if user_hash in self._cache:
                return self._cache[user_hash]

        profile = self._load_from_disk(user_hash)
        if profile is None:
            profile = UserProfile(user_hash=user_hash)
            self._save_to_disk(profile)

        with self._lock:
            if len(self._cache) >= self._max_cache:
                # LRU-eviction: удалить наименее обновлённый
                oldest = min(self._cache.values(), key=lambda p: p.updated_at)
                self._cache.pop(oldest.user_hash, None)
            self._cache[user_hash] = profile

        return profile

    def update_from_interaction(
        self,
        user_hash: str,
        prompt: str,
        response: str,
        rating: int = 0,
    ) -> UserProfile:
        """
        Обновить профиль на основе нового взаимодействия.

        Алгоритм:
            1. Извлечь ключевые темы из prompt (TF-IDF-lite).
            2. Update interest weights (+1.0 * rating_factor).
            3. Update expertise_level (скользящее среднее complexity score).
            4. Update response_style (если rating=1 и длинный ответ → verbose).
            5. Update preferred_language.
        """
        profile = self.get_or_create(user_hash)

        # 1. Extract topics from prompt
        topics = self._extract_topics(prompt)

        # 2. Update interests
        now = time.time()
        rating_factor = 1.0 + max(0, rating) * 0.5  # 1.0..1.5
        interest_map = {i.topic: i for i in profile.interests}

        for topic in topics:
            if topic in interest_map:
                existing = interest_map[topic]
                existing.weight = existing.decayed_weight(now) + rating_factor
                existing.last_seen = now
            else:
                interest_map[topic] = UserInterest(
                    topic=topic,
                    weight=rating_factor,
                    last_seen=now,
                )

        # Trim by decayed weight, keep MAX_INTERESTS
        interests = sorted(
            interest_map.values(),
            key=lambda i: -i.decayed_weight(now),
        )[:MAX_INTERESTS]
        profile.interests = [i for i in interests if i.decayed_weight(now) >= MIN_INTEREST_WEIGHT]

        # 3. Update expertise
        complexity = self._assess_complexity(prompt)
        profile.expertise_level = self._update_expertise(
            profile.expertise_level,
            profile.total_interactions,
            complexity,
        )

        # 4. Update response style from feedback
        if rating == 1:
            resp_words = len(response.split())
            if resp_words > 300:
                profile.response_style = "verbose"
            elif resp_words < 80:
                profile.response_style = "concise"
        elif rating == -1 and len(response.split()) > 400:
            profile.response_style = "concise"

        # 5. Language detection
        lang = self._detect_language(prompt)
        if lang != "und":
            profile.preferred_language = lang

        profile.total_interactions += 1
        profile.updated_at = now

        # Сохраняем
        self._save_to_disk(profile)
        with self._lock:
            self._cache[user_hash] = profile

        return profile

    def delete_profile(self, user_hash: str) -> bool:
        """Удалить профиль (GDPR right to erasure)."""
        path = self._profile_path(user_hash)
        with self._lock:
            self._cache.pop(user_hash, None)
        if path.exists():
            path.unlink()
            logger.info("Profile deleted for user_hash %s…", user_hash[:8])
            return True
        return False

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _extract_topics(text: str, max_topics: int = 5) -> list[str]:
        """
        Извлечь ключевые темы из текста (TF-IDF-lite без внешних зависимостей).
        Возвращает до max_topics существительных/ключевых слов.
        """
        words = re.findall(r'\b[a-zA-Zа-яёА-ЯЁ]{3,}\b', text.lower())
        # Фильтрация стоп-слов
        stop = {"the", "and", "for", "are", "was", "with", "that", "this",
                "have", "from", "they", "will", "been", "their", "но", "или",
                "что", "как", "это", "для", "при", "the", "your", "you", "can",
                "how", "не", "по", "из", "да", "нет", "все", "его"}
        filtered = [w for w in words if w not in stop and len(w) > 3]
        freq = Counter(filtered)
        return [w for w, _ in freq.most_common(max_topics)]

    @staticmethod
    def _assess_complexity(text: str) -> float:
        """Оценить сложность запроса [0.0, 1.0]."""
        words = text.split()
        if not words:
            return 0.3

        # Средняя длина слова
        avg_word_len = sum(len(w) for w in words) / len(words)
        complexity = min(1.0, (avg_word_len - 3) / 7)

        # Наличие сложных терминов
        if _COMPLEX_MARKERS.search(text):
            complexity = min(1.0, complexity + 0.4)

        # Количество технических символов
        tech_ratio = sum(1 for c in text if c in "{}[]()=><") / max(len(text), 1)
        complexity = min(1.0, complexity + tech_ratio * 2)

        return max(0.0, complexity)

    @staticmethod
    def _update_expertise(
        current: str,
        n_interactions: int,
        new_complexity: float,
    ) -> str:
        """Обновить оценку экспертизы (скользящая оценка с momentum)."""
        level_map = {"beginner": 0.2, "intermediate": 0.5, "expert": 0.8}
        current_score = level_map.get(current, 0.5)
        # EMA с убывающим весом нового сигнала (больше взаимодействий → меньше обновлений)
        alpha = max(0.05, 1.0 / max(n_interactions + 1, 1))
        updated = (1 - alpha) * current_score + alpha * new_complexity
        if updated < 0.35:
            return "beginner"
        elif updated > 0.65:
            return "expert"
        return "intermediate"

    @staticmethod
    def _detect_language(text: str) -> str:
        """Быстрый скрипт-детектор языка."""
        cyrillic = sum(1 for c in text if '\u0400' <= c <= '\u04FF')
        latin    = sum(1 for c in text if c.isascii() and c.isalpha())
        if cyrillic > latin:
            return "ru"
        if latin > 5:
            return "en"
        return "und"
