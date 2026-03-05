#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Working Memory — кратковременная память текущей сессии.

Хранит историю диалога с автоматическим обрезанием по лимиту токенов.
Эвристика токенизации: ~4 символа = 1 токен (стандарт GPT-4).
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# ~4 символа = 1 токен (GPT-4 / tiktoken эвристика)
CHARS_PER_TOKEN = 4


@dataclass
class Message:
    """
    Одно сообщение в диалоговой истории.

    Attributes:
        role: Роль: "user", "assistant", "system".
        content: Текстовое содержимое.
        timestamp: ISO 8601 timestamp.
        token_count: Приближённое количество токенов.
    """

    role: str
    content: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    token_count: int = 0

    def __post_init__(self) -> None:
        if self.token_count == 0:
            self.token_count = max(1, len(self.content) // CHARS_PER_TOKEN)


class WorkingMemory:
    """
    Кратковременная рабочая память — хранит историю текущей сессии.

    Обеспечивает:
        - Добавление сообщений с автоматическим подсчётом токенов
        - Обрезание истории по max_tokens (скользящее окно)
        - Генерацию краткого резюме сессии

    Attributes:
        max_tokens: Максимальный размер контекстного окна.
    """

    def __init__(self, max_tokens: int = 4096) -> None:
        """
        Args:
            max_tokens: Максимум токенов для контекстного окна.
        """
        self.max_tokens = max_tokens
        self._messages: list[Message] = []
        self._total_tokens: int = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def add_message(self, role: str, content: str) -> None:
        """
        Добавить сообщение в историю.

        Args:
            role: Роль отправителя: "user", "assistant", "system".
            content: Текст сообщения.

        Raises:
            ValueError: Если role не является допустимым значением.
        """
        valid_roles = {"user", "assistant", "system"}
        if role not in valid_roles:
            raise ValueError(f"Недопустимая роль '{role}'. Допустимые: {valid_roles}")

        msg = Message(role=role, content=content)
        self._messages.append(msg)
        self._total_tokens += msg.token_count
        logger.debug("WorkingMemory: добавлено [%s] ~%d токенов", role, msg.token_count)

    def get_history(self) -> list[Message]:
        """
        Получить всю историю.

        Returns:
            Копия списка сообщений.
        """
        return list(self._messages)

    def get_context_window(self, max_tokens: Optional[int] = None) -> list[Message]:
        """
        Получить последние N токенов истории (скользящее окно).

        Args:
            max_tokens: Лимит токенов. Если None — использует self.max_tokens.

        Returns:
            Список сообщений умещающихся в лимит (от новых к старым
            включая system сообщения).
        """
        limit = max_tokens or self.max_tokens
        result: list[Message] = []
        token_sum = 0

        # Итерируем с конца (новые сообщения важнее)
        for msg in reversed(self._messages):
            if token_sum + msg.token_count > limit:
                break
            result.insert(0, msg)
            token_sum += msg.token_count

        # Гарантируем наличие system сообщения если было
        system_msgs = [m for m in self._messages if m.role == "system"]
        if system_msgs and (not result or result[0].role != "system"):
            result.insert(0, system_msgs[0])

        return result

    def clear(self) -> None:
        """Очистить всю историю."""
        self._messages.clear()
        self._total_tokens = 0
        logger.debug("WorkingMemory: история очищена")

    def summarize(self) -> str:
        """
        Сгенерировать краткое резюме сессии.

        Использует эвристику: подсчёт тем по ключевым словам.
        В production заменить на LLM summarization.

        Returns:
            Текстовое резюме сессии.
        """
        if not self._messages:
            return "Сессия пуста."

        user_msgs = [m for m in self._messages if m.role == "user"]
        assistant_msgs = [m for m in self._messages if m.role == "assistant"]

        total_msgs = len(self._messages)
        total_tokens = sum(m.token_count for m in self._messages)

        # Извлечь первый и последний запросы пользователя
        first_query = user_msgs[0].content[:100] if user_msgs else "—"
        last_query = user_msgs[-1].content[:100] if user_msgs else "—"

        summary = (
            f"Сессия: {total_msgs} сообщений (~{total_tokens} токенов). "
            f"Запросов пользователя: {len(user_msgs)}. "
            f"Ответов ассистента: {len(assistant_msgs)}. "
            f"Первый вопрос: '{first_query}'. "
            f"Последний вопрос: '{last_query}'."
        )
        return summary

    @property
    def total_tokens(self) -> int:
        """Текущее количество токенов в истории."""
        return self._total_tokens

    @property
    def message_count(self) -> int:
        """Количество сообщений."""
        return len(self._messages)

    def to_dict_list(self) -> list[dict]:
        """Сериализовать историю для передачи в LLM API."""
        return [
            {"role": m.role, "content": m.content}
            for m in self._messages
        ]


if __name__ == "__main__":
    mem = WorkingMemory(max_tokens=1000)

    mem.add_message("system", "Ты полезный AI ассистент.")
    mem.add_message("user", "Расскажи про Python")
    mem.add_message("assistant", "Python — высокоуровневый язык программирования.")
    mem.add_message("user", "А что такое RAG?")
    mem.add_message("assistant", "RAG — Retrieval-Augmented Generation.")

    print(f"Сообщений: {mem.message_count}, токенов: {mem.total_tokens}")
    print(f"\nРезюме: {mem.summarize()}")

    window = mem.get_context_window(max_tokens=200)
    print(f"\nКонтекстное окно (200 токенов): {len(window)} сообщений")
    for m in window:
        print(f"  [{m.role}]: {m.content[:50]}")
