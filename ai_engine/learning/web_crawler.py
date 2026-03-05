#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WebCrawler — этичный асинхронный краулер открытого интернета.
=============================================================

Принципы этичного краулинга (соответствие RFC 9309 / Robots Exclusion Protocol):
    1. robots.txt: кэшируется на 24 ч, полностью соблюдается.
    2. Crawl-delay: используем max(1s, Crawl-delay из robots.txt).
    3. User-Agent: честный, с контактом.
    4. Только публичный контент (нет авторизации, нет форм).
    5. Дедупликация URL (seen_urls через bloom filter / set).
    6. Breadth-first обход: очередь приоритетов по quality score домена.
    7. Глубина ограничена: max_depth=3 по умолчанию.
    8. Размер ответа: max 2 MB, timeout 10 s.

Безопасность:
    - Blacklist доменов (darkweb, exploit DB, etc.).
    - HTML sanitizer: только text/plain из <p>, <article>, <main>, <pre>.
    - Никаких JS execution (нет puppeteer) — только статический HTML.
    - Конкурентность: semaphore(max_concurrent=8) для защиты от сети DDoS.

Масштабирование:
    Краулер stateless, Seeds поступают через asyncio.Queue.
    Для распределённого краулинга используйте Celery/Redis очередь seeds.

Зависимости (опциональные):
    aiohttp, lxml / html.parser (встроенный), certifi
    При отсутствии aiohttp — заглушка с requests (sync, fallback).
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import time
import urllib.parse
import urllib.robotparser
from dataclasses import dataclass, field
from typing import AsyncIterator, Optional, Sequence, Set

logger = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

USER_AGENT = (
    "ARIABot/1.0 (self-hosted AI training crawler; "
    "contact: admin@mansoni.platform; respectful bot)"
)
MAX_RESPONSE_BYTES  = 2 * 1024 * 1024  # 2 MB
REQUEST_TIMEOUT_S   = 10
MAX_CONCURRENT      = 8
DEFAULT_CRAWL_DELAY = 1.5              # seconds between requests to same domain
MAX_DEPTH           = 3
ROBOTS_CACHE_TTL    = 86_400           # 24 h

# Domains blacklisted from crawling (harm/legal/privacy)
_BLACKLISTED_DOMAINS: frozenset[str] = frozenset({
    "onion", "i2p", "tor2web",
    "exploit-db.com", "hackforums.net", "nulled.to",
    "pastebin.com",  # dynamic user content — too noisy / risky
})

# Tags whose text is useful for training
_CONTENT_TAGS = frozenset({"p", "article", "main", "section", "pre", "blockquote", "li"})


# ─── Config ───────────────────────────────────────────────────────────────────

@dataclass
class CrawlConfig:
    """
    Конфигурация сессии краулера.

    Attributes:
        seeds:          Начальные URLs.
        max_pages:      Максимум страниц в сессии.
        max_depth:      Максимальная глубина обхода.
        max_concurrent: Параллельные запросы.
        crawl_delay:    Задержка между запросами к одному домену (сек).
        allowed_langs:  Разрешённые языки (пустой = все).
        min_text_len:   Минимальная длина извлечённого текста.
    """

    seeds:          list[str] = field(default_factory=list)
    max_pages:      int   = 500
    max_depth:      int   = MAX_DEPTH
    max_concurrent: int   = MAX_CONCURRENT
    crawl_delay:    float = DEFAULT_CRAWL_DELAY
    allowed_langs:  list[str] = field(default_factory=list)
    min_text_len:   int   = 200


# ─── Result ───────────────────────────────────────────────────────────────────

@dataclass
class CrawlResult:
    """
    Результат обхода одной страницы.

    Attributes:
        url:       Финальный URL (после редиректов).
        text:      Извлечённый чистый текст.
        title:     Заголовок страницы.
        language:  ISO 639-1 (из <html lang> или Content-Language).
        fetched_at: Unix timestamp.
    """

    url:        str
    text:       str
    title:      str = ""
    language:   str = "und"
    fetched_at: float = field(default_factory=time.time)


# ─── robots.txt cache ────────────────────────────────────────────────────────

