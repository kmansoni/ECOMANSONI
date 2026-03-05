#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vector Store — in-memory хранилище векторных документов.

Production замена: Pinecone / Qdrant / Weaviate / pgvector.
Текущая реализация: линейный поиск по cosine similarity — O(n).
Для >100k документов необходим HNSW/IVF индекс (Qdrant, Faiss).
"""

import json
import logging
from dataclasses import asdict, dataclass
from typing import Optional

import numpy as np

from .embeddings import EmbeddingEngine

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """Результат поиска по векторному хранилищу."""

    doc_id: str
    text: str
    metadata: dict
    score: float


@dataclass
class _StoredDoc:
    """Внутреннее представление документа в индексе."""

    doc_id: str
    text: str
    metadata: dict
    embedding: list  # list[float] для JSON-сериализации


class VectorStore:
    """
    In-memory векторное хранилище с cosine similarity поиском.

    Архитектурное замечание:
        Реализация обеспечивает O(n) поиск, пригодный для
        прототипирования и небольших корпусов (< 50k документов).
        В production следует заменить на Qdrant (self-hosted) или
        Pinecone (SaaS) с HNSW индексом для O(log n) поиска.
    """

    def __init__(self, embedding_engine: Optional[EmbeddingEngine] = None) -> None:
        """
        Args:
            embedding_engine: Экземпляр EmbeddingEngine.
                Если не передан — создаётся автоматически.
        """
        self.embedding_engine = embedding_engine or EmbeddingEngine()
        self._index: list[_StoredDoc] = []
        self._id_set: set[str] = set()

    # ------------------------------------------------------------------
    # Ingestion
    # ------------------------------------------------------------------

    def add_document(
        self,
        doc_id: str,
        text: str,
        metadata: Optional[dict] = None,
    ) -> None:
        """
        Добавить один документ в хранилище.

        Args:
            doc_id: Уникальный идентификатор документа.
            text: Текстовое содержимое.
            metadata: Произвольные метаданные (source, timestamp и т.д.).

        Raises:
            ValueError: Если doc_id уже существует.
        """
        if doc_id in self._id_set:
            logger.warning("Документ '%s' уже существует. Пропуск.", doc_id)
            return

        embedding = self.embedding_engine.embed_text(text)
        doc = _StoredDoc(
            doc_id=doc_id,
            text=text,
            metadata=metadata or {},
            embedding=embedding.tolist(),
        )
        self._index.append(doc)
        self._id_set.add(doc_id)
        logger.debug("Добавлен документ '%s' (всего: %d)", doc_id, len(self._index))

    def add_documents(self, docs: list[dict]) -> None:
        """
        Батч-добавление документов.

        Args:
            docs: Список словарей с ключами doc_id, text, metadata (опц.).

        Example:
            store.add_documents([
                {"doc_id": "1", "text": "...", "metadata": {"source": "wiki"}},
            ])
        """
        texts = []
        valid_docs = []

        for d in docs:
            doc_id = d.get("doc_id", "")
            text = d.get("text", "")
            if not doc_id or not text:
                logger.warning("Пропуск документа без doc_id или text: %s", d)
                continue
            if doc_id in self._id_set:
                logger.warning("Документ '%s' уже существует. Пропуск.", doc_id)
                continue
            texts.append(text)
            valid_docs.append(d)

        if not texts:
            return

        embeddings = self.embedding_engine.embed_batch(texts)

        for d, emb in zip(valid_docs, embeddings):
            doc = _StoredDoc(
                doc_id=d["doc_id"],
                text=d["text"],
                metadata=d.get("metadata", {}),
                embedding=emb.tolist(),
            )
            self._index.append(doc)
            self._id_set.add(d["doc_id"])

        logger.info("Добавлено %d документов. Итого: %d", len(valid_docs), len(self._index))

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def search(self, query: str, top_k: int = 5) -> list[SearchResult]:
        """
        Поиск наиболее релевантных документов.

        Args:
            query: Поисковый запрос.
            top_k: Количество результатов.

        Returns:
            Список SearchResult, отсортированный по убыванию score.
        """
        if not self._index:
            return []

        # Сначала embed query — это может расширить TF-IDF словарь
        query_vec = self.embedding_engine.embed_text(query)

        # Пересчитываем эмбеддинги документов через текущий fitted vectorizer
        # (необходимо при TF-IDF backend, т.к. словарь мог измениться)
        doc_texts = [doc.text for doc in self._index]
        try:
            doc_vecs = self.embedding_engine.embed_batch(doc_texts)
        except Exception:
            doc_vecs = [np.array(doc.embedding, dtype=np.float32) for doc in self._index]

        scores: list[tuple[float, _StoredDoc]] = []
        for doc, doc_vec in zip(self._index, doc_vecs):
            sim = EmbeddingEngine.cosine_similarity(query_vec, doc_vec)
            scores.append((sim, doc))

        scores.sort(key=lambda x: x[0], reverse=True)

        return [
            SearchResult(
                doc_id=doc.doc_id,
                text=doc.text,
                metadata=doc.metadata,
                score=float(score),
            )
            for score, doc in scores[:top_k]
        ]

    # ------------------------------------------------------------------
    # Deletion
    # ------------------------------------------------------------------

    def delete(self, doc_id: str) -> bool:
        """
        Удалить документ по ID.

        Args:
            doc_id: Идентификатор документа.

        Returns:
            True если документ был найден и удалён, False иначе.
        """
        if doc_id not in self._id_set:
            return False

        self._index = [d for d in self._index if d.doc_id != doc_id]
        self._id_set.discard(doc_id)
        logger.info("Документ '%s' удалён.", doc_id)
        return True

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self, path: str) -> None:
        """
        Сохранить индекс в JSON файл.

        Args:
            path: Путь к файлу.
        """
        data = [asdict(doc) for doc in self._index]
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        logger.info("VectorStore сохранён в '%s' (%d документов)", path, len(self._index))

    def load(self, path: str) -> None:
        """
        Загрузить индекс из JSON файла.

        Args:
            path: Путь к файлу.

        Raises:
            FileNotFoundError: Если файл не найден.
            ValueError: Если формат файла некорректен.
        """
        with open(path, encoding="utf-8") as f:
            data = json.load(f)

        self._index = []
        self._id_set = set()

        for item in data:
            try:
                doc = _StoredDoc(
                    doc_id=item["doc_id"],
                    text=item["text"],
                    metadata=item.get("metadata", {}),
                    embedding=item["embedding"],
                )
                self._index.append(doc)
                self._id_set.add(doc.doc_id)
            except KeyError as e:
                logger.error("Некорректная запись в индексе: %s", e)

        logger.info("VectorStore загружён из '%s' (%d документов)", path, len(self._index))

    def __len__(self) -> int:
        return len(self._index)

    def __repr__(self) -> str:
        return f"VectorStore(docs={len(self._index)}, backend={self.embedding_engine._backend})"


if __name__ == "__main__":
    store = VectorStore()

    docs = [
        {"doc_id": "d1", "text": "Python — язык программирования высокого уровня.", "metadata": {"source": "wiki"}},
        {"doc_id": "d2", "text": "Машинное обучение изучает алгоритмы, которые учатся на данных.", "metadata": {"source": "textbook"}},
        {"doc_id": "d3", "text": "Нейронные сети — основа глубокого обучения.", "metadata": {"source": "article"}},
        {"doc_id": "d4", "text": "RAG улучшает LLM ответы за счёт поиска.", "metadata": {"source": "paper"}},
    ]
    store.add_documents(docs)

    results = store.search("как работает обучение нейросетей", top_k=3)
    print(f"Найдено: {len(results)} документов")
    for r in results:
        print(f"  [{r.score:.3f}] {r.doc_id}: {r.text[:60]}...")

    store.save("/tmp/test_store.json")
    store2 = VectorStore()
    store2.load("/tmp/test_store.json")
    print(f"\nПосле загрузки: {store2}")
