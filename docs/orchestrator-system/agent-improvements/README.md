# Рекомендации по улучшению агента

> Анализ лучших open-source агентных фреймворков и конкретные рекомендации по внедрению передовых техник в систему.

---

## Содержание

- [Обзор open-source фреймворков](#обзор-open-source-фреймворков)
- [Сравнительный анализ](#сравнительный-анализ)
- [Рекомендация 1: CodeAct паттерн (OpenHands)](#рекомендация-1-codeact-паттерн-openhands)
- [Рекомендация 2: Event-Driven Architecture (OpenHands)](#рекомендация-2-event-driven-architecture-openhands)
- [Рекомендация 3: ACI — Agent Computer Interface (SWE-agent)](#рекомендация-3-aci--agent-computer-interface-swe-agent)
- [Рекомендация 4: Group Chat / Multi-Agent Conversation (AutoGen)](#рекомендация-4-group-chat--multi-agent-conversation-autogen)
- [Рекомендация 5: Graph-based State Machine (LangGraph)](#рекомендация-5-graph-based-state-machine-langgraph)
- [Рекомендация 6: Type-safe Agent Responses (Pydantic AI)](#рекомендация-6-type-safe-agent-responses-pydantic-ai)
- [Рекомендация 7: Secure Code Sandbox (E2B)](#рекомендация-7-secure-code-sandbox-e2b)
- [Рекомендация 8: Tree of Thoughts Reasoning](#рекомендация-8-tree-of-thoughts-reasoning)
- [Рекомендация 9: Reflexion — Self-Critique Loop](#рекомендация-9-reflexion--self-critique-loop)
- [Рекомендация 10: DSPy — Оптимизация промптов](#рекомендация-10-dspy--оптимизация-промптов)
- [Рекомендация 11: Skill Library (Reusable Agent Skills)](#рекомендация-11-skill-library-reusable-agent-skills)
- [Рекомендация 12: Constitutional AI Safety](#рекомендация-12-constitutional-ai-safety)
- [Рекомендация 13: SWE-bench Benchmark](#рекомендация-13-swe-bench-benchmark)
- [Рекомендация 14: Параллельные вызовы инструментов](#рекомендация-14-параллельные-вызовы-инструментов)
- [Рекомендация 15: Streaming Structured Outputs](#рекомендация-15-streaming-structured-outputs)
- [Roadmap внедрения](#roadmap-внедрения)
- [Матрица влияния](#матрица-влияния)

---

## Обзор open-source фреймворков

### Топ-12 открытых агентных систем

| Проект | GitHub | ⭐ Stars | Ключевая инновация | Применимость |
|--------|--------|---------|-------------------|--------------|
| **OpenHands** | [All-Hands-AI/OpenHands](https://github.com/All-Hands-AI/OpenHands) | 40k+ | CodeAct: Python-код как действия, Docker sandbox | 🔴 Критически важно |
| **SWE-agent** | [princeton-nlp/SWE-agent](https://github.com/princeton-nlp/SWE-agent) | 14k+ | ACI: структурированный просмотр кода с контекстом | 🔴 Критически важно |
| **AutoGen** | [microsoft/autogen](https://github.com/microsoft/autogen) | 35k+ | GroupChat: агенты разговаривают друг с другом | 🟠 Высокая |
| **CrewAI** | [joaomdmoura/crewAI](https://github.com/crewAIInc/crewAI) | 25k+ | Role-based crews с делегированием задач | 🟠 Высокая |
| **LangGraph** | [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | 10k+ | Stateful graph: явные переходы состояний + checkpointing | 🟠 Высокая |
| **Smolagents** | [huggingface/smolagents](https://github.com/huggingface/smolagents) | 12k+ | CodeAgent: агент пишет Python вместо JSON tool calls | 🔴 Критически важно |
| **Pydantic AI** | [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) | 8k+ | Type-safe ответы, DI для агентов | 🟡 Средняя |
| **Agno** (Phidata) | [agno-agi/agno](https://github.com/agno-agi/agno) | 18k+ | Multi-modal teams, structured responses | 🟡 Средняя |
| **MetaGPT** | [geekan/MetaGPT](https://github.com/geekan/MetaGPT) | 45k+ | Симуляция software company: PM → Dev → QA | 🟡 Средняя |
| **E2B** | [e2b-dev/e2b](https://github.com/e2b-dev/e2b) | 7k+ | Безопасный cloud sandbox для выполнения кода | 🔴 Критически важно |
| **DSPy** | [stanfordnlp/dspy](https://github.com/stanfordnlp/dspy) | 20k+ | Программное конфигурирование LLM, auto-optimization | 🟡 Средняя |
| **Reflexion** | [noahshinn/reflexion](https://github.com/noahshinn/reflexion) | 2k+ | Verbal reinforcement: агент критикует свои ответы | 🟠 Высокая |

---

## Сравнительный анализ

### Наша система vs лучшие практики

| Аспект | Наша система | Лучшая практика | Gap |
|--------|-------------|----------------|-----|
| **Выполнение действий** | JSON tool calls | Python код (CodeAct) | ❌ Ограничен |
| **Sandbox** | Нет изоляции | Docker / E2B | ❌ Отсутствует |
| **Агентная коммуникация** | Message Bus | Group Chat (AutoGen) | ⚠️ Частично |
| **Состояния агента** | Implicit | Explicit graph (LangGraph) | ❌ Неявные |
| **Просмотр кода** | readFile() | ACI с line numbers + context | ⚠️ Базовый |
| **Типобезопасность** | Базовая | Pydantic AI full types | ⚠️ Частично |
| **Self-critique** | Нет | Reflexion loop | ❌ Отсутствует |
| **Промпт оптимизация** | Ручная | DSPy auto-compile | ❌ Отсутствует |
| **Бенчмарк** | Нет | SWE-bench | ❌ Отсутствует |
| **Параллельные инструменты** | Sequential | Parallel async calls | ⚠️ Частично |

---

## Рекомендация 1: CodeAct паттерн (OpenHands)

**Источник**: [OpenHands CodeAct](https://github.com/All-Hands-AI/OpenHands) — вместо JSON tool calls агент **пишет и выполняет Python код**

### Почему это лучше текущего подхода

| Текущий подход (JSON tools) | CodeAct (Python code) |
|-----------------------------|----------------------|
| `{"tool": "read_file", "path": "..."}` | `content = open("auth.py").read()` |
| Ограничен заданными инструментами | Полная мощь Python |
| Один инструмент за вызов | Сложная логика в одном блоке |
| Нет условной логики | `if "TODO" in content: fix_it()` |
| Нет циклов | `for file in glob("**/*.py"):` |

### Архитектура CodeAct

```
LLM генерирует Python-код
         │
         ▼
   CodeActExecutor
         │
    ┌────▼─────┐
    │  Sandbox │  ← изолированный Python интерпретатор
    │ (Docker) │     с доступом к инструментам
    └────┬─────┘
         │
         ▼
   Observation (stdout + stderr + return value)
         │
         ▼
   LLM получает результат → следующий шаг
```

### Реализация

```python
# ai_engine/agent/codeact_agent.py

CODEACT_SYSTEM_PROMPT = """
You are an AI software engineer. Solve tasks by writing Python code.

You have access to these pre-imported modules and helpers:
- `workspace`: WorkspaceHelper with methods:
    workspace.read_file(path: str) -> str
    workspace.write_file(path: str, content: str) -> None
    workspace.list_files(pattern: str) -> list[str]
    workspace.run_command(cmd: str) -> tuple[str, str, int]  # stdout, stderr, returncode
    workspace.get_symbols(path: str) -> list[Symbol]
    workspace.git_diff() -> str
- `memory`: MemoryManager for storing facts
- `search`: semantic search over codebase

Write Python code to solve the task. Be specific and complete.
If you need to see a file first, read it. Don't assume file contents.

After your code block, the execution result will be shown.
Use `print()` to output information for your next reasoning step.

Task: {task}
"""

@dataclass 
class CodeActStep:
    code: str          # Python код, сгенерированный LLM
    stdout: str        # Вывод выполнения
    stderr: str        # Ошибки
    return_code: int   # 0 = успех
    timestamp: str

class CodeActAgent:
    """Агент, использующий Python код как действия (CodeAct паттерн)."""

    def __init__(
        self,
        llm: LLMClient,
        sandbox: CodeSandbox,
        workspace: WorkspaceHelper,
        memory: MemoryManager,
        max_steps: int = 20,
    ):
        self.llm = llm
        self.sandbox = sandbox
        self.workspace = workspace
        self.memory = memory
        self.max_steps = max_steps

    async def run(self, task: str) -> AgentResult:
        history: list[CodeActStep] = []
        messages = [
            {"role": "system", "content": CODEACT_SYSTEM_PROMPT.format(task=task)},
        ]

        for step_num in range(self.max_steps):
            # Агент генерирует Python код
            response = await self.llm.complete(messages)

            # Извлечь блок кода из ответа
            code = self._extract_code_block(response)
            if not code:
                # LLM дал финальный ответ без кода
                return AgentResult(
                    final_answer=response,
                    steps=history,
                    success=True
                )

            # Выполнить код в sandbox
            stdout, stderr, rc = await self.sandbox.execute(
                code=code,
                context={
                    "workspace": self.workspace,
                    "memory": self.memory,
                }
            )

            step = CodeActStep(
                code=code,
                stdout=stdout,
                stderr=stderr,
                return_code=rc,
                timestamp=datetime.now().isoformat()
            )
            history.append(step)

            # Добавить результат в историю для следующего шага
            messages.append({"role": "assistant", "content": response})
            messages.append({
                "role": "user",
                "content": f"Execution result:\n```\nSTDOUT: {stdout}\nSTDERR: {stderr}\nReturn code: {rc}\n```"
            })

            # Проверить: выполнено ли задание?
            if self._is_task_complete(stdout, stderr, rc):
                return AgentResult(final_answer=stdout, steps=history, success=True)

        return AgentResult(
            final_answer="Max steps reached",
            steps=history,
            success=False
        )

    def _extract_code_block(self, response: str) -> Optional[str]:
        """Извлечь ```python ... ``` блок из ответа LLM."""
        pattern = r"```(?:python)?\n(.*?)```"
        match = re.search(pattern, response, re.DOTALL)
        return match.group(1).strip() if match else None
```

### Пример работы CodeAct агента

```
Task: "Find all TODO comments in the project and create a GitHub issue for each"

[Step 1 - Code]:
```python
todos = []
for filepath in workspace.list_files("**/*.py"):
    content = workspace.read_file(filepath)
    for i, line in enumerate(content.split('\n'), 1):
        if '# TODO' in line:
            todos.append({
                'file': filepath,
                'line': i, 
                'text': line.strip()
            })
print(f"Found {len(todos)} TODOs:")
for t in todos[:5]:
    print(f"  {t['file']}:{t['line']} — {t['text']}")
```

[Observation]:
Found 23 TODOs:
  src/auth/jwt.py:45 — # TODO: add refresh token rotation
  src/auth/jwt.py:89 — # TODO: implement token blacklist
  ...

[Step 2 - Code]:
```python
for todo in todos:
    title = f"[TODO] {todo['file']}:{todo['line']}"
    body = f"**File**: `{todo['file']}`\n**Line**: {todo['line']}\n```\n{todo['text']}\n```"
    stdout, _, rc = workspace.run_command(
        f"gh issue create --title '{title}' --body '{body}' --label 'tech-debt'"
    )
    print(f"Created: {stdout.strip()}")
```
```

---

## Рекомендация 2: Event-Driven Architecture (OpenHands)

**Источник**: [OpenHands EventStream](https://github.com/All-Hands-AI/OpenHands/blob/main/openhands/events)

### Event Stream vs Message Bus

OpenHands использует **Event Stream** — персистентный лог всех событий агента. Это позволяет:
- Восстановить любое состояние агента из лога
- Полный аудит каждого действия и наблюдения
- Time-travel debugging
- Replay сессии

```python
# ai_engine/orchestrator/event_stream.py

from enum import Enum
from dataclasses import dataclass, field
from typing import Union
import json
import time

class EventType(Enum):
    # Actions (агент → среда)
    MESSAGE = "message"
    RUN_CODE = "run_code"
    READ_FILE = "read_file"
    WRITE_FILE = "write_file"
    RUN_COMMAND = "run_command"
    BROWSE_URL = "browse_url"
    THINK = "think"         # Внутреннее рассуждение (не выполняется)
    FINISH = "finish"

    # Observations (среда → агент)
    CODE_OUTPUT = "code_output"
    FILE_CONTENT = "file_content"
    COMMAND_OUTPUT = "command_output"
    BROWSER_OUTPUT = "browser_output"
    ERROR = "error"
    NULL = "null"           # Ничего не произошло

@dataclass
class Event:
    id: int
    type: EventType
    source: str              # "agent" | "user" | "environment"
    timestamp: float = field(default_factory=time.time)
    payload: dict = field(default_factory=dict)
    cause: int = -1          # ID события, вызвавшего это (для трассировки)

class EventStream:
    """
    Персистентный лог всех событий агентной сессии.
    
    Гарантии:
    - Append-only (события никогда не удаляются)
    - Полная воспроизводимость сессии
    - Атомарная запись (thread-safe)
    """

    def __init__(self, session_id: str, storage_path: str):
        self.session_id = session_id
        self.storage_path = storage_path
        self._events: list[Event] = []
        self._next_id = 0
        self._load_existing()

    def add_event(
        self,
        event_type: EventType,
        source: str,
        payload: dict,
        cause: int = -1
    ) -> Event:
        event = Event(
            id=self._next_id,
            type=event_type,
            source=source,
            payload=payload,
            cause=cause
        )
        self._events.append(event)
        self._next_id += 1
        self._persist(event)
        return event

    def get_events(
        self,
        event_types: list[EventType] = None,
        source: str = None,
        since_id: int = 0
    ) -> list[Event]:
        events = self._events[since_id:]
        if event_types:
            events = [e for e in events if e.type in event_types]
        if source:
            events = [e for e in events if e.source == source]
        return events

    def replay(self, up_to_id: int) -> list[Event]:
        """Воспроизвести сессию до определённого события."""
        return [e for e in self._events if e.id <= up_to_id]

    def _persist(self, event: Event):
        filepath = f"{self.storage_path}/{self.session_id}.jsonl"
        with open(filepath, 'a') as f:
            f.write(json.dumps({
                "id": event.id,
                "type": event.type.value,
                "source": event.source,
                "timestamp": event.timestamp,
                "payload": event.payload,
                "cause": event.cause
            }) + '\n')

    def _load_existing(self):
        """Загрузить историю событий из файла при перезапуске."""
        import os
        filepath = f"{self.storage_path}/{self.session_id}.jsonl"
        if not os.path.exists(filepath):
            return
        with open(filepath) as f:
            for line in f:
                data = json.loads(line)
                self._events.append(Event(
                    id=data["id"],
                    type=EventType(data["type"]),
                    source=data["source"],
                    timestamp=data["timestamp"],
                    payload=data["payload"],
                    cause=data["cause"]
                ))
        if self._events:
            self._next_id = self._events[-1].id + 1
```

---

## Рекомендация 3: ACI — Agent Computer Interface (SWE-agent)

**Источник**: [SWE-agent ACI](https://github.com/princeton-nlp/SWE-agent/blob/main/sweagent/environment/utils.py)

### Проблема текущего подхода

Агент читает файлы через `readFile(path)` и получает **весь текст** — без номеров строк, без контекста, без навигации. При больших файлах (1000+ строк) агент теряет ориентацию.

### Решение: Agent Computer Interface

SWE-agent разработал специализированный интерфейс для работы агента с кодом:

```python
# ai_engine/agent/aci.py — Agent Computer Interface

class AgentComputerInterface:
    """
    Специализированный интерфейс агента для работы с кодом.
    
    Ключевые улучшения vs простого readFile:
    1. Показывает номера строк ВСЕГДА
    2. open() фокусирует на нужном месте файла
    3. scroll_up/down для навигации
    4. search_file — поиск внутри файла с контекстом
    5. Автоматический linter feedback после edit
    6. goto_line — прыжок к строке с окном ±20 строк
    """

    WINDOW_SIZE = 100  # Строк видимых одновременно

    def __init__(self, workspace_path: str, linter_cmd: str = "flake8"):
        self.workspace = workspace_path
        self.linter = linter_cmd
        self._open_file: Optional[str] = None
        self._current_line: int = 1

    def open(self, path: str, line_number: int = 1) -> str:
        """
        Открыть файл и показать window вокруг line_number с номерами строк.
        
        Returns:
            Форматированный вывод с номерами строк:
            [File: src/auth.py (245 lines total)]
            [Current line: 42 (lines 1-50 shown)]
            
             1: import jwt
             2: from typing import Optional
            ...
            42: def decode_token(token: str) -> dict:  ← CURRENT
            43:     try:
            ...
            50:     except jwt.InvalidTokenError:
        """
        full_path = os.path.join(self.workspace, path)
        with open(full_path) as f:
            lines = f.readlines()

        self._open_file = path
        self._current_line = line_number
        total = len(lines)

        start = max(0, line_number - self.WINDOW_SIZE // 2)
        end = min(total, start + self.WINDOW_SIZE)

        output = [f"[File: {path} ({total} lines total)]"]
        output.append(f"[Showing lines {start+1}-{end} of {total}]")
        output.append("")

        for i, line in enumerate(lines[start:end], start=start+1):
            marker = "  ←" if i == line_number else ""
            output.append(f"{i:4d}: {line.rstrip()}{marker}")

        return "\n".join(output)

    def goto_line(self, line_number: int) -> str:
        """Перейти к строке в открытом файле."""
        if not self._open_file:
            return "Error: No file is open. Use open() first."
        return self.open(self._open_file, line_number)

    def scroll_down(self) -> str:
        """Прокрутить вниз на WINDOW_SIZE строк."""
        return self.goto_line(self._current_line + self.WINDOW_SIZE)

    def scroll_up(self) -> str:
        """Прокрутить вверх на WINDOW_SIZE строк."""
        return self.goto_line(max(1, self._current_line - self.WINDOW_SIZE))

    def search_file(self, query: str, file_path: str = None) -> str:
        """
        Найти строки, содержащие query, с контекстом ±3 строки.
        
        Returns:
            Found 3 matches for 'decode_token':
            
            Line 42:
              40:     ...
              41:     
            → 42: def decode_token(token: str) -> dict:
              43:     try:
              44:         payload = jwt.decode(
            ...
        """
        path = file_path or self._open_file
        if not path:
            return "Error: specify file_path or open a file first"

        full_path = os.path.join(self.workspace, path)
        with open(full_path) as f:
            lines = f.readlines()

        matches = []
        for i, line in enumerate(lines):
            if query.lower() in line.lower():
                matches.append(i)

        if not matches:
            return f"No matches found for '{query}' in {path}"

        result = [f"Found {len(matches)} matches for '{query}' in {path}:\n"]
        CONTEXT = 3

        for match_line in matches[:10]:  # Максимум 10 совпадений
            start = max(0, match_line - CONTEXT)
            end = min(len(lines), match_line + CONTEXT + 1)
            result.append(f"Line {match_line + 1}:")
            for i in range(start, end):
                prefix = "→ " if i == match_line else "  "
                result.append(f"  {prefix}{i+1:4d}: {lines[i].rstrip()}")
            result.append("")

        return "\n".join(result)

    def edit(
        self,
        start_line: int,
        end_line: int,
        new_content: str
    ) -> str:
        """
        Заменить строки start_line..end_line на new_content.
        Автоматически запускает linter и показывает ошибки.
        """
        if not self._open_file:
            return "Error: No file is open."

        full_path = os.path.join(self.workspace, self._open_file)
        with open(full_path) as f:
            lines = f.readlines()

        new_lines = new_content.split('\n')
        new_lines = [l + '\n' for l in new_lines]

        # Заменить диапазон строк
        updated = lines[:start_line-1] + new_lines + lines[end_line:]

        with open(full_path, 'w') as f:
            f.writelines(updated)

        # Запустить linter
        lint_result = self._run_linter(full_path)

        result = f"[File edited: lines {start_line}-{end_line} replaced]\n"
        if lint_result:
            result += f"\n[Linter warnings]:\n{lint_result}\n"
            result += "Please fix the linter errors before continuing.\n"

        # Показать результат редактирования
        result += "\n" + self.goto_line(start_line)
        return result

    def _run_linter(self, filepath: str) -> str:
        """Запустить linter, вернуть ошибки или пустую строку."""
        try:
            result = subprocess.run(
                [self.linter, filepath, "--max-line-length=120"],
                capture_output=True, text=True, timeout=10
            )
            return result.stdout + result.stderr if result.returncode != 0 else ""
        except Exception:
            return ""

    def find_file(self, filename: str) -> str:
        """Найти файл по имени в workspace."""
        results = []
        for root, dirs, files in os.walk(self.workspace):
            # Исключить node_modules, .git, __pycache__
            dirs[:] = [d for d in dirs if d not in {
                'node_modules', '.git', '__pycache__', 'dist', '.next'
            }]
            for file in files:
                if filename.lower() in file.lower():
                    rel = os.path.relpath(os.path.join(root, file), self.workspace)
                    results.append(rel)

        if not results:
            return f"File '{filename}' not found in workspace"
        return "Found files:\n" + "\n".join(f"  {r}" for r in results[:20])
```

---

## Рекомендация 4: Group Chat / Multi-Agent Conversation (AutoGen)

**Источник**: [AutoGen GroupChat](https://github.com/microsoft/autogen)

### Концепция: агенты разговаривают между собой

В отличие от нашей системы (оркестратор → агент → результат), AutoGen позволяет агентам **напрямую общаться**:

```
User ──► GroupChatManager
              │
         ┌────▼────────────────────┐
         │   Group Chat            │
         │                         │
         │  PlannerAgent           │
         │      ↕ (messages)       │
         │  CoderAgent             │
         │      ↕ (messages)       │
         │  ReviewerAgent          │
         │      ↕ (messages)       │
         │  UserProxy (approval)   │
         └─────────────────────────┘
```

### Реализация GroupChat

```python
# ai_engine/orchestrator/group_chat.py

from dataclasses import dataclass, field
from typing import Optional, Callable
import asyncio

@dataclass
class ChatMessage:
    sender: str      # Имя агента-отправителя
    content: str     # Текст сообщения
    timestamp: float = field(default_factory=time.time)

class GroupChatAgent:
    """Базовый агент для участия в групповом чате."""

    def __init__(
        self,
        name: str,
        role_description: str,
        llm: LLMClient,
        max_consecutive_auto_reply: int = 5,
    ):
        self.name = name
        self.role_description = role_description
        self.llm = llm
        self.max_consecutive_auto_reply = max_consecutive_auto_reply

    async def generate_reply(
        self,
        messages: list[ChatMessage],
        sender_name: str
    ) -> Optional[str]:
        """
        Сгенерировать ответ на основе истории группового чата.
        Возвращает None если агент решает не отвечать.
        """
        prompt = self._build_prompt(messages)
        response = await self.llm.complete(prompt)

        # Проверить: агент хочет завершить чат?
        if "TERMINATE" in response:
            return None

        return response

    def _build_prompt(self, messages: list[ChatMessage]) -> str:
        history = "\n".join([
            f"{m.sender}: {m.content}"
            for m in messages[-20:]  # Последние 20 сообщений
        ])
        return f"""You are {self.name}. {self.role_description}

Chat history:
{history}

Your turn. Reply to continue solving the task, or say TERMINATE if done."""


class GroupChatManager:
    """
    Менеджер группового чата агентов.
    Реализует round-robin и speaker selection.
    """

    def __init__(
        self,
        agents: list[GroupChatAgent],
        max_rounds: int = 20,
        speaker_selection: str = "auto",  # "auto" | "round-robin" | "random"
    ):
        self.agents = agents
        self.max_rounds = max_rounds
        self.speaker_selection = speaker_selection
        self.messages: list[ChatMessage] = []

    async def run(self, initial_message: str) -> list[ChatMessage]:
        """Запустить групповой чат."""
        # Начальное сообщение
        self.messages.append(ChatMessage(
            sender="User",
            content=initial_message
        ))

        for round_num in range(self.max_rounds):
            # Выбрать следующего спикера
            agent = await self._select_speaker(round_num)
            if not agent:
                break

            # Агент генерирует ответ
            reply = await agent.generate_reply(
                messages=self.messages,
                sender_name=self.messages[-1].sender
            )

            if reply is None:
                # Агент решил завершить чат
                break

            self.messages.append(ChatMessage(
                sender=agent.name,
                content=reply
            ))

        return self.messages

    async def _select_speaker(
        self, round_num: int
    ) -> Optional[GroupChatAgent]:
        """Выбрать следующего спикера."""
        if self.speaker_selection == "round-robin":
            return self.agents[round_num % len(self.agents)]

        if self.speaker_selection == "auto":
            # LLM выбирает наиболее подходящего агента
            return await self._llm_select_speaker()

        return None

    async def _llm_select_speaker(self) -> Optional[GroupChatAgent]:
        """Использовать LLM для выбора следующего спикера."""
        agent_list = "\n".join([
            f"- {a.name}: {a.role_description}"
            for a in self.agents
        ])
        last_msg = self.messages[-1]

        prompt = f"""Given the last message:
"{last_msg.sender}: {last_msg.content}"

Available agents:
{agent_list}

Who should speak next? Reply with just the agent name."""

        response = await self.llm.complete(prompt)
        name = response.strip()

        return next((a for a in self.agents if a.name == name), self.agents[0])


# Пример использования: Feature Development Team
async def create_feature_team(task: str):
    manager = GroupChatManager(
        agents=[
            GroupChatAgent(
                name="Planner",
                role_description="You create implementation plans. Break tasks into steps.",
            ),
            GroupChatAgent(
                name="Coder",
                role_description="You write Python/TypeScript code. Be precise and complete.",
            ),
            GroupChatAgent(
                name="Reviewer",
                role_description="You review code for bugs, security issues, best practices.",
            ),
            GroupChatAgent(
                name="Tester",
                role_description="You write pytest tests. Aim for 100% coverage.",
            ),
        ],
        max_rounds=30,
        speaker_selection="auto",
    )
    return await manager.run(task)
```

---

## Рекомендация 5: Graph-based State Machine (LangGraph)

**Источник**: [LangGraph](https://github.com/langchain-ai/langgraph)

### Явные состояния вместо неявного потока

LangGraph представляет агентный процесс как **граф с явными состояниями и переходами**. Это обеспечивает:
- **Checkpointing**: сохранение/восстановление в любой точке
- **Human-in-the-loop**: пауза для одобрения человеком
- **Branching**: ветвление на основе условий
- **Циклы**: явные retry loops

```python
# ai_engine/orchestrator/agent_graph.py

from typing import TypedDict, Literal, Annotated
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite import SqliteSaver

class AgentState(TypedDict):
    """Состояние агентного процесса."""
    task: str
    messages: list[dict]
    research_results: Optional[dict]
    plan: Optional[list[str]]
    code_written: Optional[str]
    tests_written: Optional[str]
    test_results: Optional[str]
    review_feedback: Optional[str]
    iteration_count: int
    final_answer: Optional[str]
    errors: list[str]

def build_agent_graph() -> StateGraph:
    """Построить явный граф состояний агента."""

    graph = StateGraph(AgentState)

    # Добавить узлы (node = функция перехода состояния)
    graph.add_node("research",       research_node)
    graph.add_node("plan",           planning_node)
    graph.add_node("write_code",     code_writing_node)
    graph.add_node("write_tests",    test_writing_node)
    graph.add_node("run_tests",      test_execution_node)
    graph.add_node("review",         code_review_node)
    graph.add_node("fix_issues",     issue_fixing_node)
    graph.add_node("finalize",       finalization_node)

    # Начальный узел
    graph.set_entry_point("research")

    # Переходы (edges)
    graph.add_edge("research", "plan")
    graph.add_edge("plan", "write_code")
    graph.add_edge("write_code", "write_tests")
    graph.add_edge("write_tests", "run_tests")

    # Условный переход: тесты прошли?
    graph.add_conditional_edges(
        "run_tests",
        decide_after_tests,  # функция-условие → возвращает имя следующего узла
        {
            "pass":    "review",
            "fail":    "fix_issues",
            "timeout": "finalize",   # Слишком много попыток
        }
    )

    # Условный переход: ревью нашло проблемы?
    graph.add_conditional_edges(
        "review",
        decide_after_review,
        {
            "clean":    "finalize",
            "has_issues": "fix_issues",
        }
    )

    # Fix → back to tests (цикл с защитой)
    graph.add_conditional_edges(
        "fix_issues",
        check_iteration_limit,
        {
            "continue": "run_tests",
            "give_up":  "finalize",
        }
    )

    graph.add_edge("finalize", END)

    return graph


# Функции-условия

def decide_after_tests(state: AgentState) -> Literal["pass", "fail", "timeout"]:
    if state["iteration_count"] >= 5:
        return "timeout"
    if "FAILED" in (state["test_results"] or ""):
        return "fail"
    return "pass"

def decide_after_review(state: AgentState) -> Literal["clean", "has_issues"]:
    feedback = state["review_feedback"] or ""
    critical_markers = ["🚨", "Critical", "Security issue", "SQL injection"]
    if any(m in feedback for m in critical_markers):
        return "has_issues"
    return "clean"

def check_iteration_limit(state: AgentState) -> Literal["continue", "give_up"]:
    return "give_up" if state["iteration_count"] >= 5 else "continue"


# Использование с checkpointing
async def run_with_checkpoints(task: str, session_id: str):
    graph = build_agent_graph()
    # Сохранять чекпоинт после каждого узла
    checkpointer = SqliteSaver.from_conn_string("./checkpoints.db")
    app = graph.compile(checkpointer=checkpointer)

    config = {"configurable": {"thread_id": session_id}}
    initial_state = AgentState(
        task=task,
        messages=[],
        iteration_count=0,
        errors=[]
    )

    # Запустить с возможностью паузы для human-in-the-loop
    async for event in app.astream(initial_state, config):
        print(f"State: {list(event.keys())}")
        # Если нужна пауза (например, перед finalize)
        # app.update_state(config, {"approved": True})
```

---

## Рекомендация 6: Type-safe Agent Responses (Pydantic AI)

**Источник**: [Pydantic AI](https://github.com/pydantic/pydantic-ai)

### Структурированные типобезопасные ответы

```python
# ai_engine/agent/typed_agent.py

from pydantic import BaseModel, Field
from pydantic_ai import Agent

# Определить ожидаемую структуру ответа
class CodeAnalysisResult(BaseModel):
    summary: str = Field(description="Краткое описание кода")
    bugs: list[str] = Field(default_factory=list, description="Найденные баги")
    security_issues: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    complexity_score: int = Field(ge=1, le=10, description="Цикломатическая сложность 1-10")
    test_coverage_estimate: float = Field(ge=0, le=100, description="Оценка покрытия в %")

class ImplementationPlan(BaseModel):
    steps: list[str] = Field(description="Шаги реализации по порядку")
    estimated_time_minutes: int
    dependencies: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    requires_clarification: bool = False
    clarification_questions: list[str] = Field(default_factory=list)


# Агент с типизированным выводом
code_analyst = Agent(
    model="openai:gpt-4o",
    result_type=CodeAnalysisResult,
    system_prompt="""
    You are a code analyst. Analyze the provided code and return
    a structured report following the specified schema exactly.
    Be thorough and specific about bugs and security issues.
    """
)

planner = Agent(
    model="openai:gpt-4o",
    result_type=ImplementationPlan,
    system_prompt="""
    You are a technical project planner. Create a detailed
    implementation plan. If you need clarification, set
    requires_clarification=True and list your questions.
    """
)


# Использование
async def analyze_code(code: str) -> CodeAnalysisResult:
    result = await code_analyst.run(f"Analyze this code:\n```python\n{code}\n```")
    return result.data  # Гарантированно типизированный CodeAnalysisResult

async def plan_feature(description: str) -> ImplementationPlan:
    result = await planner.run(f"Create a plan for: {description}")
    plan = result.data
    
    if plan.requires_clarification:
        # Оркестратор спросит пользователя
        answers = await ask_user(plan.clarification_questions)
        result = await planner.run(
            f"Create a plan for: {description}\nAdditional context: {answers}"
        )
    return result.data
```

---

## Рекомендация 7: Secure Code Sandbox (E2B)

**Источник**: [E2B](https://github.com/e2b-dev/e2b) — облачные изолированные среды выполнения

### Проблема: выполнение кода без изоляции опасно

Текущий агент выполняет команды через `subprocess` — это **небезопасно**. Агент может случайно удалить файлы, установить пакеты, сломать систему.

### Решение: E2B Sandbox

```python
# ai_engine/agent/sandbox.py

from e2b_code_interpreter import Sandbox

class SecureCodeSandbox:
    """
    Безопасное выполнение кода агента в изолированной среде.
    
    E2B предоставляет micro-VM с:
    - Полная изоляция от хост-системы
    - Предустановленные Python, Node.js, bash
    - Файловая система с доступом к проекту (через upload)
    - Сетевой доступ (опционально)
    - Автоматическое уничтожение после timeout
    """

    def __init__(
        self,
        api_key: str,
        template: str = "base",  # "base" | "Python3" | "Node" | custom
        timeout_seconds: int = 120
    ):
        self.api_key = api_key
        self.template = template
        self.timeout = timeout_seconds
        self._sandbox: Optional[Sandbox] = None

    async def __aenter__(self):
        self._sandbox = Sandbox(
            api_key=self.api_key,
            template=self.template,
            timeout=self.timeout
        )
        return self

    async def __aexit__(self, *args):
        if self._sandbox:
            self._sandbox.close()

    async def execute(
        self,
        code: str,
        language: str = "python",
        context: dict = None
    ) -> tuple[str, str, int]:
        """
        Выполнить код в sandbox.
        
        Returns:
            (stdout, stderr, return_code)
        """
        if not self._sandbox:
            raise RuntimeError("Sandbox not initialized. Use as context manager.")

        # Если нужен контекст (файлы из workspace) — залить их
        if context and "files" in context:
            for filepath, content in context["files"].items():
                self._sandbox.filesystem.write(filepath, content)

        # Выполнить код
        if language == "python":
            result = self._sandbox.run_code(code)
        elif language == "bash":
            result = self._sandbox.commands.run(code)
        else:
            raise ValueError(f"Unsupported language: {language}")

        # Получить изменённые файлы обратно
        if context and "output_files" in context:
            for filepath in context["output_files"]:
                try:
                    content = self._sandbox.filesystem.read(filepath)
                    context["output_files"][filepath] = content
                except Exception:
                    pass

        return result.stdout, result.stderr, 0 if not result.error else 1


# Альтернатива E2B: локальный Docker sandbox
class DockerSandbox:
    """
    Локальный Docker контейнер как sandbox.
    Не требует внешних API — работает офлайн.
    """

    DOCKER_IMAGE = "python:3.12-slim"
    MAX_MEMORY = "512m"
    MAX_CPU = "0.5"

    async def execute(
        self,
        code: str,
        timeout: int = 30
    ) -> tuple[str, str, int]:
        import docker
        client = docker.from_env()

        container = client.containers.run(
            self.DOCKER_IMAGE,
            command=["python", "-c", code],
            remove=True,
            mem_limit=self.MAX_MEMORY,
            cpu_period=100000,
            cpu_quota=int(float(self.MAX_CPU) * 100000),
            network_mode="none",  # ← Нет сети
            read_only=False,
            detach=True,
            volumes={
                "/workspace": {"bind": "/workspace", "mode": "ro"}  # Read-only workspace
            }
        )

        try:
            result = container.wait(timeout=timeout)
            stdout = container.logs(stdout=True, stderr=False).decode()
            stderr = container.logs(stdout=False, stderr=True).decode()
            return stdout, stderr, result["StatusCode"]
        except Exception as e:
            container.kill()
            return "", str(e), 1
```

---

## Рекомендация 8: Tree of Thoughts Reasoning

**Источник**: [Tree of Thoughts](https://github.com/princeton-nlp/tree-of-thought-llm) (Princeton NLP)

### Вместо одной цепочки мышления — дерево вариантов

```python
# ai_engine/agent/tree_of_thoughts.py

@dataclass
class ThoughtNode:
    thought: str
    depth: int
    score: float           # 0.0–1.0: насколько перспективен этот путь
    children: list["ThoughtNode"] = field(default_factory=list)
    is_terminal: bool = False
    solution: Optional[str] = None

class TreeOfThoughts:
    """
    Tree of Thoughts: исследование нескольких путей решения.
    
    Алгоритм:
    1. Генерировать k ветвей рассуждений параллельно
    2. Оценить каждую ветвь через LLM (BFS или DFS)
    3. Отсечь неперспективные ветви (beam search)
    4. Продолжить наиболее перспективные
    
    Применение: сложные алгоритмические задачи, архитектурные решения,
    задачи с неочевидным решением.
    """

    def __init__(
        self,
        llm: LLMClient,
        branching_factor: int = 3,    # k ветвей на каждом уровне
        max_depth: int = 4,           # Максимальная глубина дерева
        beam_width: int = 2,          # Сколько ветвей сохраняем (beam search)
    ):
        self.llm = llm
        self.branching_factor = branching_factor
        self.max_depth = max_depth
        self.beam_width = beam_width

    async def solve(self, problem: str) -> str:
        """Решить задачу через дерево рассуждений."""
        root = ThoughtNode(thought=problem, depth=0, score=1.0)

        # BFS по дереву с beam search
        beam = [root]

        for depth in range(self.max_depth):
            candidates = []

            # Для каждого узла в beam генерируем k дочерних мыслей
            expand_tasks = [
                self._expand_node(node, problem)
                for node in beam
            ]
            all_children = await asyncio.gather(*expand_tasks)

            for node, children in zip(beam, all_children):
                node.children = children
                candidates.extend(children)

            # Проверить на терминальные узлы (финальный ответ)
            solutions = [c for c in candidates if c.is_terminal]
            if solutions:
                best = max(solutions, key=lambda x: x.score)
                return best.solution or best.thought

            # Оценить и выбрать топ beam_width узлов
            scored = await self._score_nodes(candidates, problem)
            beam = sorted(scored, key=lambda x: x.score, reverse=True)[:self.beam_width]

        # Если дошли до max_depth — вернуть лучший узел
        return beam[0].thought if beam else "Could not solve"

    async def _expand_node(
        self,
        node: ThoughtNode,
        problem: str
    ) -> list[ThoughtNode]:
        """Генерировать k дочерних мыслей для узла."""
        prompt = f"""Problem: {problem}

Current reasoning path:
{node.thought}

Generate {self.branching_factor} different next steps or approaches.
Format each as: THOUGHT: [the reasoning step]
Make each step meaningfully different."""

        response = await self.llm.complete(prompt)

        thoughts = re.findall(r"THOUGHT:\s*(.+?)(?=THOUGHT:|$)", response, re.DOTALL)

        children = []
        for thought in thoughts[:self.branching_factor]:
            is_terminal = any(kw in thought.lower() for kw in [
                "final answer:", "solution:", "therefore:", "in conclusion:"
            ])
            child = ThoughtNode(
                thought=thought.strip(),
                depth=node.depth + 1,
                score=0.5,  # Default, will be updated by scorer
                is_terminal=is_terminal,
                solution=thought if is_terminal else None
            )
            children.append(child)

        return children

    async def _score_nodes(
        self,
        nodes: list[ThoughtNode],
        problem: str
    ) -> list[ThoughtNode]:
        """Оценить перспективность каждого узла."""
        thoughts_text = "\n".join([
            f"{i+1}. {node.thought}"
            for i, node in enumerate(nodes)
        ])

        prompt = f"""Problem: {problem}

Rate each reasoning step's promise for solving the problem.
Scale: 1=useless, 5=brilliant, 3=ok

Steps:
{thoughts_text}

Reply with just numbers separated by commas (e.g., "3,5,2,4,1")"""

        response = await self.llm.complete(prompt)
        scores = [float(s.strip()) / 5.0 for s in response.split(",")]

        for node, score in zip(nodes, scores[:len(nodes)]):
            node.score = score

        return nodes
```

---

## Рекомендация 9: Reflexion — Self-Critique Loop

**Источник**: [Reflexion](https://github.com/noahshinn/reflexion) (Noah Shinn et al.)

### Агент критикует собственные ответы

```python
# ai_engine/agent/reflexion.py

class ReflexionAgent:
    """
    Агент с механизмом саморефлексии.
    
    Цикл:
    1. Решить задачу (Actor)
    2. Оценить результат (Evaluator)
    3. Если неудача → Сгенерировать вербальную рефлексию
    4. Добавить рефлексию в память как "урок"
    5. Повторить с учётом уроков
    
    Verbal reinforcement vs backpropagation:
    Вместо изменения весей модели — накапливаем текстовые "уроки"
    в episodic memory.
    """

    def __init__(
        self,
        llm: LLMClient,
        memory: MemoryManager,
        evaluator: "ResultEvaluator",
        max_iterations: int = 3,
    ):
        self.llm = llm
        self.memory = memory
        self.evaluator = evaluator
        self.max_iterations = max_iterations

    async def run(self, task: str) -> ReflexionResult:
        reflections = []
        attempts = []

        # Достать предыдущие рефлексии из памяти
        past_reflections = self.memory.recall_facts(
            query=task,
            topic="reflexion_lessons",
            top_k=5
        )

        for attempt_num in range(self.max_iterations):
            # Попытка с учётом накопленных уроков
            attempt_result = await self._attempt(
                task=task,
                past_reflections=past_reflections + reflections
            )
            attempts.append(attempt_result)

            # Оценить результат
            evaluation = await self.evaluator.evaluate(
                task=task,
                result=attempt_result
            )

            if evaluation.success:
                # Задача решена
                return ReflexionResult(
                    final_answer=attempt_result,
                    attempts=attempts,
                    reflections=reflections,
                    success=True
                )

            if attempt_num < self.max_iterations - 1:
                # Сгенерировать рефлексию
                reflection = await self._reflect(
                    task=task,
                    attempt=attempt_result,
                    evaluation=evaluation
                )
                reflections.append(reflection)

                # Сохранить урок в долгосрочную память
                self.memory.add_knowledge(
                    topic="reflexion_lessons",
                    content=f"For task type '{self._classify_task(task)}': {reflection}",
                    confidence=0.7
                )

        return ReflexionResult(
            final_answer=attempts[-1],
            attempts=attempts,
            reflections=reflections,
            success=False
        )

    async def _attempt(
        self,
        task: str,
        past_reflections: list
    ) -> str:
        """Попытаться решить задачу с учётом прошлых уроков."""
        reflections_text = ""
        if past_reflections:
            reflections_text = "\n\n## Lessons from previous attempts:\n" + \
                "\n".join(f"- {r}" for r in past_reflections[-5:])

        prompt = f"""Task: {task}
{reflections_text}

Solve the task carefully, avoiding past mistakes."""

        return await self.llm.complete(prompt)

    async def _reflect(
        self,
        task: str,
        attempt: str,
        evaluation: "EvaluationResult"
    ) -> str:
        """Сгенерировать вербальную рефлексию о неудаче."""
        prompt = f"""You tried to solve a task but failed.

Task: {task}

Your attempt:
{attempt}

Why it failed:
{evaluation.failure_reason}

In 1-2 sentences, describe what you should do differently next time.
Be specific and actionable. Focus on the mistake, not the general approach."""

        return await self.llm.complete(prompt)
```

---

## Рекомендация 10: DSPy — Оптимизация промптов

**Источник**: [DSPy](https://github.com/stanfordnlp/dspy) — Stanford NLP

### Автоматическая оптимизация промптов

DSPy рассматривает промпты не как текст, а как **программу**, которую можно оптимизировать автоматически.

```python
import dspy

# Определить сигнатуры (типы входа/выхода)
class CodeReview(dspy.Signature):
    """Review code for bugs, security issues, and improvements."""
    
    code: str = dspy.InputField(desc="Python or TypeScript code to review")
    context: str = dspy.InputField(desc="Project context and conventions")
    
    bugs: str = dspy.OutputField(desc="List of bugs found, one per line")
    security_issues: str = dspy.OutputField(desc="Security vulnerabilities found") 
    suggestions: str = dspy.OutputField(desc="Improvement suggestions")
    score: int = dspy.OutputField(desc="Code quality score 1-10")


class IntentClassifier(dspy.Signature):
    """Classify user intent from message."""
    
    message: str = dspy.InputField()
    context: str = dspy.InputField(desc="Recent conversation context")
    
    intent: str = dspy.OutputField(
        desc="One of: write_code, fix_bug, explain_code, run_tests, "
             "navigate_to, general_question, refactor, document"
    )
    confidence: float = dspy.OutputField(desc="Confidence 0.0-1.0")
    entities: str = dspy.OutputField(desc="JSON with extracted entities")


# Создать модули (автоматически выбирают few-shot примеры)
code_reviewer = dspy.ChainOfThought(CodeReview)
intent_classifier = dspy.Predict(IntentClassifier)

# Оптимизировать промпты на обучающем наборе
# (DSPy автоматически подирает лучшие few-shot примеры)
from dspy.teleprompt import BootstrapFewShot

optimizer = BootstrapFewShot(metric=review_quality_metric)
optimized_reviewer = optimizer.compile(
    code_reviewer,
    trainset=training_examples  # list[dspy.Example]
)

# Использование (синтаксис такой же)
result = optimized_reviewer(
    code=my_code,
    context="Python project using FastAPI and Pydantic"
)
print(result.bugs)
print(result.score)
```

---

## Рекомендация 11: Skill Library (Reusable Agent Skills)

### Переиспользуемые навыки для агентов

Вместо того, чтобы каждый раз заново учить агента делать одно и то же, создаём **библиотеку навыков** — готовых промптов+кода для типовых задач.

```python
# ai_engine/skills/skill_registry.py

@dataclass
class Skill:
    """Переиспользуемый навык агента."""
    name: str
    description: str
    trigger_keywords: list[str]  # Ключевые слова для автоактивации
    system_prompt: str           # Специализированный промпт
    tools: list[str]             # Инструменты, которые использует навык
    example_usage: str           # Пример использования

SKILL_REGISTRY = {
    "python_debugger": Skill(
        name="Python Debugger",
        description="Отладка Python ошибок через добавление logging и pdb",
        trigger_keywords=["traceback", "error", "exception", "не работает"],
        system_prompt="""
        You are a Python debugger. When given an error:
        1. Parse the traceback to find the exact failure line
        2. Analyze the root cause (TypeError, AttributeError, etc.)
        3. Add strategic logging to narrow down the issue
        4. Propose a minimal fix
        5. Explain why the fix works
        
        Always look at 3 lines before and after the error line for context.
        Check for None values, type mismatches, missing attributes.
        """,
        tools=["read_file", "write_file", "run_command"],
        example_usage="Fix: AttributeError: 'NoneType' has no attribute 'split'"
    ),

    "sql_optimizer": Skill(
        name="SQL Query Optimizer",
        description="Анализ и оптимизация медленных SQL запросов",
        trigger_keywords=["slow query", "N+1", "index", "EXPLAIN", "performance"],
        system_prompt="""
        You are a database performance expert. When optimizing queries:
        1. Run EXPLAIN ANALYZE on the query
        2. Identify missing indexes
        3. Detect N+1 query patterns
        4. Suggest query rewrites (JOINs vs subqueries, CTEs)
        5. Recommend index additions with exact SQL
        
        Never suggest indexes without checking existing ones first.
        Consider query frequency and write/read ratio.
        """,
        tools=["query_database", "read_file"],
        example_usage="Optimize: SELECT * FROM users WHERE email LIKE '%@example.com'"
    ),

    "test_generator": Skill(
        name="Test Generator",
        description="Генерация pytest тестов с полным покрытием",
        trigger_keywords=["tests", "тесты", "coverage", "pytest", "unit test"],
        system_prompt="""
        You are a test engineer. Generate comprehensive pytest tests:
        1. Read the source code fully before writing tests
        2. Identify: happy paths, edge cases, error cases, boundary values
        3. Use fixtures for setup/teardown
        4. Mock external dependencies (DB, HTTP, filesystem)
        5. Aim for 100% branch coverage
        6. Add parametrize for multiple inputs
        
        Test naming: test_<method>_<scenario>_<expected>
        Example: test_decode_token_expired_raises_auth_error
        """,
        tools=["read_file", "write_file", "run_command"],
        example_usage="Write tests for class UserService in src/services/user.py"
    ),

    "api_documenter": Skill(
        name="API Documenter",
        description="Написание OpenAPI документации для FastAPI/Express",
        trigger_keywords=["openapi", "swagger", "API docs", "document endpoint"],
        system_prompt="""
        You are an API documentation expert. Document API endpoints:
        1. Read all route handlers
        2. Extract request/response schemas from Pydantic models or TypeScript types
        3. Document all possible error responses (4xx, 5xx)
        4. Add authentication requirements
        5. Include realistic request/response examples
        
        Use OpenAPI 3.1 format. Group by resource (users, posts, etc.)
        """,
        tools=["read_file", "write_file"],
        example_usage="Document all endpoints in src/api/routes.py"
    ),
}


class SkillActivator:
    """Автоматически активирует навык по ключевым словам запроса."""

    def detect_skill(self, user_message: str) -> Optional[Skill]:
        message_lower = user_message.lower()
        for skill in SKILL_REGISTRY.values():
            if any(kw in message_lower for kw in skill.trigger_keywords):
                return skill
        return None

    def apply_skill(self, skill: Skill, base_prompt: str) -> str:
        """Применить навык к системному промпту."""
        return f"{base_prompt}\n\n## Active Skill: {skill.name}\n{skill.system_prompt}"
```

---

## Рекомендация 12: Constitutional AI Safety

### Встроенная система безопасности на уровне архитектуры

```python
# ai_engine/safety/constitutional_ai.py

CONSTITUTION = """
## Конституция AI агента (Constitutional AI)

### Принципы безопасности (нарушение = отказ выполнить)

1. ДАННЫЕ И ПРИВАТНОСТЬ
   - Никогда не выводить в лог: пароли, API ключи, токены, email, телефоны
   - Маскировать credentials в diff-отображении: `****` вместо значения
   - Не отправлять персональные данные в LLM провайдер без согласия

2. ФАЙЛОВАЯ СИСТЕМА
   - Удаление (rm, unlink, shutil.rmtree) → ВСЕГДА с подтверждением
   - Запись за пределами workspace → ЗАПРЕЩЕНО
   - .env, *.pem, *.key, secrets.* → только чтение, никогда не записывать

3. ВЫПОЛНЕНИЕ КОДА
   - `sudo`, `su`, `chmod 777` → ЗАПРЕЩЕНО
   - Массовые операции (`find | xargs rm`) → с подтверждением
   - Сетевые запросы к внешним сервисам → сообщить пользователю
   - Установка пакетов (pip install, npm install) → с подтверждением

4. БАЗЫ ДАННЫХ
   - DROP TABLE, TRUNCATE, DELETE без WHERE → ЗАПРЕЩЕНО
   - Прямые запросы к production БД в prod режиме → только SELECT

5. GIT
   - `git push --force` → с двойным подтверждением
   - Коммиты в main/master → с подтверждением
   - Удаление веток → с подтверждением

### Принципы качества (нарушение = предупреждение)

6. Не оставлять TODO/FIXME/HACK без issue
7. Не генерировать код с hardcoded secrets
8. Не создавать функции без type hints (для Python проектов)
9. Не применять изменения без прохождения тестов
10. Не изменять более 5 файлов без разбивки на подзадачи
"""

class ConstitutionalChecker:
    """Проверяет каждое действие агента на соответствие конституции."""

    # Паттерны, требующие ОБЯЗАТЕЛЬНОГО подтверждения
    ALWAYS_CONFIRM = [
        r"rm\s+-rf",
        r"shutil\.rmtree",
        r"DROP\s+TABLE",
        r"TRUNCATE",
        r"git\s+push\s+--force",
        r"DELETE\s+FROM\s+\w+\s*(?!WHERE)",  # DELETE без WHERE
    ]

    # Паттерны, которые ЗАПРЕЩЕНЫ (отказ без исключений)
    FORBIDDEN = [
        r"sudo\s+",
        r"chmod\s+777",
        r"\/etc\/passwd",
        r"\/etc\/shadow",
    ]

    # Паттерны, которые нужно МАСКИРОВАТЬ перед логированием
    SECRETS_PATTERN = re.compile(
        r"(password|token|secret|key|api_key|auth)\s*[=:]\s*['\"]?(\S+)['\"]?",
        re.IGNORECASE
    )

    def check_action(self, action: AgentAction) -> CheckResult:
        """
        Проверить действие перед выполнением.
        
        Returns:
            CheckResult с полями:
                allowed: bool       - разрешено ли выполнение
                requires_confirm: bool - нужно ли подтверждение
                reason: str         - причина отказа/предупреждения
                sanitized_action: AgentAction - безопасная версия
        """
        if action.type == "run_command":
            cmd = action.params.get("command", "")

            # Проверить запрещённые паттерны
            for pattern in self.FORBIDDEN:
                if re.search(pattern, cmd, re.IGNORECASE):
                    return CheckResult(
                        allowed=False,
                        reason=f"Forbidden pattern detected: `{pattern}`"
                    )

            # Проверить паттерны с обязательным подтверждением
            for pattern in self.ALWAYS_CONFIRM:
                if re.search(pattern, cmd, re.IGNORECASE):
                    return CheckResult(
                        allowed=True,
                        requires_confirm=True,
                        reason=f"Potentially destructive command requires confirmation"
                    )

        if action.type == "write_file":
            content = action.params.get("content", "")
            # Маскировать секреты в контент перед показом diff
            sanitized_content = self.SECRETS_PATTERN.sub(
                r"\1 = '****'", content
            )
            action = replace(action, params={
                **action.params,
                "display_content": sanitized_content  # Показываем bez секретов
            })

        return CheckResult(allowed=True, sanitized_action=action)

    def scrub_for_logging(self, text: str) -> str:
        """Удалить секреты из текста перед записью в лог."""
        return self.SECRETS_PATTERN.sub(r"\1=****", text)
```

---

## Рекомендация 13: SWE-bench Benchmark

**Источник**: [SWE-bench](https://github.com/princeton-nlp/SWE-bench)

### Оценка реальной способности решать GitHub issues

SWE-bench содержит **2294 реальных GitHub issues** из популярных Python проектов (Django, Flask, scikit-learn и др.). Агент должен исправить баг, не видя решения.

```python
# ai_engine/evaluation/swe_bench.py

class SWEBenchEvaluator:
    """
    Оценка агента на SWE-bench задачах.
    
    Метрики:
    - Resolve Rate: % задач, где патч проходит все тесты
    - PASS@1: решение с первой попытки
    - Cost per issue: токены и время
    """

    async def run_benchmark(
        self,
        agent: CodeActAgent,
        num_tasks: int = 50,
        split: str = "verified"  # "verified" | "lite" | "full"
    ) -> BenchmarkResult:

        dataset = self._load_swe_bench(split)
        tasks = random.sample(dataset, min(num_tasks, len(dataset)))

        results = []
        for task in tqdm(tasks):
            result = await self._run_single_task(agent, task)
            results.append(result)

        return BenchmarkResult(
            total_tasks=len(tasks),
            resolved=sum(r.resolved for r in results),
            resolve_rate=sum(r.resolved for r in results) / len(results),
            avg_tokens=sum(r.tokens_used for r in results) / len(results),
            avg_time_seconds=sum(r.time_seconds for r in results) / len(results),
            failed_tasks=[r.task_id for r in results if not r.resolved]
        )

    async def _run_single_task(
        self,
        agent: CodeActAgent,
        task: SWEBenchTask
    ) -> TaskRunResult:
        """Запустить агента на одной SWE-bench задаче."""
        start_time = time.time()

        # Подготовить workspace (checkout нужной версии репо)
        workspace_path = await self._setup_workspace(task)

        try:
            # Запустить агента
            result = await agent.run(
                task=f"""Fix the following issue in the repository:

Issue: {task.issue_title}

Description:
{task.issue_body}

The issue is in the repository: {task.repo}
Hints: {task.hints_text or 'None provided'}

Fix the code so that the failing tests pass.""",
                workspace=workspace_path
            )

            # Применить патч
            await self._apply_patch(workspace_path, result.code_changes)

            # Запустить тесты
            test_result = await self._run_tests(
                workspace_path,
                task.fail_to_pass  # Тесты, которые должны НАЧАТЬ проходить
            )

            return TaskRunResult(
                task_id=task.instance_id,
                resolved=test_result.all_pass,
                tokens_used=result.tokens_used,
                time_seconds=time.time() - start_time,
                patch=result.code_changes
            )

        finally:
            await self._cleanup_workspace(workspace_path)
```

### Целевые показатели

| Уровень | Resolve Rate | Описание |
|---------|-------------|---------|
| Baseline (no AI) | 0% | |
| GPT-4 + simple prompting | ~3% | Минимальный уровень |
| SWE-agent (2024) | ~12% | Специализированный агент |
| **Наша цель** | **>15%** | С CodeAct + ACI + Reflexion |
| Claude-3.5 + Devin | ~45% | State-of-the-art (2024) |

---

## Рекомендация 14: Параллельные вызовы инструментов

### Проблема: инструменты вызываются последовательно

```python
# Текущий код (медленно):
content1 = await read_file("auth.py")   # 50ms
content2 = await read_file("user.py")   # 50ms
content3 = await read_file("roles.py")  # 50ms
# Итого: 150ms

# Рекомендуемый подход (быстро):
results = await asyncio.gather(
    read_file("auth.py"),
    read_file("user.py"),
    read_file("roles.py"),
)
# Итого: 50ms (3x быстрее)
```

### Реализация параллельных tool calls

```python
# ai_engine/agent/parallel_tools.py

class ParallelToolExecutor:
    """
    Группирует независимые tool calls и выполняет их параллельно.
    Анализирует зависимости: некоторые вызовы нельзя параллелизировать.
    """

    WRITE_OPERATIONS = {"write_file", "delete_file", "run_command", "execute_sql"}
    READ_OPERATIONS = {"read_file", "get_symbols", "get_diagnostics", "search_files"}

    async def execute_tool_calls(
        self,
        tool_calls: list[ToolCall]
    ) -> list[ToolResult]:
        """
        Выполнить tool calls с максимальной параллельностью.
        
        Правила параллелизации:
        - Все READ операции параллельны
        - WRITE операции последовательны и после всех READ
        - run_command с одинаковым cwd — последовательно
        """
        # Разделить на группы
        read_calls = [c for c in tool_calls if c.tool_name in self.READ_OPERATIONS]
        write_calls = [c for c in tool_calls if c.tool_name in self.WRITE_OPERATIONS]
        other_calls = [c for c in tool_calls
                      if c.tool_name not in self.READ_OPERATIONS | self.WRITE_OPERATIONS]

        results = {}

        # 1. Параллельно все read операции
        if read_calls:
            read_tasks = [self._execute_single(call) for call in read_calls]
            read_results = await asyncio.gather(*read_tasks, return_exceptions=True)
            for call, result in zip(read_calls, read_results):
                results[call.call_id] = result

        # 2. Параллельно independent other calls
        if other_calls:
            other_tasks = [self._execute_single(call) for call in other_calls]
            other_results = await asyncio.gather(*other_tasks, return_exceptions=True)
            for call, result in zip(other_calls, other_results):
                results[call.call_id] = result

        # 3. Последовательно write операции (порядок важен)
        for call in write_calls:
            results[call.call_id] = await self._execute_single(call)

        # Вернуть в исходном порядке
        return [results[call.call_id] for call in tool_calls]
```

---

## Рекомендация 15: Streaming Structured Outputs

### Потоковая передача структурированных данных

```python
# ai_engine/server/streaming.py

class StreamingResponseBuilder:
    """
    Построение структурированного потокового ответа.
    
    Позволяет фронтенду обновлять UI в реальном времени:
    - Показывать шаги мышления по мере их появления
    - Отображать прогресс-бар конкретного этапа
    - Показывать файлы по мере их создания
    - Мгновенно отображать ошибки
    """

    async def stream_agent_response(
        self,
        task: str,
        orchestrator: OrchestratorCore,
        websocket: WebSocket
    ):
        async def send_event(event_type: str, data: dict):
            await websocket.send_json({
                "type": event_type,
                "timestamp": time.time(),
                **data
            })

        # Фаза 1: Research
        await send_event("phase_start", {
            "phase": "research",
            "message": "🔍 Изучаю кодовую базу..."
        })

        async for file_analyzed in orchestrator.research_phase(task):
            await send_event("research_progress", {
                "file": file_analyzed.path,
                "relevant": file_analyzed.relevance_score > 0.7,
                "symbols_found": len(file_analyzed.symbols)
            })

        # Фаза 2: Planning
        await send_event("phase_start", {"phase": "planning", "message": "📋 Составляю план..."})

        plan = await orchestrator.planning_phase(task)
        await send_event("plan_ready", {
            "steps": plan.steps,
            "parallel_groups": plan.parallel_groups,
            "estimated_minutes": plan.estimated_time
        })

        # Фаза 3: Execution с прогрессом
        await send_event("phase_start", {"phase": "execution", "message": "⚙️ Выполняю..."})

        async for step_result in orchestrator.execute_plan(plan):
            await send_event("step_complete", {
                "step_id": step_result.step_id,
                "description": step_result.description,
                "success": step_result.success,
                "files_changed": step_result.files_changed,
                "progress_percent": step_result.progress
            })

            # Потоковая передача кода по частям
            if step_result.code_output:
                async for chunk in step_result.code_output_stream():
                    await send_event("code_chunk", {"content": chunk})

        # Фаза 4: Synthesis
        await send_event("phase_start", {"phase": "synthesis"})
        synthesis = await orchestrator.synthesize()
        await send_event("done", {
            "summary": synthesis.summary,
            "files_created": synthesis.files_created,
            "files_modified": synthesis.files_modified,
            "tests_passed": synthesis.tests_passed,
            "tokens_used": synthesis.tokens_used
        })
```

---

## Roadmap внедрения

### Фаза 1 — Критические улучшения (1–2 недели)

| Задача | Приоритет | Источник | Файл |
|--------|-----------|---------|------|
| CodeAct Agent | 🔴 P0 | OpenHands | `ai_engine/agent/codeact_agent.py` |
| ACI (numbered file viewer) | 🔴 P0 | SWE-agent | `ai_engine/agent/aci.py` |
| Docker Sandbox | 🔴 P0 | E2B | `ai_engine/agent/sandbox.py` |
| Constitutional AI checker | 🔴 P0 | Anthropic | `ai_engine/safety/constitutional_ai.py` |
| Параллельные tool calls | 🔴 P0 | — | `ai_engine/agent/parallel_tools.py` |

### Фаза 2 — Архитектурные улучшения (2–4 недели)

| Задача | Приоритет | Источник | Файл |
|--------|-----------|---------|------|
| Event Stream (персистентный лог) | 🟠 P1 | OpenHands | `ai_engine/orchestrator/event_stream.py` |
| Graph-based State Machine | 🟠 P1 | LangGraph | `ai_engine/orchestrator/agent_graph.py` |
| Reflexion Self-Critique | 🟠 P1 | Reflexion | `ai_engine/agent/reflexion.py` |
| Streaming Structured Output | 🟠 P1 | — | `ai_engine/server/streaming.py` |
| Skill Library | 🟠 P1 | — | `ai_engine/skills/skill_registry.py` |

### Фаза 3 — Расширенные возможности (месяц+)

| Задача | Приоритет | Источник |
|--------|-----------|---------|
| Group Chat (Multi-Agent) | 🟡 P2 | AutoGen |
| Tree of Thoughts | 🟡 P2 | Princeton NLP |
| Type-safe Responses | 🟡 P2 | Pydantic AI |
| DSPy Prompt Optimization | 🟡 P2 | Stanford NLP |
| SWE-bench Evaluation | 🟡 P2 | Princeton NLP |

---

## Матрица влияния

| Улучшение | Сложность | Влияние на качество | ROI |
|-----------|-----------|-------------------|-----|
| CodeAct паттерн | Средняя | +40% гибкости | ⭐⭐⭐⭐⭐ |
| ACI (numbered viewer) | Низкая | +30% точности навигации | ⭐⭐⭐⭐⭐ |
| Docker Sandbox | Низкая | +∞ безопасности | ⭐⭐⭐⭐⭐ |
| Параллельные tool calls | Низкая | -60% latency research | ⭐⭐⭐⭐⭐ |
| Constitutional AI | Низкая | +∞ безопасности | ⭐⭐⭐⭐⭐ |
| Reflexion Loop | Средняя | +25% accuracy | ⭐⭐⭐⭐ |
| Event Stream | Средняя | +debugging | ⭐⭐⭐⭐ |
| LangGraph States | Высокая | +reliability | ⭐⭐⭐ |
| Group Chat | Высокая | +complex tasks | ⭐⭐⭐ |
| Tree of Thoughts | Высокая | +hard problems | ⭐⭐⭐ |
| DSPy | Высокая | +prompt quality | ⭐⭐ |
| SWE-bench | Средняя | measurement only | ⭐⭐ |

---

## Связанные разделы

- [Рой агентов](../agents/README.md) — текущая архитектура агентов
- [Ядро оркестратора](../orchestrator-core/README.md) — как улучшения встраиваются
- [Терминальные навыки](../terminal-skills/README.md) — выполнение команд в sandbox
- [Архитектурная память](../architectural-memory/README.md) — хранение рефлексий

---

*Версия: 1.0.0 | Дата: 2026-03-31 | Исследование: OpenHands, SWE-agent, AutoGen, CrewAI, LangGraph, Smolagents, Pydantic AI, E2B, DSPy, Reflexion*
