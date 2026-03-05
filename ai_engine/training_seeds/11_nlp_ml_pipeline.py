#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Training Seed 11: NLP & ML Pipeline
======================================
Паттерны: Text preprocessing → TF-IDF → Classification → NER-like
Архитектурные решения:
  - Pipeline предотвращает data leakage (TF-IDF fit только на train)
  - Preprocessing как отдельный шаг с кастомным трансформером
  - Multilabel и multiclass поддержка
  - Evaluation с macro/micro усреднением
  - Regex-based NER как baseline перед нейросетевым подходом
"""

from __future__ import annotations

import re
import string
from collections import Counter
from typing import Any

import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, f1_score
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline

# ---------------------------------------------------------------------------
# 1. Text Preprocessing
# ---------------------------------------------------------------------------
STOPWORDS_RU = {
    "и", "в", "не", "на", "я", "с", "а", "как", "то", "это", "у", "он",
    "они", "мы", "вы", "но", "за", "по", "из", "так", "что", "для", "от",
    "же", "к", "все", "или", "бы", "его", "её", "их", "было", "был", "были",
}


def preprocess_text(text: str, language: str = "ru") -> str:
    """
    Предобработка текста: lowercase, remove punctuation, remove stopwords.
    В проде для русского: использовать pymorphy2/natasha для лемматизации.
    """
    text = text.lower().strip()
    # Убираем URL
    text = re.sub(r"https?://\S+|www\.\S+", " URL ", text)
    # Убираем email
    text = re.sub(r"\S+@\S+", " EMAIL ", text)
    # Убираем числа (или заменить на тег <NUM>)
    text = re.sub(r"\d+", " NUM ", text)
    # Убираем пунктуацию
    text = text.translate(str.maketrans("", "", string.punctuation + "«»—–"))
    # Убираем лишние пробелы
    text = re.sub(r"\s+", " ", text).strip()

    if language == "ru":
        tokens = [w for w in text.split() if w not in STOPWORDS_RU and len(w) > 1]
    else:
        tokens = [w for w in text.split() if len(w) > 1]

    return " ".join(tokens)


class TextPreprocessor(BaseEstimator, TransformerMixin):
    """sklearn-совместимый трансформер для preprocessing текста."""

    def __init__(self, language: str = "ru") -> None:
        self.language = language

    def fit(self, X: list[str], y: Any = None) -> "TextPreprocessor":
        return self  # stateless

    def transform(self, X: list[str]) -> list[str]:
        return [preprocess_text(doc, self.language) for doc in X]


# ---------------------------------------------------------------------------
# 2. Dataset (синтетические обучающие данные)
# ---------------------------------------------------------------------------
TRAINING_DATA: list[tuple[str, str]] = [
    # Позитивные отзывы
    ("Отличный продукт, очень доволен покупкой!", "positive"),
    ("Прекрасное качество, рекомендую всем!", "positive"),
    ("Быстрая доставка и хорошая упаковка", "positive"),
    ("Товар соответствует описанию, всё супер", "positive"),
    ("Замечательный сервис и приятные цены", "positive"),
    ("Очень понравилось, буду заказывать ещё", "positive"),
    ("Качество на высоте, доволен на все 100", "positive"),
    ("Продукт отличный, советую покупать", "positive"),
    # Негативные отзывы
    ("Ужасное качество, полное разочарование", "negative"),
    ("Товар не соответствует описанию, обман", "negative"),
    ("Долгая доставка и плохая упаковка", "negative"),
    ("Сломался на второй день, брак", "negative"),
    ("Не рекомендую, полное надувательство", "negative"),
    ("Деньги выброшены на ветер", "negative"),
    ("Ужасный сервис, грубые сотрудники", "negative"),
    ("Никогда не буду покупать снова", "negative"),
    # Нейтральные
    ("Среднее качество за среднюю цену", "neutral"),
    ("Доставили вовремя, упаковка обычная", "neutral"),
    ("Товар нормальный, ничего особенного", "neutral"),
    ("Как и ожидалось, обычный продукт", "neutral"),
]


# ---------------------------------------------------------------------------
# 3. TF-IDF + Classification Pipeline
# ---------------------------------------------------------------------------
def build_text_pipeline() -> Pipeline:
    """
    Строит NLP pipeline: preprocessing → TF-IDF → Logistic Regression.
    LogReg — хороший baseline для text classification (быстро, интерпретируемо).
    Для длинных текстов: заменить на BERT-based модель (transformers).
    """
    return Pipeline([
        ("preprocessor", TextPreprocessor(language="ru")),
        ("tfidf", TfidfVectorizer(
            ngram_range=(1, 2),      # unigrams + bigrams
            max_features=10000,
            min_df=1,                 # В проде: min_df=2-5
            sublinear_tf=True,        # Логарифмическое сглаживание TF
            analyzer="word",
        )),
        ("classifier", LogisticRegression(
            C=1.0,
            max_iter=1000,
            class_weight="balanced",
            random_state=42,
            solver="lbfgs",
            multi_class="multinomial",
        )),
    ])


def train_sentiment_model(
    data: list[tuple[str, str]],
) -> dict[str, Any]:
    """Обучает и оценивает модель анализа тональности."""
    texts = [item[0] for item in data]
    labels = [item[1] for item in data]

    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels
    )

    pipeline = build_text_pipeline()

    # CV на train
    cv_scores = cross_val_score(pipeline, X_train, y_train, cv=3, scoring="f1_macro")
    print(f"CV F1-macro: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    pipeline.fit(X_train, y_train)
    y_pred = pipeline.predict(X_test)

    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, zero_division=0))

    # Top features per class
    tfidf = pipeline.named_steps["tfidf"]
    clf = pipeline.named_steps["classifier"]
    feature_names = tfidf.get_feature_names_out()

    for i, class_name in enumerate(clf.classes_):
        if hasattr(clf, "coef_"):
            top_indices = np.argsort(clf.coef_[i])[-5:]
            top_features = [feature_names[j] for j in top_indices]
            print(f"Top features [{class_name}]: {top_features}")

    return {"pipeline": pipeline, "cv_f1": cv_scores.mean(), "test_f1": f1_score(y_test, y_pred, average="macro", zero_division=0)}


# ---------------------------------------------------------------------------
# 4. Named Entity Recognition (Regex-based baseline)
# ---------------------------------------------------------------------------
NER_PATTERNS: dict[str, list[str]] = {
    "EMAIL": [r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"],
    "PHONE": [r"\+?[78][-\s]?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2}"],
    "DATE": [r"\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b", r"\b\d{4}-\d{2}-\d{2}\b"],
    "MONEY": [r"\b\d+[\s,]?\d*\s*(?:руб|рублей|₽|USD|\$|€)\b"],
    "ORG": [r"\b(?:\u041e\u041e\u041e|\u041e\u0410\u041e|\u0417\u0410\u041e|\u0418\u041f|\u0410\u041e)\s+\S+"],
}


@dataclass
class Entity:
    text: str
    label: str
    start: int
    end: int


def extract_entities(text: str) -> list[Entity]:
    """
    Rule-based NER. Baseline перед нейросетевым подходом (natasha, spaCy).
    В проде: использовать natasha/Natasha для русского или spaCy + custom model.
    """
    entities: list[Entity] = []
    for label, patterns in NER_PATTERNS.items():
        for pattern in patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                entities.append(Entity(
                    text=match.group(),
                    label=label,
                    start=match.start(),
                    end=match.end(),
                ))
    # Сортируем по позиции
    entities.sort(key=lambda e: e.start)
    return entities


# ---------------------------------------------------------------------------
# Точка входа
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=== NLP Pipeline Demo ===\n")

    # Preprocessing
    sample = "Отличный товар! Заказал 25.01.2024 за 1500 руб. Связаться: test@mail.ru"
    print(f"Оригинал: {sample}")
    print(f"Processeed: {preprocess_text(sample)}")

    # NER
    print(f"\nNER entities:")
    for ent in extract_entities(sample):
        print(f"  [{ent.label}] '{ent.text}' at {ent.start}:{ent.end}")

    # Sentiment classification
    print("\n=== Sentiment Classification ===")
    results = train_sentiment_model(TRAINING_DATA)

    # Predict на новых текстах
    pipeline = results["pipeline"]
    test_texts = [
        "Великолепный продукт, очень рад покупке!",
        "Ужасное разочарование, не советую",
        "Обычный товар, ничего выдающегося",
    ]
    predictions = pipeline.predict(test_texts)
    proba = pipeline.predict_proba(test_texts)
    for text, pred, prob in zip(test_texts, predictions, proba):
        print(f"\n'{text[:40]}...' → {pred} (conf: {max(prob):.2f})")
