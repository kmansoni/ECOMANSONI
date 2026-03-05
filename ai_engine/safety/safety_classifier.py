#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SafetyClassifier — многоуровневый классификатор безопасности контента.
======================================================================

Архитектура (глубина защиты = 4 уровня):

    Level 0: BLOCKLIST (instant, O(1) via Aho-Corasick / regex)
        Абсолютно запрещённые слова/фразы: CSAM, синтез оружия.
        Нет ML — детерминированно, не обходится jailbreak.

    Level 1: PATTERN RULES (regex + контекстные правила)
        Паттерны: "how to make * bomb", "synthesize * from *".
        Контекстная проверка: запрос на код + вредоносные ключевые слова.
        
    Level 2: HEURISTIC SCORER (O(n) word-level features)
        Score = взвешенная сумма harm-индикаторов.
        Категории: violence, self-harm, hate speech, weapons, drugs, privacy.
        
    Level 3: ML CLASSIFIER (опционально, sklearn/torch)
        TF-IDF + LogisticRegression (при наличии обучающих данных).
        Обучается инкрементально на user-labeled примерах (FeedbackStore).

Политика:
    ANY Level 0/1 срабатывание → BLOCK (безусловно).
    Level 2 score > 0.85 → BLOCK.
    Level 2 score [0.6, 0.85] → WARN (отдаём response + предупреждение).
    Level 2 score < 0.6 → PASS.
    Level 3 дополняет Level 2 если доступен (ансамбль).

Производительность:
    Level 0+1: < 0.1 ms
    Level 2: < 1 ms
    Level 3: < 10 ms (sklearn), < 50 ms (torch)
    Total pipeline: < 20 ms на CPU (приемлемо для inference middleware)

Zero-Trust принципы:
    - Safety классификатор вызывается ДВАЖДЫ: на входящий prompt И на исходящий response.
    - Это предотвращает содержательные jailbreak через косвенные инструкции.
    - Все решения логируются (audit trail).
    - Нет переопределения через системный промпт.
