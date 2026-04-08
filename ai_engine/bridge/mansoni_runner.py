#!/usr/bin/env python3
"""Mansoni Runner — CLI мультиагентный оркестратор.

Работает БЕЗ API ключей. Агенты — rule-based.
Опционально: ANTHROPIC_API_KEY / OPENAI_API_KEY для LLM-reasoning.

    python -m ai_engine.bridge --interactive
    python -m ai_engine.bridge "Аудит безопасности"
    python -m ai_engine.bridge --agents reviewer,security "Проверь проект"
"""

import argparse
import sys
import time
from datetime import datetime
from pathlib import Path

_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_root))

from ai_engine.bridge.tool_implementations import ProjectTools
from ai_engine.bridge.rule_agents import AGENT_REGISTRY


PIPELINES = {
    "audit":    ["reviewer", "security", "doc_writer"],
    "bug":      ["debugger", "reviewer"],
    "feature":  ["reviewer", "tester"],
    "refactor": ["reviewer", "tester"],
    "docs":     ["doc_writer"],
    "test":     ["tester"],
    "security": ["security"],
    "full":     ["reviewer", "security", "tester", "debugger", "doc_writer"],
}

TASK_KEYWORDS = {
    "audit":    ["аудит", "ревью", "проверь", "audit", "review"],
    "bug":      ["баг", "ошибка", "fix", "bug", "не работает", "crash"],
    "feature":  ["фича", "добавь", "создай", "feature", "implement"],
    "refactor": ["рефакторинг", "упрости", "декомпозиция", "refactor"],
    "docs":     ["документ", "doc", "описа"],
    "test":     ["тест", "test", "покрытие", "coverage"],
    "security": ["безопасность", "security", "owasp", "xss", "rls"],
    "full":     ["полный", "всё", "full", "complete", "10 часов"],
}


def classify(task: str) -> str:
    lower = task.lower()
    for task_type, keywords in TASK_KEYWORDS.items():
        if any(w in lower for w in keywords):
            return task_type
    return "audit"


class MansoniOrchestrator:
    def __init__(self, project_root: str) -> None:
        self.root = Path(project_root).resolve()
        self.tools = ProjectTools(str(self.root))
        self.reports_dir = self.root / "ai_engine" / "bridge" / "reports"
        self.reports_dir.mkdir(parents=True, exist_ok=True)

    def run(self, task: str, agent_names: list[str] | None = None) -> str:
        start = time.time()
        task_type = classify(task)
        pipeline = agent_names or PIPELINES.get(task_type, ["reviewer"])

        print(f"\n{'═'*60}")
        print(f"  MANSONI | Задача: {task[:50]}")
        print(f"  Тип: {task_type} | Агенты: {' → '.join(pipeline)}")
        print(f"{'═'*60}")

        # Pre-flight: память
        mem = self.tools.memory("repo")
        print(f"  Память: {len(mem)} символов загружено\n")

        all_findings = []
        agent_results = []

        for i, name in enumerate(pipeline, 1):
            cls = AGENT_REGISTRY.get(name)
            if not cls:
                print(f"  ⚠ Агент {name} не найден, пропуск")
                continue

            print(f"{'─'*40} [{i}/{len(pipeline)}] {name}")
            agent = cls(self.tools)
            result = agent.run(task)
            all_findings.extend(agent.findings)
            agent_results.append({"name": name, "result": result, "report_md": agent.report_md(), "log": agent.log})
            print(f"  ✓ {name}: {len(agent.findings)} находок\n")

        elapsed = time.time() - start

        # Формируем отчёт
        report = self._build_report(task, task_type, pipeline, agent_results, all_findings, elapsed)

        # Сохраняем
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = self.reports_dir / f"report_{task_type}_{ts}.md"
        path.write_text(report, encoding="utf-8")

        # Summary
        by_sev = {}
        for f in all_findings:
            by_sev.setdefault(f["severity"], []).append(f)

        print(f"{'═'*60}")
        print(f"  ИТОГ: {len(all_findings)} находок за {elapsed:.1f}с")
        for sev in ["critical", "high", "medium", "low", "info"]:
            cnt = len(by_sev.get(sev, []))
            if cnt:
                icon = {"critical":"🔴","high":"🟠","medium":"🟡","low":"🔵","info":"⚪"}.get(sev,"")
                print(f"    {icon} {sev}: {cnt}")
        print(f"  📄 Отчёт: {path.relative_to(self.root)}")
        print(f"{'═'*60}")

        return report

    def _build_report(self, task, task_type, pipeline, results, findings, elapsed):
        ts = datetime.now().strftime("%Y-%m-%d %H:%M")
        lines = [
            f"# Отчёт Mansoni",
            f"\n| Параметр | Значение |",
            f"|---|---|",
            f"| Дата | {ts} |",
            f"| Задача | {task} |",
            f"| Тип | {task_type} |",
            f"| Пайплайн | {' → '.join(pipeline)} |",
            f"| Находок | {len(findings)} |",
            f"| Время | {elapsed:.1f}с |",
            f"\n---\n",
        ]
        for r in results:
            lines.append(r["report_md"])
        return "\n".join(lines)

    def interactive(self):
        print("\n🤖 Mansoni Interactive. Без API — rule-based агенты.")
        print("   Команды: audit, security, test, docs, full, exit\n")
        while True:
            try:
                task = input("mansoni> ").strip()
                if task.lower() in ("exit", "quit", "q"):
                    break
                if not task:
                    continue
                self.run(task)
            except (KeyboardInterrupt, EOFError):
                break


def main():
    p = argparse.ArgumentParser(description="Mansoni — мультиагентный оркестратор (без API)")
    p.add_argument("task", nargs="?")
    p.add_argument("--interactive", "-i", action="store_true")
    p.add_argument("--agents", help="Список агентов через запятую")
    p.add_argument("--project-root", default=str(_root))
    args = p.parse_args()

    orch = MansoniOrchestrator(args.project_root)

    if args.interactive:
        orch.interactive()
    elif args.task:
        agents = args.agents.split(",") if args.agents else None
        orch.run(args.task, agents)
    else:
        p.print_help()


if __name__ == "__main__":
    main()