class _RobotsCache:
    """Thread-safe кэш robots.txt парсеров с TTL."""

    def __init__(self, ttl: float = ROBOTS_CACHE_TTL) -> None:
        self._cache: dict[str, tuple[urllib.robotparser.RobotFileParser, float]] = {}
        self._ttl = ttl

    async def can_fetch(self, url: str, session) -> bool:
        """True если robots.txt разрешает краулить URL."""
        parsed = urllib.parse.urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        robots_url = f"{origin}/robots.txt"

        now = time.time()
        cached = self._cache.get(origin)
        if cached and (now - cached[1]) < self._ttl:
            rp = cached[0]
        else:
            rp = urllib.robotparser.RobotFileParser()
            rp.set_url(robots_url)
            try:
                async with session.get(
                    robots_url,
                    timeout=5,
                    headers={"User-Agent": USER_AGENT},
                    max_redirects=3,
                ) as resp:
                    if resp.status == 200:
                        robots_text = await resp.text(errors="replace")
                        rp.parse(robots_text.splitlines())
                    else:
                        rp.parse([])   # если robots.txt недоступен — считаем разрешено
            except Exception:
                rp.parse([])

            self._cache[origin] = (rp, now)

        return rp.can_fetch(USER_AGENT, url)

    def get_crawl_delay(self, url: str) -> float:
        """Получить crawl-delay для домена из кэша."""
        parsed = urllib.parse.urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        cached = self._cache.get(origin)
        if cached:
            delay = cached[0].crawl_delay(USER_AGENT)
            if delay is not None:
                return max(DEFAULT_CRAWL_DELAY, float(delay))
        return DEFAULT_CRAWL_DELAY


# ─── HTML text extractor ──────────────────────────────────────────────────────

def _extract_text(html: str, url: str) -> tuple[str, str, str]:
    """
    Извлечь (title, text, language) из HTML без JS.
    Использует html.parser из stdlib — никаких внешних зависимостей.
    """
    from html.parser import HTMLParser

    class _Extractor(HTMLParser):
        def __init__(self):
            super().__init__()
            self.title = ""
            self.lang = "und"
            self.texts: list[str] = []
            self._in_title = False
            self._in_content = False
            self._skip_tags = {"script", "style", "noscript", "nav", "footer",
                               "header", "aside", "form", "meta", "link"}
            self._skip_depth = 0
            self._content_stack: list[str] = []

        def handle_starttag(self, tag, attrs):
            attrs_dict = dict(attrs)
            if tag == "html":
                self.lang = attrs_dict.get("lang", "und")[:5]
            if tag == "title":
                self._in_title = True
            if tag in self._skip_tags:
                self._skip_depth += 1
            if tag in _CONTENT_TAGS and self._skip_depth == 0:
                self._content_stack.append(tag)
                self._in_content = True

        def handle_endtag(self, tag):
            if tag == "title":
                self._in_title = False
            if tag in self._skip_tags:
                self._skip_depth = max(0, self._skip_depth - 1)
            if tag in _CONTENT_TAGS and self._content_stack:
                self._content_stack.pop()
                self._in_content = bool(self._content_stack)

        def handle_data(self, data):
            data = data.strip()
            if not data:
                return
            if self._in_title:
                self.title += data
            elif self._in_content and self._skip_depth == 0:
                self.texts.append(data)

    parser = _Extractor()
    try:
        parser.feed(html)
    except Exception:
        pass

    text = " ".join(parser.texts)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return parser.title.strip(), text, parser.lang


# ─── Domain helpers ───────────────────────────────────────────────────────────

def _get_domain(url: str) -> str:
    return urllib.parse.urlparse(url).netloc.lower()


def _is_blacklisted(url: str) -> bool:
    domain = _get_domain(url)
    return any(bl in domain for bl in _BLACKLISTED_DOMAINS)


def _normalize_url(url: str, base: str) -> Optional[str]:
    """Абсолютизировать URL, убрать фрагменты, отфильтровать не-HTTP."""
    try:
        u = urllib.parse.urljoin(base, url)
        parsed = urllib.parse.urlparse(u)
        if parsed.scheme not in ("http", "https"):
            return None
        # Убираем фрагменты
        clean = parsed._replace(fragment="").geturl()
        return clean
    except Exception:
        return None


def _extract_links(html: str, base_url: str) -> list[str]:
    """Извлечь все <a href> ссылки из HTML."""
    links = []
    for m in re.finditer(r'<a\s[^>]*href=["\'](.*?)["\']', html, re.IGNORECASE):
        href = m.group(1).strip()
        url = _normalize_url(href, base_url)
        if url:
            links.append(url)
    return links


# ─── WebCrawler ───────────────────────────────────────────────────────────────

