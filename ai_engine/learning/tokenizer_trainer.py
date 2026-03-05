#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TokenizerTrainer — динамическое расширение BPE словаря ARIA на новых данных.
============================================================================

Проблема:
    Исходный BPETokenizer обучен на seed-корпусе (training_seeds/).
    По мере накопления пользовательского контента и веб-краулинга
    появляются новые термины, сленг, доменная лексика (мед., юр., код.).
    Токенизация незнакомых слов ведёт к excessive fragmentation:
    "GPT-4o" → ["G", "PT", "-", "4", "o"] вместо ["GPT", "-4o"].

Решение:
    1. Собрать новый корпус из FeedbackStore (training texts).
    2. Вычислить frequency distribution новых bigrams.
    3. Merge только пары, которые:
       a) Встречаются ≥ MIN_FREQ раз в новом корпусе.
       b) Отсутствуют в существующем vocab (чистое расширение, не замена).
       c) Не нарушают MAX_VOCAB_SIZE лимит.
    4. Сохранить расширенный vocab в файл (версионированный).
    5. Не пересоздавать токенизатор: patch-only подход.

Безопасность:
    - Новые токены валидируются против NSFW wordlist.
    - Максимум 1000 новых токенов за прогон (предотвращает vocabulary explosion).
    - Атомарное обновление vocab файла (write → rename).
    - Версионирование: каждый расширенный vocab сохраняется с timestamp.

Catastrophic forgetting protection:
    - Старые токены НИКОГДА не удаляются (только добавляются).
    - ID старых токенов не меняются (stable embeddings).
    - Новые токены добавляются с ID = max_existing_id + 1..N.
    - ContinualTrainer после этого дообучает только embedding слой для новых ID.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import time
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Sequence

logger = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

MIN_PAIR_FREQ    = 5       # минимальное число вхождений пары для добавления
MAX_NEW_TOKENS   = 1000    # максимум новых токенов за один прогон
MAX_VOCAB_SIZE   = 65_536  # жёсткий лимит словаря

# Паттерн для слов-кандидатов (только буквенно-цифровые + дефис/точка)
_WORD_PATTERN = re.compile(r"[A-Za-z0-9\u0400-\u04FF][\w\-\.]*[A-Za-z0-9\u0400-\u04FF]|[A-Za-z0-9\u0400-\u04FF]")

# NSFW blocklist для новых токенов
_NSFW_TOKENS = frozenset({
    "porn", "xxx", "nude", "nsfw", "hentai", "rape",
    "nigger", "faggot",  # slurs
})


@dataclass
class TokenizerExpansionResult:
    """
    Результат расширения словаря.

    Attributes:
        new_tokens_added: Число добавленных токенов.
        vocab_size_before: Размер словаря до расширения.
        vocab_size_after:  Размер словаря после расширения.
        top_new_tokens:    Топ-20 добавленных токенов по частоте.
        checkpoint_path:   Путь к обновлённому vocab файлу.
    """

    new_tokens_added:  int
    vocab_size_before: int
    vocab_size_after:  int
    top_new_tokens:    list[tuple[str, int]] = field(default_factory=list)
    checkpoint_path:   str = ""


