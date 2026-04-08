#!/usr/bin/env python3
"""
Mansoni Bootstrap — создаёт bridge-модули и инициализирует оркестратор.

ВАЖНО: Работает БЕЗ внешних API ключей.
Агенты используют rule-based анализ (tsc, lint, grep, vitest, ast).
LLM (Copilot / Anthropic / OpenAI) — опционально для reasoning.

Запуск:
    python ai_engine/bootstrap_bridge.py

После:
    python -m ai_engine.bridge --interactive
    python -m ai_engine.bridge "Проведи аудит"
"""

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
os.chdir(PROJECT_ROOT)
sys.path.insert(0, str(PROJECT_ROOT))

print("=" * 60)
print("  MANSONI BOOTSTRAP — Мультиагентная система")
print("  Режим: автономный (без API ключей)")
print("=" * 60)

# ── 1. Директории ──────────────────────────────────────────────────
dirs = [
    "ai_engine/bridge",
    "ai_engine/bridge/reports",
]
for d in dirs:
    os.makedirs(d, exist_ok=True)
    init_path = os.path.join(d, "__init__.py")
    if not os.path.exists(init_path):
        with open(init_path, "w") as f:
            f.write("")
    print(f"  ✓ {d}")

# ── 2. tool_implementations.py ─────────────────────────────────────
with open("ai_engine/bridge/tool_implementations.py", "w", encoding="utf-8") as f:
    f.write(r'''#!/usr/bin/env python3
"""Реальные инструменты для агентов. Работает на файловой системе проекта."""

import os
import re
import subprocess
from pathlib import Path


class ProjectTools:
    def __init__(self, project_root: str) -> None:
        self.root = Path(project_root).resolve()

    def _safe(self, rel: str) -> Path:
        full = (self.root / rel).resolve()
        if not str(full).startswith(str(self.root)):
            raise ValueError(f"Path traversal: {rel}")
        return full

    def read_file(self, path: str, start: int = 0, end: int = 0) -> str:
        fp = self._safe(path)
        if not fp.exists():
            return f"ERROR: not found: {path}"
        text = fp.read_text(encoding="utf-8", errors="replace")
        if start > 0 or end > 0:
            lines = text.splitlines(keepends=True)
            return "".join(lines[max(start-1,0):(end or len(lines))])
        return text

    def write_file(self, path: str, content: str) -> str:
        fp = self._safe(path)
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(content, encoding="utf-8")
        return f"OK: {len(content)} chars → {path}"

    def replace_in_file(self, path: str, old: str, new: str) -> str:
        fp = self._safe(path)
        if not fp.exists():
            return f"ERROR: not found: {path}"
        text = fp.read_text(encoding="utf-8")
        if old not in text:
            return f"ERROR: pattern not found in {path}"
        fp.write_text(text.replace(old, new, 1), encoding="utf-8")
        return f"OK: replaced in {path}"

    def grep(self, pattern: str, include: str = "*.ts,*.tsx", max_results: int = 50) -> str:
        regex = re.compile(pattern, re.IGNORECASE)
        exts = {e.strip() for e in include.split(",")}
        results, ignore = [], {"node_modules",".git","dist","build","__pycache__",".venv","reserve","archive"}
        for root_dir, dirs, files in os.walk(self.root):
            dirs[:] = [d for d in dirs if d not in ignore]
            for fname in files:
                if not any(fname.endswith(e.replace("*","")) for e in exts):
                    continue
                fp = Path(root_dir) / fname
                try:
                    for i, line in enumerate(fp.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                        if regex.search(line):
                            rel = str(fp.relative_to(self.root)).replace("\\","/")
                            results.append(f"{rel}:{i}: {line.strip()[:120]}")
                            if len(results) >= max_results:
                                return "\n".join(results)
                except (OSError, UnicodeDecodeError):
                    pass
        return "\n".join(results) if results else "No matches"

    def line_count(self, path: str) -> int:
        fp = self._safe(path)
        return len(fp.read_text(encoding="utf-8", errors="replace").splitlines()) if fp.exists() else -1

    def run(self, cmd: str, timeout: int = 120) -> str:
        blocked = ["rm -rf /", "format c:", "DROP DATABASE", "sudo rm"]
        if any(b.lower() in cmd.lower() for b in blocked):
            return "BLOCKED: dangerous command"
        try:
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                               timeout=timeout, cwd=str(self.root))
            return f"Exit:{r.returncode}\n{(r.stdout+r.stderr).strip()[-3000:]}"
        except subprocess.TimeoutExpired:
            return f"TIMEOUT:{timeout}s"
        except Exception as e:
            return f"ERROR:{e}"

    def tsc(self) -> str:
        return self.run("npx tsc -p tsconfig.app.json --noEmit", 180)

    def lint(self) -> str:
        return self.run("npm run lint", 120)

    def vitest(self, pattern: str = "") -> str:
        cmd = "npx vitest run --reporter=verbose"
        return self.run(f"{cmd} {pattern}".strip(), 300)

    def memory(self, scope: str = "repo") -> str:
        for base in ["memories", ".memories"]:
            p = self.root / base / scope
            if p.is_dir():
                parts = []
                for f in sorted(p.glob("*.md")):
                    parts.append(f"### {f.name}\n{f.read_text(encoding='utf-8', errors='replace')[:2000]}")
                return "\n\n".join(parts) if parts else "Empty"
        return f"Not found: {scope}"
''')
print("  ✓ tool_implementations.py")

