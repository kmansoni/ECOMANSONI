#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Training Seed 03: Data Science & ML Pipeline
=============================================
Паттерн: Pandas + Scikit-learn Pipeline + Feature Engineering + Cross-Validation
Архитектурные решения:
  - sklearn Pipeline предотвращает data leakage (fit только на train)
  - FunctionTransformer для кастомного feature engineering внутри pipeline
  - StratifiedKFold для несбалансированных классов
  - Явный random_state везде для воспроизводимости
"""

from __future__ import annotations

import warnings
from typing import Any

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    StratifiedKFold,
    classification_report,
    roc_auc_score,
)
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, OneHotEncoder, StandardScaler

warnings.filterwarnings("ignore")
RANDOM_STATE = 42


# ---------------------------------------------------------------------------
# 1. Генерация / загрузка данных
# ---------------------------------------------------------------------------
def generate_sample_data(n: int = 1000) -> pd.DataFrame:
    """
    Генерирует синтетический датасет для задачи бинарной классификации.
    В проде — заменить на pd.read_csv() или запрос к БД.
    """
    rng = np.random.default_rng(RANDOM_STATE)
    df = pd.DataFrame(
        {
            "age": rng.integers(18, 80, n).astype(float),
            "income": rng.lognormal(10, 1, n),
            "education": rng.choice(["high_school", "bachelor", "master", "phd"], n),
            "experience_years": rng.integers(0, 40, n).astype(float),
            "city_size": rng.choice(["small", "medium", "large"], n),
            "score": rng.normal(50, 15, n),
        }
    )
    # Вносим пропуски (реалистично)
    df.loc[rng.choice(n, 50, replace=False), "age"] = np.nan
    df.loc[rng.choice(n, 30, replace=False), "income"] = np.nan

    # Целевая переменная с нелинейной зависимостью
    log_odds = (
        0.03 * df["age"].fillna(40)
        + 0.0001 * df["income"].fillna(df["income"].median())
        + 0.05 * df["experience_years"]
        - 2.0
    )
    prob = 1 / (1 + np.exp(-log_odds))
    df["target"] = (rng.uniform(0, 1, n) < prob).astype(int)
    return df


# ---------------------------------------------------------------------------
# 2. Feature Engineering
# ---------------------------------------------------------------------------
def add_interaction_features(X: pd.DataFrame) -> pd.DataFrame:
    """Feature engineering: добавляем производные признаки."""
    X = X.copy()
    X["income_per_age"] = X["income"] / (X["age"].clip(lower=1))
    X["experience_ratio"] = X["experience_years"] / (X["age"].clip(lower=1))
    return X


# ---------------------------------------------------------------------------
# 3. Pipeline-сборка
# ---------------------------------------------------------------------------
def build_pipeline() -> Pipeline:
    """
    Строит sklearn Pipeline.
    Ключевой принцип: ColumnTransformer применяется ПОСЛЕ разделения train/test,
    fit вызывается ТОЛЬКО на train — исключает data leakage.
    """
    numeric_features = ["age", "income", "experience_years", "score",
                        "income_per_age", "experience_ratio"]
    categorical_features = ["education", "city_size"]

    numeric_transformer = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])

    categorical_transformer = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])

    preprocessor = ColumnTransformer([
        ("num", numeric_transformer, numeric_features),
        ("cat", categorical_transformer, categorical_features),
    ])

    return Pipeline([
        ("preprocessor", preprocessor),
        ("classifier", RandomForestClassifier(
            n_estimators=200,
            max_depth=8,
            min_samples_leaf=10,
            class_weight="balanced",
            random_state=RANDOM_STATE,
            n_jobs=-1,
        )),
    ])


# ---------------------------------------------------------------------------
# 4. Обучение и оценка
# ---------------------------------------------------------------------------
def train_and_evaluate(df: pd.DataFrame) -> dict[str, Any]:
    """
    Обучает модель, оценивает через cross-validation и hold-out test set.
    Возвращает словарь с метриками.
    """
    # Feature engineering ДО разбивки — только статeless трансформации
    df = add_interaction_features(df)

    feature_cols = [c for c in df.columns if c != "target"]
    X = df[feature_cols]
    y = df["target"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )

    pipeline = build_pipeline()

    # Cross-validation на train set
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    cv_scores = cross_val_score(pipeline, X_train, y_train, cv=cv, scoring="roc_auc", n_jobs=-1)
    print(f"CV ROC-AUC: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    # Финальное обучение на полном train
    pipeline.fit(X_train, y_train)

    # Оценка на hold-out test
    y_pred = pipeline.predict(X_test)
    y_prob = pipeline.predict_proba(X_test)[:, 1]
    test_auc = roc_auc_score(y_test, y_prob)

    print(f"\nTest ROC-AUC: {test_auc:.4f}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))

    return {
        "cv_mean_auc": cv_scores.mean(),
        "cv_std_auc": cv_scores.std(),
        "test_auc": test_auc,
        "pipeline": pipeline,
    }


# ---------------------------------------------------------------------------
# 5. Визуализация
# ---------------------------------------------------------------------------
def plot_feature_importance(pipeline: Pipeline, top_n: int = 10) -> None:
    """Визуализирует важность признаков из Random Forest."""
    clf = pipeline.named_steps["classifier"]
    preprocessor = pipeline.named_steps["preprocessor"]

    # Получаем имена признаков после трансформации
    num_names = ["age", "income", "experience_years", "score", "income_per_age", "experience_ratio"]
    cat_names = list(
        preprocessor.named_transformers_["cat"]
        .named_steps["encoder"]
        .get_feature_names_out(["education", "city_size"])
    )
    feature_names = num_names + cat_names

    importances = pd.Series(clf.feature_importances_, index=feature_names)
    top = importances.nlargest(top_n)

    fig, ax = plt.subplots(figsize=(8, 5))
    top.sort_values().plot(kind="barh", ax=ax, color="steelblue")
    ax.set_title(f"Top {top_n} Feature Importances")
    ax.set_xlabel("Importance")
    plt.tight_layout()
    plt.savefig("feature_importance.png", dpi=150)
    print("График сохранён: feature_importance.png")
    plt.close(fig)


# ---------------------------------------------------------------------------
# Точка входа
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=== Data Science Training Seed ===\n")
    df = generate_sample_data(n=2000)
    print(f"Датасет: {df.shape}, target distribution:\n{df['target'].value_counts()}\n")

    results = train_and_evaluate(df)
    plot_feature_importance(results["pipeline"])
    print(f"\nИтого: CV AUC = {results['cv_mean_auc']:.4f}, Test AUC = {results['test_auc']:.4f}")