class TokenizerTrainer:
    """
    Инкрементальный расширитель BPE словаря.

    Usage:
        trainer = TokenizerTrainer(
            base_vocab_path="aria_vocab.json",
            corpus_texts=["new texts from crawler..."],
        )
        result = trainer.expand()
        print(f"Added {result.new_tokens_added} new tokens")

    Алгоритм:
        1. Загрузить существующий vocab из base_vocab_path.
        2. Построить frequency map всех слов в корпусе.
        3. Разбить слова на символьные пары BPE-стилем.
        4. Выбрать пары с freq >= MIN_PAIR_FREQ, которых нет в vocab.
        5. Добавить до MAX_NEW_TOKENS пар.
        6. Сохранить расширенный vocab атомарно.
    """

    def __init__(
        self,
        base_vocab_path: str | Path = "aria_vocab.json",
        output_path: Optional[str | Path] = None,
        min_freq: int = MIN_PAIR_FREQ,
        max_new_tokens: int = MAX_NEW_TOKENS,
    ) -> None:
        self._base_vocab_path = Path(base_vocab_path)
        self._output_path = Path(output_path or base_vocab_path)
        self._min_freq = min_freq
        self._max_new_tokens = max_new_tokens
        self._vocab: dict[str, int] = {}
        self._merges: list[tuple[str, str]] = []

    # ── Vocab I/O ─────────────────────────────────────────────────────────────

    def _load_vocab(self) -> None:
        """Загрузить vocab из JSON. Если не существует — создать пустой."""
        if self._base_vocab_path.exists():
            try:
                with open(self._base_vocab_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._vocab = data.get("vocab", {})
                self._merges = [tuple(m) for m in data.get("merges", [])]
                logger.info("Loaded vocab: %d tokens", len(self._vocab))
            except Exception as exc:
                logger.warning("Vocab load failed: %s, starting fresh", exc)
                self._vocab = {}
                self._merges = []
        else:
            logger.info("No vocab found at %s, starting fresh", self._base_vocab_path)
            self._vocab = {}
            self._merges = []

    def _save_vocab(self) -> str:
        """
        Атомарное сохранение vocab:
        1. Записываем во временный файл.
        2. Rename (атомарная операция на POSIX); на Windows — копируем.
        Версионированная резервная копия с timestamp.
        """
        data = {
            "vocab": self._vocab,
            "merges": [list(m) for m in self._merges],
            "version": int(time.time()),
            "size": len(self._vocab),
        }
        tmp_path = self._output_path.with_suffix(".tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        # Backup current
        if self._output_path.exists():
            backup = self._output_path.with_suffix(f".bak.{int(time.time())}")
            shutil.copy2(self._output_path, backup)

        # Atomic rename
        try:
            os.replace(tmp_path, self._output_path)
        except OSError:
            shutil.copy2(tmp_path, self._output_path)
            os.unlink(tmp_path)

        logger.info("Vocab saved: %d tokens → %s", len(self._vocab), self._output_path)
        return str(self._output_path)

    # ── BPE expansion core ────────────────────────────────────────────────────

    @staticmethod
    def _tokenize_word(word: str) -> list[str]:
        """Разбить слово на символы + маркер конца слова </w>."""
        return list(word) + ["</w>"]

    @staticmethod
    def _get_pairs(word_tokens: list[str]) -> list[tuple[str, str]]:
        """Получить все соседние пары токенов."""
        return [(word_tokens[i], word_tokens[i+1]) for i in range(len(word_tokens)-1)]

    def _build_word_freqs(self, texts: Sequence[str]) -> Counter:
        """Подсчёт частоты слов во всём корпусе."""
        word_freq: Counter = Counter()
        for text in texts:
            words = _WORD_PATTERN.findall(text.lower())
            word_freq.update(words)
        return word_freq

    def _build_pair_freqs(self, word_freqs: Counter) -> Counter:
        """Подсчёт частоты пар символов (BPE-стиль)."""
        pair_freq: Counter = Counter()
        for word, freq in word_freqs.items():
            tokens = self._tokenize_word(word)
            for pair in self._get_pairs(tokens):
                pair_freq[pair] += freq
        return pair_freq

    def _is_nsfw_token(self, token: str) -> bool:
        """True если токен содержит NSFW слово."""
        lower = token.lower().replace("</w>", "")
        return any(nsfw in lower for nsfw in _NSFW_TOKENS)

    # ── Main expand ───────────────────────────────────────────────────────────

    def expand(self, texts: Sequence[str]) -> TokenizerExpansionResult:
        """
        Расширить словарь на основе нового корпуса текстов.

        Args:
            texts: Список текстов (из WebCrawler, FeedbackStore, platform content).

        Returns:
            TokenizerExpansionResult с метриками расширения.

        Алгоритм:
            1. Загрузить существующий vocab.
            2. Построить word frequencies из новых текстов.
            3. Получить pair frequencies по BPE.
            4. Выбрать top-N пар (freq >= min_freq, нет в vocab, не NSFW).
            5. Добавить как новые merge rules + vocab tokens.
            6. Сохранить атомарно.
        """
        if not texts:
            logger.warning("TokenizerTrainer.expand: empty corpus, nothing to do")
            return TokenizerExpansionResult(0, 0, 0)

        self._load_vocab()
        vocab_size_before = len(self._vocab)

        logger.info("Building word frequencies from %d texts...", len(texts))
        word_freqs = self._build_word_freqs(texts)
        logger.info("Unique words in corpus: %d", len(word_freqs))

        pair_freqs = self._build_pair_freqs(word_freqs)
        logger.info("Unique pairs: %d", len(pair_freqs))

        # Существующий набор токенов для быстрой проверки
        existing_tokens = set(self._vocab.keys())
        next_id = max(self._vocab.values(), default=-1) + 1

        # Отсортировать пары по частоте и выбрать кандидатов
        sorted_pairs = pair_freqs.most_common()
        new_tokens: list[tuple[str, int]] = []   # (token, freq)
        merges_added: list[tuple[str, str]] = []

        for pair, freq in sorted_pairs:
            if len(new_tokens) >= self._max_new_tokens:
                break
            if freq < self._min_freq:
                break

            merged = pair[0] + pair[1]
            merged_clean = merged.replace("</w>", "")

            if not merged_clean:
                continue
            if merged in existing_tokens:
                continue
            if self._is_nsfw_token(merged):
                logger.debug("NSFW token blocked: %s", merged)
                continue
            if next_id >= MAX_VOCAB_SIZE:
                logger.warning("MAX_VOCAB_SIZE=%d reached, stopping expansion", MAX_VOCAB_SIZE)
                break

            # Добавляем в vocab
            self._vocab[merged] = next_id
            existing_tokens.add(merged)
            merges_added.append(pair)
            new_tokens.append((merged_clean, freq))
            next_id += 1

        self._merges.extend(merges_added)

        checkpoint = ""
        if new_tokens:
            checkpoint = self._save_vocab()
            logger.info(
                "TokenizerTrainer: added %d new tokens. vocab: %d → %d",
                len(new_tokens), vocab_size_before, len(self._vocab),
            )
        else:
            logger.info("TokenizerTrainer: no new tokens to add (corpus may overlap with existing vocab)")

        return TokenizerExpansionResult(
            new_tokens_added=len(new_tokens),
            vocab_size_before=vocab_size_before,
            vocab_size_after=len(self._vocab),
            top_new_tokens=new_tokens[:20],
            checkpoint_path=checkpoint,
        )

    # ── Integration with BPETokenizer ─────────────────────────────────────────

    def patch_tokenizer(self, tokenizer) -> bool:
        """
        Применить расширенный vocab к уже загруженному BPETokenizer в памяти.
        Добавляет только новые token → id пары; не пересоздаёт токенизатор.

        Args:
            tokenizer: экземпляр ai_engine.BPETokenizer.

        Returns:
            True если патч применён, False если API не поддерживается.
        """
        if not hasattr(tokenizer, "vocab") or not hasattr(tokenizer, "merges"):
            logger.warning("patch_tokenizer: unknown tokenizer API, cannot patch")
            return False

        before = len(tokenizer.vocab)
        for token, token_id in self._vocab.items():
            if token not in tokenizer.vocab:
                tokenizer.vocab[token] = token_id

        for merge in self._merges:
            if merge not in tokenizer.merges:
                tokenizer.merges.append(merge)

        after = len(tokenizer.vocab)
        logger.info("patch_tokenizer: %d → %d tokens (+%d)", before, after, after - before)
        return True
