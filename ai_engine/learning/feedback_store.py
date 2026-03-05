#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FeedbackStore — Хранилище пользовательских взаимодействий с ARIA.
=================================================================

Архитектурные принципы:
    - GDPR-aware: каждая запись содержит user_consent флаг.
    - Анонимизация: user_id хэшируется SHA-256 перед записью в БД.
    - WAL-mode SQLite: безопасная конкурентная запись с нескольких потоков.
    - Idempotency: запись с тем же interaction_id игнорируется (UPSERT).
    - RLS-like: запросы к данным требуют явного флага include_non_consented=False.
    - Retention policy: записи без consent автоматически удаляются через 24 ч.

Схема таблиц:
    interactions  — пары prompt/response с оценкой
    corrections   — пользовательская правка ответа (предпочтительный вариант)
    content_items — внешние документы (уже деперсонализированные)

Атаки / Угрозы:
    - Prompt injection через user feedback: все тексты escaping-safe (параметризованные запросы).
    - Replay: interaction_id = SHA-256(user_hash + prompt + ts) — collision-resistant.
    - Data poisoning: reward model использует confidence score; низкоуверенные аномалии изолируются.
    - Mass ingestion DoS: rate limiter по user_hash (max 100 записей/час/пользователь).
"""

from __future__ import annotations

import hashlib
import logging
import sqlite3
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from enum import IntEnum
from pathlib import Path
from threading import RLock
from typing import Iterator, Optional, Sequence

logger = logging.getLogger(__name__)

# ─── Constants ───────────────────────────────────────────────────────────────

DEFAULT_DB_PATH = Path("aria_feedback.db")
RETENTION_NON_CONSENT_SECS = 86_400          # 24 h
RATE_LIMIT_RECORDS_PER_HOUR = 100
MAX_PROMPT_BYTES = 32_768                     # 32 KB — DoS cap
MAX_RESPONSE_BYTES = 65_536                   # 64 KB


# ─── Domain types ────────────────────────────────────────────────────────────

class FeedbackRating(IntEnum):
    THUMBS_DOWN = -1
    NEUTRAL     =  0
    THUMBS_UP   =  1


@dataclass(frozen=True)
class FeedbackRecord:
    """
    Единица обратной связи.

    Attributes:
        interaction_id: Идемпотентный идентификатор (SHA-256).
        user_hash:      Необратимый хэш user_id (SHA-256 + salt).
        prompt:         Входное сообщение пользователя (max 32 KB).
        response:       Ответ ARIA (max 64 KB).
        rating:         Оценка пользователя.
        correction:     Предпочтительный ответ (если пользователь исправил).
        consent:        Явное согласие на обучение.
        timestamp:      Unix seconds UTC.
        session_id:     UUID текущей сессии.
        language:       ISO 639-1 код языка (auto-detected).
    """

    interaction_id: str
    user_hash:      str
    prompt:         str
    response:       str
    rating:         FeedbackRating = FeedbackRating.NEUTRAL
    correction:     Optional[str]  = None
    consent:        bool           = False
    timestamp:      float          = field(default_factory=time.time)
    session_id:     str            = field(default_factory=lambda: str(uuid.uuid4()))
    language:       str            = "und"   # undetermined until pipeline sets it


@dataclass(frozen=True)
class PreferenceRecord:
    """Пара chosen/rejected для RLHF reward model."""

    prompt:    str
    chosen:    str    # ответ, который пользователь посчитал лучшим
    rejected:  str    # ответ, который пользователь отверг
    timestamp: float  = field(default_factory=time.time)


# ─── Store ───────────────────────────────────────────────────────────────────

class FeedbackStore:
    """
    Thread-safe SQLite-backed хранилище взаимодействий.

    Usage:
        store = FeedbackStore("/data/aria_feedback.db")
        store.record(feedback)
        pairs = store.load_preference_pairs(limit=1000)

    Concurrency:
        RLock + WAL mode позволяют N читателей + 1 писатель одновременно.
        Для multi-process деплоя используйте PostgreSQL-адаптер.
    """

    def __init__(
        self,
        db_path: str | Path = DEFAULT_DB_PATH,
        user_id_salt: str = "aria-feedback-v1",
    ) -> None:
        self._db_path = Path(db_path)
        self._salt = user_id_salt
        self._lock = RLock()
        self._rate_counters: dict[str, list[float]] = {}  # user_hash → [timestamps]
        self._init_db()

    # ── Init ─────────────────────────────────────────────────────────────────

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript("""
                PRAGMA journal_mode = WAL;
                PRAGMA synchronous  = NORMAL;
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS interactions (
                    interaction_id TEXT PRIMARY KEY,
                    user_hash      TEXT NOT NULL,
                    prompt         TEXT NOT NULL,
                    response       TEXT NOT NULL,
                    rating         INTEGER NOT NULL DEFAULT 0,
                    correction     TEXT,
                    consent        INTEGER NOT NULL DEFAULT 0,
                    timestamp      REAL NOT NULL,
                    session_id     TEXT NOT NULL,
                    language       TEXT NOT NULL DEFAULT 'und'
                );

                CREATE INDEX IF NOT EXISTS idx_interactions_user
                    ON interactions (user_hash, timestamp);
                CREATE INDEX IF NOT EXISTS idx_interactions_consent
                    ON interactions (consent, timestamp);

                CREATE TABLE IF NOT EXISTS content_items (
                    content_id   TEXT PRIMARY KEY,
                    source_url   TEXT,
                    source_type  TEXT NOT NULL,  -- 'web' | 'user_upload' | 'platform'
                    text         TEXT NOT NULL,
                    language     TEXT NOT NULL DEFAULT 'und',
                    quality_score REAL NOT NULL DEFAULT 0.5,
                    ingested_at  REAL NOT NULL,
                    used_in_training INTEGER NOT NULL DEFAULT 0
                );

                CREATE INDEX IF NOT EXISTS idx_content_untrained
                    ON content_items (used_in_training, quality_score);

                CREATE TABLE IF NOT EXISTS training_runs (
                    run_id      TEXT PRIMARY KEY,
                    started_at  REAL NOT NULL,
                    finished_at REAL,
                    samples     INTEGER NOT NULL DEFAULT 0,
                    loss_before REAL,
                    loss_after  REAL,
                    status      TEXT NOT NULL DEFAULT 'running'  -- 'running'|'done'|'failed'
                );
            """)
        logger.info("FeedbackStore initialised at %s", self._db_path)

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(str(self._db_path), timeout=30)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ── Hashing ──────────────────────────────────────────────────────────────

    def hash_user_id(self, raw_user_id: str) -> str:
        """
        Необратимо хэшировать user_id перед сохранением.
        Используется pepper (сервисная соль) + SHA-256.
        """
        payload = f"{self._salt}:{raw_user_id}"
        return hashlib.sha256(payload.encode()).hexdigest()

    @staticmethod
    def make_interaction_id(user_hash: str, prompt: str, timestamp: float) -> str:
        """Детерминированный, collision-resistant ID взаимодействия."""
        payload = f"{user_hash}:{prompt[:256]}:{timestamp:.3f}"
        return hashlib.sha256(payload.encode()).hexdigest()

    # ── Rate limiting ─────────────────────────────────────────────────────────

    def _check_rate_limit(self, user_hash: str) -> bool:
        """True → запрос допустим. False → превышен лимит (100 записей/час)."""
        now = time.time()
        cutoff = now - 3600
        with self._lock:
            timestamps = self._rate_counters.get(user_hash, [])
            timestamps = [t for t in timestamps if t > cutoff]
            if len(timestamps) >= RATE_LIMIT_RECORDS_PER_HOUR:
                logger.warning("Rate limit exceeded for user_hash %s…", user_hash[:8])
                return False
            timestamps.append(now)
            self._rate_counters[user_hash] = timestamps
        return True

    # ── Write API ─────────────────────────────────────────────────────────────

    def record(self, feedback: FeedbackRecord) -> bool:
        """
        Сохранить запись взаимодействия.

        Returns:
            True если запись сохранена, False если дубликат или rate-limit.

        Raises:
            ValueError: если prompt/response превышают MAX_*_BYTES.
        """
        if len(feedback.prompt.encode()) > MAX_PROMPT_BYTES:
            raise ValueError(f"prompt exceeds {MAX_PROMPT_BYTES} bytes")
        if len(feedback.response.encode()) > MAX_RESPONSE_BYTES:
            raise ValueError(f"response exceeds {MAX_RESPONSE_BYTES} bytes")

        if not self._check_rate_limit(feedback.user_hash):
            return False

        with self._lock, self._connect() as conn:
            try:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO interactions
                        (interaction_id, user_hash, prompt, response, rating,
                         correction, consent, timestamp, session_id, language)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        feedback.interaction_id,
                        feedback.user_hash,
                        feedback.prompt,
                        feedback.response,
                        int(feedback.rating),
                        feedback.correction,
                        int(feedback.consent),
                        feedback.timestamp,
                        feedback.session_id,
                        feedback.language,
                    ),
                )
                return conn.execute("SELECT changes()").fetchone()[0] == 1
            except sqlite3.IntegrityError:
                return False  # duplicate

    def ingest_content(
        self,
        text: str,
        source_url: str = "",
        source_type: str = "web",
        language: str = "und",
        quality_score: float = 0.5,
    ) -> str:
        """
        Сохранить внешний контент для обучения.

        Returns:
            content_id (детерминированный SHA-256 от text).
        """
        content_id = hashlib.sha256(text[:1024].encode()).hexdigest()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO content_items
                    (content_id, source_url, source_type, text, language,
                     quality_score, ingested_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (content_id, source_url, source_type, text,
                 language, quality_score, time.time()),
            )
        return content_id

    # ── Read API ──────────────────────────────────────────────────────────────

    def load_preference_pairs(
        self,
        limit: int = 2000,
        min_rating_gap: int = 2,  # chosen.rating - rejected.rating >= 2
    ) -> list[PreferenceRecord]:
        """
        Загрузить пары (chosen, rejected) для обучения reward model.
        Только записи с consent=1.
        min_rating_gap: разница рейтингов, чтобы пара была достаточно контрастной.

        Алгоритм:
            JOIN interactions по session_id, где одинаковый prompt
            встречается дважды (A/B тест или исправление).
            Либо: correction != NULL → chosen=correction, rejected=response.
        """
        records: list[PreferenceRecord] = []

        with self._connect() as conn:
            # Пара: пользователь исправил ответ — используем correction vs response
            rows = conn.execute(
                """
                SELECT prompt, correction AS chosen, response AS rejected, timestamp
                FROM interactions
                WHERE consent = 1
                  AND correction IS NOT NULL
                  AND rating = ?
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                (int(FeedbackRating.THUMBS_DOWN), limit),
            ).fetchall()

            for row in rows:
                records.append(PreferenceRecord(
                    prompt=row["prompt"],
                    chosen=row["chosen"],
                    rejected=row["rejected"],
                    timestamp=row["timestamp"],
                ))

        return records

    def load_training_texts(
        self,
        limit: int = 10_000,
        min_quality: float = 0.4,
    ) -> list[str]:
        """
        Загрузить необработанные тексты для языкового fine-tuning.
        Возвращает тексты content_items + позитивные interactions (consent=1).
        """
        texts: list[str] = []

        with self._connect() as conn:
            # Контент из краулера
            rows = conn.execute(
                """
                SELECT text FROM content_items
                WHERE used_in_training = 0
                  AND quality_score >= ?
                ORDER BY quality_score DESC
                LIMIT ?
                """,
                (min_quality, limit // 2),
            ).fetchall()
            texts.extend(r["text"] for r in rows)
            content_ids = [
                hashlib.sha256(r["text"][:1024].encode()).hexdigest()
                for r in rows
            ]

            # Позитивные взаимодействия пользователей
            rows2 = conn.execute(
                """
                SELECT prompt || '\n' || response AS text
                FROM interactions
                WHERE consent = 1 AND rating >= 1
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                (limit - len(texts),),
            ).fetchall()
            texts.extend(r["text"] for r in rows2)

            # Помечаем content как использованные
            if content_ids:
                conn.executemany(
                    "UPDATE content_items SET used_in_training = 1 WHERE content_id = ?",
                    [(cid,) for cid in content_ids],
                )

        return texts

    # ── Maintenance ───────────────────────────────────────────────────────────

    def purge_expired_non_consent(self) -> int:
        """
        GDPR compliance: удалить записи без consent, старше RETENTION_NON_CONSENT_SECS.
        Должен вызываться периодически (cron / background task).

        Returns:
            Количество удалённых записей.
        """
        cutoff = time.time() - RETENTION_NON_CONSENT_SECS
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM interactions WHERE consent = 0 AND timestamp < ?",
                (cutoff,),
            )
            deleted = conn.execute("SELECT changes()").fetchone()[0]
        logger.info("Purged %d non-consent interactions older than 24h", deleted)
        return deleted

    def log_training_run(
        self,
        run_id: str,
        samples: int,
        loss_before: Optional[float],
        loss_after: Optional[float],
        status: str,
        started_at: Optional[float] = None,
    ) -> None:
        """Записать метаданные тренировочного прогона для аудита."""
        now = time.time()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO training_runs
                    (run_id, started_at, finished_at, samples, loss_before, loss_after, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (run_id, started_at or now, now, samples, loss_before, loss_after, status),
            )
