#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Training Seed 13: Financial Analysis
======================================
Паттерны: Markowitz Portfolio, Risk Metrics (VaR, Sharpe), Technical Indicators, Monte Carlo
Архитектурные решения:
  - scipy.optimize для портфельной оптимизации (квадратичная задача)
  - VaR через Historical Simulation (непараметрический — не предполагает нормальность)
  - Monte Carlo для сценарного анализа с GBM (Geometric Brownian Motion)
  - Технические индикаторы как pandas rolling операции — нет data leakage
"""

from __future__ import annotations

import warnings
from typing import Any

import numpy as np
import pandas as pd
from scipy.optimize import minimize

warnings.filterwarnings("ignore")
RANDOM_STATE = 42
np.random.seed(RANDOM_STATE)


# ---------------------------------------------------------------------------
# 1. Генерация синтетических данных (в проде — yfinance/Bloomberg API)
# ---------------------------------------------------------------------------
def generate_price_data(
    tickers: list[str], n_days: int = 252, seed: int = 42
) -> pd.DataFrame:
    """
    Генерирует синтетические цены акций по модели GBM.
    GBM: dS = mu*S*dt + sigma*S*dW
    """
    rng = np.random.default_rng(seed)
    params = {
        "AAPL": {"mu": 0.25, "sigma": 0.22},
        "GOOGL": {"mu": 0.20, "sigma": 0.25},
        "MSFT": {"mu": 0.22, "sigma": 0.20},
        "TSLA": {"mu": 0.30, "sigma": 0.55},
    }
    prices: dict[str, np.ndarray] = {}
    dt = 1 / 252

    for ticker in tickers:
        p = params.get(ticker, {"mu": 0.15, "sigma": 0.20})
        returns = rng.normal(
            (p["mu"] - 0.5 * p["sigma"] ** 2) * dt,
            p["sigma"] * np.sqrt(dt),
            n_days,
        )
        prices[ticker] = 100 * np.exp(np.cumsum(returns))

    dates = pd.bdate_range(end="2024-01-01", periods=n_days)
    return pd.DataFrame(prices, index=dates)


# ---------------------------------------------------------------------------
# 2. Technical Indicators
# ---------------------------------------------------------------------------
def add_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Добавляет технические индикаторы.
    ВАЖНО: все операции используют только прошлые данные (rolling) — нет lookahead bias.
    """
    df = df.copy()

    # Simple Moving Average
    df["SMA_20"] = df["Close"].rolling(window=20).mean()
    df["SMA_50"] = df["Close"].rolling(window=50).mean()

    # Exponential Moving Average (EMA более чувствительна к последним данным)
    df["EMA_12"] = df["Close"].ewm(span=12, adjust=False).mean()
    df["EMA_26"] = df["Close"].ewm(span=26, adjust=False).mean()

    # MACD = EMA(12) - EMA(26), Signal = EMA(9) of MACD
    df["MACD"] = df["EMA_12"] - df["EMA_26"]
    df["MACD_Signal"] = df["MACD"].ewm(span=9, adjust=False).mean()
    df["MACD_Hist"] = df["MACD"] - df["MACD_Signal"]

    # RSI (Relative Strength Index)
    delta = df["Close"].diff()
    gain = delta.clip(lower=0).rolling(window=14).mean()
    loss = (-delta.clip(upper=0)).rolling(window=14).mean()
    rs = gain / loss.replace(0, np.nan)
    df["RSI"] = 100 - (100 / (1 + rs))

    # Bollinger Bands
    df["BB_Mid"] = df["Close"].rolling(20).mean()
    bb_std = df["Close"].rolling(20).std()
    df["BB_Upper"] = df["BB_Mid"] + 2 * bb_std
    df["BB_Lower"] = df["BB_Mid"] - 2 * bb_std

    # ATR (Average True Range) — волатильность
    high_low = df["High"] - df["Low"] if "High" in df.columns else bb_std
    df["ATR"] = high_low.rolling(14).mean() if "High" in df.columns else bb_std

    return df


# ---------------------------------------------------------------------------
# 3. Risk Metrics
# ---------------------------------------------------------------------------
def compute_returns(prices: pd.DataFrame) -> pd.DataFrame:
    """Логарифмические доходности — аддитивны во времени."""
    return np.log(prices / prices.shift(1)).dropna()


def value_at_risk(returns: pd.Series, confidence: float = 0.95) -> float:
    """
    Historical VaR (непараметрический).
    Интерпретация: с вероятностью confidence потери не превысят |VaR| за период.
    Преимущество над Normal VaR: учитывает fat tails реальных распределений.
    """
    return float(np.percentile(returns, (1 - confidence) * 100))


def conditional_var(returns: pd.Series, confidence: float = 0.95) -> float:
    """
    CVaR / Expected Shortfall — среднее потерь хуже VaR.
    Когерентная мера риска (в отличие от VaR). Используется Basel III.
    """
    var = value_at_risk(returns, confidence)
    return float(returns[returns <= var].mean())


def sharpe_ratio(returns: pd.Series, risk_free_rate: float = 0.05) -> float:
    """
    Sharpe Ratio = (E[R] - Rf) / std(R) * sqrt(252).
    > 1.0 — хорошо, > 2.0 — отлично, < 0 — хуже безрискового актива.
    """
    excess = returns - risk_free_rate / 252
    return float(excess.mean() / excess.std() * np.sqrt(252))


