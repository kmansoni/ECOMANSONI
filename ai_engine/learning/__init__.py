#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ARIA Learning Module
====================
Continual learning pipeline: user feedback → reward modelling →
LoRA fine-tuning → web crawl ingestion → BPE vocab expansion.

Public API
----------
    from ai_engine.learning import (
        FeedbackStore,
        DataPipeline,
        WebCrawler,
        ContinualTrainer,
        RewardModel,
        TokenizerTrainer,
    )
"""

from .feedback_store import FeedbackStore, FeedbackRecord, FeedbackRating
from .data_pipeline import DataPipeline, DataSample
from .web_crawler import WebCrawler, CrawlConfig
from .continual_trainer import ContinualTrainer, TrainingConfig
from .reward_model import RewardModel, PreferenceRecord
from .tokenizer_trainer import TokenizerTrainer, TokenizerExpansionResult

__all__ = [
    "FeedbackStore",
    "FeedbackRecord",
    "FeedbackRating",
    "DataPipeline",
    "DataSample",
    "WebCrawler",
    "CrawlConfig",
    "ContinualTrainer",
    "TrainingConfig",
    "RewardModel",
    "PreferenceRecord",
    "TokenizerTrainer",
    "TokenizerExpansionResult",
]
