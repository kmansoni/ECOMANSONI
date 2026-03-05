"""Training Seed 07 — Database Patterns & Query Optimization.

Обучающий пример для AI-движка: паттерны работы с базами данных,
включая индексирование, транзакции, N+1 problem, connection pooling,
миграции и оптимизацию запросов.

Задача: заполнить __FILL__ по контексту.
"""

# ── 1. Connection Pool (правильный паттерн) ───────────────────────────────────

from contextlib import asynccontextmanager
from typing import AsyncIterator
import asyncpg  # type: ignore

class DatabasePool:
    """Async PostgreSQL connection pool с health-check и backoff.

    Правило: один Pool на приложение, разделяется через DI.
    Никогда не создавай соединение на каждый запрос — это __FILL__.
    """

    _pool: asyncpg.Pool | None = None

    @classmethod
    async def create(cls, dsn: str, min_size: int = 5, max_size: int = 20) -> "DatabasePool":
        instance = cls()
        instance._pool = await asyncpg.create_pool(
            dsn,
            min_size=min_size,
            max_size=max_size,
            # Ping при получении соединения из пула — detect stale connections
            command_timeout=30,
        )
        return instance

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[asyncpg.Connection]:
        """Получить соединение из пула. Автоматически возвращает при выходе из блока."""
        assert self._pool is not None, "Pool not initialized"
        async with self._pool.acquire() as conn:
            yield conn

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[asyncpg.Connection]:
        """Получить соединение внутри явной транзакции."""
        async with self.acquire() as conn:
            async with conn.transaction():
                yield conn

    async def close(self) -> None:
        if self._pool:
            await self._pool.close()


# ── 2. Repository с N+1 Protection ────────────────────────────────────────────

from dataclasses import dataclass
from uuid import UUID

@dataclass
class Post:
    id: UUID
    title: str
    author_id: UUID
    author_name: str  # денормализован чтобы избежать N+1


class PostRepository:
    """Демонстрация правильного JOIN vs. неправильного N+1.

    ПЛОХО (N+1):
        posts = await db.fetch("SELECT * FROM posts")
        for post in posts:
            author = await db.fetchrow("SELECT name FROM users WHERE id=$1", post['author_id'])
            # N+1 запрос для каждого поста!

    ХОРОШО (JOIN или IN batch):
        posts = await db.fetch(
            SELECT p.*, u.name as author_name
            FROM posts p
            JOIN users u ON u.id = p.author_id
            WHERE p.created_at > $1
        )
    """

    def __init__(self, pool: DatabasePool) -> None:
        self._pool = pool

    async def list_recent(self, limit: int = 20) -> list[Post]:
        """Получить последние посты с данными авторов — ОДИН запрос."""
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT p.id, p.title, p.author_id, u.name AS author_name
                FROM posts p
                JOIN users u ON u.id = p.author_id
                ORDER BY p.created_at DESC
                LIMIT $1
                """,
                limit,
            )
        return [Post(id=r["id"], title=r["title"],
                     author_id=r["author_id"], author_name=r["author_name"])
                for r in rows]

    async def bulk_insert(self, posts: list[dict]) -> None:
        """Batch insert через copy_records_to_table — O(1) roundtrip vs O(n)."""
        async with self._pool.transaction() as conn:
            await conn.copy_records_to_table(
                "posts",
                records=[(p["id"], p["title"], p["author_id"]) for p in posts],
                columns=["id", "title", "author_id"],
            )


# ── 3. Индексирование ─────────────────────────────────────────────────────────

INDEX_EXAMPLES = """
-- Составной индекс: WHERE user_id = ? AND created_at > ?
-- Порядок важен: selectivity первого поля должна быть выше
CREATE INDEX CONCURRENTLY idx_messages_user_created
    ON messages(user_id, created_at DESC);

-- Partial index: индексируем только активные записи
CREATE INDEX CONCURRENTLY idx_users_active_email
    ON users(email)
    WHERE is_active = true;

-- GIN индекс для полнотекстового поиска
CREATE INDEX CONCURRENTLY idx_posts_fts
    ON posts USING GIN(to_tsvector('english', title || ' ' || body));

-- Запрос использующий FTS индекс
SELECT id, title, ts_rank(to_tsvector('english', title || ' ' || body), query) AS rank
FROM posts, to_tsquery('english', 'transformer & attention') query
WHERE to_tsvector('english', title || ' ' || body) @@ query
ORDER BY rank DESC
LIMIT 10;