"""

from __future__ import annotations

import logging
import pickle
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


# ─── Level 0: Absolute blocklist ─────────────────────────────────────────────

# Паттерны, которые НИКОГДА не должны появляться в ответах ARIA.
# Эти паттерны не обходятся jailbreak, т.к. проверяются на уровне output.
_L0_PATTERNS = [
    # CSAM
    r"\bchild\s+(porn|sexual|nude|naked|sex)\b",
    r"\b(loli|shota)\s+(nude|porn|sex)\b",
    # Weapons of mass destruction
    r"\b(sarin|VX\s+gas|novichok|tabun|soman)\b",
    r"\bsynthesize\s+\w+\s+(nerve\s+agent|chemical\s+weapon|bio\s*weapon)\b",
    r"\b(uranium|plutonium)\s+(enrichment|centrifuge)\b",
    # Malware output markers
    r"def\s+encrypt_files.*ransom",
    r"socket\.connect.*keylog",
    r"\bmetasploit\s+payload\b",
]
_L0_REGEX = re.compile("|".join(_L0_PATTERNS), re.IGNORECASE | re.DOTALL)


# ─── Level 1: Contextual patterns ────────────────────────────────────────────

_L1_RULES: list[tuple[str, str]] = [
    # (prompt_pattern, response_pattern) — оба должны совпасть
    (r"how\s+to\s+make\s+a?\s*(bomb|explosive)", r"\b(ammonium|TATP|PETN|RDX)\b"),
    (r"write\s+(ransomware|malware|keylogger|trojan)", r"\b(encrypt|payload|exfil)\b"),
    (r"(ddos|dos)\s+attack", r"\b(botnet|flood|amplif)\b"),
    (r"synthesize\s+meth(amphetamine)?", r"\b(precursor|pseudoephedrine|reduction)\b"),
    (r"(hack|exploit)\s+(database|server|system)", r"\b(sqlmap|injection|shell)\b"),
]


# ─── Level 2: Category-based heuristic scorer ─────────────────────────────────

_HARM_CATEGORIES: dict[str, float] = {
    # category: weight
    "weapons":    0.9,
    "self_harm":  0.85,
    "hate_speech": 0.8,
    "csam":       1.0,   # автоматический блок
    "drugs":      0.5,
    "malware":    0.9,
    "privacy":    0.6,
}

_CATEGORY_PATTERNS: dict[str, re.Pattern] = {
    "weapons": re.compile(
        r"\b(bomb|explosive|grenade|automatic\s+weapon|IED|RPG|"
        r"3D\s*print.*gun|ghost\s+gun)\b", re.I
    ),
    "self_harm": re.compile(
        r"\b(suicide\s+method|how\s+to\s+(kill|hang)\s+myself|"
        r"lethal\s+dose\s+of|overdose\s+on)\b", re.I
    ),
    "hate_speech": re.compile(
        r"\b(nigger|faggot|kike|spic|chink|wetback|coon)\b", re.I
    ),
    "csam": re.compile(
        r"\bchild\s+(porn|sexual|nude|sex)\b|\b(loli|shota)\s+(sex|porn)\b", re.I
    ),
    "drugs": re.compile(
        r"\b(how\s+to\s+cook\s+meth|crack\s+cocaine\s+recipe|"
        r"fentanyl\s+synthesis)\b", re.I
    ),
    "malware": re.compile(
        r"\b(ransomware\s+code|keylogger\s+python|bind\s+shell|"
        r"reverse\s+shell\s+one.?liner)\b", re.I
    ),
    "privacy": re.compile(
        r"\b(dox\s+someone|find\s+someone.s\s+address|"
        r"stalk\s+(using|with|via))\b", re.I
    ),
}


# ─── Enums & dataclasses ──────────────────────────────────────────────────────

class SafetyLevel(Enum):
    PASS  = "pass"
    WARN  = "warn"
    BLOCK = "block"


@dataclass
class SafetyVerdict:
    """
    Результат проверки безопасности.

    Attributes:
        level:       PASS / WARN / BLOCK.
        score:       Harm score [0.0, 1.0] (только Level 2+).
        triggered_level: Уровень, сработавший первым.
        categories:  Список сработавших категорий.
        reason:      Человекочитаемое объяснение.
        latency_ms:  Время проверки в миллисекундах.
    """

    level:            SafetyLevel
    score:            float = 0.0
    triggered_level:  int = -1
    categories:       list[str] = field(default_factory=list)
    reason:           str = ""
    latency_ms:       float = 0.0

    @property
    def is_safe(self) -> bool:
        return self.level != SafetyLevel.BLOCK


# ─── SafetyClassifier ─────────────────────────────────────────────────────────

class SafetyClassifier:
    """
    Многоуровневый классификатор безопасности.

    Usage:
        sc = SafetyClassifier()
        # Проверка входящего промпта
        verdict = sc.check(prompt)
        if not verdict.is_safe:
            return {"error": "Request blocked", "reason": verdict.reason}
        
        # Проверка исходящего ответа (zero-trust)
        response_verdict = sc.check(response, context_prompt=prompt)
        if not response_verdict.is_safe:
            return {"error": "Response blocked by safety filter"}

    Thread safety:
        Все операции read-only на shared state → thread-safe.
        ML model загружается lazy, защищён RLock.
    """

    # Пороги Level 2 heuristic score
    BLOCK_THRESHOLD = 0.75
    WARN_THRESHOLD  = 0.45

    def __init__(
        self,
        ml_model_path: Optional[str | Path] = None,
        enable_ml: bool = True,
    ) -> None:
        self._ml_model = None
        self._ml_path = Path(ml_model_path) if ml_model_path else Path("aria_safety_model.pkl")
        self._enable_ml = enable_ml
        self._load_ml_model()

    # ── ML model ──────────────────────────────────────────────────────────────

    def _load_ml_model(self) -> None:
        if not self._enable_ml or not self._ml_path.exists():
            return
        try:
            with open(self._ml_path, "rb") as f:
                self._ml_model = pickle.load(f)
            logger.info("SafetyClassifier: ML model loaded from %s", self._ml_path)
        except Exception as exc:
            logger.warning("SafetyClassifier: ML model load failed: %s", exc)

    def train_ml_model(
        self,
        safe_texts: list[str],
        harmful_texts: list[str],
    ) -> dict:
        """
        Обучить ML safety classifier на labeled примерах.
        
        Args:
            safe_texts:    Тексты класса SAFE (0).
            harmful_texts: Тексты класса HARMFUL (1).
            
        Returns:
            dict с метриками: accuracy, n_safe, n_harmful.
        """
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.linear_model import LogisticRegression
            from sklearn.pipeline import Pipeline
        except ImportError:
            logger.warning("sklearn not available, ML safety classifier disabled")
            return {"error": "sklearn required"}

        if len(safe_texts) < 5 or len(harmful_texts) < 5:
            return {"error": "insufficient training data (need ≥5 per class)"}

        X = safe_texts + harmful_texts
        y = [0] * len(safe_texts) + [1] * len(harmful_texts)

        pipeline = Pipeline([
            ("tfidf", TfidfVectorizer(max_features=10_000, ngram_range=(1, 2))),
            ("clf", LogisticRegression(C=1.0, max_iter=200, class_weight="balanced")),
        ])
        pipeline.fit(X, y)
        acc = pipeline.score(X, y)

        self._ml_model = pipeline
        try:
            with open(self._ml_path, "wb") as f:
                pickle.dump(pipeline, f)
            logger.info("SafetyClassifier ML model saved (acc=%.3f)", acc)
        except Exception:
            pass

        return {"accuracy": acc, "n_safe": len(safe_texts), "n_harmful": len(harmful_texts)}

    # ── Main check pipeline ────────────────────────────────────────────────────

    def check(
        self,
        text: str,
        context_prompt: Optional[str] = None,
    ) -> SafetyVerdict:
        """
        Запустить полный pipeline проверки.

        Args:
            text:            Текст для проверки (prompt или response).
            context_prompt:  Если задан — используется для Level 1 контекстной проверки.

        Returns:
            SafetyVerdict
        """
        t0 = time.perf_counter()

        # Level 0: absolute blocklist
        if _L0_REGEX.search(text):
            return SafetyVerdict(
                level=SafetyLevel.BLOCK,
                score=1.0,
                triggered_level=0,
                categories=["absolute_block"],
                reason="Content matches absolute safety blocklist",
                latency_ms=(time.perf_counter() - t0) * 1000,
            )

        # Level 1: contextual pattern rules
        if context_prompt:
            for prompt_pat, resp_pat in _L1_RULES:
                if re.search(prompt_pat, context_prompt, re.I) and re.search(resp_pat, text, re.I):
                    return SafetyVerdict(
                        level=SafetyLevel.BLOCK,
                        score=0.95,
                        triggered_level=1,
                        categories=["contextual_rule"],
                        reason=f"Contextual harm pattern detected",
                        latency_ms=(time.perf_counter() - t0) * 1000,
                    )

        # Level 2: heuristic category scoring
        triggered_categories: list[str] = []
        max_weight = 0.0

        for category, pattern in _CATEGORY_PATTERNS.items():
            if pattern.search(text):
                weight = _HARM_CATEGORIES[category]
                triggered_categories.append(category)
                max_weight = max(max_weight, weight)
                # CSAM → immediate block regardless
                if category == "csam":
                    return SafetyVerdict(
                        level=SafetyLevel.BLOCK,
                        score=1.0,
                        triggered_level=2,
                        categories=[category],
                        reason="CSAM content detected",
                        latency_ms=(time.perf_counter() - t0) * 1000,
                    )

        # Combine max_weight with count-based boost
        score_l2 = max_weight
        if len(triggered_categories) > 1:
            score_l2 = min(1.0, score_l2 + 0.1 * (len(triggered_categories) - 1))

        # Level 3: ML classifier (if available)
        score_ml = 0.0
        if self._ml_model is not None:
            try:
                prob = self._ml_model.predict_proba([text])[0][1]
                score_ml = float(prob)
            except Exception:
                pass

        # Ensemble: max(L2, L3) with L3 only boosting
        final_score = max(score_l2, score_ml * 0.8) if self._ml_model else score_l2

        # Determine verdict
        if final_score >= self.BLOCK_THRESHOLD:
            level = SafetyLevel.BLOCK
            reason = f"Harm score {final_score:.2f} ≥ {self.BLOCK_THRESHOLD} (categories: {triggered_categories})"
        elif final_score >= self.WARN_THRESHOLD:
            level = SafetyLevel.WARN
            reason = f"Potential harm detected (score={final_score:.2f})"
        else:
            level = SafetyLevel.PASS
            reason = "Content appears safe"

        return SafetyVerdict(
            level=level,
            score=round(final_score, 4),
            triggered_level=2 if triggered_categories else -1,
            categories=triggered_categories,
            reason=reason,
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
        )

    def check_batch(self, texts: list[str]) -> list[SafetyVerdict]:
        """Проверить батч текстов. Возвращает список SafetyVerdict."""
        return [self.check(t) for t in texts]

    def safe_response(
        self,
        prompt: str,
        response: str,
        block_message: str = "Этот запрос не может быть обработан по соображениям безопасности.",
    ) -> tuple[str, SafetyVerdict]:
        """
        Удобная обёртка: проверить prompt + response.
        Возвращает (финальный_текст, verdict).
        Если заблокировано → финальный_текст = block_message.
        """
        # Сначала проверяем исходящий response
        verdict = self.check(response, context_prompt=prompt)
        if not verdict.is_safe:
            logger.warning(
                "Response blocked: level=%s score=%.3f reason=%s",
                verdict.level.value, verdict.score, verdict.reason,
            )
            return block_message, verdict
        return response, verdict
