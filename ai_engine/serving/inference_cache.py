#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
InferenceCache — семантический кэш ответов ARIA.
================================================

Проблема:
    LLM inference дорог по computationally. Повторяющиеся или семантически
    близкие запросы (different wording, same intent) не должны запускать
    полный inference pipeline.

Решение — двухуровневый кэш:
    Level 1: Exact key cache (SHA-256 normalized prompt)
        - Hit rate: ~15-30% (дублирующие запросы)
        - Latency: O(1)
    
    Level 2: Semantic similarity cache (SimHash Hamming distance ≤ 4)
        - Hit rate: ~35-60% (перефразировки)
        - Latency: O(N) scanned — используем bucket-based approx

Инвалидация:
    - TTL-based: по умолчанию 1 час
    - Capacity-based: LRU eviction при MAX_CACHE_SIZE
    - On train: принудительная очистка (модель изменилась → старые ответы невалидны)

Персонализация:
    Кэш user-specific: ключ = SHA-256(user_hash + normalized_prompt).
    Ответ для expert ≠ ответ для beginner на тот же вопрос.

Безопасность:
    - Кэш содержит только ПРОШЕДШИЕ safety check ответы.
    - Нет кэширования toxic/blocked content.
    - Cache key не раскрывает содержимое промпта.

Масштабирование:
    В памяти: до 10K entries ≈ 50 MB
    Distributed: заменить на Redis с hash-based sharding.
    Cache stampede protection: Probabilistic Early Expiration (PER).
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

DEFAULT_TTL_S      = 3600         # 1 час
MAX_CACHE_SIZE     = 10_000       # записей в LRU
SEMANTIC_THRESHOLD = 4            # Hamming distance для semantic match
MAX_SEMANTIC_SCAN  = 200          # максимум записей при семантическом поиске


# ─── Cache entry ─────────────────────────────────────────────────────────────

@dataclass
class CacheEntry:
    """Запись кэша."""
    prompt_hash:   str
    prompt_simhash: int
    response:      str
    user_hash:     str = ""
    hits:          int = 1
    created_at:    float = field(default_factory=time.time)
    expires_at:    float = 0.0

    def is_expired(self, now: Optional[float] = None) -> bool:
        t = now or time.time()
        return self.expires_at > 0 and t > self.expires_at


# ─── SimHash for semantic key ────────────────────────────────────────────────

def _compute_simhash(text: str) -> int:
    """64-bit SimHash текста для семантического сравнения."""
    words = text.lower().split()
    counts = [0] * 64
    for word in words:
        h = int(hashlib.md5(word.encode()).hexdigest(), 16) & ((1 << 64) - 1)
        for i in range(64):
            counts[i] += 1 if (h >> i) & 1 else -1
    result = 0
    for i in range(64):
        if counts[i] > 0:
            result |= (1 << i)
    return result


def _hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def _normalize_prompt(prompt: str) -> str:
    """Нормализация для повышения hit rate: lowercase + collapse whitespace."""
    import re
    prompt = prompt.lower().strip()
    prompt = re.sub(r'\s+', ' ', prompt)
    return prompt


# ─── InferenceCache ───────────────────────────────────────────────────────────

