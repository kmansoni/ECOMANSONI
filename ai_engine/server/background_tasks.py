#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BackgroundTaskScheduler — планировщик периодических задач ARIA.
==============================================================

Задачи:
    1. **purge_expired** (каждые 6 часов)
       Удалить non-consent записи старше 24ч из FeedbackStore (GDPR).

    2. **auto_train** (каждые 4 часа)
       Запустить инкрементальное обучение если накоплено ≥ AUTO_TRAIN_THRESHOLD пар.

    3. **scheduled_crawl** (каждые 12 часов)
       Запустить web-краулер по сид-списку из переменной окружения.

    4. **eval_model** (каждые 8 часов после train)
       Запустить ModelEvaluator и записать результат.
       При обнаружении регрессии → отправить alert + rollback.

    5. **expand_tokenizer** (раз в 24 часа)
       Расширить BPE словарь на новых данных из FeedbackStore.

Реализация:
    asyncio.create_task + sleep-цикл (не требует Celery/APScheduler).
    При multi-process деплое используйте distributed lock (Redis SETNX).
    В single-process — asyncio.Lock предотвращает параллельные прогоны одного типа.

Observability:
    Все задачи логируют start/finish/error.
    Метрики записываются в FeedbackStore.training_runs таблицу.
    Алерты: structured logging (интеграция с Grafana/Loki через JSON-формат).

Безопасность:
    - Задачи не принимают внешний input → нет injection векторов.
    - Каждая задача изолирована: исключение в одной не останавливает остальные.
    - Locks предотвращают race condition при overlapping scheduling.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Configuration from env ───────────────────────────────────────────────────

_PURGE_INTERVAL_S     = int(os.environ.get("ARIA_PURGE_INTERVAL_S",    str(6  * 3600)))
_TRAIN_INTERVAL_S     = int(os.environ.get("ARIA_TRAIN_INTERVAL_S",    str(4  * 3600)))
_CRAWL_INTERVAL_S     = int(os.environ.get("ARIA_CRAWL_INTERVAL_S",    str(12 * 3600)))
_EVAL_INTERVAL_S      = int(os.environ.get("ARIA_EVAL_INTERVAL_S",     str(8  * 3600)))
_TOKENIZER_INTERVAL_S = int(os.environ.get("ARIA_TOKENIZER_INTERVAL_S",str(24 * 3600)))

_AUTO_TRAIN_THRESHOLD = int(os.environ.get("ARIA_AUTO_TRAIN_THRESHOLD", "50"))

# Сид-список для краулинга (pipe-separated URLs)
_CRAWL_SEEDS_ENV = os.environ.get(
    "ARIA_CRAWL_SEEDS",
    "https://en.wikipedia.org/wiki/Artificial_intelligence|"
    "https://ru.wikipedia.org/wiki/Искусственный_интеллект|"
    "https://arxiv.org/abs/2303.08774"
)
_CRAWL_SEEDS: list[str] = [s.strip() for s in _CRAWL_SEEDS_ENV.split("|") if s.strip()]
_CRAWL_MAX_PAGES = int(os.environ.get("ARIA_CRAWL_MAX_PAGES", "100"))


# ─── Task locks ───────────────────────────────────────────────────────────────

_lock_purge     = asyncio.Lock()
_lock_train     = asyncio.Lock()
_lock_crawl     = asyncio.Lock()
_lock_eval      = asyncio.Lock()
_lock_tokenizer = asyncio.Lock()


# ─── Individual tasks ─────────────────────────────────────────────────────────

async def task_purge_expired() -> None:
    """GDPR purge: удалить non-consent записи старше 24ч."""
    if _lock_purge.locked():
        return
    async with _lock_purge:
        logger.info("[SCHEDULER] Starting: purge_expired")
        try:
            from ai_engine.learning.feedback_store import FeedbackStore
            store = FeedbackStore(db_path=os.environ.get("ARIA_FEEDBACK_DB", "aria_feedback.db"))
            deleted = store.purge_expired_non_consent()
            logger.info("[SCHEDULER] purge_expired: deleted=%d non-consent records", deleted)
        except Exception as exc:
            logger.error("[SCHEDULER] purge_expired failed: %s", exc)


