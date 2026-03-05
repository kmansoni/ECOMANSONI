#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Integration Demo — демонстрация совместной работы RAG + Agent + Memory.

Полный цикл:
    1. Создание VectorStore и загрузка документов
    2. Создание MemoryManager
    3. Создание ReActAgent с инструментами
    4. RAGPipeline с mock LLM
    5. Вопрос -> Memory обогащение -> RAG поиск -> Agent -> ответ с памятью
"""

import logging
import sys
import os
import tempfile
from typing import Any

# Добавляем родительскую директорию в sys.path для корректного импорта
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(
    level=logging.WARNING,  # Только важные сообщения в demo
    format="%(levelname)s | %(name)s | %(message)s",
)

# ── Импорт модулей ──────────────────────────────────────────────────────────
from ai_engine.rag import RAGPipeline, VectorStore, EmbeddingEngine
from ai_engine.agent import ReActAgent, ToolRegistry
from ai_engine.memory import MemoryManager

print("=" * 60)
print("  AI Engine — RAG + Agent + Memory Integration Demo")
print("=" * 60)


# ── 1. Mock LLM ──────────────────────────────────────────────────────────────

class MockLLM:
    """
    Mock LLM для демонстрации без реального API.

    Поддерживает три режима:
        - RAG: возвращает ответ на основе контекста
        - ReAct: следует формату Thought/Action/Final Answer
        - General: обычный ответ
    """

    def __init__(self) -> None:
        self._call_count = 0
        self._react_step = 0

    def __call__(self, prompt: str) -> str:
        self._call_count += 1

        # ReAct режим
        if "You have access to the following tools" in prompt:
            return self._react_response(prompt)

        # RAG режим
        if "Context:" in prompt and "Question:" in prompt:
            return self._rag_response(prompt)

        # Обычный режим
        return f"[Mock LLM] Ответ на запрос #{self._call_count}."

    def _rag_response(self, prompt: str) -> str:
        """Имитация ответа на основе контекста."""
        # Извлекаем вопрос
        question_line = ""
        for line in prompt.split("\n"):
            if line.strip().startswith("Question:"):
                question_line = line.strip().replace("Question:", "").strip()
                break

        if "rag" in question_line.lower() or "retrieval" in question_line.lower():
            return (
                "RAG (Retrieval-Augmented Generation) — это метод, который "
                "улучшает ответы языковых моделей за счёт динамического "
                "поиска релевантных документов из внешней базы знаний. "
                "Retriever находит наиболее похожие фрагменты, которые "
                "передаются в Generator как контекст."
            )
        elif "python" in question_line.lower():
            return (
                "Python — высокоуровневый, интерпретируемый язык "
                "программирования с акцентом на читаемость кода. "
                "Широко применяется в ML/AI, веб-разработке и науке о данных."
            )
        elif "трансформер" in question_line.lower() or "transformer" in question_line.lower():
            return (
                "Трансформеры используют механизм Self-Attention для "
                "параллельной обработки последовательностей. "
                "Архитектура состоит из энкодера и декодера с "
                "Multi-Head Attention слоями."
            )
        return (
            "На основе предоставленного контекста: данный вопрос "
            "освещён в загруженных документах. "
            "Для более точного ответа рекомендую обратиться к источникам."
        )

    def _react_response(self, prompt: str) -> str:
        """Имитация ReAct шагов."""
        self._react_step += 1

        if self._react_step == 1:
            return (
                "Thought: I need to find the current date and calculate something.\n"
                'Action: current_datetime\n'
                'Action Input: {}'
            )
        elif self._react_step == 2:
            return (
                "Thought: Now I have the date. Let me analyze some text.\n"
                'Action: text_analyzer\n'
                'Action Input: {"text": "Python is great for AI development. '
                'Machine learning and deep learning are key topics."}'
            )
        else:
            self._react_step = 0
            return (
                "Thought: I now have all the information needed.\n"
                "Final Answer: Текущая дата получена. Анализ текста показал "
                "ключевые темы: Python, AI, machine learning, deep learning."
            )


mock_llm = MockLLM()
print("\n✓ Mock LLM инициализирован")


# ── 2. RAG Pipeline ───────────────────────────────────────────────────────────

print("\n" + "─" * 50)
print("МОДУЛЬ 1: RAG Pipeline")
print("─" * 50)

embedding_engine = EmbeddingEngine()
print(f"✓ EmbeddingEngine: бэкенд = {embedding_engine._backend}")

vector_store = VectorStore(embedding_engine=embedding_engine)

# Корпус документов
knowledge_base = [
    {
        "text": (
            "Python — высокоуровневый язык программирования с динамической типизацией. "
            "Поддерживает ООП, функциональное и процедурное программирование. "
            "Широко используется в data science, machine learning и веб-разработке."
        ),
        "source": "python_overview",
    },
    {
        "text": (
            "RAG (Retrieval-Augmented Generation) — техника улучшения LLM ответов "
            "через поиск релевантных документов. Состоит из двух компонентов: "
            "Retriever (поиск) и Generator (генерация). "
            "Позволяет модели отвечать на основе актуальных данных."
        ),
        "source": "rag_paper",
    },
    {
        "text": (
            "Трансформеры (Transformers) — архитектура нейронных сетей, основанная "
            "на механизме внимания (Attention). Введена в работе 'Attention is All You Need' (2017). "
            "Основа современных LLM: GPT, BERT, Claude, Gemini."
        ),
        "source": "transformers_intro",
    },
    {
        "text": (
            "Векторные базы данных хранят эмбеддинги и обеспечивают быстрый "
            "semanic search. Примеры: Pinecone, Qdrant, Weaviate, Chroma. "
            "Используют HNSW алгоритм для O(log n) поиска."
        ),
        "source": "vector_db_guide",
    },
    {
        "text": (
            "ReAct (Reasoning + Acting) — паттерн для агентных AI систем. "
            "Агент чередует размышления (Thought), действия (Action) "
            "и наблюдения (Observation) для решения задач пошагово."
        ),
        "source": "react_paper",
    },
]

# Батч-загрузка
docs_for_store = [
    {"doc_id": f"doc_{i}", "text": d["text"], "metadata": {"source": d["source"]}}
    for i, d in enumerate(knowledge_base)
]
vector_store.add_documents(docs_for_store)
print(f"✓ VectorStore: загружено {len(vector_store)} документов")

# Создаём RAG pipeline
rag_pipeline = RAGPipeline(
    llm_callable=mock_llm,
    vector_store=vector_store,
    top_k=3,
    min_confidence=0.05,
)

# Тестовый запрос
print("\n--- RAG Query Demo ---")
rag_queries = [
    "Что такое RAG и как он работает?",
    "Объясни архитектуру трансформеров",
    "Какие векторные базы данных существуют?",
]

for query in rag_queries:
    response = rag_pipeline.query(query)
    print(f"\nВопрос: {query}")
    print(f"Ответ:  {response.answer[:120]}...")
    print(f"Источники: {response.sources} | Уверенность: {response.confidence:.2f}")


# ── 3. Memory System ──────────────────────────────────────────────────────────

print("\n" + "─" * 50)
print("МОДУЛЬ 2: Memory System")
print("─" * 50)

with tempfile.TemporaryDirectory() as mem_dir:
    memory = MemoryManager(storage_path=mem_dir)
    print(f"✓ MemoryManager: storage = {mem_dir}")

    # Симуляция первой сессии
    memory.process_message("system", "Ты продвинутый AI ассистент.")
    memory.process_message("user", "Расскажи про RAG")
    memory.process_message("assistant", "RAG — это метод Retrieval-Augmented Generation.")
    memory.process_message("user", "Как это соотносится с векторными базами?")
    memory.process_message("assistant", "RAG использует векторные БД для поиска релевантных документов.")

    # Добавляем знания вручную
    memory.add_knowledge("rag", "RAG состоит из retriever и generator", source="demo", confidence=0.95)
    memory.add_knowledge("python", "Python — основной язык для ML/AI разработки", source="demo", confidence=0.9)

    print(f"✓ Working Memory: {memory.working.message_count} сообщений (~{memory.working.total_tokens} токенов)")
    print(f"✓ Semantic Memory: {len(memory.semantic.query_all())} фактов")

    # Получаем обогащённый промпт
    enriched = memory.get_enriched_prompt(
        "Ты AI ассистент со знаниями о ML.",
        "как работает RAG с векторами"
    )
    print(f"\nОбогащённый промпт (первые 200 символов):")
    print(f"  {enriched[:200]}...")

    # Завершаем сессию (сохраняет эпизод)
    memory.end_session("session_demo_001")
    print(f"\n✓ Сессия завершена и сохранена в эпизодическую память")

    # Новая сессия — проверяем что память загрузилась
    memory2 = MemoryManager(storage_path=mem_dir)
    episodes = memory2.episodic.recall("RAG и векторы", top_k=1)
    print(f"✓ Новая сессия: найдено {len(episodes)} прошлых эпизодов")
    if episodes:
        print(f"  Эпизод: {episodes[0].summary[:100]}")


# ── 4. ReAct Agent ────────────────────────────────────────────────────────────

print("\n" + "─" * 50)
print("МОДУЛЬ 3: ReAct Agent")
print("─" * 50)

tool_registry = ToolRegistry(register_builtins=True)
available_tools = tool_registry.list_tools()
print(f"✓ ToolRegistry: {len(available_tools)} инструментов")
for t in available_tools:
    print(f"   - {t.name}: {t.description[:50]}...")

# Тест инструментов напрямую
print("\n--- Прямой тест инструментов ---")
calc_result = tool_registry.execute("calculator", expression="sqrt(144) + pi")
print(f"calculator(sqrt(144) + pi) = {calc_result.result}")

dt_result = tool_registry.execute("current_datetime")
print(f"current_datetime() = {dt_result.result}")

code_result = tool_registry.execute(
    "code_executor",
    code="nums = [x**2 for x in range(1, 6)]\nprint(f'Squares: {nums}')"
)
print(f"code_executor() = {code_result.result}")

text_result = tool_registry.execute(
    "text_analyzer",
    text="Machine learning is amazing. Deep learning builds on ML. AI is the future of AI."
)
print(f"text_analyzer() = {text_result.result}")

# Запуск ReAct агента
print("\n--- ReAct Agent Demo ---")
mock_llm._react_step = 0  # Сброс шагового счётчика
agent = ReActAgent(
    llm_callable=mock_llm,
    tool_registry=tool_registry,
    max_steps=5,
)

task = "Получи текущую дату и проанализируй текст про AI и Python"
print(f"Задача: {task}")
result = agent.run(task)

print(f"\nФинальный ответ: {result.final_answer}")
print(f"Шагов выполнено: {len(result.steps)}")
print(f"Успешно: {result.success}")
print(f"Использовано токенов ~{result.total_tokens_used}")

for i, step in enumerate(result.steps, 1):
    print(f"\n  Шаг {i}: {step.action}({step.action_input})")
    print(f"    Observation: {step.observation[:80]}...")


# ── 5. Полный интеграционный цикл ───────────────────────────────────────────

print("\n" + "─" * 50)
print("ПОЛНЫЙ ИНТЕГРАЦИОННЫЙ ЦИКЛ")
print("─" * 50)

print("\nСценарий: Пользователь задаёт вопрос про RAG")
print("Pipeline: Memory обогащение -> RAG поиск -> ответ -> Memory сохранение")

with tempfile.TemporaryDirectory() as full_mem_dir:
    full_memory = MemoryManager(storage_path=full_mem_dir)
    full_memory.process_message("system", "Ты эксперт по AI системам.")

    user_question = "Как реализовать RAG с Python?"

    print(f"\n1. Вопрос пользователя: {user_question}")
    full_memory.process_message("user", user_question)

    # Обогащённый системный промпт
    enriched_system = full_memory.get_enriched_prompt(
        "Ты эксперт по AI системам.",
        user_question
    )
    print(f"2. Обогащённый контекст из памяти: {len(enriched_system)} символов")

    # RAG запрос
    mock_llm._call_count = 0
    rag_response = rag_pipeline.query(user_question, top_k=3)
    print(f"3. RAG ответ: {rag_response.answer[:150]}...")
    print(f"   Источники: {rag_response.sources}")
    print(f"   Релевантность: {rag_response.confidence:.2f}")

    # Сохраняем ответ в память
    full_memory.process_message("assistant", rag_response.answer)

    # Завершаем сессию
    full_memory.end_session()
    print(f"4. Сессия сохранена в долговременную память")

    print("\n" + "=" * 60)
    print("  Демонстрация завершена успешно!")
    print("=" * 60)
    print(f"\nСоздано модулей: 3 (RAG, Agent, Memory)")
    print(f"Компонентов: {len(available_tools)} инструментов + RAG + Memory")
    print(f"Векторов в store: {len(vector_store)}")
