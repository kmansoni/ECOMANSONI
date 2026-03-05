#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Training Seed 09: Testing Patterns
====================================
Паттерны: Unit Tests, Integration Tests, Mocking, Fixtures, Parametrize
Архитектурные решения:
  - Чистое разделение unit/integration тестов (разные директории/маркеры)
  - Factory pattern вместо хардкода данных в тестах
  - pytest.fixture с scope для дорогостоящих ресурсов (scope="session")
  - Mock только внешние зависимости — не бизнес-логику
  - Parametrize для граничных случаев (не дублировать код теста)
  - Тесты документируют поведение системы (AAA паттерн: Arrange-Act-Assert)
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import AsyncMock, MagicMock, Mock, patch, call

import pytest


# ---------------------------------------------------------------------------
# Тестируемый код (SUT — System Under Test)
# ---------------------------------------------------------------------------
@dataclass
class User:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    email: str = ""
    name: str = ""
    is_active: bool = True


class UserRepository:
    def get(self, user_id: str) -> User | None: ...
    def save(self, user: User) -> None: ...
    def get_by_email(self, email: str) -> User | None: ...


class EmailService:
    def send_welcome(self, email: str, name: str) -> bool: ...


class UserService:
    """Бизнес-логика пользователей."""

    def __init__(self, repo: UserRepository, email_svc: EmailService) -> None:
        self._repo = repo
        self._email = email_svc

    def register(self, email: str, name: str) -> User:
        """
        Регистрирует пользователя.
        Raises ValueError если email уже занят.
        """
        if not email or "@" not in email:
            raise ValueError(f"Невалидный email: {email}")
        if not name.strip():
            raise ValueError("Имя не может быть пустым")
        if self._repo.get_by_email(email):
            raise ValueError(f"Email уже занят: {email}")
        user = User(email=email, name=name)
        self._repo.save(user)
        self._email.send_welcome(email, name)
        return user

    def deactivate(self, user_id: str) -> User:
        user = self._repo.get(user_id)
        if user is None:
            raise ValueError(f"Пользователь не найден: {user_id}")
        user.is_active = False
        self._repo.save(user)
        return user


# ---------------------------------------------------------------------------
# Factories (замена захардкоженных данных)
# ---------------------------------------------------------------------------
class UserFactory:
    """Фабрика тестовых данных. Позволяет менять только нужные поля."""

    _counter = 0

    @classmethod
    def build(cls, **kwargs: Any) -> User:
        cls._counter += 1
        defaults = {
            "id": str(uuid.uuid4()),
            "email": f"user{cls._counter}@example.com",
            "name": f"User {cls._counter}",
            "is_active": True,
        }
        defaults.update(kwargs)
        return User(**defaults)

    @classmethod
    def build_inactive(cls, **kwargs: Any) -> User:
        return cls.build(is_active=False, **kwargs)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def mock_repo() -> MagicMock:
    """Мок репозитория. По умолчанию get_by_email возвращает None (email свободен)."""
    repo = MagicMock(spec=UserRepository)
    repo.get_by_email.return_value = None
    repo.get.return_value = None
    return repo


@pytest.fixture
def mock_email() -> MagicMock:
    """Мок email-сервиса. Всегда возвращает True (успех)."""
    svc = MagicMock(spec=EmailService)
    svc.send_welcome.return_value = True
    return svc


@pytest.fixture
def user_service(mock_repo: MagicMock, mock_email: MagicMock) -> UserService:
    """Готовый UserService с замоканными зависимостями."""
    return UserService(mock_repo, mock_email)


@pytest.fixture
def existing_user(mock_repo: MagicMock) -> User:
    """Пользователь, который уже есть в репозитории."""
    user = UserFactory.build(email="existing@example.com")
    mock_repo.get.return_value = user
    mock_repo.get_by_email.return_value = user
    return user


