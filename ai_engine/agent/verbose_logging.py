#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
📝 Verbose Logging — подробное логирование с прогрессом и красивым выводом.

Возможности:
- Цветной вывод в терминал
- Прогресс-бары
- Подробные шаги выполнения
- Анимированные индикаторы
- Форматированный вывод
"""

import sys
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Optional
from datetime import datetime


class LogLevel(Enum):
    """Уровни логирования."""
    DEBUG = "🔍 DEBUG"
    INFO = "ℹ️ INFO"
    SUCCESS = "✅ SUCCESS"
    WARNING = "⚠️ WARNING"
    ERROR = "❌ ERROR"
    PROGRESS = "⏳ PROGRESS"


class Colors:
    """Цвета для терминала."""
    RESET = "\033[0m"
    BOLD = "\033[1m"
    
    # Colors
    BLACK = "\033[30m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"
    
    # Backgrounds
    BG_BLACK = "\033[40m"
    BG_RED = "\033[41m"
    BG_GREEN = "\033[42m"
    BG_YELLOW = "\033[43m"
    BG_BLUE = "\033[44m"
    BG_MAGENTA = "\033[45m"
    BG_CYAN = "\033[46m"
    BG_WHITE = "\033[47m"
    
    @staticmethod
    def color(text: str, color: str) -> str:
        """Применить цвет к тексту."""
        return f"{color}{text}{Colors.RESET}"
    
    @staticmethod
    def bold(text: str) -> str:
        """Жирный текст."""
        return f"{Colors.BOLD}{text}{Colors.RESET}"
    
    @staticmethod
    def info(text: str) -> str:
        """Информация (синий)."""
        return f"{Colors.BLUE}{text}{Colors.RESET}"
    
    @staticmethod
    def success(text: str) -> str:
        """Успех (зелёный)."""
        return f"{Colors.GREEN}{text}{Colors.RESET}"
    
    @staticmethod
    def warning(text: str) -> str:
        """Предупреждение (жёлтый)."""
        return f"{Colors.YELLOW}{text}{Colors.RESET}"
    
    @staticmethod
    def error(text: str) -> str:
        """Ошибка (красный)."""
        return f"{Colors.RED}{text}{Colors.RESET}"
    
    @staticmethod
    def progress(text: str) -> str:
        """Прогресс (голубой)."""
        return f"{Colors.CYAN}{text}{Colors.RESET}"


class ProgressBar:
    """Прогресс-бар."""
    
    def __init__(self, total: int = 100, title: str = "Progress", width: int = 40):
        self.total = total
        self.title = title
        self.width = width
        self.current = 0
        self.start_time = time.time()
    
    def update(self, current: int = None, message: str = "") -> None:
        """Обновить прогресс."""
        if current is not None:
            self.current = current
        else:
            self.current += 1
        
        percent = min(100, int((self.current / self.total) * 100))
        filled = int((self.width * self.current) / self.total)
        bar = "█" * filled + "░" * (self.width - filled)
        
        elapsed = time.time() - self.start_time
        speed = self.current / elapsed if elapsed > 0 else 0
        
        # Вывод без переноса строки
        sys.stdout.write(f"\r{self.title}: |{bar}| {percent}% ({self.current}/{self.total}) {message}")
        sys.stdout.flush()
        
        if self.current >= self.total:
            sys.stdout.write("\n")
    
    def finish(self, message: str = "Done!") -> None:
        """Завершить прогресс."""
        self.update(self.total, message)


class Spinner:
    """Анимированный спиннер."""
    
    FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
    
    def __init__(self, message: str = "Working"):
        self.message = message
        self.frame = 0
        self.running = False
    
    def spin(self) -> str:
        """Следующий кадр."""
        frame = Spinner.FRAMES[self.frame % len(Spinner.FRAMES)]
        self.frame += 1
        return f"{frame} {self.message}"
    
    def __enter__(self):
        self.running = True
        return self
    
    def __exit__(self, *args):
        self.running = False


class StepTracker:
    """
    Трекер шагов выполнения.
    
    Пример:
        with StepTracker("Создание проекта") as tracker:
            tracker.start_step("Инициализация")
            init_project()
            tracker.complete_step()
            
            tracker.start_step("Настройка конфигов")
            setup_config()
            tracker.complete_step()
    """
    
    def __init__(self, title: str = "Task", verbose: bool = True):
        self.title = title
        self.verbose = verbose
        self.steps: list[dict] = []
        self.current_step = None
        self.start_time = time.time()
        self.step_number = 0
        
        if verbose:
            print(f"\n{Colors.bold('═' * 60)}")
            print(f"{Colors.bold('🎯 ' + self.title)}")
            print(f"{Colors.bold('═' * 60)}")
    
    def start_step(self, name: str, details: str = "") -> None:
        """Начать новый шаг."""
        self.step_number += 1
        self.current_step = {
            "name": name,
            "details": details,
            "start_time": time.time(),
            "number": self.step_number,
        }
        
        if self.verbose:
            indicator = f"{self.step_number:2d}."
            print(f"  {Colors.info(indicator)} {name}")
            if details:
                print(f"      └─ {Colors.progress(details)}")
            print(f"      └─ ", end="", flush=True)
    
    def complete_step(self, message: str = "✓") -> float:
        """Завершить текущий шаг."""
        if self.current_step:
            duration = time.time() - self.current_step["start_time"]
            self.current_step["duration"] = duration
            self.current_step["status"] = "complete"
            self.steps.append(self.current_step)
            
            if self.verbose:
                print(f"{Colors.success('Done in ' + f'{duration:.2f}s')}")
                print()
            
            self.current_step = None
            return duration
        return 0.0
    
    def fail_step(self, error: str) -> None:
        """Отметить шаг как failed."""
        if self.current_step:
            self.current_step["status"] = "failed"
            self.current_step["error"] = error
            self.steps.append(self.current_step)
            
            if self.verbose:
                print(f"{Colors.error('Failed: ' + error)}")
            
            self.current_step = None
    
    def __enter__(self):
        return self
    
    def __exit__(self, *args):
        total_time = time.time() - self.start_time
        status = Colors.success("✅ Успешно")
        
        if self.verbose:
            print(f"{Colors.bold('─' * 60)}")
            print(f"  {status} | Шагов: {len(self.steps)} | Время: {total_time:.2f}s")
            print(f"{Colors.bold('═' * 60)}\n")


class VerboseLogger:
    """
    Главный класс verbose логирования.
    
    Пример использования:
        log = VerboseLogger("Создание проекта")
        
        with log.task("Генерация кода"):
            log.step("Создание файлов")
            generate_files()
            log.step("Создание конфигов")
            generate_config()
        
        with log.task("Установка зависимостей"):
            log.step("Установка npm")
            install_npm()
    """
    
    def __init__(self, title: str = "Task", verbose: bool = True):
        self.title = title
        self.verbose = verbose
        self.task_depth = 0
        self.indent = "  "
    
    def _indent_text(self, text: str) -> str:
        """Добавить отступ."""
        return f"{self.indent * self.task_depth}{text}"
    
    def task(self, name: str) -> StepTracker:
        """Начать новую задачу."""
        if self.verbose:
            print(f"\n{Colors.bold('🎯 ' + name)}")
        return StepTracker(name, self.verbose)
    
    def step(self, name: str) -> None:
        """Простой шаг."""
        if self.verbose:
            print(f"{self._indent_text('📌 ' + name)}")
    
    def info(self, message: str) -> None:
        """Информация."""
        if self.verbose:
            print(f"{self._indent_text(Colors.info('ℹ️ ' + message))}")
    
    def success(self, message: str) -> None:
        """Успех."""
        if self.verbose:
            print(f"{self._indent_text(Colors.success('✅ ' + message))}")
    
    def warning(self, message: str) -> None:
        """Предупреждение."""
        if self.verbose:
            print(f"{self._indent_text(Colors.warning('⚠️ ' + message))}")
    
    def error(self, message: str) -> None:
        """Ошибка."""
        if self.verbose:
            print(f"{self._indent_text(Colors.error('❌ ' + message))}")
    
    def debug(self, message: str) -> None:
        """Отладка."""
        if self.verbose:
            print(f"{self._indent_text(Colors.debug('🔍 ' + message))}")
    
    def substep(self, name: str) -> "VerboseLogger":
        """Начать подзадачу."""
        new_logger = VerboseLogger(self.title, self.verbose)
        new_logger.task_depth = self.task_depth + 1
        new_logger.info("→ " + name)
        return new_logger
    
    def data(self, data: dict, title: str = "Data") -> None:
        """Вывод данных в красивом формате."""
        if self.verbose:
            print(f"{self._indent_text(Colors.bold('📊 ' + title + ':'))}")
            for key, value in data.items():
                if isinstance(value, dict):
                    print(f"{self._indent_text}  {key}:")
                    for k, v in value.items():
                        print(f"{self._indent_text}    {k}: {v}")
                else:
                    print(f"{self._indent_text}  {key}: {value}")


# =============================================================================
# Утилиты для форматированного вывода
# =============================================================================

def format_duration(seconds: float) -> str:
    """Форматировать время."""
    if seconds < 1:
        return f"{seconds*1000:.0f}ms"
    elif seconds < 60:
        return f"{seconds:.2f}s"
    elif seconds < 3600:
        return f"{seconds/60:.1f}m"
    else:
        return f"{seconds/3600:.1f}h"


def format_size(bytes: int) -> str:
    """Форматировать размер."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes < 1024:
            return f"{bytes:.1f}{unit}"
        bytes /= 1024
    return f"{bytes:.1f}TB"


