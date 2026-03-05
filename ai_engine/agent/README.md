# Agent Module — ReAct Pattern Agent

## Обзор

Модуль реализует агентный AI по паттерну ReAct (Reasoning + Acting): LLM рассуждает (Thought), выбирает инструмент (Action), получает результат (Observation) и повторяет цикл до Final Answer.

## Архитектура

```
┌─────────────────────────────────────────────────────┐
│                   ReActAgent.run(task)              │
│                                                     │
│  loop (max_steps):                                  │
│    prompt = format(tools, task, scratchpad)         │
│    llm_response = LLM(prompt)                       │
│    if Final Answer → return AgentResult             │
│    parse(Thought, Action, Action Input)             │
│    observation = ToolRegistry.execute(action)       │
│    scratchpad += step                               │
│                                                     │
│  if max_steps reached → forced termination         │
└─────────────────────────────────────────────────────┘
```

## Компоненты

### `ToolRegistry`
Реестр инструментов с безопасным выполнением:
- `calculator` — математические выражения (eval sandbox)
- `current_datetime` — текущее время
- `web_search_mock` — имитация поиска
- `code_executor` — Python sandbox (ограниченный `__builtins__`, threading timeout)
- `text_analyzer` — статистика текста

### `TaskPlanner`
Декомпозиция задачи на шаги:
- Эвристика: разбивка по запятым/союзам + ключевые слова
- LLM-based (если LLM передан)
- Оценка сложности: LOW/MEDIUM/HIGH

### `ReActAgent`
Итеративный ReAct цикл:
- `max_steps=10` — защита от loop
- Regex парсинг `Thought/Action/Action Input/Final Answer`
- Fallback: если LLM не следует формату → весь ответ = Final Answer

## Безопасность sandbox

`code_executor` блокирует:
- `import`, `__import__`, `open`, `exec`, `eval`, `compile`
- `getattr`, `setattr`, `globals`, `locals`, `vars`
- Timeout: 5 секунд (threading)

`calculator` блокирует выражения с:
- `__`, `import`, `exec`, `eval`, `open`, `os`, `sys`

## Использование

```python
from ai_engine.agent import ReActAgent, ToolRegistry

def my_llm(prompt: str) -> str:
    # Ваш LLM
    return "Thought: ...\nAction: calculator\nAction Input: {\"expression\": \"2+2\"}"

registry = ToolRegistry()
agent = ReActAgent(llm_callable=my_llm, tool_registry=registry, max_steps=10)

result = agent.run("Вычисли площадь круга с радиусом 5")
print(result.final_answer)
print(f"Шагов: {len(result.steps)}, Успех: {result.success}")
```

## ReAct промпт формат

```
Thought: [рассуждение]
Action: [имя инструмента]
Action Input: {"key": "value"}
Observation: [результат инструмента — вставляется автоматически]
...
Final Answer: [итоговый ответ]
```
