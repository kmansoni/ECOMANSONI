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
from urllib.parse import quote_plus

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
                name="web_search",
                description="Веб-поиск через DuckDuckGo. Возвращает краткие результаты.",
                parameters={
                    "type": "object",
                    "properties": {"query": {"type": "string", "description": "Поисковый запрос"}},
                    "required": ["query"],
                },
                func=_tool_web_search,
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
            # ==========================================================================
            # NEW SUPER AGENT TOOLS
            # ==========================================================================
            Tool(
                name="deep_research",
                description="Глубокое исследование темы: множественные поисковые запросы, анализ источников, проверка фактов.",
                parameters={
                    "type": "object",
                    "properties": {
                        "topic": {"type": "string", "description": "Тема для исследования"},
                        "depth": {"type": "integer", "description": "Глубина (количество запросов)"}
                    },
                    "required": ["topic"],
                },
                func=_tool_deep_research,
            ),
            Tool(
                name="read_url",
                description="Прочитать URL и извлечь контент. Поддерживает веб-страницы, документацию.",
                parameters={
                    "type": "object",
                    "properties": {
                        "url": {"type": "string", "description": "URL для чтения"},
                        "max_length": {"type": "integer", "description": "Максимальная длина"}
                    },
                    "required": ["url"],
                },
                func=_tool_read_url,
            ),
            Tool(
                name="think",
                description="Агент думает: глубокий анализ проблемы, исследование, архитектурное проектирование. Используй для сложных задач.",
                parameters={
                    "type": "object",
                    "properties": {
                        "problem": {"type": "string", "description": "Описание проблемы"},
                        "depth": {"type": "string", "description": "quick/medium/deep"}
                    },
                    "required": ["problem"],
                },
                func=_tool_think,
            ),
            Tool(
                name="remember",
                description="Сохранить важную информацию в долгосрочную память. Запоминает факты, выводы, контекст.",
                parameters={
                    "type": "object",
                    "properties": {
                        "content": {"type": "string", "description": "Что запомнить"},
                        "memory_type": {"type": "string", "description": "episode/fact/insight/plan"},
                        "importance": {"type": "string", "description": "critical/high/medium/low"}
                    },
                    "required": ["content"],
                },
                func=_tool_remember,
            ),
            Tool(
                name="recall",
                description="Поиск в долгосрочной памяти. Находит релевантную информацию по запросу.",
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Поисковый запрос"},
                        "limit": {"type": "integer", "description": "Количество результатов"}
                    },
                    "required": ["query"],
                },
                func=_tool_recall,
            ),
            Tool(
                name="debate",
                description="Критические дебаты: защита позиции + критика + итог. Для сложных решений.",
                parameters={
                    "type": "object",
                    "properties": {
                        "topic": {"type": "string", "description": "Тема дебатов"},
                        "position": {"type": "string", "description": "Позиция для защиты"}
                    },
                    "required": ["topic", "position"],
                },
                func=_tool_debate,
            ),
            Tool(
                name="audit_security",
                description="Аудит кода на безопасность: утечки ключей, SQL injection, XSS, hardcoded secrets.",
                parameters={
                    "type": "object",
                    "properties": {
                        "code": {"type": "string", "description": "Код для аудита"}
                    },
                    "required": ["code"],
                },
                func=_tool_audit_security,
            ),
            Tool(
                name="generate_key",
                description="Сгенерировать криптографический ключ (AES-256). Безопасно хранится в KeyVault.",
                parameters={
                    "type": "object",
                    "properties": {
                        "key_type": {"type": "string", "description": "symmetric/session/api_key"},
                        "level": {"type": "string", "description": "public/internal/confidential/secret"}
                    },
                    "required": [],
                },
                func=_tool_generate_key,
            ),
            Tool(
                name="encrypt_message",
                description="E2EE шифрование сообщения. Использует AES-256-GCM или XChaCha20-Poly1305.",
                parameters={
                    "type": "object",
                    "properties": {
                        "message": {"type": "string", "description": "Сообщение для шифрования"},
                        "key_id": {"type": "string", "description": "ID ключа из KeyVault"}
                    },
                    "required": ["message", "key_id"],
                },
                func=_tool_encrypt_message,
            ),
            Tool(
                name="decrypt_message",
                description="Расшифровать E2EE сообщение.",
                parameters={
                    "type": "object",
                    "properties": {
                        "encrypted": {"type": "string", "description": "Зашифрованное сообщение"},
                        "key_id": {"type": "string", "description": "ID ключа"},
                        "nonce": {"type": "string", "description": "Nonce/IV"}
                    },
                    "required": ["encrypted", "key_id"],
                },
                func=_tool_decrypt_message,
            ),
            Tool(
                name="design_architecture",
                description="Проектирование системы «на 10000 шагов вперёд»: полная архитектура, компоненты, безопасность, инфраструктура.",
                parameters={
                    "type": "object",
                    "properties": {
                        "system_type": {"type": "string", "description": "Тип системы (мессенджер, CRM, и т.д.)"},
                        "requirements": {"type": "string", "description": "Требования через запятую"}
                    },
                    "required": ["system_type", "requirements"],
                },
                func=_tool_design_architecture,
            ),
            Tool(
                name="fact_check",
                description="Проверить факт: ищет подтверждения и опровержения, оценивает надёжность.",
                parameters={
                    "type": "object",
                    "properties": {
                        "claim": {"type": "string", "description": "Утверждение для проверки"}
                    },
                    "required": ["claim"],
                },
                func=_tool_fact_check,
            ),
            Tool(
                name="memory_stats",
                description="Получить статистику памяти: количество воспоминаний, токенов, сессий.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                func=_tool_memory_stats,
            ),
            Tool(
                name="brain_dump",
                description="Получить «дамп мозга» — все важные знания агента.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
                func=_tool_brain_dump,
            ),
            Tool(
                name="test_encryption",
                description="Тест стойкости шифрования: проверка encrypt/decrypt, random IV, ключевые параметры.",
                parameters={
                    "type": "object",
                    "properties": {
                        "key_id": {"type": "string", "description": "ID ключа для теста"}
                    },
                    "required": ["key_id"],
                },
                func=_tool_test_encryption,
            ),
            Tool(
                name="dns_audit",
                description="Аудит DNS записей домена: A, AAAA, MX, TXT записи.",
                parameters={
                    "type": "object",
                    "properties": {
                        "domain": {"type": "string", "description": "Домен для аудита"}
                    },
                    "required": ["domain"],
                },
                func=_tool_dns_audit,
            ),
            Tool(
                name="get_plan",
                description="Получить архитектурный план по ID.",
                parameters={
                    "type": "object",
                    "properties": {
                        "plan_id": {"type": "string", "description": "ID плана"}
                    },
                    "required": ["plan_id"],
                },
                func=_tool_get_plan,
            ),
            Tool(
                name="read_topics",
                description="Прочитать несколько тем: research для списка тем параллельно.",
                parameters={
                    "type": "object",
                    "properties": {
                        "topics": {"type": "string", "description": "Темы через запятую"}
                    },
                    "required": ["topics"],
                },
                func=_tool_read_topics,
            ),
            Tool(
                name="learn_from_experience",
                description="Агент учится на основе опыта: сохраняет инсайты из запроса-ответа.",
                parameters={
                    "type": "object",
                    "properties": {
                        "request": {"type": "string", "description": "Запрос"},
                        "response": {"type": "string", "description": "Ответ"},
                        "insight": {"type": "string", "description": "Вывод/инсайт"}
                    },
                    "required": ["request", "insight"],
                },
                func=_tool_learn_from_experience,
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


def _tool_web_search(query: str) -> str:
    """Веб-поиск через DuckDuckGo HTML."""
    try:
        import httpx
    except ImportError:
        return "Веб-поиск недоступен (httpx не установлен). Отвечаю на основе имеющихся знаний."

    url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
    try:
        resp = httpx.get(url, timeout=8.0, follow_redirects=True, headers={
            "User-Agent": "Mozilla/5.0 (compatible; AriaBot/1.0)",
        })
        resp.raise_for_status()
    except Exception as exc:
        logger.warning("Ошибка веб-поиска: %s", exc)
        return "Веб-поиск недоступен. Отвечаю на основе имеющихся знаний."

    # Извлекаем результаты из HTML
    snippets: list[str] = []
    for i, match in enumerate(
        re.finditer(r'class="result__snippet"[^>]*>(.*?)</a>', resp.text, re.DOTALL),
        start=1,
    ):
        text = re.sub(r"<[^>]+>", "", match.group(1)).strip()
        if text:
            snippets.append(f"[{i}] {text}")
        if i >= 5:
            break

    if not snippets:
        return "Поиск не дал результатов. Отвечаю на основе имеющихся знаний."

    return "\n".join(snippets)


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


# =============================================================================
# NEW SUPER AGENT TOOLS IMPLEMENTATIONS
# =============================================================================

# Глобальные instance для новых систем
_memory_manager = None
_brain_system = None
_security_system = None
_research_manager = None


def _get_memory_manager():
    """Получить MemoryManager."""
    global _memory_manager
    if _memory_manager is None:
        try:
            from .memory_system import get_memory_manager
            _memory_manager = get_memory_manager()
        except ImportError:
            _memory_manager = None
    return _memory_manager


def _get_brain():
    """Получить BrainSystem."""
    global _brain_system
    if _brain_system is None:
        try:
            from .brain_system import get_brain_system
            _brain_system = get_brain_system()
        except ImportError:
            _brain_system = None
    return _brain_system


def _get_security():
    """Получить SecuritySystem."""
    global _security_system
    if _security_system is None:
        try:
            from .security_system import get_security_system
            _security_system = get_security_system()
        except ImportError:
            _security_system = None
    return _security_system


def _get_research():
    """Получить ResearchManager."""
    global _research_manager
    if _research_manager is None:
        try:
            from .research_system import get_research_manager
            _research_manager = get_research_manager()
        except ImportError:
            _research_manager = None
    return _research_manager


def _tool_deep_research(topic: str, depth: int = 10) -> str:
    """Глубокое исследование темы."""
    rm = _get_research()
    if not rm:
        return "❌ Research system недоступна. Установи зависимости."
    
    result = rm.investigate(topic, deep=True)
    
    lines = [
        f"🔬 ГЛУБОКОЕ ИССЛЕДОВАНИЕ: {topic}",
        f"Найдено источников: {result['sources_count']}",
        f"Уверенность: {result['confidence']:.2%}",
        "",
        "📚 Findings:"
    ]
    
    for i, f in enumerate(result['findings'][:10], 1):
        lines.append(f"  {i}. {f[:200]}")
    
    return "\n".join(lines)


def _tool_read_url(url: str, max_length: int = 50000) -> str:
    """Прочитать URL."""
    from .research_system import BookReader
    
    reader = BookReader()
    source = reader.read_url(url, max_length)
    
    lines = [
        f"📖 {source.title or url}",
        "",
        f"Содержимое ({len(source.content)} чар):",
        source.content[:5000],
    ]
    
    return "\n".join(lines)


def _tool_think(problem: str, depth: str = "deep") -> str:
    """Агент думает."""
    brain = _get_brain()
    if not brain:
        return "❌ Brain system недоступна."
    
    return brain.think(problem, depth)


def _tool_remember(
    content: str,
    memory_type: str = "fact",
    importance: str = "medium",
) -> str:
    """Запомнить информацию."""
    mgr = _get_memory_manager()
    if not mgr:
        return "❌ Memory system недоступна."
    
    try:
        from .memory_system import MemoryType, Importance
        
        type_map = {
            "episode": MemoryType.EPISODE,
            "fact": MemoryType.FACT,
            "insight": MemoryType.INSIGHT,
            "plan": MemoryType.PLAN,
        }
        imp_map = {
            "critical": Importance.CRITICAL,
            "high": Importance.HIGH,
            "medium": Importance.MEDIUM,
            "low": Importance.LOW,
        }
        
        mgr.remember(
            content,
            type_map.get(memory_type, MemoryType.FACT),
            imp_map.get(importance, Importance.MEDIUM),
        )
        
        return f"✅ Сохранено: {content[:100]}..."
    except Exception as e:
        return f"❌ Ошибка: {e}"


def _tool_recall(query: str, limit: int = 10) -> str:
    """Вспомнить."""
    mgr = _get_memory_manager()
    if not mgr:
        return "❌ Memory system недоступна."
    
    results = mgr.recall(query, limit)
    
    if not results:
        return "Ничего не найдено."
    
    lines = [f"🔍 Найдено: {len(results)} воспоминаний", ""]
    for r in results:
        lines.append(f"• {r.summary or r.content[:150]}")
    
    return "\n".join(lines)


def _tool_debate(topic: str, position: str) -> str:
    """Критические дебаты."""
    brain = _get_brain()
    if not brain:
        return "❌ Brain system недоступна."
    
    return brain.debate(topic, position)


def _tool_audit_security(code: str) -> str:
    """Аудит безопасности."""
    security = _get_security()
    if not security:
        return "❌ Security system недоступна."
    
    audit = security.audit_code(code)
    
    lines = [
        f"🔐 АУДИТ БЕЗОПАСНОСТИ",
        f"Оценка: {audit.score}/100",
        "",
        f"Пр��блемы ({len(audit.issues)}):"
    ]
    
    for issue in audit.issues:
        lines.append(f"  • {issue}")
    
    if not audit.issues:
        lines.append("  ✅ Проблем не обнаружено!")
    
    return "\n".join(lines)


def _tool_generate_key(key_type: str = "session", level: str = "secret") -> str:
    """Сгенерировать ключ."""
    security = _get_security()
    if not security:
        return "❌ Security system недоступна."
    
    from .security_system import KeyType, SecretLevel
    
    type_map = {
        "symmetric": KeyType.SYMMETRIC,
        "session": KeyType.SESSION,
        "api_key": KeyType.API_KEY,
    }
    level_map = {
        "internal": SecretLevel.INTERNAL,
        "confidential": SecretLevel.CONFIDENTIAL,
        "secret": SecretLevel.SECRET,
    }
    
    key = security.vault.generate_key(
        type_map.get(key_type, KeyType.SESSION),
        level_map.get(level, SecretLevel.SECRET),
    )
    
    return f"🔑 Ключ создан: {key.id}\nТип: {key.type.value}\nАлгоритм: {key.algorithm}"


def _tool_encrypt_message(message: str, key_id: str) -> str:
    """Зашифровать сообщение."""
    security = _get_security()
    if not security:
        return "❌ Security system недоступна."
    
    try:
        encrypted, nonce = security.encryption.encrypt_message(message, key_id)
        return f"🔐 Зашифровано:\n{encrypted}\n\nNonce: {nonce}"
    except Exception as e:
        return f"❌ Ошибка: {e}"


def _tool_decrypt_message(encrypted: str, key_id: str, nonce: str = "simple") -> str:
    """Расшифровать сообщение."""
    security = _get_security()
    if not security:
        return "❌ Security system недоступна."
    
    try:
        decrypted = security.encryption.decrypt_message(encrypted, key_id, nonce)
        return f"🔓 Расшифровано: {decrypted}"
    except Exception as e:
        return f"❌ Ошибка: {e}"


def _tool_design_architecture(system_type: str, requirements: str) -> str:
    """Проектирование архитектуры."""
    brain = _get_brain()
    if not brain:
        return "❌ Brain system недоступна."
    
    full_problem = f"Создай {system_type} с требованиями: {requirements}"
    return brain.think(full_problem, depth="deep")


def _tool_fact_check(claim: str) -> str:
    """Проверить факт."""
    rm = _get_research()
    if not rm:
        return "❌ Research system недоступна."
    
    from .research_system import WebResearcher
    
    researcher = WebResearcher(result=rm.researcher.web_search)
    result = researcher.fact_check(claim)
    
    lines = [
        f"🔍 FACT CHECK: {claim}",
        "",
        f"Верифицировано: {'✅ ДА' if result['verified'] else '❌ НЕТ'}",
        f"Подтверждений: {result['positive_sources']}",
        f"Опровержений: {result['negative_sources']}",
        f"Уверенность: {result['confidence']:.2%}",
    ]
    
    return "\n".join(lines)


def _tool_memory_stats() -> str:
    """Статистика памяти."""
    mgr = _get_memory_manager()
    if not mgr:
        return "❌ Memory system недоступна."
    
    stats = mgr.get_stats()
    
    lines = [
        "📊 СТАТИСТИКА ПАМЯТИ",
        f"Всего записей: {stats['memory']['total_entries']}",
        f"Токенов (приблизительно): {stats['memory']['total_tokens_approx']}",
        f"Контекст токенов: {stats['context_tokens']}",
        f"Запросов в сессии: {stats['session_requests']}",
    ]
    
    return "\n".join(lines)


def _tool_brain_dump() -> str:
    """Дамп мозга."""
    mgr = _get_memory_manager()
    if not mgr:
        return "❌ Memory system недоступна."
    
    return mgr.get_brain_dump()


def _tool_test_encryption(key_id: str) -> str:
    """Тест шифрования."""
    security = _get_security()
    if not security:
        return "❌ Security system недоступна."
    
    result = security.test_encryption(key_id)
    
    lines = ["🔐 ТЕСТ ШИФРОВАНИЯ", ""]
    
    for k, v in result.items():
        lines.append(f"  {k}: {v}")
    
    return "\n".join(lines)


def _tool_dns_audit(domain: str) -> str:
    """Аудит DNS."""
    security = _get_security()
    if not security:
        return "❌ Security system недоступна."
    
    result = security.auditor.audit_dns(domain)
    
    lines = [f"🌐 DNS АУДИТ: {domain}", ""]
    
    for rec_type, values in result['records'].items():
        lines.append(f"  {rec_type}: {values}")
    
    return "\n".join(lines)


def _tool_get_plan(plan_id: str) -> str:
    """Получить план."""
    brain = _get_brain()
    if not brain:
        return "❌ Brain system недоступна."
    
    plan = brain.get_plan(plan_id)
    if not plan:
        return "План не найден."
    
    lines = [
        f"🏗️ ПЛАН: {plan.name}",
        "",
        f"Проблема: {plan.problem_statement}",
        "Требования:", *[f"  - {r}" for r in plan.requirements],
    ]
    
    return "\n".join(lines)


def _tool_read_topics(topics: str) -> str:
    """Прочитать несколько тем."""
    rm = _get_research()
    if not rm:
        return "❌ Research system недоступна."
    
    topic_list = [t.strip() for t in topics.split(",")]
    results = rm.read_topics(topic_list)
    
    lines = []
    for r in results:
        lines.append(f"\n📚 {r['topic']}:")
        lines.append(f"  Источников: {r['sources_count']}")
        lines.append(f"  Findings: {len(r['findings'])}")
    
    return "\n".join(lines)


def _tool_learn_from_experience(request: str, response: str, insight: str) -> str:
    """Учиться на опыте."""
    mgr = _get_memory_manager()
    if not mgr:
        return "❌ Memory system недоступна."
    
    mgr.learn(request, response, insight)
    
    return f"✅ Инсайт сохранён: {insight[:100]}..."


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
