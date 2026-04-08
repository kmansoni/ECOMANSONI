#!/usr/bin/env python3
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
    """Проверяет: dangerouslySetInnerHTML, eval, RLS, CORS, SQL injection patterns.

    Фильтрует ложноположительные: DOMPurify.sanitize + dangerouslySetInnerHTML = safe,
    redis.eval — не JS eval, PostgREST query строки — не SQL injection.
    """
    role = "security"

    # Паттерны, которые делают находку safe (строка файла содержит один из них)
    _FALSE_POSITIVE_FILTERS = {
        "dangerouslySetInnerHTML": ["DOMPurify", "sanitize", "no dangerouslySetInnerHTML"],
        "eval/Function": ["redis", "Redis", ".eval(", "TOKEN_BUCKET", "LUA"],
        "innerHTML": ["DOMPurify", "sanitize", "# ❌", "// ❌", "element.innerHTML", "userInput"],
        "SQL template literal": ["encodeURIComponent", "postgrest", "PostgREST", "buildUrl",
                                  "# ❌", "// ❌", "cursor.execute"],
        "Hardcoded secret": [".example", ".sample", "test", "mock", "placeholder", "TODO", "CHANGE_ME",
                              "# ❌", "# ✅", "// ❌", "// ✅", "<API_KEY", "<HARDCODED",
                              "ESCROW_CREATED", "CEREMONY_", "DEVICE_TRANSFER", "_PASSWORD'",
                              "cloud_password", "security_cloud"],
    }

    def _is_false_positive(self, check_name: str, file_path: str, line_text: str) -> bool:
        filters = self._FALSE_POSITIVE_FILTERS.get(check_name, [])
        for fp in filters:
            if fp.lower() in line_text.lower() or fp.lower() in file_path.lower():
                return True
        return False

    def run(self, task: str = "") -> dict:
        checks = [
            ("dangerouslySetInnerHTML", r"dangerouslySetInnerHTML", "*.tsx", "high", "xss",
             "XSS риск: dangerouslySetInnerHTML без sanitize", "Использовать DOMPurify"),
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
                for line in matches.splitlines()[:15]:
                    parts = line.split(":", 2)
                    if len(parts) >= 2:
                        ctx = parts[2] if len(parts) > 2 else ""
                        if self._is_false_positive(name, parts[0], ctx):
                            continue
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
            # Исключаем service-only таблицы (email-router, tenant) и несуществующие аналитические
            service_only = {"smtp_identities", "email_messages", "tenant_limits",
                            "email_events", "templates", "retry_log", "email_outbox", "email_inbox",
                            "email_threads", "delivery_attempts"}
            no_rls -= service_only
            if no_rls:
                # Проверяем: используется ли таблица из фронтенда (src/)
                for t in sorted(no_rls)[:15]:
                    usage = self.tools.grep(rf'from\(["\x27]{t}["\x27]\)', include="*.ts,*.tsx")
                    if "No matches" not in usage:
                        self._add("critical", "rls", "supabase/migrations", 0,
                                  f"Таблица `{t}` без RLS (используется из клиента)",
                                  f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY")
                    else:
                        self._add("low", "rls", "supabase/migrations", 0,
                                  f"Таблица `{t}` без RLS (только server-side)",
                                  f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY")
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