# ---------------------------------------------------------------------------
# Unit Tests
# ---------------------------------------------------------------------------
class TestUserServiceRegister:
    """Тесты регистрации пользователя (AAA паттерн)."""

    def test_successful_registration(self, user_service: UserService, mock_repo: MagicMock, mock_email: MagicMock) -> None:
        # Arrange
        email, name = "new@example.com", "Alice"

        # Act
        user = user_service.register(email, name)

        # Assert
        assert user.email == email
        assert user.name == name
        assert user.is_active is True
        mock_repo.save.assert_called_once_with(user)
        mock_email.send_welcome.assert_called_once_with(email, name)

    def test_register_sends_welcome_email(self, user_service: UserService, mock_email: MagicMock) -> None:
        user_service.register("alice@test.com", "Alice")
        mock_email.send_welcome.assert_called_once_with("alice@test.com", "Alice")

    def test_register_duplicate_email_raises(
        self, user_service: UserService, existing_user: User, mock_email: MagicMock
    ) -> None:
        with pytest.raises(ValueError, match="Email уже занят"):
            user_service.register(existing_user.email, "Other Name")
        mock_email.send_welcome.assert_not_called()

    @pytest.mark.parametrize("bad_email", [
        "",
        "not-an-email",
        "missing_at_sign",
        "   ",
    ])
    def test_register_invalid_email_raises(self, user_service: UserService, bad_email: str) -> None:
        with pytest.raises(ValueError, match="Невалидный email"):
            user_service.register(bad_email, "Alice")

    @pytest.mark.parametrize("bad_name", ["", "   ", "\t\n"])
    def test_register_empty_name_raises(self, user_service: UserService, bad_name: str) -> None:
        with pytest.raises(ValueError, match="Имя не может быть пустым"):
            user_service.register("valid@test.com", bad_name)


class TestUserServiceDeactivate:

    def test_deactivate_active_user(self, user_service: UserService, existing_user: User, mock_repo: MagicMock) -> None:
        result = user_service.deactivate(existing_user.id)

        assert result.is_active is False
        mock_repo.save.assert_called_once()
        saved_user = mock_repo.save.call_args[0][0]
        assert saved_user.is_active is False

    def test_deactivate_nonexistent_user_raises(self, user_service: UserService) -> None:
        with pytest.raises(ValueError, match="Пользователь не найден"):
            user_service.deactivate("nonexistent-id")


# ---------------------------------------------------------------------------
# Integration Tests (используют реальные компоненты)
# ---------------------------------------------------------------------------
class TestUserServiceIntegration:
    """
    Интеграционные тесты — проверяют взаимодействие компонентов.
    В реальном проекте: используют тестовую БД (TestContainers / SQLite in-memory).
    """

    def test_full_registration_flow(self) -> None:
        """Тест полного флоу регистрации с in-memory хранилищем."""
        # Простая in-memory реализация репозитория
        store: dict[str, User] = {}
        sent_emails: list[tuple[str, str]] = []

        class InMemoryUserRepo:
            def get(self, uid: str) -> User | None:
                return store.get(uid)
            def save(self, user: User) -> None:
                store[user.id] = user
            def get_by_email(self, email: str) -> User | None:
                return next((u for u in store.values() if u.email == email), None)

        class FakeEmailService:
            def send_welcome(self, email: str, name: str) -> bool:
                sent_emails.append((email, name))
                return True

        svc = UserService(InMemoryUserRepo(), FakeEmailService())
        user = svc.register("alice@example.com", "Alice")

        assert store[user.id] == user
        assert sent_emails == [("alice@example.com", "Alice")]


# ---------------------------------------------------------------------------
# Async Tests
# ---------------------------------------------------------------------------
class TestAsyncOperations:

    @pytest.mark.asyncio
    async def test_async_service(self) -> None:
        """Пример теста async функции с AsyncMock."""
        async def fetch_user(user_id: str) -> dict[str, str]:
            return {"id": user_id, "name": "Alice"}

        mock_fetch = AsyncMock(side_effect=fetch_user)
        result = await mock_fetch("user-123")
        assert result["id"] == "user-123"
        mock_fetch.assert_awaited_once_with("user-123")


# ---------------------------------------------------------------------------
# Parametrized edge cases
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("email,name,expected_error", [
    ("", "Alice", "Невалидный email"),
    ("valid@test.com", "", "Имя не может быть пустым"),
    ("no-at-sign", "Bob", "Невалидный email"),
])
def test_registration_validation_matrix(email: str, name: str, expected_error: str) -> None:
    """Матрица граничных случаев валидации — один тест покрывает все комбинации."""
    repo = MagicMock(spec=UserRepository)
    repo.get_by_email.return_value = None
    svc = UserService(repo, MagicMock(spec=EmailService))

    with pytest.raises(ValueError, match=expected_error):
        svc.register(email, name)


# ---------------------------------------------------------------------------
# Точка входа
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # Запустить: pytest ai_engine/training_seeds/09_testing_patterns.py -v --tb=short
    print("Запустите тесты командой:")
    print("  pytest ai_engine/training_seeds/09_testing_patterns.py -v")
    print("\nСтруктура тестов:")
    print("  TestUserServiceRegister — unit тесты регистрации")
    print("  TestUserServiceDeactivate — unit тесты деактивации")
    print("  TestUserServiceIntegration — интеграционные тесты")
    print("  TestAsyncOperations — async тесты с AsyncMock")
    print("  test_registration_validation_matrix — параметризованные тесты")
