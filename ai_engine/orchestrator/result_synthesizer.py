#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Result Synthesizer — сборка результатов агентов в единый ответ.

Отвечает за:
    - Агрегацию результатов всех подзадач
    - Устранение противоречий между результатами
    - Формирование финального структурированного ответа
    - Оценку качества через Quality Gate
"""

import logging
from typing import Callable, Optional

from .models import DAG, Task, TaskResult, TaskStatus, TrainingSignal

logger = logging.getLogger(__name__)


class QualityGate:
    """
    Quality Gate — проверка качества результатов.

    Метрики (из документации):
        - reasoning_depth: глубина обоснования
        - decision_confidence: уверенность решений
        - context_retention_rate: использование контекста
        - action_efficiency: полезных/всех действий
        - scope_alignment: соответствие исходной задаче
        - hallucination_rate: непроверенные факты
    """

    # Пороги из документации
    THRESHOLDS = {
        "min_quality_score": 0.6,
        "min_success_rate": 0.8,
        "max_error_rate": 0.2,
        "min_action_efficiency": 0.6,
    }

    def evaluate(self, results: list[TaskResult], task: Task) -> "QualityReport":
        """
        Оценить качество результатов.

        Args:
            results: Результаты подзадач.
            task: Корневая задача.

        Returns:
            QualityReport с оценками и рекомендациями.
        """
        if not results:
            return QualityReport(passed=False, overall_score=0.0, issues=["Нет результатов"])

        # Метрики
        success_rate = sum(1 for r in results if r.success) / len(results)
        avg_quality = sum(r.quality_score for r in results) / len(results)
        error_rate = sum(1 for r in results if not r.success) / len(results)
        total_tokens = sum(r.tokens_used for r in results)

        issues: list[str] = []

        if success_rate < self.THRESHOLDS["min_success_rate"]:
            issues.append(f"Низкий success_rate: {success_rate:.2f} < {self.THRESHOLDS['min_success_rate']}")

        if avg_quality < self.THRESHOLDS["min_quality_score"]:
            issues.append(f"Низкое среднее качество: {avg_quality:.2f} < {self.THRESHOLDS['min_quality_score']}")

        if error_rate > self.THRESHOLDS["max_error_rate"]:
            issues.append(f"Высокий error_rate: {error_rate:.2f} > {self.THRESHOLDS['max_error_rate']}")

        overall_score = (success_rate * 0.4 + avg_quality * 0.4 + (1 - error_rate) * 0.2)

        return QualityReport(
            passed=len(issues) == 0,
            overall_score=overall_score,
            success_rate=success_rate,
            avg_quality=avg_quality,
            error_rate=error_rate,
            total_tokens=total_tokens,
            issues=issues,
        )


class QualityReport:
    """Отчёт Quality Gate."""

    def __init__(
        self,
        passed: bool = True,
        overall_score: float = 0.0,
        success_rate: float = 0.0,
        avg_quality: float = 0.0,
        error_rate: float = 0.0,
        total_tokens: int = 0,
        issues: Optional[list[str]] = None,
    ) -> None:
        self.passed = passed
        self.overall_score = overall_score
        self.success_rate = success_rate
        self.avg_quality = avg_quality
        self.error_rate = error_rate
        self.total_tokens = total_tokens
        self.issues = issues or []

    def __repr__(self) -> str:
        status = "PASS" if self.passed else "FAIL"
        return (
            f"QualityReport({status}, score={self.overall_score:.2f}, "
            f"success={self.success_rate:.2f}, issues={len(self.issues)})"
        )


class ResultSynthesizer:
    """
    Синтезирует результаты агентов в единый ответ.

    Алгоритм:
        1. Собрать все результаты из DAG
        2. Проверить через Quality Gate
        3. Если Quality Gate не прошёл — вернуть список проблем
        4. Если прошёл — агрегировать в финальный результат
        5. Сгенерировать Training Signal для обучения
    """

    def __init__(self, llm: Optional[Callable[[str], str]] = None) -> None:
        self.llm = llm
        self.quality_gate = QualityGate()
        logger.info("ResultSynthesizer инициализирован")

    def synthesize(
        self,
        task: Task,
        dag: DAG,
        results: list[TaskResult],
    ) -> "SynthesisResult":
        """
        Синтезировать финальный результат.

        Args:
            task: Корневая задача.
            dag: Граф зависимостей.
            results: Результаты всех подзадач.

        Returns:
            SynthesisResult с финальным ответом и метриками.
        """
        logger.info("Синтез результатов для задачи '%s' (%d результатов)", task.prompt[:50], len(results))

        # Quality Gate
        quality_report = self.quality_gate.evaluate(results, task)

        if not quality_report.passed:
            logger.warning("Quality Gate не прошёл: %s", quality_report.issues)
            # Возвращаем с пометкой о проблемах
            return SynthesisResult(
                final_output=self._format_partial_result(results, quality_report),
                quality_report=quality_report,
                training_signal=self._generate_training_signal(task, results, quality_report),
                needs_rework=True,
                rework_nodes=self._identify_rework_nodes(dag, results),
            )

        # Синтез
        if self.llm is not None:
            final_output = self._llm_synthesize(task, results)
        else:
            final_output = self._heuristic_synthesize(task, results)

        task.status = TaskStatus.COMPLETED

        return SynthesisResult(
            final_output=final_output,
            quality_report=quality_report,
            training_signal=self._generate_training_signal(task, results, quality_report),
            needs_rework=False,
        )

    def _heuristic_synthesize(self, task: Task, results: list[TaskResult]) -> str:
        """Эвристический синтез без LLM."""
        parts: list[str] = []
        parts.append(f"## Результат: {task.prompt[:100]}\n")

        successful = [r for r in results if r.success]
        failed = [r for r in results if not r.success]

        if successful:
            parts.append("### Выполненные подзадачи:\n")
            for r in successful:
                parts.append(f"- {r.output[:200]}")
                if r.artifacts:
                    parts.append(f"  Артефакты: {', '.join(r.artifacts)}")

        if failed:
            parts.append("\n### Проблемы:\n")
            for r in failed:
                parts.append(f"- Ошибка: {r.error[:200]}")

        # Общая статистика
        total_time = sum(r.execution_time_ms for r in results)
        total_tokens = sum(r.tokens_used for r in results)
        parts.append(f"\n---\nВремя: {total_time/1000:.1f}с | Токены: ~{total_tokens}")

        return "\n".join(parts)

    def _llm_synthesize(self, task: Task, results: list[TaskResult]) -> str:
        """LLM-based синтез."""
        assert self.llm is not None
        results_text = "\n".join(
            f"[{i+1}] {'OK' if r.success else 'FAIL'}: {r.output[:300]}"
            for i, r in enumerate(results)
        )
        prompt = (
            f"Синтезируй единый связный ответ на задачу пользователя.\n\n"
            f"Задача: {task.prompt}\n\n"
            f"Результаты подзадач:\n{results_text}\n\n"
            f"Финальный ответ (связный, без повторений):"
        )
        try:
            return self.llm(prompt)
        except Exception as exc:
            logger.warning("LLM синтез не удался: %s. Fallback.", exc)
            return self._heuristic_synthesize(task, results)

    def _format_partial_result(self, results: list[TaskResult], report: QualityReport) -> str:
        """Форматирование частичного результата при непрохождении Quality Gate."""
        parts = ["## Частичный результат (Quality Gate не прошёл)\n"]
        parts.append(f"Оценка: {report.overall_score:.2f}")
        parts.append(f"Проблемы: {'; '.join(report.issues)}\n")

        for r in results:
            status = "✓" if r.success else "✗"
            parts.append(f"  {status} {r.output[:100]}")

        return "\n".join(parts)

    @staticmethod
    def _identify_rework_nodes(dag: DAG, results: list[TaskResult]) -> list[str]:
        """Определить узлы DAG, требующие переработки."""
        failed_ids = {r.subtask_id for r in results if not r.success}
        return list(failed_ids)

    @staticmethod
    def _generate_training_signal(
        task: Task,
        results: list[TaskResult],
        quality_report: QualityReport,
    ) -> TrainingSignal:
        """Генерировать сигнал для обучения."""
        total_time = sum(r.execution_time_ms for r in results)
        total_tokens = sum(r.tokens_used for r in results)

        # Token efficiency: полезные токены / все токены
        token_efficiency = quality_report.avg_quality if total_tokens > 0 else 0.0

        # Reward: комбинация качества и эффективности
        reward = (
            quality_report.overall_score * 0.6 +
            quality_report.success_rate * 0.3 +
            (1.0 if total_time < 60000 else 0.5) * 0.1  # бонус за быстроту
        )

        outcome = "success" if quality_report.passed else ("partial" if quality_report.success_rate > 0.5 else "failure")

        return TrainingSignal(
            task_id=task.task_id,
            outcome=outcome,
            time_to_complete_ms=total_time,
            token_efficiency=token_efficiency,
            quality_score=quality_report.overall_score,
            retry_count=sum(1 for r in results if not r.success),
            reward=reward,
        )


class SynthesisResult:
    """Результат синтеза."""

    def __init__(
        self,
        final_output: str = "",
        quality_report: Optional[QualityReport] = None,
        training_signal: Optional[TrainingSignal] = None,
        needs_rework: bool = False,
        rework_nodes: Optional[list[str]] = None,
    ) -> None:
        self.final_output = final_output
        self.quality_report = quality_report
        self.training_signal = training_signal
        self.needs_rework = needs_rework
        self.rework_nodes = rework_nodes or []

    def __repr__(self) -> str:
        rework = " [NEEDS REWORK]" if self.needs_rework else ""
        return f"SynthesisResult(len={len(self.final_output)}{rework})"
