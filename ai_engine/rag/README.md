# RAG Module — Retrieval-Augmented Generation

## Обзор

Модуль реализует полный RAG pipeline для улучшения LLM ответов за счёт поиска релевантных документов из векторного хранилища.

## Архитектура

```
┌─────────────────────────────────────────────────────┐
│                   RAGPipeline                       │
│                                                     │
│  ingest() ──► DocumentProcessor ──► VectorStore     │
│                                                     │
│  query()  ──► EmbeddingEngine                       │
│           ──► VectorStore.search()                  │
│           ──► format_context()                      │
│           ──► LLM(prompt)                           │
│           ──► RAGResponse                           │
└─────────────────────────────────────────────────────┘
```

## Компоненты

### `EmbeddingEngine`
- Основной бэкенд: `sentence-transformers` (`all-MiniLM-L6-v2`, 384 dim)
- Fallback: TF-IDF через `scikit-learn`
- In-memory кэш по SHA-256 хэшу текста
- Методы: `embed_text()`, `embed_batch()`, `cosine_similarity()`

### `VectorStore`
- In-memory хранилище, cosine similarity O(n)
- **Production замена**: Qdrant / Pinecone / Weaviate (HNSW индекс)
- Personistence: JSON сериализация (`save()`/`load()`)
- Методы: `add_document()`, `add_documents()`, `search()`, `delete()`

### `DocumentProcessor`
- Recursive text splitter (chunk_size=2048 символов, overlap=200)
- Поддерживаемые форматы: `.txt`, `.md`, `.py` (docstrings), `.json`
- `process_url()` — заглушка (в production: httpx + BeautifulSoup4)

### `RAGPipeline`
- Полный RAG цикл: ingestion + retrieval + generation
- `query()` — однократный запрос
- `query_with_history()` — запрос с историей диалога
- Верификация: если relevance < min_confidence → "No relevant information found"

## Установка зависимостей

```bash
pip install sentence-transformers numpy scikit-learn
```

## Использование

```python
from ai_engine.rag import RAGPipeline, VectorStore

def my_llm(prompt: str) -> str:
    # Ваш LLM здесь (OpenAI, Anthropic, local model...)
    return "ответ"

pipeline = RAGPipeline(llm_callable=my_llm)

# Индексирование
pipeline.ingest(
    texts=["текст документа 1", "текст документа 2"],
    sources=["doc1.txt", "doc2.txt"]
)

# Запрос
response = pipeline.query("Ваш вопрос?")
print(response.answer)
print(f"Источники: {response.sources}")
print(f"Уверенность: {response.confidence:.2f}")
```

## Производительность

| Размер корпуса | Время поиска | Рекомендация |
|---|---|---|
| < 10k docs | < 50ms | In-memory (текущая реализация) |
| 10k–100k docs | 50–500ms | Faiss IVF |
| > 100k docs | — | Qdrant / Pinecone |

## Безопасность

- В production хранилище должно быть изолировано по tenant (RLS)
- Эмбеддинги не раскрывают исходный текст (необратимое преобразование)
- Ограничьте `top_k` для предотвращения утечки данных через context window