-- EXPLAIN ANALYZE для проверки: должен видеть Index Scan, НЕ Seq Scan
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT * FROM messages WHERE user_id = '...' AND created_at > NOW() - INTERVAL '7 days';
"""

# ── 4. Optimistic Locking (предотвращение lost update) ────────────────────────

OPTIMISTIC_LOCK_EXAMPLE = """
-- Оптимистичная блокировка через version column
CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    balance NUMERIC(18, 2) NOT NULL,
    version INTEGER NOT NULL DEFAULT 0
);

-- UPDATE проверяет version; возвращает 0 rows при concurrent update
UPDATE accounts
SET balance = balance + $1,    -- delta
    version = version + 1
WHERE id = $2
  AND version = $3;             -- ожидаемая версия

-- Приложение: если rowcount == 0 → retry с повторным SELECT
"""

# ── 5. Database Migration Pattern ─────────────────────────────────────────────

MIGRATION_PATTERN = """
-- migrations/V20260305_001__add_messages_idx.sql
-- ПРИНЦИПЫ:
-- 1. Идемпотентны: IF NOT EXISTS / IF EXISTS
-- 2. Без блокировок на prod: CONCURRENTLY для индексов
-- 3. Один change per migration file
-- 4. Никогда не изменяй уже применённые миграции — создавай новую

-- Добавить колонку без блокировки таблицы (PostgreSQL 11+)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id UUID;

-- Backfill данных батчами — НЕ одним UPDATE (lock)
DO $$
DECLARE
    batch_size INT := 1000;
    last_id UUID := NULL;
    updated INT;
BEGIN
    LOOP
        UPDATE messages
        SET thread_id = root_message_id
        WHERE id IN (
            SELECT id FROM messages
            WHERE thread_id IS NULL
              AND (last_id IS NULL OR id > last_id)
            ORDER BY id
            LIMIT batch_size
        )
        RETURNING id INTO last_id;
        
        GET DIAGNOSTICS updated = ROW_COUNT;
        EXIT WHEN updated = 0;
        PERFORM pg_sleep(0.1);  -- backpressure между батчами
    END LOOP;
END $$;

-- После backfill — добавить NOT NULL constraint
ALTER TABLE messages ALTER COLUMN thread_id SET NOT NULL;
"""

# ── 6. Fill-in-the-blank упражнения ────────────────────────────────────────────
EXERCISES = [
    {
        "prompt": "Проблема N+1: получить 100 постов, каждый с данными автора\n"
                  "ПЛОХО: for post in posts: author = await db.get(post.author_id)\n"
                  "ХОРОШО: ",
        "answer": "SELECT p.*, u.name FROM posts p JOIN users u ON u.id = p.author_id LIMIT 100",
        "concept": "N+1 query problem, JOIN optimization",
    },
    {
        "prompt": "Для предотвращения concurrent update без пессимистичной блокировки используй __FILL__",
        "answer": "optimistic locking with version column",
        "concept": "Optimistic concurrency control",
    },
    {
        "prompt": "Создание индекса на prod без блокировки таблицы: CREATE INDEX __FILL__ idx_name ON table(col)",
        "answer": "CONCURRENTLY",
        "concept": "Non-blocking index creation",
    },
    {
        "prompt": "Connection pool создаётся __FILL__ раз за всё время жизни приложения",
        "answer": "один (один pool на все запросы)",
        "concept": "Connection pooling, resource management",
    },
    {
        "prompt": "Batch insert через __FILL__ эффективнее чем N отдельных INSERT",
        "answer": "COPY или INSERT ... VALUES (), (), ()",
        "concept": "Bulk operations, reduced round-trips",
    },
    {
        "prompt": "Уровень изоляции транзакции для предотвращения phantom reads: __FILL__",
        "answer": "SERIALIZABLE или REPEATABLE READ",
        "concept": "Transaction isolation levels",
    },
]

if __name__ == "__main__":
    print("Database Patterns Training Seed")
    print("=" * 50)
    for i, ex in enumerate(EXERCISES, 1):
        print(f"\n[{i}] {ex['concept']}")
        print(f"Q: {ex['prompt']}")
        print(f"A: {ex['answer']}")
    print(f"\nTotal exercises: {len(EXERCISES)}")
    print(f"Index examples:{INDEX_EXAMPLES[:200]}...")
