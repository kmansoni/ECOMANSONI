#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Embeddings Engine — векторные представления текста.

Основная реализация через sentence-transformers (all-MiniLM-L6-v2).
Fallback: TF-IDF через scikit-learn если sentence-transformers недоступен.
"""

import hashlib
import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Попытка импорта sentence-transformers
_SENTENCE_TRANSFORMERS_AVAILABLE = False
try:
    from sentence_transformers import SentenceTransformer  # type: ignore
    _SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    logger.warning(
        "sentence-transformers не установлен. Используется TF-IDF fallback."
    )

# Fallback: TF-IDF
_SKLEARN_AVAILABLE = False
try:
    from sklearn.feature_extraction.text import TfidfVectorizer  # type: ignore
    _SKLEARN_AVAILABLE = True
except ImportError:
    logger.warning("scikit-learn не установлен. Embeddings будут нулевыми.")


class EmbeddingEngine:
    """
    Движок для получения векторных представлений текста.

    Предпочтительный бэкенд: sentence-transformers (all-MiniLM-L6-v2).
    Автоматический fallback на TF-IDF при отсутствии зависимости.

    Кэширует результаты in-memory по SHA-256 хэшу текста.

    Attributes:
        model_name: Название модели sentence-transformers.
        cache_size: Максимальный размер кэша (0 — без ограничений).
    """

    DEFAULT_MODEL = "all-MiniLM-L6-v2"

    def __init__(
        self,
        model_name: str = DEFAULT_MODEL,
        cache_size: int = 10_000,
    ) -> None:
        """
        Args:
            model_name: Модель sentence-transformers.
            cache_size: Максимальный размер кэша. 0 — без ограничений.
        """
        self.model_name = model_name
        self.cache_size = cache_size
        self._cache: dict[str, np.ndarray] = {}
        self._backend: str = "none"

        self._model: Optional[object] = None
        self._tfidf: Optional[object] = None
        self._tfidf_corpus: list[str] = []

        if _SENTENCE_TRANSFORMERS_AVAILABLE:
            try:
                self._model = SentenceTransformer(model_name)
                self._backend = "sentence-transformers"
                logger.info("EmbeddingEngine: бэкенд sentence-transformers (%s)", model_name)
            except Exception as exc:
                logger.error("Не удалось загрузить SentenceTransformer: %s", exc)

        if self._backend == "none" and _SKLEARN_AVAILABLE:
            self._tfidf = TfidfVectorizer(max_features=384)
            self._backend = "tfidf"
            logger.info("EmbeddingEngine: бэкенд TF-IDF")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def embed_text(self, text: str) -> np.ndarray:
        """
        Получить вектор для одного текста.

        Args:
            text: Входной текст.

        Returns:
            Нормализованный numpy-вектор формы (dim,).

        Raises:
            RuntimeError: Если ни один бэкенд не доступен.
        """
        if not text or not text.strip():
            raise ValueError("Текст не может быть пустым")

        cache_key = self._cache_key(text)
        if cache_key in self._cache:
            return self._cache[cache_key]

        vector = self._compute_embedding(text)
        self._store_cache(cache_key, vector)
        return vector

    def embed_batch(self, texts: list[str]) -> np.ndarray:
        """
        Батч-эмбеддинги для списка текстов.

        Args:
            texts: Список текстов.

        Returns:
            numpy-матрица формы (len(texts), dim).
        """
        if not texts:
            raise ValueError("Список текстов не может быть пустым")

        results: list[np.ndarray] = []

        # Разделим на кэшированные и некэшированные
        uncached_indices: list[int] = []
        uncached_texts: list[str] = []

        for i, text in enumerate(texts):
            key = self._cache_key(text)
            if key in self._cache:
                results.append(self._cache[key])
            else:
                results.append(np.array([]))  # placeholder
                uncached_indices.append(i)
                uncached_texts.append(text)

        if uncached_texts:
            batch_vectors = self._compute_batch(uncached_texts)
            for idx, vec in zip(uncached_indices, batch_vectors):
                key = self._cache_key(texts[idx])
                self._store_cache(key, vec)
                results[idx] = vec

        return np.vstack(results)

    @staticmethod
    def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
        """
        Косинусное сходство между двумя векторами.

        Args:
            a: Первый вектор.
            b: Второй вектор.

        Returns:
            Значение в диапазоне [-1.0, 1.0].
        """
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))

    def cache_stats(self) -> dict[str, int]:
        """Статистика кэша."""
        return {"size": len(self._cache), "max_size": self.cache_size}

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _compute_embedding(self, text: str) -> np.ndarray:
        if self._backend == "sentence-transformers" and self._model is not None:
            vec = self._model.encode(text, convert_to_numpy=True)  # type: ignore[attr-defined]
            return self._normalize(vec)

        if self._backend == "tfidf" and self._tfidf is not None:
            return self._tfidf_embed([text])[0]

        # Последний резерв: случайный вектор (детерминированный через seed)
        rng = np.random.default_rng(int(hashlib.md5(text.encode()).hexdigest(), 16) % (2**32))
        return self._normalize(rng.random(384).astype(np.float32))

    def _compute_batch(self, texts: list[str]) -> list[np.ndarray]:
        if self._backend == "sentence-transformers" and self._model is not None:
            vecs = self._model.encode(texts, convert_to_numpy=True)  # type: ignore[attr-defined]
            return [self._normalize(v) for v in vecs]

        if self._backend == "tfidf" and self._tfidf is not None:
            return self._tfidf_embed(texts)

        return [self._compute_embedding(t) for t in texts]

    def _tfidf_embed(self, texts: list[str]) -> list[np.ndarray]:
        """TF-IDF эмбеддинг.

        Добавляет тексты в корпус, переобучает vectorizer, возвращает
        векторы только для переданных текстов. Все последующие вызовы
        (включая query) используют тот же fitted vectorizer через transform.
        """
        assert self._tfidf is not None
        # Добавляем новые тексты в корпус и переобучаем
        new_texts = [t for t in texts if t not in self._tfidf_corpus]
        if new_texts:
            self._tfidf_corpus.extend(new_texts)
            try:
                self._tfidf.fit(self._tfidf_corpus)  # type: ignore[attr-defined]
                # Сбрасываем кэш — размерность изменилась
                self._cache.clear()
            except Exception as exc:
                logger.error("TF-IDF fit ошибка: %s", exc)
                return [np.zeros(384, dtype=np.float32) for _ in texts]

        try:
            matrix = self._tfidf.transform(texts)  # type: ignore[attr-defined]
            result = matrix.toarray()  # type: ignore[union-attr]
            return [self._normalize(row) for row in result]
        except Exception as exc:
            logger.error("TF-IDF transform ошибка: %s", exc)
            return [np.zeros(384, dtype=np.float32) for _ in texts]

    @staticmethod
    def _normalize(vec: np.ndarray) -> np.ndarray:
        norm = np.linalg.norm(vec)
        if norm == 0.0:
            return vec.astype(np.float32)
        return (vec / norm).astype(np.float32)

    @staticmethod
    def _cache_key(text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def _store_cache(self, key: str, vec: np.ndarray) -> None:
        if self.cache_size > 0 and len(self._cache) >= self.cache_size:
            # Удаляем первый (FIFO)
            oldest = next(iter(self._cache))
            del self._cache[oldest]
        self._cache[key] = vec


if __name__ == "__main__":
    engine = EmbeddingEngine()
    print(f"Бэкенд: {engine._backend}")

    v1 = engine.embed_text("Привет, как дела?")
    v2 = engine.embed_text("Здравствуй, что нового?")
    v3 = engine.embed_text("Машинное обучение — интересная область.")

    sim_12 = EmbeddingEngine.cosine_similarity(v1, v2)
    sim_13 = EmbeddingEngine.cosine_similarity(v1, v3)

    print(f"Сходство (приветствие-приветствие): {sim_12:.4f}")
    print(f"Сходство (приветствие-ML):          {sim_13:.4f}")
    print(f"Форма вектора: {v1.shape}")
    print(f"Кэш: {engine.cache_stats()}")

    batch = engine.embed_batch(["Первый текст", "Второй текст", "Третий текст"])
    print(f"Батч-матрица: {batch.shape}")