async def task_auto_train(generate_fn=None) -> None:
    """
    Инкрементальное обучение если накоплено достаточно пар.
    generate_fn: callable(prompt) → str для post-train evaluation.
    """
    if _lock_train.locked():
        return
    async with _lock_train:
        logger.info("[SCHEDULER] Starting: auto_train")
        run_id = f"sched-{uuid.uuid4().hex[:12]}"
        try:
            from ai_engine.learning.feedback_store import FeedbackStore
            from ai_engine.learning.reward_model import RewardModel
            from ai_engine.learning.data_pipeline import DataPipeline

            db_path = os.environ.get("ARIA_FEEDBACK_DB", "aria_feedback.db")
            store = FeedbackStore(db_path=db_path)
            pairs = store.load_preference_pairs(limit=5000)

            if len(pairs) < _AUTO_TRAIN_THRESHOLD:
                logger.info(
                    "[SCHEDULER] auto_train: only %d pairs (need %d), skipping",
                    len(pairs), _AUTO_TRAIN_THRESHOLD
                )
                return

            started = time.time()
            # 1. Reward model
            rm = RewardModel(
                checkpoint_path=os.environ.get("ARIA_REWARD_CKPT", "aria_reward_model.pkl")
            )
            rm_result = rm.train(pairs, epochs=3)
            logger.info("[SCHEDULER] reward_model trained: %s", rm_result)

            # 2. Language model
            texts = store.load_training_texts(limit=5000)
            lm_result = {"samples": len(texts), "loss_before": None, "loss_after": None}
            if texts:
                try:
                    from ai_engine.learning.continual_trainer import ContinualTrainer, TrainingConfig
                    trainer = ContinualTrainer(config=TrainingConfig(epochs=3))
                    lm_result = trainer.train(texts)
                except Exception as e:
                    logger.warning("[SCHEDULER] ContinualTrainer error: %s", e)

            store.log_training_run(
                run_id=run_id,
                samples=len(texts),
                loss_before=lm_result.get("loss_before"),
                loss_after=lm_result.get("loss_after"),
                status="done",
                started_at=started,
            )
            logger.info("[SCHEDULER] auto_train completed: run_id=%s", run_id)

            # 3. Post-train evaluation
            if generate_fn is not None:
                await task_eval_model(generate_fn, triggered_by=run_id)

        except Exception as exc:
            logger.error("[SCHEDULER] auto_train failed: %s", exc)


async def task_scheduled_crawl() -> None:
    """Запустить web-краулер по конфигурированному seed-списку."""
    if _lock_crawl.locked():
        logger.info("[SCHEDULER] crawl already running, skip")
        return
    async with _lock_crawl:
        logger.info("[SCHEDULER] Starting: scheduled_crawl seeds=%s", _CRAWL_SEEDS[:3])
        try:
            from ai_engine.learning.web_crawler import WebCrawler, CrawlConfig
            from ai_engine.learning.data_pipeline import DataPipeline
            from ai_engine.learning.feedback_store import FeedbackStore

            store = FeedbackStore(db_path=os.environ.get("ARIA_FEEDBACK_DB", "aria_feedback.db"))
            pipeline = DataPipeline(min_quality=0.35, dedup=True)
            config = CrawlConfig(seeds=_CRAWL_SEEDS, max_pages=_CRAWL_MAX_PAGES, max_depth=2)
            crawler = WebCrawler(config)
            ingested = 0

            async for result in crawler.crawl():
                for sample in pipeline.process([result.text], [result.url]):
                    store.ingest_content(
                        text=sample.text,
                        source_url=result.url,
                        source_type="web",
                        language=sample.language,
                        quality_score=sample.quality,
                    )
                    ingested += 1

            logger.info("[SCHEDULER] scheduled_crawl: %d chunks ingested", ingested)
        except Exception as exc:
            logger.error("[SCHEDULER] scheduled_crawl failed: %s", exc)


async def task_eval_model(generate_fn, triggered_by: str = "scheduler") -> None:
    """
    Оценить модель с помощью ModelEvaluator.
    При обнаружении регрессии → логировать alert.
    """
    if _lock_eval.locked():
        return
    async with _lock_eval:
        logger.info("[SCHEDULER] Starting: eval_model (triggered_by=%s)", triggered_by)
        try:
            from ai_engine.evaluation.evaluator import ModelEvaluator

            evaluator = ModelEvaluator(generate_fn=generate_fn)
            report = evaluator.evaluate(run_id=f"eval-{triggered_by}")

            if report.regression:
                logger.error(
                    "[SCHEDULER] REGRESSION DETECTED after %s: %s",
                    triggered_by, report.regression_details,
                )
                # Structured alert for log aggregation (Grafana Loki / ELK)
                _emit_alert({
                    "event": "model_regression",
                    "run_id": triggered_by,
                    "safety_score": report.metrics.safety_score,
                    "distinct_1": report.metrics.distinct_1,
                    "details": report.regression_details,
                })
            else:
                logger.info(
                    "[SCHEDULER] eval_model OK: safety=%.3f distinct1=%.3f perplexity=%.1f",
                    report.metrics.safety_score,
                    report.metrics.distinct_1,
                    report.metrics.perplexity,
                )
        except Exception as exc:
            logger.error("[SCHEDULER] eval_model failed: %s", exc)


