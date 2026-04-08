#!/usr/bin/env python3
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
        results, ignore = [], {"node_modules",".git",".kilo","dist","build","__pycache__",".venv","reserve","archive","tmp","test-results","pw-screenshots"}
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
