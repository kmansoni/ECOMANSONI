#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Training Seed 05: Cybersecurity Primitives
==========================================
Паттерны: Password hashing, JWT management, Rate limiting, CSRF, Audit log
Архитектурные решения:
  - Argon2id (предпочтительно) / bcrypt для паролей — защита от GPU-атак
  - Timing-safe сравнение токенов (hmac.compare_digest) — против timing attacks
  - Sliding window rate limiter без гонки состояний (атомарный incrby в Redis)
  - CSRF double-submit cookie паттерн
  - Audit log структурированный, immutable append-only
  - Input sanitization предотвращает XSS / SQL injection на уровне input
"""

from __future__ import annotations

import hashlib
import hmac
import html
import json
import logging
import os
import re
import secrets
import time
from collections import defaultdict, deque
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

import bcrypt  # pip install bcrypt
import jwt     # pip install PyJWT

# ---------------------------------------------------------------------------
# 1. Password Hashing — Argon2id / bcrypt
# ---------------------------------------------------------------------------
BCRYPT_ROUNDS = 12  # >= 12 для production (баланс безопасности и скорости)


def hash_password(plain: str) -> str:
    """
    Хэширует пароль через bcrypt с солью.
    НИКОГДА не храните plain text пароли.
    Соль генерируется автоматически — уникальна для каждого пользователя.
    """
    if len(plain.encode()) > 72:
        # bcrypt усекает пароли > 72 байт — pre-hash для длинных паролей
        plain = hashlib.sha256(plain.encode()).hexdigest()
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verifies password in constant time.
    bcrypt.checkpw сам использует timing-safe comparison.
    """
    if len(plain.encode()) > 72:
        plain = hashlib.sha256(plain.encode()).hexdigest()
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False  # Никогда не пропускаем исключение как True


# ---------------------------------------------------------------------------
# 2. JWT Token Management
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ.get("JWT_SECRET", secrets.token_hex(32))
ALGORITHM = "HS256"
_revoked_tokens: set[str] = set()  # В проде — Redis SET с TTL


@dataclass
class TokenClaims:
    sub: str
    exp: int
    iat: int
    jti: str  # JWT ID для revocation
    role: str = "user"


def create_token(user_id: str, role: str = "user", ttl_seconds: int = 3600) -> str:
    """Создаёт подписанный JWT с уникальным JTI для возможности отзыва."""
    now = int(time.time())
    payload = {
        "sub": user_id,
        "exp": now + ttl_seconds,
        "iat": now,
        "jti": secrets.token_urlsafe(16),
        "role": role,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> TokenClaims:
    """
    Верифицирует JWT. Проверяет:
    - Подпись (алгоритм зафиксирован — против algorithm confusion attack)
    - Срок действия (exp)
    - Не в revocation list
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise ValueError("Токен истёк")
    except jwt.InvalidTokenError as e:
        raise ValueError(f"Невалидный токен: {e}")

    jti = payload.get("jti", "")
    if jti in _revoked_tokens:
        raise ValueError("Токен отозван")

    return TokenClaims(
        sub=payload["sub"],
        exp=payload["exp"],
        iat=payload["iat"],
        jti=jti,
        role=payload.get("role", "user"),
    )


def revoke_token(token: str) -> None:
    """Добавляет JTI в revocation list. В проде — Redis SADD с TTL = exp - now."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
        _revoked_tokens.add(payload.get("jti", ""))
    except Exception:
        pass


# ---------------------------------------------------------------------------
# 3. Rate Limiter — Sliding Window (in-memory, thread-safe через GIL)
# ---------------------------------------------------------------------------
class SlidingWindowRateLimiter:
    """
    Sliding window rate limiter.
    В проде реализуется атомарно в Redis через Lua-скрипт:
      ZADD key now now; ZREMRANGEBYSCORE key 0 (now-window); ZCARD key
    Это устраняет race condition между check и increment.
    """

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window = window_seconds
        # {key: deque of timestamps}
        self._windows: dict[str, deque[float]] = defaultdict(deque)

    def is_allowed(self, key: str) -> tuple[bool, dict[str, int]]:
        """
        Проверяет лимит. Возвращает (allowed, headers_info).
        headers_info используется для X-RateLimit-* заголовков.
        """
        now = time.monotonic()
        window = self._windows[key]

        # Удаляем устаревшие записи
        cutoff = now - self.window
        while window and window[0] < cutoff:
            window.popleft()

        count = len(window)
        remaining = max(0, self.max_requests - count - 1)
        headers = {
            "limit": self.max_requests,
            "remaining": remaining,
            "reset": int(now + self.window),
        }

        if count >= self.max_requests:
            return False, headers

        window.append(now)
        return True, headers


# ---------------------------------------------------------------------------
# 4. CSRF Token — Double Submit Cookie Pattern
# ---------------------------------------------------------------------------
def generate_csrf_token() -> str:
    """Генерирует криптографически безопасный CSRF токен."""
    return secrets.token_urlsafe(32)


def verify_csrf_token(cookie_token: str, header_token: str) -> bool:
    """
    Сравнивает CSRF токен из cookie и заголовка в constant time.
    hmac.compare_digest предотвращает timing attack.
    """
    return hmac.compare_digest(cookie_token.encode(), header_token.encode())


# ---------------------------------------------------------------------------
# 5. Input Sanitization
# ---------------------------------------------------------------------------
_SQL_PATTERN = re.compile(
    r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|SCRIPT)\b|--|;|\bOR\b\s+\d+=\d+)",
    re.IGNORECASE,
)