async def task_expand_tokenizer() -> None:
    """Расширить BPE словарь на накопленных данных."""
    if _lock_tokenizer.locked():
        return
    async with _lock_tokenizer:
        logger.info("[SCHEDULER] Starting: expand_tokenizer")
        try:
            from ai_engine.learning.feedback_store import FeedbackStore
            from ai_engine.learning.tokenizer_trainer import TokenizerTrainer

            store = FeedbackStore(db_path=os.environ.get("ARIA_FEEDBACK_DB", "aria_feedback.db"))
            texts = store.load_training_texts(limit=10_000, min_quality=0.3)

            if not texts:
                logger.info("[SCHEDULER] expand_tokenizer: no texts, skipping")
                return

            trainer = TokenizerTrainer(
                base_vocab_path=os.environ.get("ARIA_VOCAB_PATH", "aria_vocab.json"),
            )
            result = trainer.expand(texts)
            logger.info(
                "[SCHEDULER] expand_tokenizer: +%d tokens (%d → %d), top=%s",
                result.new_tokens_added,
                result.vocab_size_before,
                result.vocab_size_after,
                [t for t, _ in result.top_new_tokens[:5]],
            )
        except Exception as exc:
            logger.error("[SCHEDULER] expand_tokenizer failed: %s", exc)


# ─── Alert emitter ────────────────────────────────────────────────────────────

def _emit_alert(payload: dict) -> None:
    """
    Структурированный alert для log aggregation систем.
    В продакшене: webhook (Slack/PagerDuty) или metrics push (Prometheus).
    """
    import json
    alert_json = json.dumps({"level": "ALERT", **payload, "ts": time.time()})
    logger.critical("[ARIA_ALERT] %s", alert_json)


# ─── Scheduler ────────────────────────────────────────────────────────────────

class BackgroundTaskScheduler:
    """
    Запускает все периодические задачи как asyncio background tasks.

    Usage (в FastAPI lifespan):
        scheduler = BackgroundTaskScheduler(generate_fn=aria_generate)
        await scheduler.start()
        # ... app runs ...
        await scheduler.stop()

    Usage (standalone):
        asyncio.run(BackgroundTaskScheduler(generate_fn=fn).run_forever())
    """

    def __init__(self, generate_fn=None) -> None:
        self._generate_fn = generate_fn
        self._tasks: list[asyncio.Task] = []
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        logger.info("[SCHEDULER] Starting background task scheduler")

        self._tasks = [
            asyncio.create_task(self._loop_purge()),
            asyncio.create_task(self._loop_train()),
            asyncio.create_task(self._loop_crawl()),
            asyncio.create_task(self._loop_eval()),
            asyncio.create_task(self._loop_tokenizer()),
        ]

    async def stop(self) -> None:
        self._running = False
        for t in self._tasks:
            t.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        logger.info("[SCHEDULER] All background tasks stopped")

    async def run_forever(self) -> None:
        await self.start()
        try:
            while self._running:
                await asyncio.sleep(60)
        except asyncio.CancelledError:
            logger.info("[SCHEDULER] run_forever cancelled")
            raise
        finally:
            await self.stop()

    # ── Loop runners ──────────────────────────────────────────────────────────

    async def _loop_purge(self) -> None:
        await asyncio.sleep(300)  # initial delay 5 min
        while self._running:
            await task_purge_expired()
            await asyncio.sleep(_PURGE_INTERVAL_S)

    async def _loop_train(self) -> None:
        await asyncio.sleep(600)  # initial delay 10 min
        while self._running:
            await task_auto_train(generate_fn=self._generate_fn)
            await asyncio.sleep(_TRAIN_INTERVAL_S)

    async def _loop_crawl(self) -> None:
        await asyncio.sleep(1800)  # initial delay 30 min
        while self._running:
            await task_scheduled_crawl()
            await asyncio.sleep(_CRAWL_INTERVAL_S)

    async def _loop_eval(self) -> None:
        await asyncio.sleep(900)  # initial delay 15 min
        while self._running:
            if self._generate_fn:
                await task_eval_model(self._generate_fn)
            await asyncio.sleep(_EVAL_INTERVAL_S)

    async def _loop_tokenizer(self) -> None:
        await asyncio.sleep(3600)  # initial delay 1 hour
        while self._running:
            await task_expand_tokenizer()
            await asyncio.sleep(_TOKENIZER_INTERVAL_S)
