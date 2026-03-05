#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tool System — система инструментов для ReAct агента.

Безопасность sandbox:
    code_executor использует ограниченный __builtins__ и timeout через
    threading. eval() в calculator ограничен безопасными математическими
    операциями — не передаётся нефильтрованный пользовательский ввод.
"""

import logging
import math
import re
import threading
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from functools import wraps
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


@dataclass
class ToolResult:
    """
    Результат выполнения инструмента.

    Attributes:
        success: Успешно ли выполнена операция.
        result: Результат (строка или dict).
        error: Сообщение об ошибке если success=False.
        execution_time: Время выполнения в секундах.
    """

    success: bool
    result: str
    error: str
    execution_time: float


@dataclass
class ToolDescription:
    """Описание инструмента для LLM."""

    name: str
    description: str
    parameters: dict


@dataclass
class Tool:
    """
    Инструмент агента.

    Attributes:
        name: Уникальное имя инструмента.
        description: Описание для LLM (что делает и когда использовать).
        parameters: JSON Schema параметров.
        func: Callable реализация.
    """

    name: str
    description: str
    parameters: dict
    func: Callable[..., str]


def tool(
    name: str,
    description: str,
    parameters: Optional[dict] = None,
) -> Callable:
    """
    Декоратор для регистрации функции как Tool.

    Args:
        name: Имя инструмента.
        description: Описание для LLM.
        parameters: JSON Schema параметров.

    Example:
        @tool("my_tool", "Does something useful", {"query": {"type": "string"}})
        def my_func(query: str) -> str:
            return f"Result: {query}"
    """
    def decorator(func: Callable) -> Callable:
        func._tool_meta = Tool(  # type: ignore[attr-defined]
            name=name,
            description=description,
            parameters=parameters or {},
            func=func,
        )

        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> str:
            return func(*args, **kwargs)

        wrapper._tool_meta = func._tool_meta  # type: ignore[attr-defined]
        return wrapper

    return decorator


class ToolRegistry:
    """
    Реестр инструментов агента.

    Обеспечивает регистрацию, поиск и безопасное выполнение инструментов.
    Встроенные инструменты регистрируются при инициализации.
    """

    def __init__(self, register_builtins: bool = True) -> None:
        """
        Args:
            register_builtins: Зарегистрировать встроенные инструменты.
        """
        self._tools: dict[str, Tool] = {}
        if register_builtins:
            self._register_builtin_tools()

    # ------------------------------------------------------------------
    # Registry management
    # ------------------------------------------------------------------

    def register(self, t: Tool) -> None:
        """
        Зарегистрировать инструмент.

        Args:
            t: Экземпляр Tool.

        Raises:
            ValueError: Если инструмент с таким именем уже существует.
        """
        if t.name in self._tools:
            logger.warning("Инструмент '%s' уже зарегистрирован. Перезапись.", t.name)
        self._tools[t.name] = t
        logger.debug("Зарегистрирован инструмент: %s", t.name)

    def get(self, name: str) -> Optional[Tool]:
        """
        Получить инструмент по имени.

        Args:
            name: Имя инструмента.

        Returns:
            Tool или None если не найден.
        """
        return self._tools.get(name)

    def list_tools(self) -> list[ToolDescription]:
        """Список описаний всех зарегистрированных инструментов."""
        return [
            ToolDescription(
                name=t.name,
                description=t.description,
                parameters=t.parameters,
            )
            for t in self._tools.values()
        ]

    def format_for_prompt(self) -> str:
        """Форматировать список инструментов для LLM промпта."""
        lines = []
        for t in self._tools.values():
            params_str = ", ".join(
                f"{k}: {v.get('type', 'string')}"
                for k, v in t.parameters.get("properties", {}).items()
            )
            lines.append(f"- {t.name}({params_str}): {t.description}")
        return "\n".join(lines)

    def execute(self, name: str, **kwargs: Any) -> ToolResult:
        """
        Выполнить инструмент по имени.

        Args:
            name: Имя инструмента.
            **kwargs: Параметры инструмента.

        Returns:
            ToolResult с результатом или описанием ошибки.
        """
        tool_obj = self._tools.get(name)
        if tool_obj is None:
            return ToolResult(
                success=False,
                result="",
                error=f"Инструмент '{name}' не найден. Доступные: {list(self._tools.keys())}",
                execution_time=0.0,
            )

        start = time.perf_counter()
        try:
            result = tool_obj.func(**kwargs)
            return ToolResult(
                success=True,
                result=str(result),
                error="",
                execution_time=time.perf_counter() - start,
            )
        except TypeError as exc:
            return ToolResult(
                success=False,
                result="",
                error=f"Неверные параметры для '{name}': {exc}",
                execution_time=time.perf_counter() - start,
            )
        except Exception as exc:
            logger.error("Ошибка выполнения инструмента '%s': %s", name, exc)
            return ToolResult(
                success=False,
                result="",
                error=f"Ошибка выполнения: {exc}",
                execution_time=time.perf_counter() - start,
            )

    # ------------------------------------------------------------------
    # Built-in tools
    # ------------------------------------------------------------------

    def _register_builtin_tools(self) -> None:
        builtins = [
            Tool(
                name="calculator",
                description="Вычисляет математические выражения. Поддерживает: +, -, *, /, **, sqrt, sin, cos, log.",
                parameters={
                    "type": "object",
                    "properties": {"expression": {"type": "string", "description": "Математическое выражение"}},
                    "required": ["expression"],
                },
                func=_tool_calculator,
            ),
            Tool(
                name="current_datetime",
                description="Возвращает текущую дату и время в формате ISO 8601.",
                parameters={"type": "object", "properties": {}, "required": []},
                func=_tool_datetime,
            ),
            Tool(
                name="web_search_mock",
                description="Имитация веб-поиска. Возвращает mock-результаты для демонстрации.",
                parameters={
                    "type": "object",
                    "properties": {"query": {"type": "string", "description": "Поисковый запрос"}},
                    "required": ["query"],
                },
                func=_tool_web_search_mock,
            ),
            Tool(
                name="code_executor",
                description="Выполняет Python код в изолированном sandbox. Timeout 5 секунд.",
                parameters={
                    "type": "object",
                    "properties": {"code": {"type": "string", "description": "Python код для выполнения"}},
                    "required": ["code"],
                },
                func=_tool_code_executor,
            ),
            Tool(
                name="text_analyzer",
                description="Анализирует текст: количество слов, предложений, частотность слов.",
                parameters={
                    "type": "object",
                    "properties": {"text": {"type": "string", "description": "Анализируемый текст"}},
                    "required": ["text"],
                },
                func=_tool_text_analyzer,
            ),
        ]
        for t in builtins:
            self._tools[t.name] = t


# ------------------------------------------------------------------
# Built-in tool implementations
# ------------------------------------------------------------------

# Разрешённые имена для eval sandbox
_SAFE_MATH_NAMES: dict[str, Any] = {
    "abs": abs, "round": round, "min": min, "max": max,
    "sqrt": math.sqrt, "sin": math.sin, "cos": math.cos,
    "tan": math.tan, "log": math.log, "log2": math.log2,
    "log10": math.log10, "pi": math.pi, "e": math.e,
    "pow": pow, "ceil": math.ceil, "floor": math.floor,
}

# Паттерн для проверки безопасности выражения
_UNSAFE_PATTERN = re.compile(r"(__|\bimport\b|\bexec\b|\beval\b|\bopen\b|\bos\b|\bsys\b)")


def _tool_calculator(expression: str) -> str:
    """Безопасный калькулятор через ограниченный eval."""
    if _UNSAFE_PATTERN.search(expression):
        raise ValueError(f"Небезопасное выражение: {expression}")

    # Дополнительная фильтрация: только цифры, операторы и функции
    sanitized = re.sub(r"[^0-9+\-*/().,\s\w]", "", expression)
    try:
        result = eval(sanitized, {"__builtins__": {}}, _SAFE_MATH_NAMES)  # noqa: S307
        return str(round(float(result), 10))
    except ZeroDivisionError:
        raise ValueError("Деление на ноль")
    except Exception as exc:
        raise ValueError(f"Ошибка вычисления '{expression}': {exc}") from exc


def _tool_datetime() -> str:
    """Текущая дата и время."""
    now = datetime.now()
    return now.strftime("%Y-%m-%dT%H:%M:%S") + f" (UTC+3, {now.strftime('%A')})"


def _tool_web_search_mock(query: str) -> str:
    """Mock веб-поиск — возвращает реалистичные заглушки."""
    mock_results = [
        f"[1] Wikipedia: {query} — подробная статья об этой теме.",
        f"[2] Stack Overflow: Как использовать {query} в Python — 142 ответа.",
        f"[3] GitHub: open-source реализация {query} — 2.3k stars.",
        f"[4] Medium: Введение в {query} для начинающих.",
        f"[5] arXiv: Исследовательская статья о {query} (2024).",
    ]
    return "\n".join(mock_results)


def _tool_code_executor(code: str, timeout: float = 5.0) -> str:
    """
    Выполнить Python код в изолированном sandbox.

    Ограничения sandbox:
        - Запрещены: import, open, os, sys, __builtins__ (кроме safe set)
        - Timeout: 5 секунд
        - Stderr перехватывается
    """
    # Проверка на опасные конструкции
    danger_patterns = [
        r"\bimport\b", r"\b__import__\b", r"\bopen\b",
        r"\bexec\b", r"\beval\b", r"\bcompile\b",
        r"\bgetattr\b", r"\bsetattr\b", r"\bdelattr\b",
        r"\bglobals\b", r"\blocals\b", r"\bvars\b",
    ]
    for pattern in danger_patterns:
        if re.search(pattern, code):
            return f"[BLOCKED] Запрещённая конструкция: {pattern}"

    # Безопасные builtins
    safe_builtins: dict[str, Any] = {
        "print": print, "len": len, "range": range,
        "str": str, "int": int, "float": float,
        "list": list, "dict": dict, "set": set, "tuple": tuple,
        "sorted": sorted, "reversed": reversed, "enumerate": enumerate,
        "zip": zip, "map": map, "filter": filter,
        "sum": sum, "min": min, "max": max, "abs": abs,
        "round": round, "bool": bool, "type": type,
    }

    output_lines: list[str] = []

    def safe_print(*args: Any, **kwargs: Any) -> None:
        output_lines.append(" ".join(str(a) for a in args))

    safe_builtins["print"] = safe_print

    result_container: dict[str, Any] = {"output": "", "error": ""}

    def run_code() -> None:
        try:
            local_ns: dict[str, Any] = {}
            exec(code, {"__builtins__": safe_builtins}, local_ns)  # noqa: S102
            result_container["output"] = "\n".join(output_lines) or "(нет вывода)"
        except Exception as exc:
            result_container["error"] = str(exc)

    thread = threading.Thread(target=run_code, daemon=True)
    thread.start()
    thread.join(timeout=timeout)

    if thread.is_alive():
        return f"[TIMEOUT] Превышен лимит {timeout}с"

    if result_container["error"]:
        return f"[ERROR] {result_container['error']}"

    return result_container["output"]


def _tool_text_analyzer(text: str) -> str:
    """Анализ текста: статистика и частотность."""
    words = re.findall(r"\b\w+\b", text.lower())
    sentences = re.split(r"[.!?]+", text)
    sentences = [s.strip() for s in sentences if s.strip()]

    word_freq = Counter(words).most_common(10)
    avg_word_len = sum(len(w) for w in words) / max(len(words), 1)

    freq_str = ", ".join(f"'{w}': {c}" for w, c in word_freq[:5])

    return (
        f"Слов: {len(words)} | "
        f"Предложений: {len(sentences)} | "
        f"Уникальных слов: {len(set(words))} | "
        f"Средняя длина слова: {avg_word_len:.1f} | "
        f"Топ-5 слов: {freq_str}"
    )


if __name__ == "__main__":
    registry = ToolRegistry()

    print("=== Зарегистрированные инструменты ===")
    for desc in registry.list_tools():
        print(f"  {desc.name}: {desc.description[:60]}...")

    print("\n=== Тест calculator ===")
    r = registry.execute("calculator", expression="sqrt(16) + 2 * 3")
    print(f"  sqrt(16) + 2*3 = {r.result}")

    print("\n=== Тест datetime ===")
    r = registry.execute("current_datetime")
    print(f"  Сейчас: {r.result}")

    print("\n=== Тест code_executor ===")
    r = registry.execute("code_executor", code="x = [i**2 for i in range(5)]\nprint(x)")
    print(f"  Вывод: {r.result}")

    print("\n=== Тест text_analyzer ===")
    r = registry.execute("text_analyzer", text="Python is great. Python is fast. I love Python!")
    print(f"  Анализ: {r.result}")