def max_drawdown(prices: pd.Series) -> float:
    """Maximum Drawdown — максимальное падение от пика. Метрика хвостового риска."""
    cummax = prices.cummax()
    drawdown = (prices - cummax) / cummax
    return float(drawdown.min())


# ---------------------------------------------------------------------------
# 4. Markowitz Portfolio Optimization
# ---------------------------------------------------------------------------
def optimize_portfolio(
    returns: pd.DataFrame,
    target_return: float | None = None,
) -> dict[str, Any]:
    """
    Оптимизация портфеля по Марковицу (Mean-Variance Optimization).
    Минимизируется дисперсия при заданной ожидаемой доходности.
    Ограничения:
    - Сумма весов = 1 (fully invested)
    - Веса >= 0 (no short selling)

    В проде: добавить transaction costs, turnover constraints, factor constraints.
    """
    n = len(returns.columns)
    mean_returns = returns.mean() * 252
    cov_matrix = returns.cov() * 252

    def portfolio_variance(weights: np.ndarray) -> float:
        return float(weights @ cov_matrix @ weights)

    def portfolio_return(weights: np.ndarray) -> float:
        return float(weights @ mean_returns)

    constraints: list[dict] = [{"type": "eq", "fun": lambda w: np.sum(w) - 1}]

    if target_return is not None:
        constraints.append({
            "type": "eq",
            "fun": lambda w: portfolio_return(w) - target_return,
        })

    bounds = tuple((0.0, 1.0) for _ in range(n))
    initial_weights = np.ones(n) / n

    result = minimize(
        portfolio_variance,
        initial_weights,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={"maxiter": 1000, "ftol": 1e-9},
    )

    if not result.success:
        raise ValueError(f"Оптимизация не сошлась: {result.message}")

    weights = result.x
    port_return = portfolio_return(weights)
    port_vol = np.sqrt(portfolio_variance(weights))

    return {
        "weights": dict(zip(returns.columns, weights.round(4))),
        "annual_return": port_return,
        "annual_volatility": port_vol,
        "sharpe": (port_return - 0.05) / port_vol,
    }


# ---------------------------------------------------------------------------
# 5. Monte Carlo Simulation
# ---------------------------------------------------------------------------
def monte_carlo_var(
    initial_price: float,
    mu: float,
    sigma: float,
    days: int = 252,
    n_simulations: int = 10000,
    confidence: float = 0.95,
) -> dict[str, float]:
    """
    Monte Carlo симуляция будущих цен по GBM.
    Используется для VaR когда историческая выборка мала.
    """
    rng = np.random.default_rng(RANDOM_STATE)
    dt = 1 / 252
    daily_returns = rng.normal(
        (mu - 0.5 * sigma ** 2) * dt,
        sigma * np.sqrt(dt),
        (n_simulations, days),
    )
    price_paths = initial_price * np.exp(np.cumsum(daily_returns, axis=1))
    final_prices = price_paths[:, -1]
    pnl = (final_prices - initial_price) / initial_price

    return {
        "expected_return": float(np.mean(pnl)),
        "var_95": float(np.percentile(pnl, 5)),
        "cvar_95": float(pnl[pnl <= np.percentile(pnl, 5)].mean()),
        "max_gain": float(np.max(pnl)),
        "max_loss": float(np.min(pnl)),
        "prob_loss": float(np.mean(pnl < 0)),
    }


# ---------------------------------------------------------------------------
# Точка входа
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    tickers = ["AAPL", "GOOGL", "MSFT", "TSLA"]
    prices = generate_price_data(tickers)
    returns = compute_returns(prices)

    print("=== Risk Metrics (AAPL) ===")
    aapl_ret = returns["AAPL"]
    print(f"Sharpe Ratio:    {sharpe_ratio(aapl_ret):.3f}")
    print(f"VaR (95%):       {value_at_risk(aapl_ret):.4f} ({value_at_risk(aapl_ret)*100:.2f}%)")
    print(f"CVaR (95%):      {conditional_var(aapl_ret):.4f}")
    print(f"Max Drawdown:   {max_drawdown(prices['AAPL']):.4f} ({max_drawdown(prices['AAPL'])*100:.2f}%)")

    print("\n=== Portfolio Optimization ===")
    portfolio = optimize_portfolio(returns)
    print(f"Optimal weights: {portfolio['weights']}")
    print(f"Annual Return:   {portfolio['annual_return']:.2%}")
    print(f"Annual Volatility: {portfolio['annual_volatility']:.2%}")
    print(f"Sharpe Ratio:    {portfolio['sharpe']:.3f}")

    print("\n=== Monte Carlo VaR (AAPL) ===")
    mc = monte_carlo_var(initial_price=100.0, mu=0.25, sigma=0.22, days=252, n_simulations=10000)
    for k, v in mc.items():
        print(f"  {k:20s}: {v:.4f}")

    # Technical Indicators
    print("\n=== Technical Indicators ===")
    aapl_df = prices[["AAPL"]].rename(columns={"AAPL": "Close"})
    aapl_df = add_technical_indicators(aapl_df)
    last = aapl_df.iloc[-1]
    print(f"Last Close: {last['Close']:.2f}")
    print(f"SMA_20:     {last['SMA_20']:.2f}")
    print(f"RSI:        {last['RSI']:.1f}")
    print(f"MACD:       {last['MACD']:.4f}")
    print(f"BB Upper:   {last['BB_Upper']:.2f}")
    print(f"BB Lower:   {last['BB_Lower']:.2f}")