# ── 3. rule_agents.py — агенты БЕЗ LLM ────────────────────────────
with open("ai_engine/bridge/rule_agents.py", "w", encoding="utf-8") as f:
    f.write(r'''#!/usr/bin/env python3
"""Rule-based агенты — работают БЕЗ API ключей.

Каждый агент выполняет конкретные проверки через ProjectTools.
Не нужен LLM для: tsc, lint, grep patterns, vitest, line count, ast.
"""

import re
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Optional


class BaseAgent:
    """Базовый rule-based агент."""
    role = "base"

    def __init__(self, tools) -> None:
        self.tools = tools
        self.findings: list[dict] = []
        self.log: list[str] = []

    def _add(self, severity: str, category: str, file: str, line: int, msg: str, fix: str = ""):
        self.findings.append({
            "severity": severity, "category": category,
            "file": file, "line": line, "message": msg, "fix": fix,
        })

    def _log(self, msg: str):
        self.log.append(f"[{self.role}] {msg}")
        print(f"  [{self.role}] {msg}")

    def run(self, task: str = "") -> dict:
        raise NotImplementedError

    def report_md(self) -> str:
        lines = [f"## Агент: {self.role}", f"Находок: {len(self.findings)}\n"]
        by_sev = {}
        for f in self.findings:
            by_sev.setdefault(f["severity"], []).append(f)
        for sev in ["critical", "high", "medium", "low", "info"]:
            items = by_sev.get(sev, [])
            if items:
                lines.append(f"### {sev.upper()} ({len(items)})")
                for item in items:
                    loc = f"`{item['file']}:{item['line']}`" if item["line"] else f"`{item['file']}`"
                    lines.append(f"- **{item['category']}** {loc}: {item['message']}")
                    if item["fix"]:
                        lines.append(f"  - Fix: {item['fix']}")
                lines.append("")
        return "\n".join(lines)


class ReviewerAgent(BaseAgent):
    """Проверяет: tsc, lint, размер файлов, мёртвый код, as any, console.log."""
    role = "reviewer"

    def run(self, task: str = "") -> dict:
        self._log("Запуск tsc...")
        tsc_out = self.tools.tsc()
        tsc_errors = [l for l in tsc_out.splitlines() if "error TS" in l]
        for err in tsc_errors[:20]:
            m = re.match(r"(.+?)\((\d+),\d+\):\s*error\s+TS\d+:\s*(.+)", err)
            if m:
                self._add("critical", "typescript", m.group(1), int(m.group(2)), m.group(3))
        self._log(f"tsc: {len(tsc_errors)} ошибок")

        self._log("Запуск lint...")
        lint_out = self.tools.lint()
        lint_warns = len(re.findall(r"warning", lint_out, re.IGNORECASE))
        lint_errs = len(re.findall(r"error", lint_out, re.IGNORECASE))
        if lint_errs:
            self._add("high", "lint", "project", 0, f"{lint_errs} lint ошибок, {lint_warns} warnings")
        self._log(f"lint: {lint_errs} ош., {lint_warns} warn")

        self._log("Проверка размеров файлов...")
        large_files = []
        for ext in ["*.tsx", "*.ts"]:
            for fp in Path(self.tools.root / "src").rglob(ext):
                lc = self.tools.line_count(str(fp.relative_to(self.tools.root)))
                if lc > 400:
                    large_files.append((str(fp.relative_to(self.tools.root)).replace("\\","/"), lc))
                    sev = "critical" if lc > 800 else "high" if lc > 600 else "medium"
                    self._add(sev, "file-size", str(fp.relative_to(self.tools.root)).replace("\\","/"),
                              0, f"{lc} строк (лимит 400)", "Декомпозировать файл")
        self._log(f"Больших файлов (>400): {len(large_files)}")

        self._log("Поиск `as any`...")
        any_matches = self.tools.grep(r"\bas any\b", include="*.ts,*.tsx")
        any_count = len(any_matches.splitlines()) if "No matches" not in any_matches else 0
        if any_count:
            self._add("medium", "type-safety", "project", 0, f"{any_count} мест с `as any`")
        self._log(f"as any: {any_count}")

        self._log("Поиск console.log...")
        console_matches = self.tools.grep(r"\bconsole\.(log|warn|error)\b", include="*.ts,*.tsx")
        cl_lines = [l for l in console_matches.splitlines() if "No matches" not in l
                     and "logger" not in l.lower() and "/reserve/" not in l and "/archive/" not in l]
        if cl_lines:
            self._add("low", "cleanup", "project", 0,
                       f"{len(cl_lines)} console.log (использовать logger)", "Заменить на logger")
        self._log(f"console.log: {len(cl_lines)}")

        return {"tsc_errors": len(tsc_errors), "lint_errors": lint_errs,
                "large_files": len(large_files), "as_any": any_count, "findings": len(self.findings)}


class SecurityAgent(BaseAgent):
    """Проверяет: dangerouslySetInnerHTML, eval, RLS, CORS, SQL injection patterns."""
    role = "security"

    def run(self, task: str = "") -> dict:
        checks = [
            ("dangerouslySetInnerHTML", r"dangerouslySetInnerHTML", "*.tsx", "high", "xss",
             "XSS риск: dangerouslySetInnerHTML", "Использовать DOMPurify"),
            ("eval/Function", r"\b(eval|new Function)\s*\(", "*.ts,*.tsx", "critical", "injection",
             "eval/Function — code injection", "Удалить eval"),
            ("innerHTML", r"\.innerHTML\s*=", "*.ts,*.tsx", "high", "xss",
             "innerHTML — XSS вектор", "Использовать textContent"),
            ("SQL template literal", r"`[^`]*\$\{[^}]*\}[^`]*(?:SELECT|INSERT|UPDATE|DELETE)", "*.ts,*.py",
             "critical", "sqli", "SQL injection через template literal", "Использовать параметризованные запросы"),
            ("Hardcoded secret", r"(?:password|secret|token|api_key)\s*[=:]\s*['\"][^'\"]{8,}", "*.ts,*.tsx,*.py,*.env",
             "high", "secrets", "Возможный захардкоженный секрет", "Перенести в env переменные"),
            ("CORS *", r"Access-Control-Allow-Origin.*\*", "*.ts", "medium", "cors",
             "CORS: разрешены все origin", "Ограничить список origin"),
            ("No .limit()", r"\.from\(['\"][^'\"]+['\"]\)\.select\([^)]*\)(?!.*\.limit\()", "*.ts,*.tsx",
             "medium", "performance", "Supabase запрос без .limit()", "Добавить .limit()"),
        ]
        for name, pattern, include, sev, cat, msg, fix in checks:
            self._log(f"Проверка: {name}...")
            matches = self.tools.grep(pattern, include=include)
            if "No matches" not in matches:
                for line in matches.splitlines()[:10]:
                    parts = line.split(":", 2)
                    if len(parts) >= 2:
                        self._add(sev, cat, parts[0], int(parts[1]) if parts[1].isdigit() else 0, msg, fix)

        # RLS check
        self._log("Проверка RLS...")
        rls_matches = self.tools.grep(r"CREATE TABLE", include="*.sql", max_results=100)
        if "No matches" not in rls_matches:
            tables = set()
            for line in rls_matches.splitlines():
                m = re.search(r"CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+\.)?(\w+)", line)
                if m:
                    tables.add(m.group(2))

            rls_enabled = self.tools.grep(r"ALTER TABLE.*ENABLE ROW LEVEL SECURITY", include="*.sql", max_results=200)
            rls_tables = set()
            if "No matches" not in rls_enabled:
                for line in rls_enabled.splitlines():
                    m = re.search(r"ALTER TABLE\s+(?:\w+\.)?(\w+)\s+ENABLE", line)
                    if m:
                        rls_tables.add(m.group(1))
            no_rls = tables - rls_tables - {"schema_migrations", "supabase_migrations"}
            if no_rls:
                for t in list(no_rls)[:10]:
                    self._add("critical", "rls", "supabase/migrations", 0,
                              f"Таблица `{t}` без RLS", f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY")
        self._log(f"Находок: {len(self.findings)}")
        return {"findings": len(self.findings)}


class TesterAgent(BaseAgent):
    """Запускает тесты, анализирует покрытие, находит модули без тестов."""
    role = "tester"

    def run(self, task: str = "") -> dict:
        self._log("Запуск vitest...")
        result = self.tools.vitest()
        passed = len(re.findall(r"✓|PASS", result))
        failed = len(re.findall(r"✗|×|FAIL", result))
        self._log(f"Тесты: {passed} passed, {failed} failed")

        if failed:
            self._add("high", "tests", "project", 0, f"{failed} тестов провалено")

        # Найти хуки без тестов
        self._log("Поиск хуков без тестов...")
        hooks_dir = self.tools.root / "src" / "hooks"
        if hooks_dir.is_dir():
            hooks = {f.stem for f in hooks_dir.glob("*.ts") if not f.name.endswith(".test.ts")}
            tests = {f.stem.replace(".test", "") for f in hooks_dir.glob("*.test.ts")}
            untested = hooks - tests
            if untested:
                for h in list(untested)[:20]:
                    self._add("medium", "coverage", f"src/hooks/{h}.ts", 0,
                              "Хук без тестов", f"Создать src/hooks/{h}.test.ts")
            self._log(f"Хуков без тестов: {len(untested)}/{len(hooks)}")

        return {"passed": passed, "failed": failed, "findings": len(self.findings)}


class DocWriterAgent(BaseAgent):
    """Генерирует документацию: архитектура, модули, API."""
    role = "doc_writer"

    def run(self, task: str = "") -> dict:
        self._log("Анализ структуры проекта...")

        # Компоненты
        comp_dir = self.tools.root / "src" / "components"
        modules = sorted(d.name for d in comp_dir.iterdir() if d.is_dir()) if comp_dir.is_dir() else []

        # Хуки
        hooks_dir = self.tools.root / "src" / "hooks"
        hooks = sorted(f.stem for f in hooks_dir.glob("*.ts") if not f.name.startswith("_")) if hooks_dir.is_dir() else []

        # Edge Functions
        func_dir = self.tools.root / "supabase" / "functions"
        functions = sorted(d.name for d in func_dir.iterdir() if d.is_dir() and not d.name.startswith("_")) if func_dir.is_dir() else []

        # Миграции
        mig_dir = self.tools.root / "supabase" / "migrations"
        migrations = sorted(f.name for f in mig_dir.glob("*.sql")) if mig_dir.is_dir() else []

        # Stores
        store_dir = self.tools.root / "src" / "stores"
        stores = sorted(f.stem for f in store_dir.glob("*.ts")) if store_dir.is_dir() else []

        # Pages
        pages_dir = self.tools.root / "src" / "pages"
        pages = sorted(f.stem for f in pages_dir.glob("*.tsx")) if pages_dir.is_dir() else []

        doc = f"""# Архитектура проекта — Your AI Companion
Сгенерировано: {datetime.now().strftime("%Y-%m-%d %H:%M")}

## Статистика
| Метрика | Значение |
|---|---|
| Компонентные модули | {len(modules)} |
| React хуки | {len(hooks)} |
| Edge Functions | {len(functions)} |
| SQL миграции | {len(migrations)} |
| Zustand stores | {len(stores)} |
| Страницы | {len(pages)} |

## Компонентные модули
{chr(10).join(f"- `{m}/`" for m in modules)}

## Ключевые хуки
{chr(10).join(f"- `{h}`" for h in hooks[:50])}

## Edge Functions
{chr(10).join(f"- `{fn}/`" for fn in functions[:50])}

## Страницы
{chr(10).join(f"- `{p}`" for p in pages)}

## Stores
{chr(10).join(f"- `{s}`" for s in stores)}
"""
        docs_dir = self.tools.root / "docs"
        docs_dir.mkdir(exist_ok=True)
        (docs_dir / "ARCHITECTURE_AUTO.md").write_text(doc, encoding="utf-8")
        self._log(f"Документация: docs/ARCHITECTURE_AUTO.md")

        # Находки для отсутствующей документации
        existing_docs = {f.stem for f in docs_dir.glob("*.md")}
        if "API" not in " ".join(existing_docs):
            self._add("medium", "docs", "docs/", 0, "Нет API-документации", "Сгенерировать docs/API.md")

        return {"modules": len(modules), "hooks": len(hooks), "functions": len(functions),
                "pages": len(pages), "findings": len(self.findings)}


class DebuggerAgent(BaseAgent):
    """Ищет типичные баги: пустые catch, missing await, race conditions."""
    role = "debugger"

    def run(self, task: str = "") -> dict:
        patterns = [
            ("Пустой catch", r"catch\s*\([^)]*\)\s*\{\s*\}", "*.ts,*.tsx", "high", "error-handling",
             "Пустой catch — ошибки проглатываются"),
            ("Missing await", r"(?<!await\s)(?:supabase|fetch)\.", "*.ts,*.tsx", "medium", "async",
             "Возможный missing await на async операции"),
            ("TODO в коде", r"\bTODO\b", "*.ts,*.tsx", "low", "cleanup",
             "TODO в production коде"),
            ("Утечка setInterval", r"setInterval\(", "*.ts,*.tsx", "medium", "memory-leak",
             "setInterval без cleanup", "Очищать в useEffect cleanup"),
            ("Fake success", r'toast\.success.*["\'].*успешно|["\'].*success', "*.ts,*.tsx", "medium", "ux",
             "Проверить: не fake success ли? Toast до завершения операции?"),
        ]
        for name, pattern, include, sev, cat, msg, *fix in patterns:
            self._log(f"Проверка: {name}...")
            matches = self.tools.grep(pattern, include=include, max_results=20)
            if "No matches" not in matches:
                for line in matches.splitlines()[:5]:
                    parts = line.split(":", 2)
                    if len(parts) >= 2:
                        self._add(sev, cat, parts[0], int(parts[1]) if parts[1].isdigit() else 0,
                                  msg, fix[0] if fix else "")

        return {"findings": len(self.findings)}


# ── Реестр агентов ─────────────────────────────────────────────────

AGENT_REGISTRY = {
    "reviewer": ReviewerAgent,
    "security": SecurityAgent,
    "tester": TesterAgent,
    "doc_writer": DocWriterAgent,
    "debugger": DebuggerAgent,
}
''')
print("  ✓ rule_agents.py")

