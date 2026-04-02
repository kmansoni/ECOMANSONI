#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Research Engine — модуль исследования и индексации кодовой базы.

Реализует Фазу 2 (Research Phase) оркестрации:
    - Индексация файлов проекта (CodeIndexer)
    - Семантический поиск по коду (keyword + TF-IDF)
    - Библиотека знаний (KnowledgeLibrary)
    - Анализ зависимостей и суммаризация файлов

Принципы:
    - Только stdlib (никаких внешних зависимостей)
    - Инкрементальная индексация через mtime
    - Дедупликация через контентные хеши
    - JSON-персистентность библиотеки знаний
"""

import fnmatch
import hashlib
import json
import logging
import math
import os
import re
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


# -- Константы ---------------------------------------------------------------

EXTENSION_LANGUAGE_MAP: dict[str, str] = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".rb": "ruby",
    ".sql": "sql",
    ".md": "markdown",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
}

DEFAULT_IGNORE_PATTERNS: list[str] = [
    "node_modules", ".git", "__pycache__", ".venv", "dist", "build",
    ".idea", ".vscode", "*.pyc", "*.pyo", ".env", ".env.*",
    "*.log", "*.lock", "package-lock.json",
]

MAX_CHUNK_LINES: int = 500


# -- Data Models -------------------------------------------------------------

@dataclass
class CodeChunk:
    """Фрагмент кода — атомарная единица индексации."""
    chunk_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    file_path: str = ""
    language: str = ""
    chunk_type: str = "block"
    name: str = "anonymous"
    content: str = ""
    line_start: int = 0
    line_end: int = 0
    embedding: Optional[list[float]] = None
    tokens_approx: int = 0
    dependencies: list[str] = field(default_factory=list)
    last_modified: float = 0.0

    @property
    def content_hash(self) -> str:
        """SHA-256 хеш содержимого для дедупликации."""
        return hashlib.sha256(self.content.encode("utf-8")).hexdigest()[:16]


@dataclass
class SearchResult:
    """Результат поиска по коду."""
    chunk: CodeChunk
    score: float = 0.0
    match_type: str = "keyword"
    highlights: list[str] = field(default_factory=list)


@dataclass
class KnowledgeEntry:
    """Запись в библиотеке знаний (аналог LibraryEntry из документации)."""
    entry_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    entry_type: str = "best_practice"
    title: str = ""
    description: str = ""
    technology_tags: list[str] = field(default_factory=list)
    pattern_tags: list[str] = field(default_factory=list)
    domain_tags: list[str] = field(default_factory=list)
    code_snippet: Optional[str] = None
    sources: list[str] = field(default_factory=list)
    confidence: float = 0.5
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    last_validated_at: str = field(default_factory=lambda: datetime.now().isoformat())
    usage_count: int = 0
    feedback_score: Optional[float] = None


@dataclass
class IndexStats:
    """Статистика индексации."""
    files_scanned: int = 0
    files_indexed: int = 0
    chunks_created: int = 0
    time_ms: int = 0
    errors: list[str] = field(default_factory=list)


# -- CodeIndexer -----------------------------------------------------------------

class CodeIndexer:
    """
    Индексатор кодовой базы.

    Обходит дерево каталогов, разбивает файлы на фрагменты (функции,
    классы, блоки) с метаданными и хранит индекс в памяти.
    Поддерживает инкрементальную индексацию через mtime.

    Attributes:
        project_root: Корневой каталог проекта.
        chunks: Проиндексированные фрагменты.
        _file_mtimes: Кеш mtime для инкрементальной индексации.
        _content_hashes: Множество хешей для дедупликации.
        _ignore_patterns: Паттерны игнорирования файлов/каталогов.
    """

    def __init__(self, project_root: str) -> None:
        self.project_root: str = os.path.abspath(project_root)
        self.chunks: list[CodeChunk] = []
        self._file_mtimes: dict[str, float] = {}
        self._content_hashes: set[str] = set()
        self._ignore_patterns: list[str] = list(DEFAULT_IGNORE_PATTERNS)
        self._load_gitignore()
        logger.info("CodeIndexer инициализирован (root=%s)", self.project_root)

    # -- gitignore / filtering ------------------------------------------------

    def _load_gitignore(self) -> None:
        """Загрузить паттерны из .gitignore проекта."""
        gitignore_path = os.path.join(self.project_root, ".gitignore")
        if not os.path.isfile(gitignore_path):
            return
        try:
            with open(gitignore_path, "r", encoding="utf-8") as fh:
                for raw in fh:
                    line = raw.strip()
                    if line and not line.startswith("#"):
                        cleaned = line.rstrip("/")
                        if cleaned and cleaned not in self._ignore_patterns:
                            self._ignore_patterns.append(cleaned)
            logger.debug("Загружено %d паттернов из .gitignore", len(self._ignore_patterns))
        except OSError as exc:
            logger.warning("Не удалось прочитать .gitignore: %s", exc)

    def _is_ignored(self, path: str) -> bool:
        """Проверить, игнорируется ли путь по паттернам."""
        rel = os.path.relpath(path, self.project_root)
        parts = Path(rel).parts
        for pattern in self._ignore_patterns:
            for part in parts:
                if fnmatch.fnmatch(part, pattern):
                    return True
            if fnmatch.fnmatch(rel, pattern):
                return True
        return False

    @staticmethod
    def _detect_language(file_path: str) -> Optional[str]:
        """Определить язык по расширению файла."""
        ext = os.path.splitext(file_path)[1].lower()
        return EXTENSION_LANGUAGE_MAP.get(ext)

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        """Приблизительная оценка количества токенов (words * 1.3)."""
        return int(len(text.split()) * 1.3)

    # -- dependency extraction ------------------------------------------------

    @staticmethod
    def _extract_deps_python(content: str) -> list[str]:
        """Извлечь зависимости из Python-файла."""
        deps: list[str] = []
        for line in content.splitlines():
            s = line.strip()
            m = re.match(r"^import\s+([\w.]+)", s)
            if m:
                deps.append(m.group(1))
                continue
            m = re.match(r"^from\s+([\w.]+)\s+import", s)
            if m:
                deps.append(m.group(1))
        return deps

    @staticmethod
    def _extract_deps_js_ts(content: str) -> list[str]:
        """Извлечь зависимости из JS/TS-файла."""
        deps: list[str] = []
        for line in content.splitlines():
            s = line.strip()
            m = re.search(r'''(?:import|require)\s*\(?[^)]*['"]([^'"]+)['"]''', s)
            if m:
                deps.append(m.group(1))
        return deps

    def _extract_dependencies(self, content: str, language: str) -> list[str]:
        """Извлечь зависимости из содержимого файла."""
        if language == "python":
            return self._extract_deps_python(content)
        if language in ("typescript", "javascript"):
            return self._extract_deps_js_ts(content)
        return []

    # -- chunk creation helpers -----------------------------------------------

    def _make_chunk(
        self, file_path: str, language: str, chunk_type: str,
        name: str, content: str, line_start: int, line_end: int,
        mtime: float,
    ) -> CodeChunk:
        """Создать CodeChunk с вычислением метаданных."""
        return CodeChunk(
            file_path=file_path, language=language,
            chunk_type=chunk_type, name=name, content=content,
            line_start=line_start, line_end=line_end,
            tokens_approx=self._estimate_tokens(content),
            dependencies=self._extract_dependencies(content, language),
            last_modified=mtime,
        )

    def _split_oversized(self, chunks: list[CodeChunk], file_path: str,
                         language: str, mtime: float) -> list[CodeChunk]:
        """Разбить чанки, превышающие MAX_CHUNK_LINES."""
        result: list[CodeChunk] = []
        for chunk in chunks:
            lines = chunk.content.splitlines()
            if len(lines) <= MAX_CHUNK_LINES:
                result.append(chunk)
                continue
            for offset in range(0, len(lines), MAX_CHUNK_LINES):
                sub = lines[offset:offset + MAX_CHUNK_LINES]
                pn = offset // MAX_CHUNK_LINES + 1
                result.append(self._make_chunk(
                    file_path, language, chunk.chunk_type,
                    f"{chunk.name}_part{pn}", "\n".join(sub),
                    chunk.line_start + offset,
                    chunk.line_start + offset + len(sub) - 1, mtime,
                ))
        return result

    # -- chunking strategies --------------------------------------------------

    def _chunk_python(self, lines: list[str], fp: str, mtime: float) -> list[CodeChunk]:
        """Разбить Python-файл на фрагменты по def/class."""
        chunks: list[CodeChunk] = []
        buf: list[str] = []
        start = 1
        name = "module_header"
        ctype = "module"

        for i, line in enumerate(lines, 1):
            stripped = line.lstrip()
            is_def = stripped.startswith("def ") and (not line[0:1].isspace())
            is_cls = stripped.startswith("class ") and (not line[0:1].isspace())
            if (is_def or is_cls) and buf:
                content = "\n".join(buf)
                if content.strip():
                    chunks.append(self._make_chunk(fp, "python", ctype, name, content, start, i - 1, mtime))
                buf = [line]
                start = i
                if is_def:
                    m = re.match(r"def\s+(\w+)", stripped)
                    name = m.group(1) if m else "anonymous"
                    ctype = "function"
                else:
                    m = re.match(r"class\s+(\w+)", stripped)
                    name = m.group(1) if m else "anonymous"
                    ctype = "class"
            else:
                buf.append(line)

        if buf:
            content = "\n".join(buf)
            if content.strip():
                chunks.append(self._make_chunk(fp, "python", ctype, name, content, start, len(lines), mtime))
        return self._split_oversized(chunks, fp, "python", mtime)

    def _chunk_js_ts(self, lines: list[str], fp: str, lang: str, mtime: float) -> list[CodeChunk]:
        """Разбить JS/TS-файл на фрагменты."""
        boundary = re.compile(
            r"^(?:export\s+)?(?:default\s+)?"
            r"(?:(?:function|class)\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=)"
        )
        chunks: list[CodeChunk] = []
        buf: list[str] = []
        start = 1
        name = "module_header"
        ctype = "module"

        for i, line in enumerate(lines, 1):
            stripped = line.lstrip()
            m = boundary.match(stripped)
            top = not line[0:1].isspace() if line else False
            if m and top and buf:
                content = "\n".join(buf)
                if content.strip():
                    chunks.append(self._make_chunk(fp, lang, ctype, name, content, start, i - 1, mtime))
                buf = [line]
                start = i
                name = m.group(1) or m.group(2) or "anonymous"
                if "function" in stripped[:30]:
                    ctype = "function"
                elif "class" in stripped[:30]:
                    ctype = "class"
                else:
                    ctype = "block"
            else:
                buf.append(line)

        if buf:
            content = "\n".join(buf)
            if content.strip():
                chunks.append(self._make_chunk(fp, lang, ctype, name, content, start, len(lines), mtime))
        return self._split_oversized(chunks, fp, lang, mtime)

    def _chunk_generic(self, lines: list[str], fp: str, lang: str, mtime: float) -> list[CodeChunk]:
        """Разбить файл на блоки по пустым строкам."""
        chunks: list[CodeChunk] = []
        buf: list[str] = []
        start = 1
        for i, line in enumerate(lines, 1):
            if line.strip() == "" and buf and len(buf) >= 3:
                content = "\n".join(buf)
                if content.strip():
                    chunks.append(self._make_chunk(fp, lang, "block", "anonymous", content, start, i - 1, mtime))
                buf = []
                start = i + 1
            else:
                buf.append(line)
        if buf:
            content = "\n".join(buf)
            if content.strip():
                chunks.append(self._make_chunk(fp, lang, "block", "anonymous", content, start, len(lines), mtime))
        return self._split_oversized(chunks, fp, lang, mtime)

    # -- public API -----------------------------------------------------------

    def index_all(self) -> IndexStats:
        """Полная индексация проекта (очистка + переиндексация)."""
        self.chunks.clear()
        self._file_mtimes.clear()
        self._content_hashes.clear()
        return self._do_index(incremental=False)

    def index_incremental(self) -> IndexStats:
        """Инкрементальная индексация — только изменённые файлы."""
        return self._do_index(incremental=True)

    def _do_index(self, incremental: bool) -> IndexStats:
        """Основная логика индексации."""
        stats = IndexStats()
        t0 = time.time()

        # Для инкрементального: собрать изменённые файлы с новыми чанками
        changed_rels: set[str] = set()
        new_chunks: list[CodeChunk] = []

        for root, dirs, files in os.walk(self.project_root):
            dirs[:] = [d for d in dirs if not self._is_ignored(os.path.join(root, d))]
            for fname in files:
                fpath = os.path.join(root, fname)
                if self._is_ignored(fpath):
                    continue
                language = self._detect_language(fpath)
                if language is None:
                    continue
                stats.files_scanned += 1
                try:
                    mtime = os.path.getmtime(fpath)
                except OSError:
                    continue
                if incremental and fpath in self._file_mtimes:
                    if self._file_mtimes[fpath] >= mtime:
                        continue
                try:
                    with open(fpath, "r", encoding="utf-8", errors="replace") as fh:
                        content = fh.read()
                except OSError as exc:
                    stats.errors.append(f"{fpath}: {exc}")
                    continue
                if not content.strip():
                    continue
                rel = os.path.relpath(fpath, self.project_root)
                if incremental:
                    changed_rels.add(rel)
                lines = content.splitlines()
                if language == "python":
                    new = self._chunk_python(lines, rel, mtime)
                elif language in ("typescript", "javascript"):
                    new = self._chunk_js_ts(lines, rel, language, mtime)
                else:
                    new = self._chunk_generic(lines, rel, language, mtime)
                for chunk in new:
                    h = chunk.content_hash
                    if h not in self._content_hashes:
                        self._content_hashes.add(h)
                        new_chunks.append(chunk)
                        stats.chunks_created += 1
                self._file_mtimes[fpath] = mtime
                stats.files_indexed += 1

        # Пакетное удаление старых чанков + добавление новых (O(n) вместо O(n*m))
        if incremental and changed_rels:
            self.chunks = [c for c in self.chunks if c.file_path not in changed_rels]
        self.chunks.extend(new_chunks)

        stats.time_ms = int((time.time() - t0) * 1000)
        logger.info(
            "Индексация: scanned=%d indexed=%d chunks=%d time=%dms errors=%d",
            stats.files_scanned, stats.files_indexed,
            stats.chunks_created, stats.time_ms, len(stats.errors),
        )
        return stats


# -- KnowledgeLibrary ------------------------------------------------------------

class KnowledgeLibrary:
    """
    Персистентное хранилище знаний.

    Хранит best practices, known issues, antipatterns и blueprints
    с поддержкой тегового поиска, подсчёта использований
    и жизненного цикла валидации.

    Attributes:
        _entries: Словарь записей по entry_id.
        _storage_path: Путь к JSON-файлу для персистенции.
    """

    def __init__(self, storage_path: Optional[str] = None) -> None:
        self._entries: dict[str, KnowledgeEntry] = {}
        self._storage_path: Optional[str] = storage_path
        if storage_path:
            self._load()
        logger.info("KnowledgeLibrary инициализирована (entries=%d)", len(self._entries))

    # -- persistence ----------------------------------------------------------

    def _load(self) -> None:
        """Загрузить записи из JSON-файла."""
        if not self._storage_path or not os.path.isfile(self._storage_path):
            return
        try:
            with open(self._storage_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            for raw in data:
                entry = KnowledgeEntry(**raw)
                self._entries[entry.entry_id] = entry
            logger.debug("Загружено %d записей из %s", len(self._entries), self._storage_path)
        except (OSError, json.JSONDecodeError, TypeError) as exc:
            logger.warning("Ошибка загрузки KnowledgeLibrary: %s", exc)

    def save(self) -> None:
        """Сохранить записи в JSON-файл."""
        if not self._storage_path:
            return
        try:
            os.makedirs(os.path.dirname(self._storage_path) or ".", exist_ok=True)
            data = [asdict(e) for e in self._entries.values()]
            with open(self._storage_path, "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False, indent=2)
            logger.debug("Сохранено %d записей в %s", len(data), self._storage_path)
        except OSError as exc:
            logger.error("Ошибка сохранения KnowledgeLibrary: %s", exc)

    # -- CRUD -----------------------------------------------------------------

    def add_entry(self, entry: KnowledgeEntry) -> None:
        """Добавить запись в библиотеку."""
        self._entries[entry.entry_id] = entry
        self.save()

    def get_entry(self, entry_id: str) -> Optional[KnowledgeEntry]:
        """Получить запись по ID. Увеличивает usage_count."""
        entry = self._entries.get(entry_id)
        if entry:
            entry.usage_count += 1
        return entry

    def search(self, query: str, filters: Optional[dict[str, Any]] = None) -> list[KnowledgeEntry]:
        """
        Поиск записей по ключевым словам и фильтрам.

        Args:
            query: Текст для поиска в title/description.
            filters: Опциональные фильтры:
                entry_type, technology_tags, pattern_tags, domain_tags,
                min_confidence.

        Returns:
            Список подходящих записей, отсортированных по релевантности.
        """
        query_lower = query.lower()
        tokens = query_lower.split()
        results: list[tuple[float, KnowledgeEntry]] = []

        for entry in self._entries.values():
            # Применить фильтры
            if filters:
                if "entry_type" in filters and entry.entry_type != filters["entry_type"]:
                    continue
                if "min_confidence" in filters and entry.confidence < filters["min_confidence"]:
                    continue
                for tag_field in ("technology_tags", "pattern_tags", "domain_tags"):
                    if tag_field in filters:
                        required = set(filters[tag_field]) if isinstance(filters[tag_field], list) else {filters[tag_field]}
                        actual = set(getattr(entry, tag_field))
                        if not required & actual:
                            continue

            # Скоринг
            score = 0.0
            title_lower = entry.title.lower()
            desc_lower = entry.description.lower()
            all_tags = entry.technology_tags + entry.pattern_tags + entry.domain_tags
            tags_lower = " ".join(all_tags).lower()

            for tok in tokens:
                if tok in title_lower:
                    score += 0.5
                if tok in desc_lower:
                    score += 0.3
                if tok in tags_lower:
                    score += 0.4

            if score > 0:
                results.append((score, entry))

        results.sort(key=lambda t: t[0], reverse=True)
        return [entry for _, entry in results]

    def invalidate_entry(self, entry_id: str) -> bool:
        """Пометить запись как невалидную (удалить)."""
        if entry_id in self._entries:
            del self._entries[entry_id]
            self.save()
            return True
        return False

    def validate_entry(self, entry_id: str) -> bool:
        """Обновить дату валидации записи."""
        entry = self._entries.get(entry_id)
        if entry:
            entry.last_validated_at = datetime.now().isoformat()
            self.save()
            return True
        return False

    @property
    def stats(self) -> dict[str, Any]:
        """Статистика библиотеки."""
        by_type: dict[str, int] = {}
        for e in self._entries.values():
            by_type[e.entry_type] = by_type.get(e.entry_type, 0) + 1
        return {"total": len(self._entries), "by_type": by_type}


# -- ResearchEngine (главный координатор) ----------------------------------------

class ResearchEngine:
    """
    Движок исследования — главный класс, координирующий
    индексацию кода, поиск и работу с базой знаний.

    Attributes:
        project_root: Корневой каталог проекта.
        indexer: Индексатор кодовой базы.
        knowledge: Библиотека знаний.
        llm: Опциональный LLM callable для суммаризации.
    """

    def __init__(
        self,
        project_root: str,
        llm: Optional[Callable[[str], str]] = None,
        storage_path: Optional[str] = None,
    ) -> None:
        """
        Args:
            project_root: Корневой каталог проекта.
            llm: LLM callable (prompt -> response) для суммаризации.
            storage_path: Путь для JSON-хранения библиотеки знаний.
        """
        self.project_root = os.path.abspath(project_root)
        self.llm = llm
        self.indexer = CodeIndexer(project_root)

        kb_path = storage_path or os.path.join(self.project_root, ".ai_engine", "knowledge.json")
        self.knowledge = KnowledgeLibrary(storage_path=kb_path)

        logger.info("ResearchEngine инициализирован (root=%s)", self.project_root)

    # -- indexing -------------------------------------------------------------

    def index_project(self) -> IndexStats:
        """Полная переиндексация проекта."""
        return self.indexer.index_all()

    def incremental_index(self) -> IndexStats:
        """Инкрементальная индексация (только изменённые файлы)."""
        return self.indexer.index_incremental()

    # -- code search ----------------------------------------------------------

    def search_code(
        self,
        query: str,
        top_k: int = 10,
        language: Optional[str] = None,
    ) -> list[SearchResult]:
        """
        Поиск по индексу кода (keyword TF-IDF-подобный скоринг).

        Args:
            query: Поисковый запрос.
            top_k: Максимум результатов.
            language: Фильтр по языку (None = все).

        Returns:
            Список SearchResult, отсортированный по score desc.
        """
        tokens = self._tokenize(query)
        if not tokens:
            return []

        # Быстрая фильтрация: собираем только чанки, содержащие хотя бы 1 токен
        total_docs = max(len(self.indexer.chunks), 1)
        query_lower = query.lower()

        # Предвычислить lowercase-кеш для каждого чанка (ленивый)
        candidate_indices: set[int] = set()
        doc_freq: dict[str, int] = {tok: 0 for tok in tokens}

        for i, chunk in enumerate(self.indexer.chunks):
            if language and chunk.language != language:
                continue
            name_lower = chunk.name.lower()
            content_lower = chunk.content.lower()
            deps_str = " ".join(chunk.dependencies).lower()
            matched = False
            for tok in tokens:
                if tok in name_lower or tok in content_lower or tok in deps_str:
                    doc_freq[tok] += 1
                    matched = True
            if matched or query_lower == name_lower:
                candidate_indices.add(i)

        # Скоринг только кандидатов
        results: list[SearchResult] = []

        for i in candidate_indices:
            chunk = self.indexer.chunks[i]
            name_lower = chunk.name.lower()
            content_lower = chunk.content.lower()
            deps_lower = " ".join(chunk.dependencies).lower()

            score = 0.0
            highlights: list[str] = []

            # Точное совпадение с именем символа
            if query_lower == name_lower:
                score = 1.0
                highlights.append(f"exact name: {chunk.name}")
            else:
                for tok in tokens:
                    idf = math.log(total_docs / max(doc_freq.get(tok, 1), 1)) + 1.0

                    if tok in name_lower:
                        score += 0.8 * idf
                        highlights.append(f"name: {chunk.name}")

                    cnt = content_lower.count(tok)
                    if cnt > 0:
                        tf = cnt / max(len(content_lower.split()), 1)
                        score += min(0.6, 0.3 + tf * 10) * idf
                        for line in chunk.content.splitlines():
                            if tok in line.lower():
                                highlights.append(line.strip()[:120])
                                break

                    if tok in deps_lower:
                        score += 0.2 * idf

            if score > 0:
                score = min(score / (len(tokens) * 3.0), 1.0)
                results.append(SearchResult(
                    chunk=chunk, score=round(score, 4),
                    match_type="keyword",
                    highlights=highlights[:5],
                ))

        results.sort(key=lambda r: r.score, reverse=True)
        return results[:top_k]

    # -- knowledge search -----------------------------------------------------

    def search_knowledge(
        self, query: str, filters: Optional[dict[str, Any]] = None,
    ) -> list[KnowledgeEntry]:
        """Поиск в библиотеке знаний."""
        return self.knowledge.search(query, filters)

    def add_knowledge(self, entry: KnowledgeEntry) -> None:
        """Добавить запись в библиотеку знаний."""
        self.knowledge.add_entry(entry)

    # -- dependency analysis --------------------------------------------------

    def analyze_dependencies(self, file_path: str) -> dict[str, Any]:
        """
        Анализ зависимостей файла.

        Args:
            file_path: Путь к файлу (относительный или абсолютный).

        Returns:
            Словарь: imports (список), dependents (кто зависит от этого файла).
        """
        abs_path = file_path if os.path.isabs(file_path) else os.path.join(self.project_root, file_path)
        rel_path = os.path.relpath(abs_path, self.project_root)

        imports: list[str] = []
        for chunk in self.indexer.chunks:
            if chunk.file_path == rel_path:
                for dep in chunk.dependencies:
                    if dep not in imports:
                        imports.append(dep)

        # Найти файлы, которые зависят от данного
        base_name = Path(rel_path).stem
        dependents: list[str] = []
        for chunk in self.indexer.chunks:
            if chunk.file_path == rel_path:
                continue
            for dep in chunk.dependencies:
                if base_name in dep and chunk.file_path not in dependents:
                    dependents.append(chunk.file_path)

        return {
            "file": rel_path,
            "imports": imports,
            "dependents": dependents,
            "import_count": len(imports),
            "dependent_count": len(dependents),
        }

    # -- file summary ---------------------------------------------------------

    def get_file_summary(self, file_path: str) -> str:
        """
        Краткая сводка по файлу.

        Если LLM доступен, генерирует суммаризацию.
        Иначе — эвристическая сводка на основе индекса.

        Args:
            file_path: Путь к файлу.

        Returns:
            Строка-сводка.
        """
        abs_path = file_path if os.path.isabs(file_path) else os.path.join(self.project_root, file_path)
        rel_path = os.path.relpath(abs_path, self.project_root)

        file_chunks = [c for c in self.indexer.chunks if c.file_path == rel_path]
        if not file_chunks:
            return f"Файл {rel_path} не найден в индексе."

        lang = file_chunks[0].language
        symbols = [c.name for c in file_chunks if c.name != "anonymous"]
        types = [c.chunk_type for c in file_chunks]
        total_lines = max(c.line_end for c in file_chunks) if file_chunks else 0
        deps = []
        for c in file_chunks:
            deps.extend(c.dependencies)
        deps = list(dict.fromkeys(deps))  # unique, preserve order

        # LLM суммаризация
        if self.llm:
            snippet = "\n".join(c.content[:300] for c in file_chunks[:3])
            prompt = (
                f"Кратко опиши назначение файла {rel_path} ({lang}).\n"
                f"Символы: {', '.join(symbols[:15])}\n"
                f"Зависимости: {', '.join(deps[:10])}\n"
                f"Фрагмент:\n{snippet[:800]}"
            )
            try:
                return self.llm(prompt)
            except Exception as exc:
                logger.warning("LLM суммаризация не удалась: %s", exc)

        # Эвристическая сводка
        parts = [f"{rel_path} ({lang}, {total_lines} строк)"]
        func_count = types.count("function")
        cls_count = types.count("class")
        if cls_count:
            parts.append(f"классов: {cls_count}")
        if func_count:
            parts.append(f"функций: {func_count}")
        if symbols:
            parts.append(f"символы: {', '.join(symbols[:10])}")
        if deps:
            parts.append(f"зависимости: {', '.join(deps[:8])}")
        return " | ".join(parts)

    # -- helpers --------------------------------------------------------------

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        """Разбить текст на токены для поиска."""
        text = text.lower()
        # camelCase / PascalCase -> разделить
        text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)
        # snake_case -> пробелы
        text = text.replace("_", " ").replace("-", " ")
        tokens = re.findall(r"[a-z0-9]+", text)
        # Убрать слишком короткие
        return [t for t in tokens if len(t) >= 2]


# -- __main__ ----------------------------------------------------------------

if __name__ == "__main__":
    import sys

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    print(f"=== ResearchEngine demo ===")
    print(f"Project root: {root}\n")

    engine = ResearchEngine(project_root=root)

    # Индексация
    stats = engine.index_project()
    print(f"Index stats:")
    print(f"  files_scanned:  {stats.files_scanned}")
    print(f"  files_indexed:  {stats.files_indexed}")
    print(f"  chunks_created: {stats.chunks_created}")
    print(f"  time_ms:        {stats.time_ms}")
    if stats.errors:
        print(f"  errors:         {len(stats.errors)}")

    # Поиск
    query = sys.argv[1] if len(sys.argv) > 1 else "OrchestratorCore"
    print(f"\nSearch: '{query}'")
    results = engine.search_code(query, top_k=5)
    for i, r in enumerate(results, 1):
        print(f"  {i}. [{r.score:.3f}] {r.chunk.file_path}:{r.chunk.line_start} "
              f"({r.chunk.chunk_type} {r.chunk.name})")
        for h in r.highlights[:2]:
            print(f"     > {h[:100]}")

    # Суммаризация
    if results:
        fp = results[0].chunk.file_path
        print(f"\nFile summary: {fp}")
        print(f"  {engine.get_file_summary(fp)}")

    # Инкрементальная переиндексация
    print("\nIncremental re-index:")
    stats2 = engine.incremental_index()
    print(f"  files_indexed: {stats2.files_indexed} (should be 0 if nothing changed)")