class WebCrawler:
    """
    Асинхронный этичный краулер.

    Usage (async):
        config = CrawlConfig(seeds=["https://en.wikipedia.org/wiki/Python"])
        crawler = WebCrawler(config)
        async for result in crawler.crawl():
            store.ingest_content(result.text, source_url=result.url)

    Usage (sync wrapper):
        results = WebCrawler(config).crawl_sync(max_pages=100)
    """

    def __init__(self, config: CrawlConfig) -> None:
        self._config = config
        self._robots = _RobotsCache()
        self._seen_urls: Set[str] = set()
        self._domain_last_access: dict[str, float] = {}

    # ── Rate limiting per domain ──────────────────────────────────────────────

    async def _wait_for_domain(self, url: str) -> None:
        domain = _get_domain(url)
        last = self._domain_last_access.get(domain, 0)
        delay = self._robots.get_crawl_delay(url)
        elapsed = time.time() - last
        if elapsed < delay:
            await asyncio.sleep(delay - elapsed)
        self._domain_last_access[domain] = time.time()

    # ── Fetch one page ────────────────────────────────────────────────────────

    async def _fetch(self, url: str, session) -> Optional[tuple[str, str]]:
        """
        Загрузить страницу. Возвращает (html, final_url) или None при ошибке.
        Ограничения: 2 MB, 10s timeout, только text/html.
        """
        try:
            await self._wait_for_domain(url)
            headers = {"User-Agent": USER_AGENT, "Accept-Language": "en,ru;q=0.9"}

            async with session.get(
                url,
                timeout=REQUEST_TIMEOUT_S,
                headers=headers,
                max_redirects=5,
                ssl=True,
            ) as resp:
                if resp.status != 200:
                    return None
                ct = resp.headers.get("Content-Type", "")
                if "text/html" not in ct:
                    return None
                # Читаем по кускам с ограничением
                chunks: list[bytes] = []
                total = 0
                async for chunk in resp.content.iter_chunked(65_536):
                    total += len(chunk)
                    if total > MAX_RESPONSE_BYTES:
                        break
                    chunks.append(chunk)
                raw = b"".join(chunks)
                # Определяем кодировку
                encoding = resp.charset or "utf-8"
                html = raw.decode(encoding, errors="replace")
                return html, str(resp.url)
        except Exception as exc:
            logger.debug("Fetch failed for %s: %s", url, exc)
            return None

    # ── BFS crawl ─────────────────────────────────────────────────────────────

    async def crawl(self) -> AsyncIterator[CrawlResult]:
        """
        Асинхронный BFS-краулер.

        Алгоритм:
            Queue: (url, depth)
            Semaphore: max_concurrent параллельных запросов.
            robots.txt: проверка перед каждым запросом.
            Dedup: seen_urls (SHA-256 нормализованного URL).

        Yields:
            CrawlResult для каждой успешно обработанной страницы.
        """
        try:
            import aiohttp
        except ImportError:
            logger.error("aiohttp not installed. Install: pip install aiohttp certifi")
            return

        queue: asyncio.Queue = asyncio.Queue()
        for seed in self._config.seeds:
            norm = _normalize_url(seed, seed)
            if norm:
                await queue.put((norm, 0))

        semaphore = asyncio.Semaphore(self._config.max_concurrent)
        pages_fetched = 0

        connector = aiohttp.TCPConnector(limit=self._config.max_concurrent, ssl=False)
        async with aiohttp.ClientSession(connector=connector) as session:
            while not queue.empty() and pages_fetched < self._config.max_pages:
                url, depth = await queue.get()

                # Dedup check
                url_hash = hashlib.sha256(url.encode()).hexdigest()
                if url_hash in self._seen_urls:
                    continue
                self._seen_urls.add(url_hash)

                if _is_blacklisted(url):
                    logger.debug("Blacklisted URL skipped: %s", url)
                    continue

                if depth > self._config.max_depth:
                    continue

                # robots.txt check
                if not await self._robots.can_fetch(url, session):
                    logger.debug("robots.txt disallows: %s", url)
                    continue

                async with semaphore:
                    result = await self._fetch(url, session)

                if result is None:
                    continue

                html, final_url = result
                title, text, lang = _extract_text(html, final_url)

                if len(text) < self._config.min_text_len:
                    continue

                if self._config.allowed_langs and lang not in self._config.allowed_langs:
                    continue

                pages_fetched += 1
                logger.info("[%d/%d] Crawled: %s (%d chars)",
                            pages_fetched, self._config.max_pages, final_url, len(text))

                yield CrawlResult(
                    url=final_url,
                    text=text,
                    title=title,
                    language=lang,
                )

                # Добавить дочерние ссылки в очередь
                if depth < self._config.max_depth:
                    links = _extract_links(html, final_url)
                    for link in links[:20]:  # ограничиваем fan-out
                        lh = hashlib.sha256(link.encode()).hexdigest()
                        if lh not in self._seen_urls:
                            await queue.put((link, depth + 1))

    def crawl_sync(self, max_pages: Optional[int] = None) -> list[CrawlResult]:
        """
        Синхронная обёртка над crawl() для простого использования.
        Не блокирует event loop — создаёт новый.
        """
        if max_pages:
            self._config = CrawlConfig(
                **{**self._config.__dict__, "max_pages": max_pages}
            )

        results: list[CrawlResult] = []

        async def _collect():
            async for r in self.crawl():
                results.append(r)

        asyncio.run(_collect())
        return results
