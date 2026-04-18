#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🤖 AI Code Review — умный review через AI.

Возможности:
- Умный анализ кода
- Предложения по улучшению
- Баг детекция
- Performance suggestions
- Security suggestions
- Best practices
"""

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


class ReviewSeverity(Enum):
    """Уровень важности."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    SUGGESTION = "suggestion"


class ReviewCategory(Enum):
    """Категория review."""
    BUG = "bug"
    SECURITY = "security"
    PERFORMANCE = "performance"
    BEST_PRACTICE = "best_practice"
    STYLE = "style"
    ACCESSIBILITY = "accessibility"
    TESTING = "testing"


@dataclass
class CodeReviewItem:
    """Элемент review."""
    line: int
    category: ReviewCategory
    severity: ReviewSeverity
    title: str
    description: str
    suggestion: str
    code: str = ""


@dataclass
class CodeReviewResult:
    """Результат review."""
    file: str
    language: str
    reviews: list[CodeReviewItem] = field(default_factory=list)
    score: int = 100
    summary: str = ""


class AIReviewEngine:
    """
    AI Code Review Engine.

    Анализирует:
    - Баги
    - Безопасность
    - Performance
    - Best practices
    - Тесты
    """

    def __init__(self, llm_callable: Optional[Callable] = None):
        self.llm = llm_callable
        
        # Паттерны для быстрого анализа
        self.patterns = {
            # Bugs
            "async_without_await": (
                r"async\s+def\s+\w+\([^)]*\):\s*(?!.*await)",
                "Async функция без await",
                ReviewCategory.BUG,
                ReviewSeverity.HIGH,
            ),
            "undefined_access": (
                r"\w+\[undefined\]",
                "Доступ к undefined",
                ReviewCategory.BUG,
                ReviewSeverity.HIGH,
            ),
            "console_log": (
                r"console\.(log|debug|info)",
                "console.log в коде",
                ReviewCategory.BEST_PRACTICE,
                ReviewSeverity.LOW,
            ),
            # Security
            "hardcoded_secret": (
                r"(password|secret|key|token)\s*=\s*['\"][^'\"]+['\"]",
                "Hardcoded credentials",
                ReviewCategory.SECURITY,
                ReviewSeverity.CRITICAL,
            ),
            "eval_usage": (
                r"\beval\s*\(",
                "Использование eval()",
                ReviewCategory.SECURITY,
                ReviewSeverity.CRITICAL,
            ),
            "inner_html": (
                r"\.innerHTML\s*=",
                "innerHTML - XSS риск",
                ReviewCategory.SECURITY,
                ReviewSeverity.HIGH,
            ),
            # Performance
            "useeffect_deps": (
                r"useEffect\([^)]*,\s*\[",
                "Неполные dependencies",
                ReviewCategory.PERFORMANCE,
                ReviewSeverity.MEDIUM,
            ),
            "no_memo": (
                r"(map|filter|reduce)\([^)]*\)\s*\)\s*\.\w+\(",
                "Цепочка без memo",
                ReviewCategory.PERFORMANCE,
                ReviewSeverity.MEDIUM,
            ),
            # Testing
            "no_test": (
                r"export\s+default\s+function\s+\w+",
                "Нет тестов для функции",
                ReviewCategory.TESTING,
                ReviewSeverity.MEDIUM,
            ),
        }

    def review_file(self, filepath: str, content: str) -> CodeReviewResult:
        """
        Review одного файла.

        Args:
            filepath: Путь к файлу.
            content: Содержимое.

        Returns:
            CodeReviewResult.
        """
        result = CodeReviewResult(
            file=filepath,
            language=self._detect_language(filepath),
            reviews=[],
        )
        
        lines = content.split("\n")
        
        # Паттерн анализ
        for i, line in enumerate(lines, 1):
            for pattern, (regex, title, category, severity) in self.patterns.items():
                if re.search(regex, line):
                    result.reviews.append(CodeReviewItem(
                        line=i,
                        category=category,
                        severity=severity,
                        title=title,
                        description=f"Found at line {i}: {title}",
                        suggestion=self._get_suggestion(category, title),
                        code=line.strip()[:100],
                    ))
        
        # AI enhanced review
        if self.llm:
            ai_reviews = self._ai_review(content, filepath)
            result.reviews.extend(ai_reviews)
        
        # Считаем score
        result.score = self._calculate_score(result.reviews)
        
        # Summary
        result.summary = f"Found {len(result.reviews)} issues"
        
        return result

    def _ai_review(self, code: str, filepath: str) -> list[CodeReviewItem]:
        """AI enhanced review."""
        if not self.llm:
            return []
        
        prompt = f"""Сделай code review файла {filepath}.

Код:
```{code[:2000]}
```

Выведи JSON массив объектов:
[{{"line": N, "category": "bug|security|performance|best_practice", "severity": "critical|high|medium|low", "title": "...", "suggestion": "..."}}]

Только JSON, без пояснений:"""

        try:
            response = self.llm(prompt)
            
            # Парсим JSON
            reviews = json.loads(response)
            
            return [
                CodeReviewItem(
                    line=r.get("line", 0),
                    category=ReviewCategory(r.get("category", "best_practice")),
                    severity=ReviewSeverity(r.get("severity", "medium")),
                    title=r.get("title", ""),
                    description=r.get("description", ""),
                    suggestion=r.get("suggestion", ""),
                )
                for r in reviews
            ]
        except:
            return []

    def review_directory(self, path: str) -> list[CodeReviewResult]:
        """Review всей директории."""
        import os
        
        results = []
        
        for root, dirs, files in os.walk(path):
            dirs[:] = [d for d in dirs if d not in ["node_modules", ".git", "dist"]]
            
            for file in files:
                if file.endswith((".js", ".ts", ".jsx", ".tsx", ".py", ".go")):
                    filepath = os.path.join(root, file)
                    
                    try:
                        with open(filepath, "r", encoding="utf-8") as f:
                            content = f.read()
                        
                        result = self.review_file(filepath, content)
                        if result.reviews:
                            results.append(result)
                    except:
                        pass
        
        return results

    def _detect_language(self, filepath: str) -> str:
        """Определить язык."""
        ext = filepath.rsplit(".", 1)[-1] if "." in filepath else ""
        
        lang_map = {
            "js": "JavaScript",
            "ts": "TypeScript",
            "jsx": "React JSX",
            "tsx": "React TSX",
            "py": "Python",
            "go": "Go",
            "rs": "Rust",
            "java": "Java",
        }
        
        return lang_map.get(ext.lower(), "Unknown")

    def _get_suggestion(self, category: ReviewCategory, title: str) -> str:
        """Получить suggestion."""
        suggestions = {
            (ReviewCategory.BUG, "async"): "Добавь await или убери async",
            (ReviewCategory.SECURITY, "hardcoded"): "ИспользуйEnvironment variables",
            (ReviewCategory.SECURITY, "eval"): "Не используй eval(), используй JSON.parse",
            (ReviewCategory.SECURITY, "inner_html"): "Используй textContent или sanitize",
            (ReviewCategory.PERFORMANCE, "useeffect"): "Добавь все зависимости в массив",
            (ReviewCategory.TESTING, "no_test"): "Напиши тесты для этой функции",
        }
        
        return suggestions.get((category, title), "Исправь это")

    def _calculate_score(self, reviews: list[CodeReviewItem]) -> int:
        """Рассчитать score."""
        score = 100
        
        for r in reviews:
            if r.severity == ReviewSeverity.CRITICAL:
                score -= 25
            elif r.severity == ReviewSeverity.HIGH:
                score -= 15
            elif r.severity == ReviewSeverity.MEDIUM:
                score -= 10
            elif r.severity == ReviewSeverity.LOW:
                score -= 5
        
        return max(0, score)

    def format_report(self, results: list[CodeReviewResult]) -> str:
        """Форматировать отчёт."""
        lines = [
            "🤖 AI CODE REVIEW",
            "=" * 50,
            "",
        ]
        
        for result in results:
            lines.append(f"📄 {result.file} ({result.language})")
            lines.append(f"   Score: {result.score}/100")
            lines.append("")
            
            if result.reviews:
                for review in result.reviews:
                    emoji = {
                        ReviewSeverity.CRITICAL: "🔴",
                        ReviewSeverity.HIGH: "🟠",
                        ReviewSeverity.MEDIUM: "🟡",
                        ReviewSeverity.LOW: "🔵",
                        ReviewSeverity.SUGGESTION: "💡",
                    }.get(review.severity, "⚪")
                    
                    lines.append(f"   {emoji} Line {review.line}: {review.title}")
                    lines.append(f"      → {review.suggestion}")
                lines.append("")
        
        return "\n".join(lines)


# =============================================================================
# Глобальный instance
# =============================================================================

_ai_review: Optional[AIReviewEngine] = None


def get_ai_code_reviewer(llm_callable: Optional[Callable] = None) -> AIReviewEngine:
    """Получить AI reviewer."""
    global _ai_review
    if _ai_review is None:
        _ai_review = AIReviewEngine(llm_callable)
    return _ai_review


if __name__ == "__main__":
    reviewer = get_ai_code_reviewer()
    
    # Example review
    code = """
async function fetchData() {
  const result = fetch('/api/data');
  console.log(result);
  return result.json();
}
"""
    result = reviewer.review_file("example.js", code)
    
    print(f"File: {result.file}")
    print(f"Score: {result.score}")
    print(f"Issues: {len(result.reviews)}")
    for r in result.reviews:
        print(f"  - {r.title}")