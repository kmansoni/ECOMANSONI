#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RAG Pipeline — главный класс, объединяющий Document Processor,
Vector Store и LLM в единый Retrieval-Augmented Generation цикл.

Архитектура:
    1. Ingestion: DocumentProcessor -> chunks -> VectorStore
    2. Query: embed(query) -> search -> format context -> LLM -> answer
    3. Верификация: если контекст не содержит ответ — явно указываем это
"""

import logging
from dataclasses import dataclass, field
from typing import Callable, Optional

from .document_processor import DocumentProcessor
from .vector_store import VectorStore, SearchResult

logger = logging.getLogger(__name__)

# Промпт-шаблон для RAG
RAG_PROMPT_TEMPLATE = """You are a helpful assistant. Answer the question based ONLY on the following context.
If the context does not contain enough information to answer, say "No relevant information found in the provided context."

Context:
{context}

Question: {question}

Answer:"""

RAG_HISTORY_PROMPT_TEMPLATE = """You are a helpful assistant. Answer the question based ONLY on the following context.
If the context does not contain enough information to answer, say "No relevant information found in the provided context."

Context:
{context}

Conversation history:
{history}

Question: {question}

Answer:"""


@dataclass
class RAGResponse:
    """
    Ответ RAG Pipeline.

    Attributes:
        answer: Сгенерированный LLM ответ.
        sources: Список источников (source из метаданных).
        context_chunks: Использованные фрагменты документов.
        confidence: Средний score релевантности [0.0, 1.0].
    """

    answer: str
    sources: list[str]
    context_chunks: list[SearchResult]
    confidence: float


class RAGPipeline:
    """
    Полный RAG Pipeline.

    Принимает любой LLM callable с сигнатурой:
        llm(prompt: str) -> str

    Пример использования:
        pipeline = RAGPipeline(llm_callable=my_llm, vector_store=store)
        pipeline.ingest(["текст1", "текст2"], ["источник1", "источник2"])
        response = pipeline.query("Что такое RAG?")
        print(response.answer)

    Attributes:
        llm: Callable принимающий str и возвращающий str.
        vector_store: Экземпляр VectorStore.
        document_processor: Процессор документов.
        top_k: Количество документов для retrieval.
        min_confidence: Минимальный порог релевантности.
    """

    def __init__(
        self,
        llm_callable: Callable[[str], str],
        vector_store: Optional[VectorStore] = None,
        top_k: int = 5,
        min_confidence: float = 0.1,
    ) -> None:
        """
        Args:
            llm_callable: LLM функция с сигнатурой (prompt: str) -> str.
            vector_store: Экземпляр VectorStore. Создаётся автоматически если None.
            top_k: Количество документов для retrieval.
            min_confidence: Минимальный порог cosine similarity.
        """
        self.llm = llm_callable
        self.vector_store = vector_store or VectorStore()
        self.document_processor = DocumentProcessor()
        self.top_k = top_k
        self.min_confidence = min_confidence

    # ------------------------------------------------------------------
    # Ingestion
    # ------------------------------------------------------------------

    def ingest(self, texts: list[str], sources: Optional[list[str]] = None) -> int:
        """
        Загрузить документы в vector store.

        Args:
            texts: Список текстов для индексирования.
            sources: Список меток источников. Если None — генерируются автоматически.

        Returns:
            Количество добавленных chunks.
        """
        if sources is None:
            sources = [f"source_{i}" for i in range(len(texts))]

        if len(texts) != len(sources):
            raise ValueError("Длины texts и sources должны совпадать")

        total_chunks = 0
        batch_docs = []

        for text, source in zip(texts, sources):
            chunks = self.document_processor.process_text(text, source=source)
            for chunk in chunks:
                batch_docs.append({
                    "doc_id": chunk.chunk_id,
                    "text": chunk.text,
                    "metadata": chunk.metadata,
                })
                total_chunks += 1

        if batch_docs:
            self.vector_store.add_documents(batch_docs)

        logger.info("Ingested %d chunks из %d документов", total_chunks, len(texts))
        return total_chunks

    def ingest_file(self, file_path: str) -> int:
        """
        Загрузить файл в vector store.

        Args:
            file_path: Путь к файлу.

        Returns:
            Количество добавленных chunks.
        """
        chunks = self.document_processor.process_file(file_path)
        docs = [
            {"doc_id": c.chunk_id, "text": c.text, "metadata": c.metadata}
            for c in chunks
        ]
        if docs:
            self.vector_store.add_documents(docs)
        return len(docs)

    # ------------------------------------------------------------------
    # Query
    # ------------------------------------------------------------------

    def query(self, question: str, top_k: Optional[int] = None) -> RAGResponse:
        """
        Полный RAG цикл: retrieval -> context formatting -> LLM generation.

        Args:
            question: Вопрос пользователя.
            top_k: Переопределить количество документов для retrieval.

        Returns:
            RAGResponse с ответом, источниками и метаданными.
        """
        k = top_k or self.top_k
        results = self.vector_store.search(question, top_k=k)

        # Фильтрация по минимальному порогу релевантности
        relevant = [r for r in results if r.score >= self.min_confidence]

        if not relevant:
            logger.warning("Не найдено релевантных документов для: %s", question[:100])
            return RAGResponse(
                answer="No relevant information found in the provided context.",
                sources=[],
                context_chunks=[],
                confidence=0.0,
            )

        context = self._format_context(relevant)
        prompt = RAG_PROMPT_TEMPLATE.format(context=context, question=question)

        try:
            answer = self.llm(prompt)
            if not answer or not answer.strip():
                raise RuntimeError("LLM не сконфигурирован")
        except Exception as exc:
            logger.error("LLM ошибка: %s", exc)
            answer = f"Ошибка генерации ответа: {exc}"

        sources = list(dict.fromkeys(
            r.metadata.get("source", r.doc_id) for r in relevant
        ))
        confidence = sum(r.score for r in relevant) / len(relevant)

        return RAGResponse(
            answer=answer.strip(),
            sources=sources,
            context_chunks=relevant,
            confidence=float(confidence),
        )

    def query_with_history(
        self,
        question: str,
        history: list[dict],
        top_k: Optional[int] = None,
    ) -> RAGResponse:
        """
        RAG цикл с историей диалога.

        Args:
            question: Текущий вопрос.
            history: История в формате [{"role": "user/assistant", "content": "..."}].
            top_k: Количество документов для retrieval.

        Returns:
            RAGResponse.
        """
        k = top_k or self.top_k

        # Обогащаем запрос историей для более точного retrieval
        history_text = " ".join(
            msg.get("content", "") for msg in history[-4:]  # последние 4 сообщения
        )
        enriched_query = f"{history_text} {question}".strip()

        results = self.vector_store.search(enriched_query, top_k=k)
        relevant = [r for r in results if r.score >= self.min_confidence]

        if not relevant:
            return RAGResponse(
                answer="No relevant information found in the provided context.",
                sources=[],
                context_chunks=[],
                confidence=0.0,
            )

        context = self._format_context(relevant)
        history_formatted = self._format_history(history)
        prompt = RAG_HISTORY_PROMPT_TEMPLATE.format(
            context=context,
            history=history_formatted,
            question=question,
        )

        try:
            answer = self.llm(prompt)
            if not answer or not answer.strip():
                raise RuntimeError("LLM не сконфигурирован")
        except Exception as exc:
            logger.error("LLM ошибка: %s", exc)
            answer = f"Ошибка генерации ответа: {exc}"

        sources = list(dict.fromkeys(
            r.metadata.get("source", r.doc_id) for r in relevant
        ))
        confidence = sum(r.score for r in relevant) / len(relevant)

        return RAGResponse(
            answer=answer.strip(),
            sources=sources,
            context_chunks=relevant,
            confidence=float(confidence),
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _format_context(results: list[SearchResult]) -> str:
        parts = []
        for i, r in enumerate(results, 1):
            source = r.metadata.get("source", r.doc_id)
            parts.append(f"[{i}] (source: {source}, relevance: {r.score:.2f})\n{r.text}")
        return "\n\n".join(parts)

    @staticmethod
    def _format_history(history: list[dict]) -> str:
        lines = []
        for msg in history:
            role = msg.get("role", "user").capitalize()
            content = msg.get("content", "")
            lines.append(f"{role}: {content}")
        return "\n".join(lines)


if __name__ == "__main__":
    # DEMO ONLY — в production используется реальный LLM
    def mock_llm(prompt: str) -> str:
        if "No relevant" in prompt:
            return "I don't have information about that."
        # Простой экстракт первого предложения из контекста
        lines = prompt.split("\n")
        for line in lines:
            if line.strip() and not line.startswith("[") and "Context:" not in line:
                return f"Based on the context: {line.strip()[:100]}"
        return "Based on the provided context, I can answer your question."

    # Создаём pipeline
    pipeline = RAGPipeline(llm_callable=mock_llm, top_k=3)

    # Индексируем документы
    texts = [
        "Python — высокоуровневый язык программирования с динамической типизацией.",
        "RAG (Retrieval-Augmented Generation) улучшает точность LLM ответов.",
        "Нейронные сети имитируют работу биологического мозга.",
        "Трансформеры используют механизм внимания для обработки последовательностей.",
    ]
    sources = ["python_docs", "rag_paper", "neural_intro", "transformer_paper"]

    n = pipeline.ingest(texts, sources)
    print(f"Проиндексировано chunks: {n}")

    # Запрос
    response = pipeline.query("Что такое RAG и как это помогает?")
    print(f"\nВопрос: Что такое RAG?")
    print(f"Ответ: {response.answer}")
    print(f"Источники: {response.sources}")
    print(f"Уверенность: {response.confidence:.3f}")

    # Запрос с историей
    history = [
        {"role": "user", "content": "Расскажи про Python"},
        {"role": "assistant", "content": "Python — популярный язык."},
    ]
    response2 = pipeline.query_with_history(
        "А что такое трансформеры?", history
    )
    print(f"\nОтвет с историей: {response2.answer}")