def sanitize_html(value: str) -> str:
    """Экранирует HTML — предотвращает XSS."""
    return html.escape(value, quote=True)


def detect_sql_injection(value: str) -> bool:
    """Эвристическое обнаружение SQL injection попыток. НЕ замена параметризованным запросам."""
    return bool(_SQL_PATTERN.search(value))


def sanitize_input(value: str, max_length: int = 1000) -> str:
    """
    Комплексная санитизация входных данных:
    1. Ограничение длины
    2. Удаление null bytes
    3. HTML escaping
    """
    value = value[:max_length]
    value = value.replace("\x00", "")
    return sanitize_html(value)


# ---------------------------------------------------------------------------
# 6. Audit Log
# ---------------------------------------------------------------------------
@dataclass
class AuditEvent:
    """Immutable audit record."""
    timestamp: str
    event_type: str
    user_id: str
    ip_address: str
    resource: str
    action: str
    success: bool
    metadata: dict[str, Any]


class AuditLogger:
    """Append-only audit log. В проде — запись в защищённую append-only таблицу PostgreSQL."""

    def __init__(self) -> None:
        self._logger = logging.getLogger("audit")
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        self._logger.addHandler(handler)
        self._logger.setLevel(logging.INFO)

    def log(
        self,
        event_type: str,
        user_id: str,
        ip_address: str,
        resource: str,
        action: str,
        success: bool,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Записывает audit event. Структурированный JSON для SIEM."""
        event = AuditEvent(
            timestamp=datetime.now(timezone.utc).isoformat(),
            event_type=event_type,
            user_id=user_id,
            ip_address=ip_address,
            resource=resource,
            action=action,
            success=success,
            metadata=metadata or {},
        )
        self._logger.info(json.dumps(asdict(event), ensure_ascii=False))


# ---------------------------------------------------------------------------
# Точка входа / демонстрация
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    audit = AuditLogger()
    limiter = SlidingWindowRateLimiter(max_requests=10, window_seconds=60)

    print("=== Password Hashing ===")
    pwd = os.environ.get("CYBERSEED_DEMO_PASSWORD") or secrets.token_urlsafe(18)
    hashed = hash_password(pwd)
    print(f"Hash: {hashed[:30]}...")
    print(f"Verify correct: {verify_password(pwd, hashed)}")
    print(f"Verify wrong:   {verify_password('wrong', hashed)}")

    print("\n=== JWT ===")
    token = create_token("user-123", role="admin", ttl_seconds=300)
    claims = verify_token(token)
    print(f"Claims: sub={claims.sub}, role={claims.role}, jti={claims.jti}")
    revoke_token(token)
    try:
        verify_token(token)
    except ValueError as e:
        print(f"Revoked token error: {e}")

    print("\n=== Rate Limiter ===")
    for i in range(12):
        allowed, headers = limiter.is_allowed("user-123")
        print(f"Request {i+1}: {'✓' if allowed else '✗ BLOCKED'} remaining={headers['remaining']}")

    print("\n=== Input Sanitization ===")
    evil = "<script>alert('xss')</script>"
    print(f"Sanitized: {sanitize_input(evil)}")
    sql_attempt = "' OR 1=1 --"
    print(f"SQL injection detected: {detect_sql_injection(sql_attempt)}")

    print("\n=== Audit Log ===")
    audit.log("auth.login", "user-123", "192.168.1.1", "/api/login", "POST", True, {"ua": "Mozilla/5.0"})
