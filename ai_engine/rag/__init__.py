#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RAG (Retrieval-Augmented Generation) модуль.

Обеспечивает pipeline для дополнения LLM ответов релевантными
документами из векторного хранилища.
"""

from .embeddings import EmbeddingEngine
from .vector_store import VectorStore, SearchResult
from .document_processor import DocumentProcessor, Chunk
from .rag_pipeline import RAGPipeline, RAGResponse

__all__ = [
    "EmbeddingEngine",
    "VectorStore",
    "SearchResult",
    "DocumentProcessor",
    "Chunk",
    "RAGPipeline",
    "RAGResponse",
]
