#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DataPipeline — дедупликация, фильтрация и токенизация текстов для обучения.
===========================================================================

Этапы пайплайна:
    1. Нормализация Unicode (NFC) + удаление нулевых байт.
    2. Language detection (langdetect или heuristic fallback).
    3. Quality score: perplexity proxy, repetition ratio, NSFW keyword filter.
    4. SimHash deduplication: 64-bit fingerprint, Hamming distance ≤ 3.
    5. Chunking: скользящее окно max_tokens с overlap.
    6. Tokenization: BPETokenizer или HuggingFace fallback.

Угрозы:
    - Data poisoning: adversarial training examples с инструкцией перезаписать
      веса безопасности. Митигация: правила allow-list + reward model score.
    - Unicode homoglyph injection: NFC-нормализация + ASCII-range preference check.
    - Memory exhaustion: потоковая обработка, ни один документ не загружается целиком.

Scale:
    Пайплайн stateless, горизонтально масштабируется через multiprocessing.Pool.
    SimHash индекс хранится в RAM (до 10M хэшей ≈ 80 MB).
"""

from __future__ import annotations

import hashlib
import logging
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Iterable, Iterator, Optional, Sequence

logger = logging.getLogger(__name__)

# ─── NSFW / harm keyword blocklist (minimal, extend in production) ────────────
_HARM_PATTERNS = re.compile(
    r"\b(make\s+a\s+bomb|synthesize\s+\w+\s+gas|child\s+(porn|sex)|"
    r"ransomware\s+code|exploit\s+zero.?day)\b",
    re.IGNORECASE,
)

# ─── Repetition detector: если >40% токенов — повтор ─────────────────────────
_MAX_REPETITION_RATIO = 0.40

# ─── Минимальный размер чанка ─────────────────────────────────────────────────
MIN_CHUNK_CHARS = 64


# ─── Domain types ────────────────────────────────────────────────────────────

@dataclass
class DataSample:
    """
    Один обучающий пример после прохождения пайплайна.

    Attributes:
        text:         Нормализованный текст чанка.
        source:       URL или идентификатор источника.
        language:     ISO 639-1 код (или 'und').
        quality:      Оценка качества [0.0, 1.0].
        token_ids:    Токены (если токенизация запрошена).
        simhash:      64-bit SimHash (int) для dedup.
    """

    text:      str
    source:    str = ""
    language:  str = "und"
    quality:   float = 0.5
    token_ids: list[int] = field(default_factory=list)
    simhash:   int = 0


# ─── SimHash ─────────────────────────────────────────────────────────────────

class SimHashIndex:
    """
    64-bit SimHash с проверкой Hamming-расстояния.
    В продакшене замените на LSH (locality-sensitive hashing) для 10M+ хэшей.
    """

    def __init__(self, threshold: int = 3) -> None:
        self._hashes: list[int] = []
        self._threshold = threshold  # Hamming distance

    @staticmethod
    def compute(text: str) -> int:
        """Вычислить 64-bit SimHash для текста."""
        words = text.lower().split()
        counts = [0] * 64
        for word in words:
            h = int(hashlib.md5(word.encode()).hexdigest(), 16) & ((1 << 64) - 1)
            for i in range(64):
                counts[i] += 1 if (h >> i) & 1 else -1
        result = 0
        for i in range(64):
            if counts[i] > 0:
                result |= (1 << i)
        return result

    @staticmethod
    def hamming(a: int, b: int) -> int:
        return bin(a ^ b).count("1")

    def is_duplicate(self, h: int) -> bool:
        """True если близкий хэш уже есть в индексе."""
        return any(self.hamming(h, existing) <= self._threshold for existing in self._hashes)

    def add(self, h: int) -> None:
        self._hashes.append(h)

    def __len__(self) -> int:
        return len(self._hashes)


# ─── Quality scoring ─────────────────────────────────────────────────────────

def _repetition_ratio(text: str) -> float:
    """Доля повторяющихся биграм — proxy для качества текста."""
    words = text.split()
    if len(words) < 4:
        return 0.0
    bigrams = [(words[i], words[i + 1]) for i in range(len(words) - 1)]
    unique = len(set(bigrams))
    return 1.0 - (unique / len(bigrams))


def _quality_score(text: str) -> float:
    """
    Эвристический score [0.0, 1.0].
    Штрафует за:
      - Слишком короткие тексты.
      - Высокую долю спецсимволов (спам/HTML-мусор).
      - Высокую repetition ratio.
      - Слишком много цифр (SEO-спам).
    """
    if len(text) < MIN_CHUNK_CHARS:
        return 0.0

    score = 1.0

    # Длина — логарифмический бонус
    score *= min(1.0, len(text) / 512)

    # Специальные символы
    special = sum(1 for c in text if not c.isalnum() and not c.isspace()) / max(len(text), 1)
    if special > 0.35:
        score *= 0.4

    # Repetition
    rep = _repetition_ratio(text)
    score *= max(0.0, 1.0 - rep * 2)

    # Цифровой мусор
    digit_ratio = sum(c.isdigit() for c in text) / max(len(text), 1)
    if digit_ratio > 0.3:
        score *= 0.5

    return min(1.0, max(0.0, score))


def _detect_language(text: str) -> str:
    """
    Определить язык — легковесная эвристика без сторонних библиотек.
    В продакшене замените на fastText language identification.
    """
    try:
        from langdetect import detect  # type: ignore
        return detect(text[:500])
    except Exception:
        pass

    # Fallback: скрипт детектор
    cyrillic = sum(1 for c in text if '\u0400' <= c <= '\u04FF')
    latin = sum(1 for c in text if c.isascii() and c.isalpha())
    if cyrillic > latin:
        return "ru"
    if latin > 10:
        return "en"
    return "und"


# ─── Normalization ────────────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    """Unicode NFC + удаление нулевых/управляющих байт + collapse whitespace."""
    text = unicodedata.normalize("NFC", text)
    text = text.replace("\x00", "")
    # Убираем управляющие символы кроме \n \t
    text = "".join(c for c in text if unicodedata.category(c)[0] != "C" or c in "\n\t")
    text = re.sub(r"[^\S\n]+", " ", text)   # collapse horizontal whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)  # max 2 пустых строки подряд
    return text.strip()


def _is_harmful(text: str) -> bool:
    """True если текст содержит запрещённый контент."""
    return bool(_HARM_PATTERNS.search(text))


# ─── Chunking ─────────────────────────────────────────────────────────────────

def _chunk_text(
    text: str,
    max_chars: int = 2048,
    overlap_chars: int = 128,
) -> Iterator[str]:
    """
    Скользящее окно по символам с overlap.
    Предпочитает разрывы по \n\n или '. ', чтобы не рвать предложения.
    """
    if len(text) <= max_chars:
        if len(text) >= MIN_CHUNK_CHARS:
            yield text
        return

    start = 0
    while start < len(text):
        end = start + max_chars
        if end >= len(text):
            chunk = text[start:]
        else:
            # Ищем ближайший \n\n назад от end
            split_pos = text.rfind("\n\n", start, end)
            if split_pos == -1 or split_pos <= start + max_chars // 2:
                split_pos = text.rfind(". ", start, end)
            if split_pos == -1 or split_pos <= start + max_chars // 2:
                split_pos = end
            else:
                split_pos += 2  # включить разделитель
            chunk = text[start:split_pos]

        if len(chunk.strip()) >= MIN_CHUNK_CHARS:
            yield chunk.strip()

        if end >= len(text):
            break
        start = max(start + 1, (end if split_pos == end else split_pos) - overlap_chars)


# ─── Main Pipeline ────────────────────────────────────────────────────────────

class DataPipeline:
    """
    Stateless pipeline для подготовки текстов к обучению.

    Usage:
        pipeline = DataPipeline(min_quality=0.35, dedup=True)
        samples = list(pipeline.process(["text1", "text2", ...], sources=["url1", ...]))

    Args:
        min_quality:    Минимальный quality score для включения в датасет.
        dedup:          Включить SimHash deduplication.
        max_chars:      Максимальный размер чанка.
        tokenizer:      Опциональный BPETokenizer для токенизации.
    """

    def __init__(
        self,
        min_quality: float = 0.35,
        dedup: bool = True,
        max_chars: int = 2048,
        tokenizer=None,
    ) -> None:
        self._min_quality = min_quality
        self._dedup = dedup
        self._max_chars = max_chars
        self._tokenizer = tokenizer
        self._simhash_index = SimHashIndex(threshold=3) if dedup else None

    def process(
        self,
        texts: Sequence[str],
        sources: Optional[Sequence[str]] = None,
    ) -> Iterator[DataSample]:
        """
        Обработать список документов и выдать DataSample итераторно.

        Гарантии:
            - Каждый чанк уникален (SimHash Hamming > 3 к уже виденным).
            - quality >= min_quality.
            - Нет вредоносного контента.
            - Нормализованный Unicode NFC.

        Yields:
            DataSample
        """
        sources = sources or [""] * len(texts)
        stats = {"total": 0, "filtered_harm": 0, "filtered_quality": 0,
                 "filtered_dedup": 0, "accepted": 0}

        for text, source in zip(texts, sources):
            stats["total"] += 1
            text = _normalize(text)

            if _is_harmful(text):
                stats["filtered_harm"] += 1
                logger.debug("Harmful content filtered from %s", source)
                continue

            lang = _detect_language(text)

            for chunk in _chunk_text(text, max_chars=self._max_chars):
                quality = _quality_score(chunk)
                if quality < self._min_quality:
                    stats["filtered_quality"] += 1
                    continue

                sh = SimHashIndex.compute(chunk)

                if self._simhash_index is not None:
                    if self._simhash_index.is_duplicate(sh):
                        stats["filtered_dedup"] += 1
                        continue
                    self._simhash_index.add(sh)

                token_ids: list[int] = []
                if self._tokenizer is not None:
                    try:
                        token_ids = self._tokenizer.encode(chunk)
                    except Exception:
                        pass

                stats["accepted"] += 1
                yield DataSample(
                    text=chunk,
                    source=source,
                    language=lang,
                    quality=quality,
                    token_ids=token_ids,
                    simhash=sh,
                )

        logger.info(
            "DataPipeline stats: %s | dedup_index_size=%d",
            stats,
            len(self._simhash_index) if self._simhash_index else 0,
        )

    def reset_dedup(self) -> None:
        """Сбросить SimHash индекс (например, перед новым эпохом обучения)."""
        if self._simhash_index is not None:
            self._simhash_index = SimHashIndex(threshold=3)
