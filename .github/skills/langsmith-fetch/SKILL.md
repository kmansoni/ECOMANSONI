---
name: langsmith-fetch
description: >-
  Отладка LangChain и LangGraph агентов через LangSmith Studio traces.
  Анализ выполнения, ошибок, tool calls, памяти, производительности.
  Use when: debug agent, traces, LangSmith, LangChain, LangGraph, ошибки агента.
metadata:
  category: development
  source:
    repository: 'https://github.com/Kilo-Org/kilo-marketplace'
    path: skills/langsmith-fetch
---

# LangSmith Fetch — Agent Debugging

Отладка LangChain/LangGraph агентов через execution traces из LangSmith Studio.

## Когда использовать

- "Debug my agent" / "What went wrong?"
- "Show me recent traces"
- "Check for errors" / "Why did it fail?"
- "Analyze memory operations"
- "Review agent performance"

## Prerequisites

```bash
pip install langsmith-fetch
export LANGSMITH_API_KEY="your_key"
export LANGSMITH_PROJECT="your_project"
```

## Core Workflows

### 1. Quick Debug

```bash
langsmith-fetch traces --last-n-minutes 5 --limit 5 --format pretty
```

Анализ: количество traces, ошибки, tool calls, время выполнения, token usage.

### 2. Deep Dive Trace

```bash
langsmith-fetch trace <trace-id> --format json
```

Анализ: цель агента → tool calls по порядку → результаты → ошибки → root cause → fix.

### 3. Export Session

```bash
SESSION_DIR="langsmith-debug/session-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SESSION_DIR"
langsmith-fetch traces "$SESSION_DIR/traces" --last-n-minutes 30 --limit 50 --include-metadata
langsmith-fetch threads "$SESSION_DIR/threads" --limit 20
```

### 4. Error Detection

```bash
langsmith-fetch traces --last-n-minutes 30 --limit 50 --format json > recent-traces.json
grep -i "error\|failed\|exception" recent-traces.json
```

## Common Use Cases

### "Agent Not Responding"
1. Проверить наличие traces
2. Нет traces → tracing выключен (`LANGCHAIN_TRACING_V2=true`)
3. Есть traces → ошибки или зависание

### "Wrong Tool Called"
1. Получить trace
2. Проверить доступные tools
3. Проанализировать reasoning агента
4. Улучшить описания tools

### "Memory Not Working"
```bash
langsmith-fetch traces --last-n-minutes 10 --limit 20 --format raw | grep -i "memory\|recall\|store"
```

### "Performance Issues"
```bash
langsmith-fetch traces ./perf-analysis --last-n-minutes 30 --limit 50 --include-metadata
```
Анализ: время на trace, latency tools, token usage, число итераций.

## Quick Reference

```bash
# Quick debug
langsmith-fetch traces --last-n-minutes 5 --limit 5 --format pretty

# Specific trace
langsmith-fetch trace <trace-id> --format pretty

# Export session
langsmith-fetch traces ./debug-session --last-n-minutes 30 --limit 50

# Find errors
langsmith-fetch traces --last-n-minutes 30 --limit 50 --format raw | grep -i error

# With metadata
langsmith-fetch traces --limit 10 --include-metadata
```

## Resources

- LangSmith Fetch CLI: https://github.com/langchain-ai/langsmith-fetch
- LangSmith Studio: https://smith.langchain.com/
- LangChain Docs: https://docs.langchain.com/