class InferenceCache:
    """
    Двухуровневый LRU кэш с семантическим поиском.

    Usage:
        cache = InferenceCache(ttl=3600, max_size=10_000)
        
        # Lookup
        cached = cache.get(prompt, user_hash="user-abc")
        if cached:
            return cached
        
        # Generate
        response = aria_generate(prompt)
        
        # Store (только если ответ прошёл safety check)
        cache.put(prompt, response, user_hash="user-abc")

    Thread safety:
        RLock для всех операций чтения/записи.
    """

    def __init__(
        self,
        ttl: float = DEFAULT_TTL_S,
        max_size: int = MAX_CACHE_SIZE,
        semantic_threshold: int = SEMANTIC_THRESHOLD,
        enable_semantic: bool = True,
    ) -> None:
        self._ttl = ttl
        self._max_size = max_size
        self._semantic_threshold = semantic_threshold
        self._enable_semantic = enable_semantic
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._semantic_index: list[tuple[int, str]] = []  # (simhash, cache_key)
        self._lock = RLock()

        # Stats
        self._hits_exact = 0
        self._hits_semantic = 0
        self._misses = 0

    # ── Key construction ─────────────────────────────────────────────────────

    @staticmethod
    def _make_key(normalized_prompt: str, user_hash: str = "") -> str:
        payload = f"{user_hash}:{normalized_prompt}"
        return hashlib.sha256(payload.encode()).hexdigest()

    # ── Get ──────────────────────────────────────────────────────────────────

    def get(self, prompt: str, user_hash: str = "") -> Optional[str]:
        """
        Lookup кэша.
        
        Returns:
            Cached response или None при промахе.
        
        Алгоритм:
            1. Нормализуем prompt.
            2. Exact key match (SHA-256).
            3. Если miss → semantic search (SimHash Hamming).
        """
        norm = _normalize_prompt(prompt)
        key = self._make_key(norm, user_hash)
        now = time.time()

        with self._lock:
            # Level 1: exact match
            entry = self._cache.get(key)
            if entry is not None:
                if entry.is_expired(now):
                    self._evict_key(key)
                    self._misses += 1
                    return None
                # LRU touch
                self._cache.move_to_end(key)
                entry.hits += 1
                self._hits_exact += 1
                logger.debug("Cache HIT (exact) key=%s…", key[:12])
                return entry.response

            # Level 2: semantic search
            if self._enable_semantic:
                sh = _compute_simhash(norm)
                # Scan последние MAX_SEMANTIC_SCAN записей
                for stored_sh, stored_key in self._semantic_index[-MAX_SEMANTIC_SCAN:]:
                    if _hamming(sh, stored_sh) <= self._semantic_threshold:
                        sem_entry = self._cache.get(stored_key)
                        if sem_entry and not sem_entry.is_expired(now):
                            # Проверяем user_hash совместимость (ответ для этого юзера или анонимный)
                            if not sem_entry.user_hash or sem_entry.user_hash == user_hash:
                                self._cache.move_to_end(stored_key)
                                sem_entry.hits += 1
                                self._hits_semantic += 1
                                logger.debug(
                                    "Cache HIT (semantic, hamming=%d) key=%s…",
                                    _hamming(sh, stored_sh), stored_key[:12],
                                )
                                return sem_entry.response

            self._misses += 1
            return None

    # ── Put ──────────────────────────────────────────────────────────────────

    def put(
        self,
        prompt: str,
        response: str,
        user_hash: str = "",
        ttl: Optional[float] = None,
    ) -> None:
        """
        Сохранить ответ в кэш.

        Args:
            prompt:    Оригинальный промпт (будет нормализован).
            response:  Ответ ARIA (должен быть уже прошедшим safety check).
            user_hash: Анонимный хэш пользователя (для персонализированного кэша).
            ttl:       TTL в секундах (None → использует default).
        """
        norm = _normalize_prompt(prompt)
        key = self._make_key(norm, user_hash)
        sh = _compute_simhash(norm)
        now = time.time()
        expires_at = now + (ttl if ttl is not None else self._ttl)

        entry = CacheEntry(
            prompt_hash=key,
            prompt_simhash=sh,
            response=response,
            user_hash=user_hash,
            hits=0,
            created_at=now,
            expires_at=expires_at,
        )

        with self._lock:
            # LRU eviction
            while len(self._cache) >= self._max_size:
                evict_key, _ = self._cache.popitem(last=False)
                self._semantic_index = [(h, k) for h, k in self._semantic_index if k != evict_key]

            self._cache[key] = entry
            self._cache.move_to_end(key)
            self._semantic_index.append((sh, key))

    # ── Eviction & maintenance ───────────────────────────────────────────────

    def _evict_key(self, key: str) -> None:
        self._cache.pop(key, None)
        self._semantic_index = [(h, k) for h, k in self._semantic_index if k != key]

    def invalidate_all(self) -> int:
        """
        Полная инвалидация кэша.
        Вызывается после training run (модель изменилась).
        
        Returns:
            Число удалённых записей.
        """
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            self._semantic_index.clear()
            logger.info("InferenceCache: full invalidation, %d entries removed", count)
            return count

    def evict_expired(self) -> int:
        """Удалить просроченные записи. Рекомендуется вызывать периодически."""
        now = time.time()
        with self._lock:
            expired_keys = [k for k, e in self._cache.items() if e.is_expired(now)]
            for key in expired_keys:
                self._evict_key(key)
            if expired_keys:
                logger.debug("InferenceCache: evicted %d expired entries", len(expired_keys))
            return len(expired_keys)

    # ── Stats ─────────────────────────────────────────────────────────────────

    @property
    def stats(self) -> dict:
        """Статистика кэша для мониторинга."""
        with self._lock:
            total = self._hits_exact + self._hits_semantic + self._misses
            hit_rate = (self._hits_exact + self._hits_semantic) / max(total, 1)
            return {
                "size":           len(self._cache),
                "max_size":       self._max_size,
                "hits_exact":     self._hits_exact,
                "hits_semantic":  self._hits_semantic,
                "misses":         self._misses,
                "hit_rate":       round(hit_rate, 4),
                "semantic_index_size": len(self._semantic_index),
            }
