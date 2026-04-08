#!/usr/bin/env python3
"""Copilot Bridge — генерирует промпты для Copilot Chat.

Вместо вызова API, этот модуль:
1. Собирает контекст (grep, tsc, файлы)
2. Формирует структурированный промпт
3. Выводит его — для вставки в Copilot Chat

Использование:
    python -m ai_engine.bridge.copilot_bridge "аудит безопасности"

Или в Copilot Chat:
    @workspace /mansoni аудит безопасности
"""

import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_root))

from ai_engine.bridge.tool_implementations import ProjectTools
from ai_engine.bridge.rule_agents import AGENT_REGISTRY


def generate_copilot_prompt(task: str, project_root: str = str(_root)) -> str:
    """Генерирует промпт для Copilot Chat с собранным контекстом."""
    tools = ProjectTools(project_root)

    # Собираем контекст
    memory = tools.memory("repo")
    tsc_result = tools.tsc()
    has_tsc_errors = "error TS" in tsc_result

    # Запускаем rule-based агентов для сбора фактов
    facts = []
    for name, cls in AGENT_REGISTRY.items():
        agent = cls(tools)
        agent.run(task)
        if agent.findings:
            facts.append(f"\n### {name} ({len(agent.findings)} находок)")
            for f in agent.findings[:10]:
                facts.append(f"- [{f['severity']}] {f['file']}:{f['line']} — {f['message']}")

    prompt = f"""КОНТЕКСТ ПРОЕКТА (собран автоматически):

## Память проекта
{memory[:2000]}

## TypeScript
{"0 ошибок ✓" if not has_tsc_errors else tsc_result[:500]}

## Автоматический анализ
{"".join(facts) if facts else "Критических проблем не найдено."}

---

ЗАДАЧА: {task}

Выполни задачу как Mansoni-оркестратор. Используй собранный контекст.
Формат: отчёт с файл:строка, severity, конкретные фиксы.
"""
    return prompt


if __name__ == "__main__":
    task = " ".join(sys.argv[1:]) or "Полный аудит проекта"
    prompt = generate_copilot_prompt(task)
    print(prompt)
