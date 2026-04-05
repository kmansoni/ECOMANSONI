#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Document Processor — разбивка документов на chunks для RAG pipeline.

Поддерживает форматы: .txt, .md, .py (парсинг docstrings), .json.
Стратегия chunking: recursive text splitter с overlap.
"""

import ast
import json
import logging
import os
import re
import uuid
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# Размер chunk в символах (~512 токенов при ~4 символа/токен)
DEFAULT_CHUNK_SIZE = 2048   # символов
DEFAULT_CHUNK_OVERLAP = 200  # символов


@dataclass
class Chunk:
    """
    Фрагмент текста для индексирования.

    Attributes:
        text: Текстовое содержимое фрагмента.
        source: Источник (путь к файлу, URL, и т.д.).
        chunk_id: Уникальный идентификатор фрагмента.
        metadata: Дополнительные метаданные.
    """

    text: str
    source: str
    chunk_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    metadata: dict = field(default_factory=dict)


class DocumentProcessor:
    """
    Процессор документов — читает, парсит и разбивает на chunks.

    Стратегия chunking:
        Recursive text splitter разбивает по иерархии разделителей:
        абзацы -> предложения -> слова, гарантируя перекрытие (overlap)
        для сохранения контекста на границах.

    Attributes:
        chunk_size: Максимальный размер chunk в символах.
        chunk_overlap: Размер перекрытия между chunks.
    """

    # Иерархия разделителей для recursive splitting
    SEPARATORS = ["\n\n", "\n", ". ", "! ", "? ", " ", ""]

    def __init__(
        self,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
    ) -> None:
        """
        Args:
            chunk_size: Максимальный размер chunk в символах.
            chunk_overlap: Перекрытие между соседними chunks.
        """
        if chunk_overlap >= chunk_size:
            raise ValueError("chunk_overlap должен быть меньше chunk_size")
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_text(self, text: str, source: str = "unknown") -> list[Chunk]:
        """
        Разбить произвольный текст на chunks.

        Args:
            text: Входной текст.
            source: Метка источника.

        Returns:
            Список Chunk объектов.
        """
        if not text or not text.strip():
            return []

        raw_chunks = self._recursive_split(text, self.SEPARATORS)
        return [
            Chunk(
                text=chunk,
                source=source,
                metadata={"source": source, "chunk_index": i},
            )
            for i, chunk in enumerate(raw_chunks)
        ]

    def process_file(self, file_path: str) -> list[Chunk]:
        """
        Прочитать файл и разбить на chunks.

        Args:
            file_path: Путь к файлу.

        Returns:
            Список Chunk объектов.

        Raises:
            FileNotFoundError: Если файл не найден.
            ValueError: Если формат не поддерживается.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Файл не найден: {file_path}")

        ext = os.path.splitext(file_path)[1].lower()
        source = file_path

        handlers = {
            ".txt": self._read_plain,
            ".md": self._read_plain,
            ".py": self._read_python,
            ".json": self._read_json,
        }

        handler = handlers.get(ext)
        if handler is None:
            raise ValueError(f"Формат '{ext}' не поддерживается. Поддерживаемые: {list(handlers.keys())}")

        text = handler(file_path)
        chunks = self.process_text(text, source=source)

        # Обогащаем метаданными
        for chunk in chunks:
            chunk.metadata["file_path"] = file_path
            chunk.metadata["extension"] = ext

        logger.info("Обработан файл '%s': %d chunks", file_path, len(chunks))
        return chunks

    def process_url(self, url: str) -> list[Chunk]:
        """Извлечь контент по URL через httpx + стрип HTML-тегов."""
        try:
            import httpx
        except ImportError:
            logger.error("httpx не установлен — process_url недоступен")
            chunk = Chunk(
                text=f"Не удалось загрузить URL: {url} (httpx не установлен)",
                source=url,
                metadata={"url": url, "error": "httpx не установлен"},
            )
            return [chunk]

        try:
            resp = httpx.get(url, timeout=10.0, follow_redirects=True, headers={
                "User-Agent": "Mozilla/5.0 (compatible; AriaBot/1.0)",
            })
            resp.raise_for_status()
        except Exception as exc:
            logger.error("Ошибка загрузки URL %s: %s", url, exc)
            chunk = Chunk(
                text=f"Не удалось загрузить URL: {url}",
                source=url,
                metadata={"url": url, "error": f"Не удалось загрузить URL: {exc}"},
            )
            return [chunk]

        # Убираем script/style блоки, затем все HTML-теги
        html = resp.text
        html = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"\s+", " ", text).strip()

        if not text:
            chunk = Chunk(
                text=f"Страница не содержит текстового контента: {url}",
                source=url,
                metadata={"url": url, "error": "пустой контент"},
            )
            return [chunk]

        chunks = self.process_text(text, source=url)
        for chunk in chunks:
            chunk.metadata["url"] = url

        logger.info("Извлечено %d chunks из URL: %s", len(chunks), url)
        return chunks

    # ------------------------------------------------------------------
    # Format readers
    # ------------------------------------------------------------------

    @staticmethod
    def _read_plain(file_path: str) -> str:
        with open(file_path, encoding="utf-8", errors="replace") as f:
            return f.read()

    @staticmethod
    def _read_python(file_path: str) -> str:
        """
        Извлечь docstrings, комментарии и код из Python файла.
        Docstrings имеют приоритет для индексирования.
        """
        with open(file_path, encoding="utf-8", errors="replace") as f:
            source = f.read()

        parts: list[str] = []

        try:
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Module)):
                    docstring = ast.get_docstring(node)
                    if docstring:
                        name = getattr(node, "name", "module")
                        parts.append(f"[{type(node).__name__}: {name}]\n{docstring}")
        except SyntaxError:
            logger.warning("Не удалось распарсить Python файл: %s", file_path)

        # Добавляем исходный код целиком как fallback
        parts.append(source)
        return "\n\n".join(parts)

    @staticmethod
    def _read_json(file_path: str) -> str:
        with open(file_path, encoding="utf-8") as f:
            data = json.load(f)
        # Рекурсивное извлечение строковых значений
        return DocumentProcessor._flatten_json(data)

    @staticmethod
    def _flatten_json(obj: object, prefix: str = "") -> str:
        parts: list[str] = []
        if isinstance(obj, dict):
            for k, v in obj.items():
                key = f"{prefix}.{k}" if prefix else str(k)
                parts.append(DocumentProcessor._flatten_json(v, key))
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                parts.append(DocumentProcessor._flatten_json(item, f"{prefix}[{i}]"))
        elif isinstance(obj, str):
            if prefix:
                parts.append(f"{prefix}: {obj}")
            else:
                parts.append(obj)
        else:
            if prefix:
                parts.append(f"{prefix}: {obj}")
        return "\n".join(p for p in parts if p)

    # ------------------------------------------------------------------
    # Recursive text splitter
    # ------------------------------------------------------------------

    def _recursive_split(self, text: str, separators: list[str]) -> list[str]:
        """
        Рекурсивный text splitter с overlap.

        Разбивает текст по иерархии разделителей, гарантируя:
        - максимальный размер chunk <= chunk_size
        - перекрытие overlap символов между соседними chunks
        """
        if not separators:
            return self._merge_splits(list(text), "")

        separator = separators[0]
        remaining_separators = separators[1:]

        splits = text.split(separator) if separator else list(text)
        good_splits: list[str] = []
        current_separator = separator

        for split in splits:
            if not split.strip():
                continue
            if len(split) <= self.chunk_size:
                good_splits.append(split)
            else:
                if good_splits:
                    merged = self._merge_splits(good_splits, current_separator)
                    result: list[str] = []
                    for m in merged:
                        result.append(m)
                    good_splits = []
                    # Рекурсивно обрабатываем большой кусок
                    sub = self._recursive_split(split, remaining_separators)
                    result.extend(sub)

        if good_splits:
            return self._merge_splits(good_splits, current_separator)

        return self._merge_splits(splits, current_separator)

    def _merge_splits(self, splits: list[str], separator: str) -> list[str]:
        """Объединить мелкие куски в chunks нужного размера с overlap."""
        chunks: list[str] = []
        current_parts: list[str] = []
        current_len = 0

        for split in splits:
            split_len = len(split)
            if current_len + split_len + len(separator) > self.chunk_size and current_parts:
                chunk_text = separator.join(current_parts).strip()
                if chunk_text:
                    chunks.append(chunk_text)
                # Overlap: оставляем последние части
                overlap_parts: list[str] = []
                overlap_len = 0
                for part in reversed(current_parts):
                    if overlap_len + len(part) + len(separator) > self.chunk_overlap:
                        break
                    overlap_parts.insert(0, part)
                    overlap_len += len(part) + len(separator)
                current_parts = overlap_parts
                current_len = overlap_len

            current_parts.append(split)
            current_len += split_len + len(separator)

        if current_parts:
            chunk_text = separator.join(current_parts).strip()
            if chunk_text:
                chunks.append(chunk_text)

        return chunks if chunks else [separator.join(splits).strip()]


if __name__ == "__main__":
    processor = DocumentProcessor(chunk_size=500, chunk_overlap=50)

    long_text = """
    Машинное обучение — подраздел искусственного интеллекта,
    изучающий методы построения алгоритмов, способных обучаться.

    Глубокое обучение использует многослойные нейронные сети.
    Трансформеры стали основой современных языковых моделей.

    RAG (Retrieval-Augmented Generation) — техника улучшения LLM
    за счёт поиска релевантных документов из внешней базы знаний.
    Это позволяет модели отвечать на вопросы на основе актуальных данных.
    """

    chunks = processor.process_text(long_text, source="demo_text")
    print(f"Chunks: {len(chunks)}")
    for i, chunk in enumerate(chunks):
        print(f"\n[Chunk {i+1}] ({len(chunk.text)} chars):")
        print(chunk.text[:150] + "..." if len(chunk.text) > 150 else chunk.text)
