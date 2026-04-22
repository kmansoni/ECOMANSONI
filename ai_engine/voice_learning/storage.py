from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class VoiceLearningStore:
    def __init__(self, db_path: str):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS raw_utterances (
                    id TEXT PRIMARY KEY,
                    user_id_hash TEXT,
                    audio_path TEXT,
                    transcript_draft TEXT,
                    language_code TEXT,
                    accent_tag TEXT,
                    source TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS training_samples (
                    id TEXT PRIMARY KEY,
                    utterance_id TEXT,
                    transcript_final TEXT NOT NULL,
                    address_json TEXT,
                    novelty_score REAL NOT NULL DEFAULT 0,
                    is_valid INTEGER NOT NULL DEFAULT 0,
                    confidence REAL NOT NULL DEFAULT 0,
                    validation_source TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS feedback (
                    id TEXT PRIMARY KEY,
                    sample_id TEXT,
                    utterance_id TEXT,
                    corrected_transcript TEXT,
                    corrected_address_json TEXT,
                    feedback_type TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS address_patterns (
                    id TEXT PRIMARY KEY,
                    country_code TEXT,
                    city TEXT,
                    street TEXT,
                    house_number TEXT,
                    corpus TEXT,
                    pattern_type TEXT,
                    frequency INTEGER NOT NULL DEFAULT 1,
                    first_seen TEXT NOT NULL,
                    last_seen TEXT NOT NULL,
                    is_confirmed INTEGER NOT NULL DEFAULT 0,
                    metadata_json TEXT NOT NULL DEFAULT '{}'
                );

                CREATE TABLE IF NOT EXISTS hotspot_events (
                    id TEXT PRIMARY KEY,
                    utterance_id TEXT,
                    transcript TEXT NOT NULL,
                    parsed_address_json TEXT NOT NULL,
                    novelty_score REAL NOT NULL,
                    reasons_json TEXT NOT NULL,
                    text_variants_json TEXT NOT NULL,
                    synthetic_jobs_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS model_versions (
                    id TEXT PRIMARY KEY,
                    model_type TEXT NOT NULL,
                    version_tag TEXT NOT NULL,
                    metrics_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )

            existing = conn.execute("SELECT COUNT(*) AS count FROM model_versions").fetchone()["count"]
            if existing == 0:
                conn.execute(
                    """
                    INSERT INTO model_versions (id, model_type, version_tag, metrics_json, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        "voice-platform",
                        "foundation-v1",
                        json.dumps(
                            {
                                "wer_target": 0.1,
                                "address_f1_target": 0.95,
                                "hotspot_response_hours": 48,
                            }
                        ),
                        _utc_now(),
                    ),
                )
            conn.commit()

    def insert_raw_utterance(
        self,
        user_id_hash: str,
        transcript_draft: str,
        source: str,
        language_code: str | None = None,
        accent_tag: str | None = None,
        audio_path: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        utterance_id = str(uuid.uuid4())
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO raw_utterances (
                    id, user_id_hash, audio_path, transcript_draft, language_code,
                    accent_tag, source, metadata_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    utterance_id,
                    user_id_hash,
                    audio_path,
                    transcript_draft,
                    language_code,
                    accent_tag,
                    source,
                    json.dumps(metadata or {}),
                    _utc_now(),
                ),
            )
            conn.commit()
        return utterance_id

    def insert_training_sample(
        self,
        utterance_id: str | None,
        transcript_final: str,
        address: dict[str, Any] | None,
        novelty_score: float,
        is_valid: bool,
        confidence: float,
        validation_source: str,
    ) -> str:
        sample_id = str(uuid.uuid4())
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO training_samples (
                    id, utterance_id, transcript_final, address_json, novelty_score,
                    is_valid, confidence, validation_source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sample_id,
                    utterance_id,
                    transcript_final,
                    json.dumps(address or {}),
                    novelty_score,
                    int(is_valid),
                    confidence,
                    validation_source,
                    _utc_now(),
                ),
            )
            conn.commit()
        return sample_id

    def insert_feedback(
        self,
        utterance_id: str | None,
        sample_id: str | None,
        corrected_transcript: str | None,
        corrected_address: dict[str, Any] | None,
        feedback_type: str,
    ) -> str:
        feedback_id = str(uuid.uuid4())
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO feedback (
                    id, sample_id, utterance_id, corrected_transcript,
                    corrected_address_json, feedback_type, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    feedback_id,
                    sample_id,
                    utterance_id,
                    corrected_transcript,
                    json.dumps(corrected_address or {}),
                    feedback_type,
                    _utc_now(),
                ),
            )
            conn.commit()
        return feedback_id

    def upsert_address_pattern(
        self,
        address: dict[str, Any],
        pattern_type: str,
        is_confirmed: bool,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, frequency FROM address_patterns
                WHERE country_code IS ? AND city IS ? AND street IS ? AND house_number IS ? AND corpus IS ?
                LIMIT 1
                """,
                (
                    address.get("country"),
                    address.get("locality"),
                    address.get("road"),
                    address.get("house_number"),
                    address.get("corpus"),
                ),
            ).fetchone()

            now = _utc_now()
            if row:
                conn.execute(
                    """
                    UPDATE address_patterns
                    SET frequency = frequency + 1,
                        last_seen = ?,
                        is_confirmed = MAX(is_confirmed, ?),
                        metadata_json = ?
                    WHERE id = ?
                    """,
                    (now, int(is_confirmed), json.dumps(metadata or {}), row["id"]),
                )
                conn.commit()
                return str(row["id"])

            pattern_id = str(uuid.uuid4())
            conn.execute(
                """
                INSERT INTO address_patterns (
                    id, country_code, city, street, house_number, corpus,
                    pattern_type, frequency, first_seen, last_seen, is_confirmed, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pattern_id,
                    address.get("country"),
                    address.get("locality"),
                    address.get("road"),
                    address.get("house_number"),
                    address.get("corpus"),
                    pattern_type,
                    1,
                    now,
                    now,
                    int(is_confirmed),
                    json.dumps(metadata or {}),
                ),
            )
            conn.commit()
        return pattern_id

    def insert_hotspot_event(
        self,
        utterance_id: str | None,
        transcript: str,
        parsed_address: dict[str, Any],
        novelty_score: float,
        reasons: list[str],
        text_variants: list[str],
        synthetic_jobs: list[dict[str, Any]],
    ) -> str:
        hotspot_id = str(uuid.uuid4())
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO hotspot_events (
                    id, utterance_id, transcript, parsed_address_json, novelty_score,
                    reasons_json, text_variants_json, synthetic_jobs_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    hotspot_id,
                    utterance_id,
                    transcript,
                    json.dumps(parsed_address),
                    novelty_score,
                    json.dumps(reasons),
                    json.dumps(text_variants),
                    json.dumps(synthetic_jobs),
                    _utc_now(),
                ),
            )
            conn.commit()
        return hotspot_id

    def get_status(self) -> dict[str, Any]:
        with self._connect() as conn:
            counts = {
                "raw_utterances": conn.execute("SELECT COUNT(*) FROM raw_utterances").fetchone()[0],
                "training_samples": conn.execute("SELECT COUNT(*) FROM training_samples").fetchone()[0],
                "feedback": conn.execute("SELECT COUNT(*) FROM feedback").fetchone()[0],
                "address_patterns": conn.execute("SELECT COUNT(*) FROM address_patterns").fetchone()[0],
                "hotspot_events": conn.execute("SELECT COUNT(*) FROM hotspot_events").fetchone()[0],
            }
            latest_version = conn.execute(
                "SELECT model_type, version_tag, metrics_json, created_at FROM model_versions ORDER BY created_at DESC LIMIT 1"
            ).fetchone()
            version = dict(latest_version) if latest_version else None
            if version and version.get("metrics_json"):
                version["metrics"] = json.loads(version.pop("metrics_json"))
        return {"counts": counts, "model_version": version}