def format_table(headers: list[str], rows: list[list[str]], title: str = "") -> str:
    """Создать таблицу."""
    if not rows:
        return ""
    
    # Calculate widths
    widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(str(cell)))
    
    lines = []
    
    if title:
        lines.append(Colors.bold(title))
        lines.append(Colors.bold("═" * sum(widths)))
    
    # Header
    header = " | ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    lines.append(Colors.bold(header))
    lines.append("-" * sum(widths))
    
    # Rows
    for row in rows:
        line = " | ".join(str(cell).ljust(widths[i]) for i, cell in enumerate(row))
        lines.append(line)
    
    return "\n".join(lines)


def format_list(items: list[str], title: str = "", numbered: bool = True) -> str:
    """Создать список."""
    if not items:
        return ""
    
    lines = []
    
    if title:
        lines.append(Colors.bold(title))
    
    for i, item in enumerate(items):
        prefix = f"{i+1}." if numbered else "•"
        lines.append(f"  {prefix} {item}")
    
    return "\n".join(lines)


# =============================================================================
# Глобальные функции
# =============================================================================

def log_step(name: str, duration: float = None) -> None:
    """Простой лог шага."""
    msg = f"  📌 {name}"
    if duration:
        msg += f" {Colors.success('✓')}"
    print(msg)


