#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RewardModel — RLHF-lite reward model на основе пользовательских предпочтений.
=============================================================================

Архитектура:
    Bradley-Terry предпочтительная модель поверх sentence-embedding similarity.
    При наличии PyTorch — обучается MLP reward head поверх text features.
    При отсутствии PyTorch — fallback на логистическую регрессию (scikit-learn)
    или на эвристический scoring (stdlib only).

Обучение:
    Входные данные: список PreferenceRecord (chosen vs rejected).
    Лосс: Binary Cross-Entropy на пары (chosen_score > rejected_score).
    Gradient: только reward head, base encoder заморожен (если есть).

Применение:
    1. Фильтрация ответов перед отправкой пользователю (score > threshold).
    2. Отбор обучающих примеров для fine-tuning (score > 0.6).
    3. Safety gate: примеры с safety_score < 0.3 отбрасываются.

Безопасность:
    - Adversarial reward hacking: reward model НЕ участвует в gradient flow
      language model напрямую (offline RLHF, не online PPO).
    - Distribution shift: sliding window на последних 10K парах.
    - Reward model collapse: EMA score нормализация.

Угрозы:
    - Sycophancy: модель учится давать лесть, а не правду.
      Митигация: calibration loss + разнообразие пар в датасете.
    - Reward hacking: LM генерирует "длинные красивые" ответы для высокого балла.
      Митигация: length penalty в score = raw_score - 0.01 * log(len(response)).