# ── 4. mansoni_runner.py — CLI оркестратор ─────────────────────────
with open("ai_engine/bridge/mansoni_runner.py", "w", encoding="utf-8") as f:
    f.write(r'''#!/usr/bin/env python3
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
''')
print("  ✓ mansoni_runner.py")

# ── 5. __main__.py ────────────────────────────────────────────────
with open("ai_engine/bridge/__main__.py", "w", encoding="utf-8") as f:
    f.write("from ai_engine.bridge.mansoni_runner import main\nmain()\n")
print("  ✓ __main__.py")

# ── 6. copilot_bridge.py — Интеграция с VS Code Copilot ──────────
with open("ai_engine/bridge/copilot_bridge.py", "w", encoding="utf-8") as f:
    f.write(r'''#!/usr/bin/env python3
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
''')
print("  ✓ copilot_bridge.py")

# ── 7. Верификация ────────────────────────────────────────────────
print("\n" + "=" * 60)
print("  ВЕРИФИКАЦИЯ")
print("=" * 60)

from ai_engine.bridge.tool_implementations import ProjectTools
tools = ProjectTools(str(PROJECT_ROOT))

result = tools.grep("export function ChatConversation", include="*.tsx")
print(f"  ✓ grep: {len(result.splitlines())} совпадений")

lines = tools.line_count("src/components/chat/ChatConversation.tsx")
print(f"  ✓ ChatConversation.tsx: {lines} строк")

tsc = tools.tsc()
print(f"  ✓ tsc: {'ошибки' if 'error TS' in tsc else '0 ошибок'}")

from ai_engine.bridge.rule_agents import AGENT_REGISTRY
print(f"  ✓ Агенты: {', '.join(AGENT_REGISTRY.keys())}")

print(f"\n{'=' * 60}")
print("  ГОТОВО! Запуск:")
print()
print("  # Полный аудит (без API):")
print('  python -m ai_engine.bridge "Полный аудит проекта"')
print()
print("  # Интерактивный режим:")
print("  python -m ai_engine.bridge -i")
print()
print("  # Конкретные агенты:")
print('  python -m ai_engine.bridge --agents reviewer,security "Проверь"')
print()
print("  # Генерация промпта для Copilot Chat:")
print('  python -m ai_engine.bridge.copilot_bridge "аудит безопасности"')
print(f"{'=' * 60}")
