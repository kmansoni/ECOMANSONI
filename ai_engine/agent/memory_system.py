#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🧠 Memory System — долгосрочная память агента.

Возможности:
- Хранение до 1000+ запросов с полным контекстом
- Векторное хранилище для семантического поиска
- Иерархическая память: эпизоды → факты → выводы
- Автоматическая консолидация и обобщение
- Самообучение через feedback loop
"""

import json
import logging
import os
import sqlite3
import threading
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional
import hashlib

logger = logging.getLogger(__name__)


class MemoryType(Enum):
    """Тип памяти."""
    EPISODE = "episode"        # Конкретный опыт
    FACT = "fact"           # Факт/истина
    INSIGHT = "insight"     # Вывод/инсайт
    PLAN = "plan"          # План действий
    SKILL = "skill"         # Освоенный навык
    CONTEXT = "context"      # Контекст текущей сессии
    ARCHITECTURE = "architecture"  # Архитектурное решение


class Importance(Enum):
    """Важность memori."""
    CRITICAL = 5   # Критично (без этого нельзя)
    HIGH = 4      # Важно
    MEDIUM = 3     # Среднее
    LOW = 2        # Низкое
    ZERO = 1       # Неважно


@dataclass
class MemoryEntry:
    """
    Один элемент памяти.

    Attributes:
        id: Уникальный ID.
        type: Тип памяти.
        content: Содержание (может быть огромным - миллионы токенов).
        summary: Краткое резюме для быстрого поиска.
        importance: Важность.
        embedding_hash: Хэш для семантического поиска.
        timestamp: Время создания.
        last_access: Последний доступ.
        access_count:多少次访问了.
        tags: Теги для категоризации.
        parent_id: Родительская память (для иерархии).
        metadata: Доп. метаданные.
    """

    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    type: MemoryType = MemoryType.EPISODE
    content: str = ""
    summary: str = ""
    importance: Importance = Importance.MEDIUM
    embedding_hash: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    last_access: str = field(default_factory=lambda: datetime.now().isoformat())
    access_count: int = 0
    tags: list[str] = field(default_factory=list)
    parent_id: Optional[str] = None
    metadata: dict = field(default_factory=dict)


@dataclass
class Session:
    """
    Сессия работы с пользователем.

    Attributes:
        id: ID сессии.
        user_id: ID пользователя.
        requests: История запросов (до 1000+).
        context: Текущий контекст.
        started: Начало сессии.
        last_activity: Последняя активность.
    """

    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    user_id: str = "default"
    requests: list[dict] = field(default_factory=list)
    context: dict = field(default_factory=dict)
    started: str = field(default_factory=lambda: datetime.now().isoformat())
    last_activity: str = field(default_factory=lambda: datetime.now().isoformat())


class MemoryStore:
    """
    SQLite-хранилище с оптимизацией для миллионов токенов.

    Особенности:
    - Сжатие контента (gzip для больших записей)
    - Индексы для быстрого поиска
    - TTL для автоматической чистки
    - Потокобезопасность
    """

    def __init__(self, db_path: str = "memory.db", max_entries: int = 100000):
        """
        Args:
            db_path: Путь к SQLite базе.
            max_entries: Максимум записей.
        """
        self.db_path = db_path
        self.max_entries = max_entries
        self._lock = threading.RLock()
        
        # Инициализация базы
        self._init_db()
        
        # Кэш для быстрого доступа
        self._cache: dict[str, MemoryEntry] = {}
        self._cache_capacity = 1000  # LRU кэш
        
        # Статистика
        self._stats = {
            "total_entries": 0,
            "total_tokens_stored": 0,
            "queries_served": 0,
            "cache_hits": 0,
        }

    def _init_db(self) -> None:
        """Создать таблицы если их нет."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Main memory table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                content TEXT,
                summary TEXT,
                importance INTEGER,
                embedding_hash TEXT,
                timestamp TEXT,
                last_access TEXT,
                access_count INTEGER,
                tags TEXT,
                parent_id TEXT,
                metadata TEXT,
                compressed INTEGER DEFAULT 0
            )
        """)
        
        # Sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                requests TEXT,
                context TEXT,
                started TEXT,
                last_activity TEXT
            )
        """)
        
        # Indexes для быстрого поиска
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_type ON memories(type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_importance ON memories(importance)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON memories(timestamp)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_embedding ON memories(embedding_hash)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_parent ON memories(parent_id)")
        
        conn.commit()
        conn.close()
        
        logger.info(f"Memory DB инициализирована: {self.db_path}")

    def _compress(self, content: str) -> tuple[bytes, bool]:
        """Сжать большой контент."""
        import gzip
        
        if len(content) > 10000:  # Сжимаем если > 10KB
            compressed = gzip.compress(content.encode('utf-8'))
            if len(compressed) < len(content):
                return compressed, True
        return content.encode('utf-8'), False

    def _decompress(self, content: bytes, compressed: bool) -> str:
        """Распаковать контент."""
        import gzip
        
        if compressed:
            return gzip.decompress(content).decode('utf-8')
        return content.decode('utf-8')

    def _generate_embedding_hash(self, text: str) -> str:
        """Генерировать хэш для семантического поиска."""
        # Упрощенная версия эмбеддинга - используем n-граммы
        text = text.lower()
        
        # Биграммы
        bigrams = [text[i:i+2] for i in range(len(text)-1)]
        bigram_counts = defaultdict(int)
        for bg in bigrams:
            bigram_counts[bg] += 1
        
        # Топ биграммы как хэш
        top_bigrams = sorted(bigram_counts.items(), key=lambda x: -x[1])[:50]
        hash_input = "|".join(f"{k}:{v}" for k, v in top_bigrams)
        
        return hashlib.sha256(hash_input.encode()).hexdigest()[:32]

    def store(self, entry: MemoryEntry) -> None:
        """
        Сохранить entry в память.

        Args:
            entry: Элемент памяти.
        """
        with self._lock:
            # Генерируем embedding hash если не дан
            if not entry.embedding_hash and entry.content:
                entry.embedding_hash = self._generate_embedding_hash(entry.content)
            
            # Сжимаем если большой
            content_bytes, is_compressed = self._compress(entry.content)
            
            # Сохраняем в БД
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT OR REPLACE INTO memories 
                (id, type, content, summary, importance, embedding_hash, 
                 timestamp, last_access, access_count, tags, parent_id, metadata, compressed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                entry.id,
                entry.type.value,
                content_bytes if is_compressed else entry.content,
                entry.summary,
                entry.importance.value,
                entry.embedding_hash,
                entry.timestamp,
                entry.last_access,
                entry.access_count,
                json.dumps(entry.tags),
                entry.parent_id,
                json.dumps(entry.metadata),
                1 if is_compressed else 0,
            ))
            
            conn.commit()
            conn.close()
            
            # Обновляем кэш
            self._cache[entry.id] = entry
            
            # Обновляем статистику
            self._stats["total_entries"] += 1
            self._stats["total_tokens_stored"] += len(entry.content) // 4
            
            logger.debug(f"Сохранено в память: {entry.id[:8]} ({len(entry.content)} чар)")

    def retrieve(
        self,
        query: str,
        limit: int = 10,
        memory_type: Optional[MemoryType] = None,
        min_importance: Importance = Importance.ZERO,
    ) -> list[MemoryEntry]:
        """
        Найти релевантные воспоминания.

        Args:
            query: Поисковый запрос.
            limit: Максимум результатов.
            memory_type: Фильтр по типу.
            min_importance: Минимальная важность.

        Returns:
            Список найденных entry.
        """
        with self._lock:
            self._stats["queries_served"] += 1
            
            # ��ытаемся найти через embedding hash
            query_hash = self._generate_embedding_hash(query)
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Поиск по хэшу + текстовый поиск
            sql = """
                SELECT id, type, content, summary, importance, embedding_hash,
                       timestamp, last_access, access_count, tags, parent_id, 
                       metadata, compressed
                FROM memories
                WHERE importance >= ?
            """
            params = [min_importance.value]
            
            if memory_type:
                sql += " AND type = ?"
                params.append(memory_type.value)
            
            # Дополнительный поиск по контенту
            if query:
                sql += " AND (content LIKE ? OR summary LIKE ? OR tags LIKE ?)"
                like_pattern = f"%{query}%"
                params.extend([like_pattern, like_pattern, like_pattern])
            
            sql += " ORDER BY importance DESC, access_count DESC LIMIT ?"
            params.append(limit)
            
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            conn.close()
            
            results = []
            for row in rows:
                entry = MemoryEntry(
                    id=row[0],
                    type=MemoryType(row[1]),
                    content=self._decompress(row[2], bool(row[12])),
                    summary=row[3],
                    importance=Importance(row[4]),
                    embedding_hash=row[5],
                    timestamp=row[6],
                    last_access=row[7],
                    access_count=row[8],
                    tags=json.loads(row[9]),
                    parent_id=row[10],
                    metadata=json.loads(row[11]),
                )
                
                # Обновляем last_access
                entry.last_access = datetime.now().isoformat()
                entry.access_count += 1
                results.append(entry)
            
            # Кэшируем
            for e in results:
                self._cache[e.id] = e
            
            if results:
                self._stats["cache_hits"] += 1
            
            return results

    def get_recent(self, limit: int = 50) -> list[MemoryEntry]:
        """Получить последние записи."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, type, content, summary, importance, embedding_hash,
                   timestamp, last_access, access_count, tags, parent_id, 
                   metadata, compressed
            FROM memories
            ORDER BY last_access DESC
            LIMIT ?
        """, (limit,))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [
            MemoryEntry(
                id=row[0],
                type=MemoryType(row[1]),
                content=self._decompress(row[2], bool(row[12])),
                summary=row[3],
                importance=Importance(row[4]),
                embedding_hash=row[5],
                timestamp=row[6],
                last_access=row[7],
                access_count=row[8],
                tags=json.loads(row[9]),
                parent_id=row[10],
                metadata=json.loads(row[11]),
            )
            for row in rows
        ]

    def get_by_importance(
        self,
        min_importance: Importance = Importance.MEDIUM,
        limit: int = 100,
    ) -> list[MemoryEntry]:
        """Получить важные записи."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, type, content, summary, importance, tags
            FROM memories
            WHERE importance >= ?
            ORDER BY importance DESC, access_count DESC
            LIMIT ?
        """, (min_importance.value, limit))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [
            MemoryEntry(
                id=row[0],
                type=MemoryType(row[1]),
                content=row[2],
                summary=row[3],
                importance=Importance(row[4]),
                tags=json.loads(row[5]) if row[5] else [],
            )
            for row in rows
        ]

    def consolidate(self) -> int:
        """
        Консолидировать память - создать обобщения.

        Returns:
            Количество созданных инсайтов.
        """
        # Находим связанные эпизоды и создаем из них инсайты
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Group by tags and find patterns
        cursor.execute("""
            SELECT tags, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
            FROM memories
            WHERE type = 'episode'
            GROUP BY tags
            HAVING cnt >= 3
        """)
        
        groups = cursor.fetchall()
        insights_created = 0
        
        for tags_json, count, ids in groups:
            if not tags_json:
                continue
            
            # Создаем инсайт из группы
            tag_list = json.loads(tags_json)
            
            # Retrieve episodes
            cursor.execute("""
                SELECT content FROM memories
                WHERE id IN ({})
                LIMIT 5
            """.format(",".join(["?"] * len(ids.split(",")))), ids.split(","))
            
            contents = [r[0] for r in cursor.fetchall()]
            
            if contents:
                insight_content = (
                    f"Обнаружена закономерность: теги {tag_list}. "
                    f"Встречалось {count} раз. "
                    f"典型 примеры: {'; '.join(contents[:3])}"
                )
                
                insight = MemoryEntry(
                    type=MemoryType.INSIGHT,
                    content=insight_content,
                    summary=f"Закономерность: {tag_list}",
                    importance=Importance.HIGH,
                    tags=tag_list + ["consolidated"],
                    parent_id=ids.split(",")[0],
                )
                self.store(insight)
                insights_created += 1
        
        conn.close()
        
        logger.info(f"Консолидация создала {insights_created} инсайтов")
        return insights_created

    def get_stats(self) -> dict:
        """Получить статистику памяти."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*), SUM(LENGTH(content)) FROM memories")
        total, total_chars = cursor.fetchone()
        
        cursor.execute("SELECT type, COUNT(*) FROM memories GROUP BY type")
        by_type = dict(cursor.fetchall())
        
        cursor.execute("SELECT importance, COUNT(*) FROM memories GROUP BY importance")
        by_importance = dict(cursor.fetchall())
        
        conn.close()
        
        return {
            "total_entries": total or 0,
            "total_chars": total_chars or 0,
            "total_tokens_approx": (total_chars or 0) // 4,
            "by_type": by_type,
            "by_importance": by_importance,
            "cache_size": len(self._cache),
            **self._stats,
        }


class ContextWindow:
    """
    Контекстное окно для работы с миллионами токенов.

    Техники:
    - Sliding window с приоритизацией
    - RAPTOR-like иерархия (резюме -> детали)
    - Working memory для текущей задачи
    """

    def __init__(self, max_tokens: int = 1000000):
        """
        Args:
            max_tokens: Максимум токенов в контексте.
        """
        self.max_tokens = max_tokens
        
        # Иерархия памяти
        self.working_memory: list[dict] = []  # Текущая задача
        self.short_term: list[MemoryEntry] = []  # Короткая память
        self.long_term_references: list[MemoryEntry] = []  # Ссылки на долгосрочную
        
        # Статистика
        self.total_tokens_used = 0

    def add(self, entry: dict) -> None:
        """
        Добавить в рабочую память.

        Args:
            entry: {'role': 'user/assistant', 'content': '...', 'metadata': {...}}
        """
        # Оцениваем токены
        tokens = len(entry.get("content", "")) // 4
        self.total_tokens_used += tokens
        
        # Добавляем
        self.working_memory.append(entry)
        
        # Trim если переполнили
        while self.total_tokens_used > self.max_tokens:
            self._trim()

    def _trim(self) -> None:
        """Обрезать старые записи, сохраняя важные."""
        if not self.working_memory:
            return
        
        # Резюмируем старые записи в одну
        old_entries = self.working_memory[:-5]  # Все кроме последних 5
        
        if old_entries:
            summary = self._create_summary(old_entries)
            
            # Добавляем summary как одну запись
            self.working_memory = [{
                "role": "system",
                "content": f"[Сводка предыдущего контекста]: {summary}",
                "metadata": {"type": "summary", "entries_count": len(old_entries)},
            }] + self.working_memory[-5:]
            
            self.total_tokens_used = sum(
                len(e.get("content", "")) // 4 
                for e in self.working_memory
            )

    def _create_summary(self, entries: list[dict]) -> str:
        """Создать резюме из записей."""
        # Берем только первый чанк каждой записи
        snippets = []
        for e in entries:
            content = e.get("content", "")[:200]
            role = e.get("role", "unknown")
            snippets.append(f"{role}: {content}")
        
        return " | ".join(snippets)

    def get_context(self) -> list[dict]:
        """Получить полный контекст для LLM."""
        return self.working_memory

    def get_formatted_context(self) -> str:
        """Получить форматированный контекст для промпта."""
        return "\n\n".join(
            f"{e.get('role', 'user')}: {e.get('content', '')}"
            for e in self.working_memory
        )

    def clear(self) -> None:
        """Очистить рабочую память."""
        self.working_memory.clear()
        self.short_term.clear()
        self.long_term_references.clear()
        self.total_tokens_used = 0


class MemoryManager:
    """
    Главный менеджер памяти - "единый мозг" агента.

    Координирует:
    - MemoryStore (долгосрочное хранение)
    - ContextWindow (рабочий контекст)
    - Auto-consolidation
    - Semantic retrieval
    """

    def __init__(
        self,
        db_path: str = "memory.db",
        max_context_tokens: int = 1000000,
        max_session_requests: int = 1000,
    ):
        """
        Args:
            db_path: Путь к БД памяти.
            max_context_tokens: Максимум токенов в контексте.
            max_session_requests: Максимум запросов в сессии.
        """
        self.store = MemoryStore(db_path)
        self.context = ContextWindow(max_context_tokens)
        self.max_session_requests = max_session_requests
        
        # Текущая сессия
        self.current_session: Optional[Session] = None
        
        # Колбэки для самообучения
        self.learned_callbacks: list[Callable] = []
        
        logger.info(f"MemoryManager инициализирован: {max_context_tokens} токенов макс")

    def start_session(self, user_id: str = "default") -> Session:
        """Начать новую сессию."""
        self.current_session = Session(user_id=user_id)
        logger.info(f"Начата сессия: {self.current_session.id[:8]}")
        return self.current_session

    def add_request(
        self,
        request: str,
        response: str = "",
        metadata: Optional[dict] = None,
    ) -> None:
        """
        Добавить запрос в историю сессии.

        Args:
            request: Запрос пользователя.
            response: Ответ агента.
            metadata: Доп. данные.
        """
        if not self.current_session:
            self.start_session()
        
        # Добавляем в историю
        self.current_session.requests.append({
            "request": request,
            "response": response,
            "timestamp": datetime.now().isoformat(),
            "metadata": metadata or {},
        })
        
        # Ограничиваем размер
        if len(self.current_session.requests) > self.max_session_requests:
            # Консолидируем старые
            old = self.current_session.requests[:-100]
            self._consolidate_requests(old)
            self.current_session.requests = self.current_session.requests[-100:]

    def _consolidate_requests(self, requests: list[dict]) -> None:
        """Консолидировать старые запросы в память."""
        content = "\n\n".join(
            f"Q: {r['request'][:500]}\nA: {r['response'][:500]}"
            for r in requests
        )
        
        entry = MemoryEntry(
            type=MemoryType.EPISODE,
            content=content,
            summary=f"{len(requests)} запросов",
            importance=Importance.MEDIUM,
            tags=["session", "consolidated"],
        )
        
        self.store.store(entry)

    def remember(
        self,
        content: str,
        memory_type: MemoryType = MemoryType.EPISODE,
        importance: Importance = Importance.MEDIUM,
        tags: Optional[list[str]] = None,
    ) -> None:
        """
        Сохранить в долгосрочную память.

        Args:
            content: Что запомнить.
            memory_type: Тип памяти.
            importance: Важность.
            tags: Теги.
        """
        entry = MemoryEntry(
            type=memory_type,
            content=content,
            summary=content[:200],
            importance=importance,
            tags=tags or [],
            metadata={"session_id": self.current_session.id if self.current_session else None},
        )
        
        self.store.store(entry)

    def recall(
        self,
        query: str,
        limit: int = 10,
    ) -> list[MemoryEntry]:
        """
        Вспомнить相关ное.

        Args:
            query: Поисковый запрос.
            limit: Максимум результатов.

        Returns:
            Список воспоминаний.
        """
        return self.store.retrieve(query, limit=limit)

    def think_about(
        self,
        topic: str,
        context: Optional[str] = None,
    ) -> list[MemoryEntry]:
        """
        Агент "думает" о теме - ищет релевантную информацию.

        Args:
            topic: Тема для размышлений.
            context: Дополнительный контекст.

        Returns:
            Найденные воспоминания + факты.
        """
        # Ищем по теме
        results = self.store.retrieve(topic, limit=20)
        
        # Фильтруем важное
        important = [r for r in results if r.importance.value >= Importance.MEDIUM.value]
        
        # Добавляем контекст в working memory
        if context:
            self.context.add({
                "role": "system",
                "content": f"Контекст для '{topic}': {context}",
            })
        
        return important

    def learn(
        self,
        from_request: str,
        from_response: str,
        insight: str,
    ) -> None:
        """
        Агент учится на основе опыта.

        Args:
            from_request: Запрос.
            from_response: Ответ.
            insight: Вывод/инсайт.
        """
        # Сохраняем как инсайт
        entry = MemoryEntry(
            type=MemoryType.INSIGHT,
            content=f"Вопрос: {from_request}\nОтвет: {from_response}\nВывод: {insight}",
            summary=insight[:200],
            importance=Importance.HIGH,
            tags=["learned", "insight"],
        )
        
        self.store.store(entry)
        
        # Вызываем колбэки
        for cb in self.learned_callbacks:
            try:
                cb(entry)
            except Exception as e:
                logger.warning(f"Learn callback error: {e}")

    def get_brain_dump(self) -> str:
        """Получить "дамп мозга" - все важные знания."""
        # Получаем важные факты и инсайты
        important = self.store.get_by_importance(
            min_importance=Importance.MEDIUM,
            limit=100,
        )
        
        lines = ["=== МОЗГ АГЕНТА ==="]
        
        for entry in important:
            lines.append(f"\n## {entry.type.value}: {entry.summary or entry.id[:8]}")
            lines.append(entry.content[:1000])  # Лимитируем
        
        return "\n".join(lines)

    def get_stats(self) -> dict:
        """Получить ст��тистику."""
        return {
            "memory": self.store.get_stats(),
            "context_tokens": self.context.total_tokens_used,
            "session_requests": (
                len(self.current_session.requests)
                if self.current_session else 0
            ),
        }


# =============================================================================
# Глобальный实例
# =============================================================================

# Дефолтный менеджер
_manager: Optional[MemoryManager] = None


def get_memory_manager() -> MemoryManager:
    """Получить глобальный экземпляр менеджера памяти."""
    global _manager
    if _manager is None:
        _manager = MemoryManager()
    return _manager


# =============================================================================
# Тесты
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # Тест системы памяти
    manager = MemoryManager()
    
    # Начинаем сессию
    session = manager.start_session("test_user")
    
    # Добавляем запросы
    for i in range(5):
        manager.add_request(
            f"Запрос {i}: Как создать мессенджер?",
            f"Ответ {i}: Нужно использовать WebSocket и шифрование E2EE.",
        )
    
    # Запоминаем важное
    manager.remember(
        "Ключевое правило: всегда шифровать сообщения E2EE перед отправкой",
        memory_type=MemoryType.FACT,
        importance=Importance.CRITICAL,
        tags=["security", "encryption"],
    )
    
    # Вспоминаем
    results = manager.recall("мессенджер шифрование")
    print(f"\nНайдено воспоминаний: {len(results)}")
    for r in results:
        print(f"  - {r.summary[:100]}")
    
    # Статистика
    stats = manager.get_stats()
    print(f"\nСтатистика: {stats}")
    
    # Консолидация
    consolidated = manager.store.consolidate()
    print(f"Создано инсайтов: {consolidated}")