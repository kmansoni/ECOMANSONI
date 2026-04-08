#!/usr/bin/env python3
"""Context Manager — управление бесконечным контекстом для Mansoni.

Сохраняет, сжимает и восстанавливает контекст между сессиями Copilot.
Работает через /memories/ систему и файловую систему проекта.

    python -m ai_engine.bridge.context_manager save "Аудит безопасности"
    python -m ai_engine.bridge.context_manager resume
    python -m ai_engine.bridge.context_manager status
"""

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
MEMORIES = ROOT / "memories"
SESSION_DIR = MEMORIES / "session"
REPO_DIR = MEMORIES / "repo"
REPORTS_DIR = ROOT / "ai_engine" / "bridge" / "reports"
CHECKPOINTS_DIR = SESSION_DIR / "checkpoints"


def _ensure_dirs():
    for d in [SESSION_DIR, REPO_DIR, CHECKPOINTS_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def _find_latest_checkpoint() -> Path | None:
    _ensure_dirs()
    cps = sorted(CHECKPOINTS_DIR.glob("checkpoint-*.md"), reverse=True)
    return cps[0] if cps else None


def _count_checkpoints() -> int:
    _ensure_dirs()
    return len(list(CHECKPOINTS_DIR.glob("checkpoint-*.md")))


def _collect_project_stats() -> dict:
    """Быстрый snapshot статистики проекта."""
    src = ROOT / "src"
    stats = {}
    for name, pattern in [("components", "src/components/**/*.tsx"),
                          ("hooks", "src/hooks/**/*.ts"),
                          ("pages", "src/pages/**/*.tsx"),
                          ("stores", "src/stores/*.ts"),
                          ("edge_functions", "supabase/functions/*/index.ts"),
                          ("migrations", "supabase/migrations/*.sql")]:
        parts = pattern.split("/")
        base = ROOT
        count = 0
        try:
            from pathlib import PurePosixPath
            # Используем glob
            count = len(list(ROOT.glob(pattern)))
        except Exception:
            pass
        stats[name] = count
    return stats


def _collect_recent_reports() -> list[dict]:
    """Последние отчёты агентов."""
    results = []
    if not REPORTS_DIR.is_dir():
        return results
    for rp in sorted(REPORTS_DIR.glob("report_*.md"), reverse=True)[:5]:
        text = rp.read_text(encoding="utf-8", errors="replace")
        # Парсим summary
        findings = 0
        m = re.search(r"Находок\s*\|\s*(\d+)", text)
        if m:
            findings = int(m.group(1))
        # Severities
        sevs = {}
        for sev in ["critical", "high", "medium", "low"]:
            sm = re.search(rf"{sev}.*?(\d+)", text, re.IGNORECASE)
            if sm:
                sevs[sev] = int(sm.group(1))
        results.append({
            "file": rp.name,
            "findings": findings,
            "severities": sevs,
            "size": len(text),
        })
    return results


def _collect_todo_state() -> str:
    """Текущий прогресс по задачам из session memory."""
    # Ищем любой session файл
    for f in sorted(SESSION_DIR.glob("*.md"), reverse=True):
        if f.name != "archive.md":
            return f.read_text(encoding="utf-8", errors="replace")
    return "Нет активной сессии"


def _estimate_context_tokens() -> int:
    """Грубая оценка использованных токенов контекста (~4 chars = 1 token)."""
    total_chars = 0
    for d in [SESSION_DIR, REPO_DIR, REPORTS_DIR]:
        if d.is_dir():
            for f in d.glob("*.md"):
                total_chars += f.stat().st_size
    return total_chars // 4


def _collect_modified_files() -> list[str]:
    """Файлы изменённые в последних коммитах."""
    import subprocess
    try:
        r = subprocess.run(["git", "diff", "--name-only", "HEAD~5"],
                           capture_output=True, text=True, cwd=str(ROOT), timeout=10)
        return [l.strip() for l in r.stdout.splitlines() if l.strip()][:30]
    except Exception:
        return []


def save_checkpoint(task: str, phase: str = "", notes: str = "") -> str:
    """Сохранить checkpoint текущего состояния."""
    _ensure_dirs()
    
    num = _count_checkpoints() + 1
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    stats = _collect_project_stats()
    reports = _collect_recent_reports()
    todo = _collect_todo_state()
    modified = _collect_modified_files()
    
    # Читаем repo memories (ключевые)
    repo_facts = []
    for f in sorted(REPO_DIR.glob("*.md"))[:20]:
        repo_facts.append(f"- {f.stem}")
    
    content = f"""# Checkpoint #{num} — {task}
Дата: {datetime.now().strftime("%Y-%m-%d %H:%M")}
Фаза: {phase or "не указана"}

## Статистика проекта
| Метрика | Значение |
|---|---|
| Компоненты | {stats.get('components', '?')} |
| Хуки | {stats.get('hooks', '?')} |
| Страницы | {stats.get('pages', '?')} |
| Edge Functions | {stats.get('edge_functions', '?')} |
| Миграции | {stats.get('migrations', '?')} |

## Последние отчёты агентов
"""
    for rp in reports:
        sevs = ", ".join(f"{k}:{v}" for k, v in rp["severities"].items())
        content += f"- `{rp['file']}`: {rp['findings']} находок ({sevs})\n"
    
    content += f"""
## Состояние задач
{todo}

## Изменённые файлы (последние коммиты)
{chr(10).join(f"- `{f}`" for f in modified)}

## Память проекта (repo facts)
{chr(10).join(repo_facts)}

## Заметки
{notes or "—"}

## Инструкция для новой сессии

> **RESUME PROTOCOL**: Используй следующее как первый промпт в новой сессии:
>
> `Продолжи задачу "{task}". Прочитай /memories/session/checkpoints/checkpoint-{num:03d}_{ts}.md и восстанови контекст. Фаза: {phase}.`
"""
    
    path = CHECKPOINTS_DIR / f"checkpoint-{num:03d}_{ts}.md"
    path.write_text(content, encoding="utf-8")
    
    print(f"✓ Checkpoint #{num} сохранён: {path.relative_to(ROOT)}")
    return str(path)


def resume() -> str:
    """Показать контекст для восстановления из последнего checkpoint."""
    cp = _find_latest_checkpoint()
    if not cp:
        return "Нет checkpoint'ов. Начните новую задачу."
    
    text = cp.read_text(encoding="utf-8", errors="replace")
    print(f"═══ ВОССТАНОВЛЕНИЕ КОНТЕКСТА ═══")
    print(f"Файл: {cp.relative_to(ROOT)}")
    print(f"{'─'*40}")
    print(text)
    print(f"{'─'*40}")
    
    # Генерируем resume-промпт
    task_match = re.search(r"# Checkpoint #\d+ — (.+)", text)
    phase_match = re.search(r"Фаза: (.+)", text)
    task = task_match.group(1) if task_match else "неизвестная задача"
    phase = phase_match.group(1) if phase_match else "?"
    
    prompt = f"""
╔═══════════════════════════════════════════════════╗
║  RESUME PROMPT — скопируй в новую сессию Copilot  ║
╚═══════════════════════════════════════════════════╝

Продолжи задачу "{task}".
1. Прочитай /memories/session/checkpoints/{cp.name}
2. Прочитай /memories/session/audit-session-2026-04-07.md
3. Прочитай /memories/repo/ (ключевые факты)
4. Восстанови контекст и продолжи с фазы: {phase}
"""
    print(prompt)
    return text


def status() -> str:
    """Показать текущее состояние системы памяти."""
    _ensure_dirs()
    
    checkpoints = sorted(CHECKPOINTS_DIR.glob("checkpoint-*.md"))
    repo_files = sorted(REPO_DIR.glob("*.md"))
    session_files = sorted(SESSION_DIR.glob("*.md"))
    reports = sorted(REPORTS_DIR.glob("report_*.md")) if REPORTS_DIR.is_dir() else []
    
    # Подсчёт размера
    total_kb = sum(f.stat().st_size for f in 
                   list(checkpoints) + list(repo_files) + list(session_files)) / 1024
    
    output = f"""
╔═══════════════════════════════════════╗
║  MANSONI MEMORY STATUS                ║
╚═══════════════════════════════════════╝

  Checkpoints:     {len(checkpoints)}
  Repo facts:      {len(repo_files)}
  Session files:   {len(session_files)}
  Agent reports:   {len(reports)}
  Total memory:    {total_kb:.1f} KB

"""
    if checkpoints:
        latest = checkpoints[-1]
        output += f"  Последний checkpoint: {latest.name}\n"
        # Парсим дату
        m = re.search(r"Дата: (.+)", latest.read_text(encoding="utf-8", errors="replace"))
        if m:
            output += f"  Дата: {m.group(1)}\n"
    
    if reports:
        output += f"\n  Последний отчёт: {reports[-1].name}\n"

    print(output)
    return output


def compress_old_checkpoints(keep: int = 5):
    """Сжать старые checkpoint'ы, оставив последние N."""
    _ensure_dirs()
    cps = sorted(CHECKPOINTS_DIR.glob("checkpoint-*.md"))
    if len(cps) <= keep:
        print(f"Checkpoint'ов ({len(cps)}) ≤ лимит ({keep}), сжатие не нужно")
        return
    
    to_compress = cps[:-keep]
    archive_path = CHECKPOINTS_DIR / "archive.md"
    
    archive_lines = [f"# Архив Checkpoint'ов\nСжато: {datetime.now()}\n\n"]
    for cp in to_compress:
        text = cp.read_text(encoding="utf-8", errors="replace")
        # Берём только заголовок и заметки
        task_match = re.search(r"# Checkpoint #\d+ — (.+)", text)
        date_match = re.search(r"Дата: (.+)", text)
        notes_match = re.search(r"## Заметки\n(.+?)(?=\n##|\Z)", text, re.DOTALL)
        
        task = task_match.group(1) if task_match else "?"
        date = date_match.group(1) if date_match else "?"
        notes = notes_match.group(1).strip() if notes_match else "—"
        
        archive_lines.append(f"### {cp.name} — {task} ({date})\n{notes}\n")
        cp.unlink()
    
    archive_path.write_text("\n".join(archive_lines), encoding="utf-8")
    print(f"✓ Сжато {len(to_compress)} checkpoint'ов → archive.md")


def main():
    p = argparse.ArgumentParser(description="Mansoni Context Manager — бесконечная память")
    sub = p.add_subparsers(dest="command")
    
    save_p = sub.add_parser("save", help="Сохранить checkpoint")
    save_p.add_argument("task", help="Описание задачи")
    save_p.add_argument("--phase", default="", help="Текущая фаза")
    save_p.add_argument("--notes", default="", help="Заметки")
    
    sub.add_parser("resume", help="Восстановить из последнего checkpoint")
    sub.add_parser("status", help="Статус системы памяти")
    
    compress_p = sub.add_parser("compress", help="Сжать старые checkpoint'ы")
    compress_p.add_argument("--keep", type=int, default=5, help="Сколько оставить (default: 5)")
    
    args = p.parse_args()
    
    if args.command == "save":
        save_checkpoint(args.task, args.phase, args.notes)
    elif args.command == "resume":
        resume()
    elif args.command == "status":
        status()
    elif args.command == "compress":
        compress_old_checkpoints(args.keep)
    else:
        p.print_help()


if __name__ == "__main__":
    main()