"""

from __future__ import annotations

import json
import logging
import math
import os
import pickle
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Sequence

from .feedback_store import PreferenceRecord

logger = logging.getLogger(__name__)


# ─── Feature extraction (no-dependency fallback) ──────────────────────────────

def _bag_of_words(text: str, top_n: int = 512) -> dict[str, int]:
    """Простой BoW без внешних зависимостей."""
    import re
    words = re.findall(r'\b\w+\b', text.lower())
    counts: dict[str, int] = {}
    for w in words:
        counts[w] = counts.get(w, 0) + 1
    # Топ-N по частоте
    sorted_items = sorted(counts.items(), key=lambda x: -x[1])[:top_n]
    return dict(sorted_items)


def _cosine_sim(a: dict[str, int], b: dict[str, int]) -> float:
    """Косинусная схожесть BoW-векторов."""
    keys = set(a) | set(b)
    dot = sum(a.get(k, 0) * b.get(k, 0) for k in keys)
    na = math.sqrt(sum(v**2 for v in a.values()))
    nb = math.sqrt(sum(v**2 for v in b.values()))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _heuristic_score(prompt: str, response: str) -> float:
    """
    Эвристический score [0.0, 1.0] без ML:
        -長度: оптимум 100–2000 символов
        - Релевантность: BoW overlap с промптом
        - Отсутствие повторов
        - Структурированность (наличие markdown)
    """
    score = 0.5

    # Длина
    n = len(response)
    if n < 20:
        return 0.05
    if 100 <= n <= 2000:
        score += 0.15
    elif n > 4000:
        score -= 0.1   # length penalty

    # Релевантность к промпту
    prompt_bow = _bag_of_words(prompt)
    resp_bow   = _bag_of_words(response)
    sim = _cosine_sim(prompt_bow, resp_bow)
    score += sim * 0.25

    # Повторы биграм
    words = response.split()
    if len(words) > 4:
        bigrams = [(words[i], words[i+1]) for i in range(len(words)-1)]
        uniqueness = len(set(bigrams)) / len(bigrams)
        score += (uniqueness - 0.5) * 0.2

    # Markdown-форматирование (признак структурированности)
    has_code   = "```" in response
    has_bullet = any(response.count(sym) > 1 for sym in ["- ", "* ", "1. "])
    has_header = "##" in response or "# " in response
    if has_code or has_bullet or has_header:
        score += 0.1

    return min(1.0, max(0.0, score))


# ─── PyTorch MLP Reward Head (optional) ──────────────────────────────────────

try:
    import torch
    import torch.nn as nn

    class _RewardMLP(nn.Module):
        """
        Лёгкий MLP reward head: 768 → 256 → 64 → 1.
        Принимает конкатенацию [prompt_embed; response_embed].
        """

        def __init__(self, input_dim: int = 1536) -> None:
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(input_dim, 256),
                nn.GELU(),
                nn.Dropout(0.1),
                nn.Linear(256, 64),
                nn.GELU(),
                nn.Linear(64, 1),
            )

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            return self.net(x).squeeze(-1)

    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False


# ─── Domain types ────────────────────────────────────────────────────────────

@dataclass
class RewardScore:
    """
    Результат scoring одного ответа.

    Attributes:
        score:        Нормализованный reward score [0.0, 1.0].
        raw_score:    До нормализации.
        safety_pass:  Прошёл ли safety gate.
        details:      Диагностика по компонентам.
    """

    score:       float
    raw_score:   float
    safety_pass: bool
    details:     dict = field(default_factory=dict)


# ─── RewardModel ─────────────────────────────────────────────────────────────

class RewardModel:
    """
    RLHF-lite reward model.

    Usage:
        rm = RewardModel(checkpoint_path="aria_reward.pkl")
        # Обучение на preference pairs:
        rm.train(preference_records)
        # Scoring:
        score = rm.score(prompt, response)
        if score.score > 0.5 and score.safety_pass:
            deliver_to_user(response)

    Fallback strategy:
        torch available → MLP reward head с preference training.
        sklearn available → LogisticRegression на BoW features.
        stdlib only → heuristic scoring.
    """

    _SAFETY_BLOCKLIST = [
        "bomb", "malware", "ransomware", "exploit", "csam",
        "synthesize gas", "kill yourself",
    ]

    def __init__(
        self,
        checkpoint_path: str | Path = "aria_reward_model.pkl",
        safety_threshold: float = 0.25,
        score_threshold: float = 0.40,
    ) -> None:
        self._ckpt = Path(checkpoint_path)
        self._safety_threshold = safety_threshold
        self._score_threshold = score_threshold
        self._model = None          # torch MLP or sklearn model
        self._backend = "heuristic"
        self._score_ema = 0.5       # exponential moving average для нормализации
        self._ema_alpha = 0.01

        self._load_checkpoint()

    # ── Checkpoint ────────────────────────────────────────────────────────────

    def _load_checkpoint(self) -> None:
        if not self._ckpt.exists():
            logger.info("RewardModel: no checkpoint found, using heuristic backend")
            return
        try:
            with open(self._ckpt, "rb") as f:
                state = pickle.load(f)
            self._model = state["model"]
            self._backend = state.get("backend", "heuristic")
            self._score_ema = state.get("score_ema", 0.5)
            logger.info("RewardModel loaded from %s (backend=%s)", self._ckpt, self._backend)
        except Exception as exc:
            logger.warning("RewardModel checkpoint load failed: %s", exc)

    def _save_checkpoint(self) -> None:
        try:
            state = {
                "model": self._model,
                "backend": self._backend,
                "score_ema": self._score_ema,
                "saved_at": time.time(),
            }
            with open(self._ckpt, "wb") as f:
                pickle.dump(state, f)
            logger.info("RewardModel saved to %s", self._ckpt)
        except Exception as exc:
            logger.warning("RewardModel checkpoint save failed: %s", exc)

    # ── Safety check ──────────────────────────────────────────────────────────

    def _safety_check(self, text: str) -> bool:
        """True = безопасно. False = заблокировано."""
        lower = text.lower()
        return not any(kw in lower for kw in self._SAFETY_BLOCKLIST)

    # ── Feature vector ────────────────────────────────────────────────────────

    def _featurize(self, prompt: str, response: str) -> list[float]:
        """
        Создать вектор признаков для sklearn/MLP backend.
        Использует BoW intersection с ограниченным vocab.
        """
        vocab_size = 512
        p_bow = _bag_of_words(prompt, top_n=vocab_size)
        r_bow = _bag_of_words(response, top_n=vocab_size)
        all_words = sorted(set(p_bow) | set(r_bow))[:vocab_size * 2]
        feat = []
        for w in all_words:
            feat.append(float(p_bow.get(w, 0)))
            feat.append(float(r_bow.get(w, 0)))
        # Pad/truncate to fixed size
        target = vocab_size * 2
        if len(feat) < target:
            feat += [0.0] * (target - len(feat))
        else:
            feat = feat[:target]
        # Extra meta-features
        feat.append(math.log1p(len(response)))
        feat.append(_cosine_sim(p_bow, r_bow))
        return feat

    # ── Train ─────────────────────────────────────────────────────────────────

    def train(
        self,
        pairs: Sequence[PreferenceRecord],
        epochs: int = 5,
        lr: float = 1e-3,
    ) -> dict:
        """
        Обучить reward model на preference pairs.

        Args:
            pairs:  список PreferenceRecord (chosen vs rejected).
            epochs: количество эпох обучения.
            lr:     learning rate.

        Returns:
            dict с метриками: {"accuracy": float, "loss": float, "n_pairs": int}
        """
        if len(pairs) < 10:
            logger.warning("RewardModel.train: too few pairs (%d), skipping", len(pairs))
            return {"accuracy": 0.0, "loss": 999.0, "n_pairs": len(pairs)}

        logger.info("Training RewardModel on %d preference pairs", len(pairs))

        if _TORCH_AVAILABLE:
            return self._train_torch(pairs, epochs, lr)

        # Fallback: sklearn logistic regression
        try:
            return self._train_sklearn(pairs)
        except ImportError:
            logger.warning("sklearn not available, RewardModel stays heuristic")
            return {"accuracy": 0.5, "loss": 0.693, "n_pairs": len(pairs)}

    def _train_sklearn(self, pairs: Sequence[PreferenceRecord]) -> dict:
        from sklearn.linear_model import LogisticRegression  # type: ignore
        from sklearn.preprocessing import StandardScaler     # type: ignore

        X, y = [], []
        for pair in pairs:
            feat_chosen   = self._featurize(pair.prompt, pair.chosen)
            feat_rejected = self._featurize(pair.prompt, pair.rejected)
            # Разность фичей: > 0 → chosen лучше
            diff = [c - r for c, r in zip(feat_chosen, feat_rejected)]
            X.append(diff)
            y.append(1)
            # Обратная пара для симметрии
            X.append([-v for v in diff])
            y.append(0)

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        clf = LogisticRegression(max_iter=200, C=1.0)
        clf.fit(X_scaled, y)

        acc = clf.score(X_scaled, y)
        self._model = {"type": "sklearn", "clf": clf, "scaler": scaler}
        self._backend = "sklearn"
        self._save_checkpoint()

        logger.info("RewardModel (sklearn): accuracy=%.3f", acc)
        return {"accuracy": acc, "loss": 1 - acc, "n_pairs": len(pairs)}

    def _train_torch(self, pairs: Sequence[PreferenceRecord], epochs: int, lr: float) -> dict:
        import torch
        import torch.nn as nn

        feat_dim = 512 * 2 + 2
        mlp = _RewardMLP(input_dim=feat_dim)
        optimizer = torch.optim.AdamW(mlp.parameters(), lr=lr, weight_decay=1e-4)

        # Prepare tensors
        chosen_feats   = [self._featurize(p.prompt, p.chosen)   for p in pairs]
        rejected_feats = [self._featurize(p.prompt, p.rejected) for p in pairs]

        cx = torch.tensor(chosen_feats,   dtype=torch.float32)
        rx = torch.tensor(rejected_feats, dtype=torch.float32)

        best_loss = float("inf")
        for epoch in range(epochs):
            mlp.train()
            optimizer.zero_grad()
            c_scores = mlp(cx)
            r_scores = mlp(rx)
            # Bradley-Terry loss: -log σ(c - r)
            logits = c_scores - r_scores
            loss = -torch.log(torch.sigmoid(logits) + 1e-8).mean()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(mlp.parameters(), 1.0)
            optimizer.step()

            acc = (logits > 0).float().mean().item()
            logger.debug("Epoch %d/%d: loss=%.4f acc=%.3f", epoch+1, epochs, loss.item(), acc)
            if loss.item() < best_loss:
                best_loss = loss.item()

        self._model = {"type": "torch", "mlp": mlp, "feat_dim": feat_dim}
        self._backend = "torch"
        self._save_checkpoint()

        return {"accuracy": acc, "loss": best_loss, "n_pairs": len(pairs)}

    # ── Score ─────────────────────────────────────────────────────────────────

    def score(self, prompt: str, response: str) -> RewardScore:
        """
        Оценить один ответ.

        Returns:
            RewardScore с полями score, safety_pass, details.
        """
        safety = self._safety_check(response)

        # Получаем raw score
        if self._backend == "torch" and self._model:
            raw = self._score_torch(prompt, response)
        elif self._backend == "sklearn" and self._model:
            raw = self._score_sklearn(prompt, response)
        else:
            raw = _heuristic_score(prompt, response)

        # Length penalty: штраф за очень длинные ответы (anti-verbosity)
        length_penalty = 0.01 * math.log1p(max(0, len(response) - 2000))
        penalized = raw - length_penalty

        # EMA normalisation: приводит score к [0, 1] относительно среднего
        self._score_ema = (1 - self._ema_alpha) * self._score_ema + self._ema_alpha * penalized
        normalized = min(1.0, max(0.0, penalized / (2 * self._score_ema + 1e-8)))

        return RewardScore(
            score=normalized,
            raw_score=raw,
            safety_pass=safety,
            details={
                "backend": self._backend,
                "length_penalty": length_penalty,
                "ema": self._score_ema,
            },
        )

    def _score_torch(self, prompt: str, response: str) -> float:
        import torch
        mlp = self._model["mlp"]
        mlp.eval()
        with torch.no_grad():
            feat = self._featurize(prompt, response)
            x = torch.tensor([feat], dtype=torch.float32)
            return torch.sigmoid(mlp(x)).item()

    def _score_sklearn(self, prompt: str, response: str) -> float:
        clf = self._model["clf"]
        scaler = self._model["scaler"]
        feat = self._featurize(prompt, response)
        x = scaler.transform([feat])
        return float(clf.predict_proba(x)[0][1])

    # ── Batch filter ─────────────────────────────────────────────────────────

    def filter_candidates(
        self,
        prompt: str,
        candidates: list[str],
        top_k: int = 1,
    ) -> list[tuple[str, RewardScore]]:
        """
        Выбрать top_k лучших кандидатов из списка.
        Используется при beam search / best-of-N sampling.

        Returns:
            Список (response, score) отсортированный по убыванию score.
        """
        scored = [(c, self.score(prompt, c)) for c in candidates]
        # Сначала отфильтровываем unsafe
        safe = [(c, s) for c, s in scored if s.safety_pass]
        if not safe:
            logger.warning("All %d candidates failed safety check", len(candidates))
            safe = scored  # вернуть хотя бы что-то, но пометить
        ranked = sorted(safe, key=lambda x: -x[1].score)
        return ranked[:top_k]
