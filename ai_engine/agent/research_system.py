#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔬 Research System — глубокое исследование и чтение книг.

Возможности:
- Веб-исследование (множественные запросы)
- Чтение и анализ книг из сети
- Мульти-источниковое исследование
- Извлечение структурированных знаний
- fact-checking
"""

import json
import logging
import re
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Optional
from collections import defaultdict
from urllib.parse import quote_plus, urljoin
import html

logger = logging.getLogger(__name__)


class SourceType(Enum):
    """Тип источника."""
    WEB = "web"
    BOOK = "book"
    PAPER = "paper"
    DOCS = "docs"
    VIDEO = "video"
    CODE = "code"


@dataclass
class ResearchSource:
    """
    Источник информации.

    Attributes:
        url: URL источника.
        type: Тип источника.
        title: Название.
        content: Содержимое.
        snippet: Краткий snippet.
        reliability: Надёжность (0-1).
        crawled: Время получения.
    """

    url: str = ""
    type: SourceType = SourceType.WEB
    title: str = ""
    content: str = ""
    snippet: str = ""
    reliability: float = 0.5
    crawled: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ResearchQuery:
    """
    Запрос исследования.

    Attributes:
        id: ID запроса.
        query: Поисковый запрос.
        sources: Найденные источники.
        findings: Найденные факты.
        gaps: Недостающая информация.
        confidence: Общая уверенность.
    """

    id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    query: str = ""
    sources: list[ResearchSource] = field(default_factory=list)
    findings: list[str] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)
    confidence: float = 0.0


class WebResearcher:
    """
    Веб-исследователь.

    Возможности:
    - Мульти-запросы
    - intelligent snippet extraction
    - fact-checking
    - ranking источников
    """

    def __init__(self, web_search: Optional[Callable] = None):
        """
        Args:
            web_search: Функция веб-поиска (query) -> results.
        """
        self.web_search = web_search or self._default_search
        
        # Кэш исследований
        self._cache: dict[str, ResearchQuery] = {}

    def _default_search(self, query: str) -> list[dict]:
        """Дефолтный поиск (DuckDuckGo)."""
        try:
            import httpx
            
            url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
            resp = httpx.get(url, timeout=10.0, follow_redirects=True)
            
            results = []
            for match in re.finditer(
                r'class="result__snippet"[^>]*>(.*?)</a>',
                resp.text,
                re.DOTALL,
            ):
                text = re.sub(r"<[^>]+>", "", match.group(1)).strip()
                if text:
                    results.append({"snippet": text})
                
                if len(results) >= 10:
                    break
            
            return results
        except Exception as e:
            logger.warning(f"Search error: {e}")
            return []

    def research(
        self,
        queries: list[str],
        parallel: bool = True,
    ) -> list[ResearchQuery]:
        """
        Провести исследование по нескольким запросам.

        Args:
            queries: Список поисковых запросов.
            parallel: Параллельный поиск.

        Returns:
            Список ResearchQuery с результатами.
        """
        results = []
        
        if parallel:
            # Параллельный поиск
            threads = []
            query_objs = []
            
            def search_one(q: str):
                rq = self._do_research(q)
                query_objs.append(rq)
            
            for q in queries:
                t = threading.Thread(target=search_one, args=(q,))
                t.start()
                threads.append(t)
            
            for t in threads:
                t.join()
            
            results = query_objs
        else:
            # Последовательный
            for q in queries:
                results.append(self._do_research(q))
        
        return results

    def _do_research(self, query: str) -> ResearchQuery:
        """Один запрос исследования."""
        rq = ResearchQuery(query=query)
        
        # Ищем
        search_results = self.web_search(query)
        
        # Парсим источники
        sources = []
        for r in search_results[:10]:
            source = ResearchSource(
                snippet=r.get("snippet", ""),
                title=r.get("title", ""),
                url=r.get("url", ""),
            )
            sources.append(source)
        
        rq.sources = sources
        rq.findings = [s.snippet for s in sources if s.snippet]
        rq.confidence = min(1.0, len(sources) / 5)
        
        return rq

    def deep_research(self, topic: str, depth: int = 5) -> ResearchQuery:
        """
        Глубокое исследование темы.

        Args:
            topic: Тема.
            depth: Глубина (количество запросов).

        Returns:
            Объединённый результат.
        """
        # Генерируем подзапросы
        sub_queries = self._generate_subqueries(topic, depth)
        
        # Выполняем
        results = self.research(sub_queries, parallel=True)
        
        # Объединяем
        combined = ResearchQuery(query=topic)
        combined.findings = []
        
        for r in results:
            combined.findings.extend(r.findings)
            combined.sources.extend(r.sources)
        
        combined.confidence = min(1.0, len(combined.sources) / 10)
        
        return combined

    def _generate_subqueries(self, topic: str, count: int) -> list[str]:
        """Сгенерировать подзапросы для исследования."""
        parts = topic.split()
        
        if len(parts) <= 2:
            return [topic, f"{topic} tutorial", f"{topic} best practices"]
        
        # Генерируем вариации
        queries = [
            topic,
            f"what is {topic}",
            f"how to {topic}",
            f"{topic} examples",
            f"{topic} architecture",
            f"{topic} security",
            f"{topic} performance",
            f"{topic} vs alternatives",
            f"{topic} real world use cases",
            f"{topic} documentation",
        ]
        
        return queries[:count]

    def fact_check(self, claim: str) -> dict:
        """
        Проверить факт.

        Args:
            claim: Утверждение для проверки.

        Returns:
            Результат проверки.
        """
        # Ищем подтверждения и опровержения
        results = self.research([
            f"{claim} true",
            f"{claim} false",
            f"{claim} myth",
        ])
        
        positive = len(results[0].findings)
        negative = len(results[1].findings)
        
        verified = positive > negative * 1.5
        
        return {
            "claim": claim,
            "verified": verified,
            "positive_sources": positive,
            "negative_sources": negative,
            "confidence": positive / (positive + negative + 1),
        }


class BookReader:
    """
    Читатель книг и документации из интернета.

    Возможности:
    - Скачивание и парсинг PDF/epub (требует библиотеки)
    - Чтение веб-страниц
    - Извлечение оглавления
    - summarization
    """

    def __init__(self):
        self._cache: dict[str, str] = {}

    def read_url(
        self,
        url: str,
        max_length: int = 50000,
    ) -> ResearchSource:
        """
        Прочитать URL.

        Args:
            url: URL для чтения.
            max_length: Максимальная длина.

        Returns:
            ResearchSource с содержимым.
        """
        source = ResearchSource(url=url)
        
        try:
            import httpx
            
            resp = httpx.get(url, timeout=30.0, follow_redirects=True)
            resp.raise_for_status()
            
            # Парсим HTML
            from bs4 import BeautifulSoup
            
            soup = BeautifulSoup(resp.text, 'html.parser')
            
            # Title
            title = soup.find('title')
            if title:
                source.title = title.text.strip()
            
            # Чистим теги script и style
            for tag in soup(['script', 'style', 'nav', 'footer']):
                tag.decompose()
            
            # main content
            main = soup.find('main') or soup.find('article') or soup.body
            
            if main:
                text = main.get_text(separator='\n', strip=True)
                source.content = text[:max_length]
                source.snippet = text[:500]
            
        except Exception as e:
            logger.warning(f"Read URL error: {e}")
            source.content = f"Error: {e}"
        
        return source

    def read_multiple(
        self,
        urls: list[str],
        parallel: bool = True,
    ) -> list[ResearchSource]:
        """
        Прочитать несколько URL.

        Args:
            urls: Список URL.
            parallel: Параллельно.

        Returns:
            Список источников.
        """
        if parallel:
            threads = []
            sources = []
            
            def read_one(url: str):
                sources.append(self.read_url(url))
            
            for url in urls:
                t = threading.Thread(target=read_one, args=(url,))
                t.start()
                threads.append(t)
            
            for t in threads:
                t.join()
            
            return sources
        else:
            return [self.read_url(u) for u in urls]

    def search_and_read(
        self,
        query: str,
        count: int = 5,
        researcher: Optional[WebResearcher] = None,
    ) -> list[ResearchSource]:
        """
        Найти и прочитать источники.

        Args:
            query: Поисковый запрос.
            count: Количество.
            researcher: WebResearcher instance.

        Returns:
            Список прочитанных источников.
        """
        r = researcher or WebResearcher()
        
        # Ищем
        results = r.research([query])
        
        if not results:
            return []
        
        # URLs
        urls = [s.url for s in results[0].sources[:count] if s.url]
        
        # Читаем
        return self.read_multiple(urls)


class ResearchManager:
    """
    Главный менеджер исследований.

    Координирует:
    - WebResearcher
    - BookReader
    - Кэширование
    - Форматирование результатов
    """

    def __init__(self, web_search: Optional[Callable] = None):
        self.researcher = WebResearcher(web_search)
        self.reader = BookReader()

    def investigate(
        self,
        topic: str,
        deep: bool = False,
    ) -> dict:
        """
        Провести расследование темы.

        Args:
            topic: Тема.
            deep: Глубокое исследование.

        Returns:
            Результаты.
        """
        if deep:
            result = self.researcher.deep_research(topic, depth=10)
        else:
            result = self.researcher.research([topic])[0]
        
        # Форматируем
        return {
            "topic": topic,
            "query_id": result.id,
            "findings": result.findings,
            "sources_count": len(result.sources),
            "confidence": result.confidence,
            "sources": [
                {"url": s.url, "snippet": s.snippet[:200]}
                for s in result.sources[:5]
            ],
        }

    def read_topics(self, topics: list[str]) -> list[dict]:
        """
        Прочитать несколько тем.

        Args:
            topics: Список тем.

        Returns:
            Результаты.
        """
        return [self.investigate(t) for t in topics]


# =============================================================================
# Глобальный instance
# =============================================================================

_research_manager: Optional[ResearchManager] = None


def get_research_manager(web_search: Optional[Callable] = None) -> ResearchManager:
    """Получить исследователя."""
    global _research_manager
    if _research_manager is None:
        _research_manager = ResearchManager(web_search)
    return _research_manager


# =============================================================================
# Тесты
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # Тест
    rm = ResearchManager()
    
    print("🔬 Исследуем 'Python async'...")
    result = rm.investigate("Python async", deep=False)
    
    print(f"Найдено: {result['sources_count']} источников")
    print(f"Уверенность: {result['confidence']:.2f}")
    
    print("\n💡 Первые findings:")
    for f in result['findings'][:3]:
        print(f"  - {f[:100]}")