def log_result(name: str, result: Any) -> None:
    """Лог результата."""
    print(f"    → {name}: {result}")


def log_error_with_traceback(message: str, exc: Exception) -> None:
    """Лог ошибки с traceback."""
    import traceback
    print(Colors.error(f"❌ {message}: {exc}"))
    print(Colors.error(traceback.format_exc()))


# =============================================================================
# Decorator для автоматического логирования
# =============================================================================

def logged(func: Callable) -> Callable:
    """Декоратор для автоматического логирования."""
    import functools
    import inspect
    
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        sig = inspect.signature(func)
        params = list(sig.parameters.keys())
        
        print(f"\n{Colors.info('🔧 Вызов:')} {func.__name__}")
        
        if args:
            print(f"  Args ({len(args)}): {args[:3]}...")
        
        start = time.time()
        
        try:
            result = func(*args, **kwargs)
            duration = time.time() - start
            print(f"  {Colors.success('✓')} {func.__name__} completed in {format_duration(duration)}")
            return result
        except Exception as e:
            duration = time.time() - start
            print(f"  {Colors.error('✗')} {func.__name__} failed after {format_duration(duration)}")
            log_error_with_traceback("Error", e)
            raise
    
    return wrapper


# =============================================================================
# Global
# =============================================================================

verbose_logger = VerboseLogger


if __name__ == "__main__":
    # Demo
    log = verbose_logger("Тестовая задача")
    
    with log.task("Создание проекта") as tracker:
        tracker.start_step("Инициализация")
        time.sleep(0.1)
        tracker.complete_step()
        
        tracker.start_step("Настройка")
        time.sleep(0.1)
        tracker.complete_step()
    
    log.success("Все задачи выполнены!")