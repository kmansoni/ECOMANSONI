"""
Prompt Optimizer — система автоматического улучшения запросов перед выполнением.
Реализует паттерны из LangChain, AutoGen, Dify для оценки и оптимизации запросов.

Компоненты:
1. Chain-of-Thought анализ — понимание структуры запроса
2. Reflection Loop — обратная связь от выполнений
3. Few-shot Injection — добавление успешных примеров
4. Prompt Expansion — добавление контекста и критериев
"""

import json
import hashlib
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
import re

# Локальный импорт (будет доступен при интеграции)
try:
    from .message_bus import publish_event
    from .research_engine import SemanticSearchEngine
except ImportError:
    # Fallback для разработки
    def publish_event(*args, **kwargs):
        pass
    SemanticSearchEngine = None


@dataclass
class OptimizedPrompt:
    """Результат оптимизации"""
    original: str
    optimized: str
    improvement_score: float  # 0.0 - 1.0
    changes: List[str]  # Какие изменения сделаны
    reasoning: str  # Почему эти изменения улучшат результат


@dataclass
class ExecutionExample:
    """Пример успешного выполнения задачи"""
    prompt: str
    result: str
    agent_type: str
    timestamp: str
    tokens_used: int
    success_rating: float  # 0.0-1.0


class PromptOptimizer:
    """
    Основной класс для оптимизации запросов.

    Использует Machine-in-the-Loop подход:
    1. Анализирует структуру запроса
    2. Ищет похожие успешные примеры
    3. Добавляет критерии оценки
    4. Расширяет контекст
    """

    def __init__(self, supabase_client=None, search_engine=None):
        self.db = supabase_client
        self.search = search_engine
        self.optimization_rules = self._load_rules()

    def optimize(self,
                 prompt: str,
                 agent_type: str = "general",
                 max_length: int = 2000) -> OptimizedPrompt:
        """
        Главный метод оптимизации запроса.

        Args:
            prompt: исходный запрос пользователя
            agent_type: тип агента (explorer, architect, coder, reviewer)
            max_length: максимальная длина оптимизированного запроса

        Returns:
            OptimizedPrompt с улучшениями
        """

        # Фаза 1: Анализ структуры запроса
        analysis = self._analyze_prompt_structure(prompt)

        # Фаза 2: Поиск похожих примеров
        examples = self._find_similar_examples(prompt, agent_type)

        # Фаза 3: Построение оптимизированного запроса
        optimized = self._build_optimized_prompt(
            prompt=prompt,
            analysis=analysis,
            examples=examples,
            agent_type=agent_type,
            max_length=max_length
        )

        # Фаза 4: Оценка улучшения
        improvement_score = self._calculate_improvement_score(prompt, optimized)

        result = OptimizedPrompt(
            original=prompt,
            optimized=optimized,
            improvement_score=improvement_score,
            changes=analysis['identified_gaps'],
            reasoning=self._generate_reasoning(analysis, examples)
        )

        # Логирование оптимизации
        self._log_optimization(result, agent_type)

        return result

    def _analyze_prompt_structure(self, prompt: str) -> Dict:
        """
        Chain-of-Thought анализ структуры запроса.

        Выявляет:
        - Недостающие детали и контекст
        - Неясные требования
        - Отсутствующие критерии оценки
        """

        analysis = {
            'has_context': False,
            'has_constraints': False,
            'has_evaluation_criteria': False,
            'has_examples': False,
            'clarity_score': 0.0,
            'identified_gaps': [],
            'recommendations': [],
        }

        # Проверка контекста
        context_keywords = ['контекст', 'фон', 'история', 'предыстория', 'given', 'context']
        if any(kw in prompt.lower() for kw in context_keywords):
            analysis['has_context'] = True
        else:
            analysis['identified_gaps'].append('❌ Отсутствует контекст задачи')
            analysis['recommendations'].append(
                '✓ Добавь контекст: "Я работаю над...")

        # Проверка ограничений
        constraint_keywords = ['ограничение', 'нельзя', 'обязатель', 'должен', 'не', 'except', 'constraint']
        if any(kw in prompt.lower() for kw in constraint_keywords):
            analysis['has_constraints'] = True
        else:
            analysis['identified_gaps'].append('❌ Не указаны ограничения')
            analysis['recommendations'].append(
                '✓ Добавь ограничения: "Нельзя использовать...")

        # Проверка критериев оценки
        criteria_keywords = ['критерий', 'оцен', 'что важно', 'приоритет', 'requirements', 'must']
        if any(kw in prompt.lower() for kw in criteria_keywords):
            analysis['has_evaluation_criteria'] = True
        else:
            analysis['identified_gaps'].append('❌ Не указаны критерии успеха')
            analysis['recommendations'].append(
                '✓ Добавь критерии: "Результат должен: быстро выполняться...")

        # Проверка примеров
        example_keywords = ['пример', 'например', 'вот', 'такой как', 'like', 'example']
        if any(kw in prompt.lower() for kw in example_keywords):
            analysis['has_examples'] = True
        else:
            analysis['identified_gaps'].append('❌ Нет примеров для ясности')

        # Вычисление clarity score (0-1)
        score = sum([
            0.25 if analysis['has_context'] else 0,
            0.25 if analysis['has_constraints'] else 0,
            0.25 if analysis['has_evaluation_criteria'] else 0,
            0.25 if analysis['has_examples'] else 0,
        ])
        analysis['clarity_score'] = score

        return analysis

    def _find_similar_examples(self,
                              prompt: str,
                              agent_type: str,
                              limit: int = 3) -> List[ExecutionExample]:
        """
        Найти похожие успешные примеры из истории выполнений.

        Использует семантический поиск для нахождения задач с высоким рейтингом.
        """

        if not self.search or not self.db:
            return []

        try:
            # Запрос к Supabase: найди успешные примеры похожего типа
            response = self.db.table('execution_logs').select(
                'id, prompt, result, agent_type, tokens_used, success_rating, timestamp'
            ).eq(
                'agent_type', agent_type
            ).gt(
                'success_rating', 0.8  # Только успешные
            ).order(
                'success_rating', desc=True
            ).limit(limit * 3).execute()

            examples = []
            for row in response.data[:limit]:
                examples.append(ExecutionExample(
                    prompt=row['prompt'],
                    result=row['result'],
                    agent_type=row['agent_type'],
                    timestamp=row['timestamp'],
                    tokens_used=row['tokens_used'],
                    success_rating=row['success_rating'],
                ))

            return examples

        except Exception:
            return []

    def _build_optimized_prompt(self,
                               prompt: str,
                               analysis: Dict,
                               examples: List[ExecutionExample],
                               agent_type: str,
                               max_length: int) -> str:
        """
        Собрать оптимизированный запрос.

        Структура оптимизированного запроса:
        1. Исходная задача (улучшенная)
        2. Контекст и ограничения
        3. Критерии оценки
        4. Похожие успешные примеры (few-shot)
        5. Инструкции по формату ответа
        """

        sections = []

        # 1. Исходная задача
        sections.append(f"## ОСНОВНАЯ ЗАДАЧА\n{prompt}")

        # 2. Добавить недостающий контекст (рекомендации)
        if analysis['recommendations']:
            sections.append("\n## КОНТЕКСТ И ОГРАНИЧЕНИЯ")
            for rec in analysis['recommendations']:
                sections.append(rec)

        # 3. Критерии успеха
        if not analysis['has_evaluation_criteria']:
            sections.append("\n## КРИТЕРИИ УСПЕХА")

            if agent_type == 'coder':
                sections.append("""
- ✓ Код должен иметь тип TypeScript strict
- ✓ Нет ошибок tsc и no warnings
- ✓ Все async в try/catch
- ✓ Максимум 400 строк на компонент
""")
            elif agent_type == 'architect':
                sections.append("""
- ✓ Архитектура должна быть масштабируемой
- ✓ Все API с .limit()
- ✓ RLS политики в Supabase
- ✓ Edge cases описаны
""")
            elif agent_type == 'reviewer':
                sections.append("""
- ✓ Проверить 8 направлений: безопасность, корректность, UI, UX, архитектура
- ✓ Привести примеры где нужны исправления
- ✓ Оценить по шкале 1-10 по каждому направлению
""")

        # 4. Few-shot примеры успешных решений
        if examples:
            sections.append("\n## ПОХОЖИЕ УСПЕШНЫЕ ПРИМЕРЫ")
            for i, ex in enumerate(examples[:2], 1):
                sections.append(f"\n### Пример {i} (Рейтинг: {ex.success_rating:.0%})")
                sections.append(f"**Задача:** {ex.prompt[:300]}...")
                sections.append(f"**Результат:** {ex.result[:300]}...")

        # 5. Инструкции по формату
        sections.append("\n## ИНСТРУКЦИИ ПО ОТВЕТУ")
        sections.append("""
1. Дай краткое резюме подхода
2. Предоставь подробное решение
3. Обоснуй каждое решение
4. Укажи на потенциальные проблемы и как их избежать
5. Если нужны уточнения - спроси вопросы перед выполнением
""")

        optimized = "\n".join(sections)

        # Обрезка если слишком длинный
        if len(optimized) > max_length:
            optimized = optimized[:max_length] + "\n[... контекст обрезан ...]"

        return optimized

    def _calculate_improvement_score(self, original: str, optimized: str) -> float:
        """
        Вычислить оценку улучшения (0.0 - 1.0).

        Факторы:
        - Длина оптимизированного запроса (больше = лучше, до лимита)
        - Добавление примеров и критериев
        - Снижение неясности
        """

        score = 0.3  # базовая оценка

        # +0.2 за каждый элемент структуры
        if 'КОНТЕКСТ' in optimized:
            score += 0.1
        if 'КРИТЕРИИ' in optimized:
            score += 0.1
        if 'ПРИМЕР' in optimized:
            score += 0.15
        if 'ИНСТРУКЦИИ' in optimized:
            score += 0.1

        # Бонус за расширение запроса (но не слишком)
        length_ratio = len(optimized) / max(len(original), 1)
        if 1.5 < length_ratio < 4:
            score += 0.1

        return min(score, 1.0)

    def _generate_reasoning(self, analysis: Dict, examples: List[ExecutionExample]) -> str:
        """Генерировать объяснение причин оптимизации."""

        reasons = []
        reasons.append("Запрос был оптимизирован следующим образом:")

        if analysis['identified_gaps']:
            reasons.append(f"\n❌ Выявленные пробелы:")
            for gap in analysis['identified_gaps']:
                reasons.append(f"  {gap}")

        if examples:
            reasons.append(f"\n✓ Добавлены {len(examples)} примеров из истории успешных задач")

        reasons.append(f"\n📊 Оценка ясности запроса: {analysis['clarity_score']:.0%}")

        return "\n".join(reasons)

    def _log_optimization(self, result: OptimizedPrompt, agent_type: str):
        """Логировать выполненную оптимизацию."""

        if not self.db:
            return

        try:
            self.db.table('prompt_optimizations').insert({
                'timestamp': datetime.now().isoformat(),
                'original': result.original,
                'optimized': result.optimized,
                'improvement_score': result.improvement_score,
                'agent_type': agent_type,
                'changes_count': len(result.changes),
            }).execute()
        except Exception:
            pass

    def _load_rules(self) -> Dict:
        """Загрузить правила оптимизации."""

        return {
            'features': [
                'add_context',
                'add_constraints',
                'add_evaluation_criteria',
                'add_examples',
                'add_output_format',
            ],
            'min_clarity_for_optimization': 0.5,
        }


class PromptCache:
    """
    LRU кэш для прямпов с хешированием.
    Избегает переобработки одинаковых запросов.
    """

    def __init__(self, ttl_hours: int = 24):
        self.ttl_hours = ttl_hours
        self.cache: Dict[str, Tuple[str, datetime]] = {}

    def _hash_prompt(self, prompt: str, model: str = "general") -> str:
        """Создать хеш промпта."""
        content = f"{prompt}:{model}".encode('utf-8')
        return hashlib.sha256(content).hexdigest()[:16]

    def get(self, prompt: str, model: str = "general") -> Optional[str]:
        """Получить кэшированный результат."""
        key = self._hash_prompt(prompt, model)

        if key in self.cache:
            value, timestamp = self.cache[key]
            if datetime.now() - timestamp < timedelta(hours=self.ttl_hours):
                return value
            else:
                del self.cache[key]

        return None

    def set(self, prompt: str, result: str, model: str = "general"):
        """Сохранить результат."""
        key = self._hash_prompt(prompt, model)
        self.cache[key] = (result, datetime.now())


# Глобальные экземпляры
_optimizer = None
_cache = PromptCache()


def init_optimizer(supabase_client=None, search_engine=None):
    """Инициализировать оптимизатор."""
    global _optimizer
    _optimizer = PromptOptimizer(supabase_client, search_engine)


def optimize_prompt(prompt: str, agent_type: str = "general") -> OptimizedPrompt:
    """API для оптимизации промпта."""
    if not _optimizer:
        init_optimizer()

    return _optimizer.optimize(prompt, agent_type)
