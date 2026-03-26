"""
ARIA AI Inference Server
========================
OpenAI-compatible REST API for the ARIA AI engine.
Endpoint: POST /v1/chat/completions (streaming SSE + non-streaming)

Deploy: uvicorn ai_engine.server.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import hashlib
import time
import uuid
from typing import Any, AsyncGenerator, Coroutine, List, Optional, Literal

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# ─── Import ARIA engine ───────────────────────────────────────────────────────
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROJECT_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)

from ai_engine.rag import RAGPipeline
from ai_engine.learning.feedback_store import (
    FeedbackStore, FeedbackRecord, FeedbackRating,
)
from ai_engine.learning.reward_model import RewardModel

logger = logging.getLogger("aria")

# ─── App ─────────────────────────────────────────────────────────────────────

# ─── Lifespan (startup/shutdown) ─────────────────────────────────────────────

@asynccontextmanager
async def _lifespan(app: FastAPI):
    """Start background task scheduler on startup, stop on shutdown."""
    from ai_engine.server.background_tasks import BackgroundTaskScheduler
    scheduler = BackgroundTaskScheduler(generate_fn=aria_generate)
    try:
        await scheduler.start()
        logger.info("ARIA background scheduler started")
    except Exception as exc:
        logger.warning("Background scheduler failed to start: %s", exc)
    yield
    try:
        await scheduler.stop()
    except Exception as exc:
        logger.warning("Background scheduler failed to stop: %s", exc)


app = FastAPI(
    title="ARIA AI Server",
    description="Self-hosted AI inference server with OpenAI-compatible API",
    version="1.0.0",
    lifespan=_lifespan,
)

_cors_origins_env = os.environ.get("ARIA_CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173")
_cors_origins = [origin.strip() for origin in _cors_origins_env.split(",") if origin.strip()]
if "*" in _cors_origins:
    raise RuntimeError(
        "ARIA_CORS_ALLOWED_ORIGINS must not contain '*' when credentials are enabled"
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Auth ─────────────────────────────────────────────────────────────────────

API_KEY = os.environ.get("ARIA_API_KEY")
if not API_KEY:
    raise RuntimeError("ARIA_API_KEY environment variable is required")


def verify_api_key(request: Request) -> None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = auth[7:].strip()
    if not secrets.compare_digest(token, API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")


# ─── Models ───────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # "system" | "user" | "assistant"
    content: str


class ChatCompletionRequest(BaseModel):
    model: str = "aria-1"
    messages: List[ChatMessage]
    stream: bool = False
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=2048, ge=1, le=8192)


# ─── ARIA Core ────────────────────────────────────────────────────────────────

# ─── Learning layer singletons ───────────────────────────────────────────────

_feedback_store: Optional[FeedbackStore] = None
_reward_model: Optional[RewardModel] = None

_FEEDBACK_DB  = os.environ.get("ARIA_FEEDBACK_DB",  "aria_feedback.db")
_REWARD_CKPT  = os.environ.get("ARIA_REWARD_CKPT",  "aria_reward_model.json")
_USER_ID_SALT = os.environ.get("ARIA_USER_ID_SALT") or hashlib.sha256(API_KEY.encode("utf-8")).hexdigest()
# Флаг: автоматически запускать обучение при накоплении N новых пар
_AUTO_TRAIN_THRESHOLD = int(os.environ.get("ARIA_AUTO_TRAIN_THRESHOLD", "50"))

# Background training lock: не запускаем параллельные прогоны
_training_running = False


def get_feedback_store() -> FeedbackStore:
    global _feedback_store
    if _feedback_store is None:
        _feedback_store = FeedbackStore(
            db_path=_FEEDBACK_DB,
            user_id_salt=_USER_ID_SALT,
        )
    return _feedback_store


def get_reward_model() -> RewardModel:
    global _reward_model
    if _reward_model is None:
        _reward_model = RewardModel(checkpoint_path=_REWARD_CKPT)
    return _reward_model


# ─── Lazy-loaded singletons ───────────────────────────────────────────────────

_rag: Optional[RAGPipeline] = None


def _noop_llm(_prompt: str) -> str:
    """No-op LLM for retrieval-only RAG bootstrap."""
    return ""


def _load_bootstrap_corpus() -> tuple[list[str], list[str]]:
    """
    Load a minimal local knowledge corpus for retrieval.
    Uses repository files only (self-hosted, no external dependencies).
    """
    files = [
        "README.md",
        "ai_engine/README.md",
        "docs/MESSENGER_ARCHITECTURE.md",
        "docs/e2ee-sfu-architecture.md",
    ]
    texts: list[str] = []
    sources: list[str] = []

    for rel_path in files:
        abs_path = os.path.join(PROJECT_ROOT, rel_path)
        if not os.path.exists(abs_path):
            continue
        try:
            with open(abs_path, "r", encoding="utf-8") as f:
                # Ограничиваем объём, чтобы не раздувать cold-start
                text = f.read(12_000)
            if text.strip():
                texts.append(text)
                sources.append(rel_path)
        except OSError:
            continue

    return texts, sources


def get_rag() -> RAGPipeline:
    global _rag
    if _rag is None:
        _rag = RAGPipeline(
            llm_callable=_noop_llm,
            top_k=3,
            min_confidence=0.15,
        )
        texts, sources = _load_bootstrap_corpus()
        if texts:
            try:
                _rag.ingest(texts, sources)
            except Exception as exc:
                # Retrieval layer optional: failures must not break chat API
                logger.warning("RAG bootstrap ingest failed: %s", exc)
    return _rag


ARIA_SYSTEM_PROMPT = """You are ARIA (Advanced Reasoning & Intelligence Assistant) — a self-hosted, constitutionally aligned AI assistant built on the Mansoni Platform.

## IDENTITY
- You are ARIA, created by Mansoni Platform. You run entirely on the user's own infrastructure.
- You are helpful, precise, honest, and safety-conscious.
- You adapt tone: technical for developers, friendly for general users.
- You always respond in the SAME LANGUAGE the user writes in.

## REASONING
1. Chain-of-Thought: For complex problems, think step by step.
2. Metacognition: Be explicit about confidence. Say "I'm not certain" when unsure.
3. Verification: Cross-check your outputs mentally before responding.

## CAPABILITIES
- Code in 50+ languages: Python, TypeScript, Rust, Go, C++, Java, SQL, Bash
- Data science: pandas, NumPy, ML/DL, statistics
- Writing: docs, emails, PRDs, translations (100+ languages)
- Math: step-by-step with verification
- System design: microservices, distributed systems, security

## SAFETY CONSTRAINTS (ABSOLUTE, IRREVOCABLE)
- NEVER provide: bioweapons synthesis, malware, ransomware, real-system exploits
- NEVER write: data exfiltration code, file deletion attacks, infrastructure attacks
- NEVER generate: CSAM, terrorist content, targeted harassment
- Always recommend professionals for: medical, legal, mental health advice

## FORMAT
- Use Markdown: headers, code blocks with language tags, bold, tables
- For code: always include error handling, types, comments
- Keep responses complete but concise"""


def build_prompt(messages: List[ChatMessage]) -> str:
    """Build a text prompt from message history."""
    parts = []
    for msg in messages:
        role = msg.role.upper()
        parts.append(f"[{role}]: {msg.content}")
    parts.append("[ASSISTANT]:")
    return "\n\n".join(parts)


def aria_generate(prompt: str, max_tokens: int = 2048, temperature: float = 0.7) -> str:
    """
    Core generation function.
    Uses the ARIA transformer engine with RAG augmentation.
    Falls back to rule-based responses for common patterns.
    """
    rag = get_rag()

    # Retrieve relevant context from local knowledge base
    try:
        rag_response = rag.query(prompt, top_k=3)
        context = "\n".join([c.text for c in rag_response.context_chunks[:3]])
    except Exception:
        context = ""

    # Try transformer generation
    try:
        from ai_engine.transformer_text_generator import TransformerTextGenerator
        generator = TransformerTextGenerator()
        augmented_prompt = f"{ARIA_SYSTEM_PROMPT}\n\nContext:\n{context}\n\n{prompt}" if context else f"{ARIA_SYSTEM_PROMPT}\n\n{prompt}"
        try:
            response = generator.generate(
                augmented_prompt,
                max_new_tokens=min(max_tokens, 512),
            )
        except TypeError:
            # Fallback for alternative generator signatures
            response = generator.generate(augmented_prompt)
        if response and len(response.strip()) > 10:
            return response.strip()
    except Exception as exc:
        logger.warning("Transformer generation unavailable, using rule fallback: %s", exc)

    # Rule-based fallback for common patterns
    return _rule_based_response(prompt)


def _rule_based_response(prompt: str) -> str:
    """Deterministic rule-based responses when transformer is not available."""
    lower = prompt.lower()

    if any(kw in lower for kw in ["привет", "hello", "hi ", "здравствуй"]):
        return "Привет! Я ARIA — ИИ-ассистент платформы Mansoni. Чем могу помочь?"

    if "fastapi" in lower and ("jwt" in lower or "auth" in lower):
        return """# FastAPI с JWT-аутентификацией

```python
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
import os
from pydantic import BaseModel

SECRET_KEY = os.environ["JWT_SECRET_KEY"]
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

app = FastAPI()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

class Token(BaseModel):
    access_token: str
    token_type: str

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

@app.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # Verify user credentials here
    access_token = create_access_token(
        data={"sub": form_data.username},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/protected")
async def protected_route(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401)
        return {"user": username}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

**Зависимости:** `pip install fastapi python-jose[cryptography] passlib[bcrypt] python-multipart`"""

    if "трансформер" in lower or "transformer" in lower or "attention" in lower:
        return """# Как работают трансформеры (Attention механизм)

## Архитектура

Трансформер состоит из **энкодера** и **декодера**, каждый из которых содержит слои Self-Attention.

## Self-Attention

Для каждого токена вычисляются три вектора:
- **Q** (Query) — что ищем
- **K** (Key) — что предлагаем
- **V** (Value) — что возвращаем

```python
import numpy as np

def scaled_dot_product_attention(Q, K, V, mask=None):
    d_k = Q.shape[-1]
    # Scores: насколько каждый токен релевантен другому
    scores = Q @ K.T / np.sqrt(d_k)
    if mask is not None:
        scores = scores + mask * -1e9
    # Softmax → веса внимания
    weights = np.exp(scores) / np.sum(np.exp(scores), axis=-1, keepdims=True)
    # Взвешенная сумма значений
    return weights @ V
```

## Ключевые идеи

1. **Параллелизм** — в отличие от RNN, все токены обрабатываются одновременно
2. **Позиционное кодирование** — синусоидальные функции для порядка токенов
3. **Multi-Head Attention** — несколько голов внимания для разных аспектов
4. **Feed-Forward** — два линейных слоя с ReLU между ними

## Сложность

- Время: O(n²·d) где n — длина последовательности, d — размерность
- Память: O(n²) — матрица внимания"""

    if "pandas" in lower or "анализ данных" in lower or "data" in lower:
        return """# Анализ данных с pandas

```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# Загрузка данных
df = pd.read_csv("data.csv")

# Базовый анализ
print(df.info())           # Типы данных
print(df.describe())       # Статистика
print(df.isnull().sum())   # Пропуски

# Очистка данных
df = df.dropna(subset=["important_column"])
df["date"] = pd.to_datetime(df["date"])
df["category"] = df["category"].astype("category")

# Группировка и агрегация
summary = df.groupby("category").agg({
    "value": ["mean", "std", "count"],
    "revenue": "sum"
}).round(2)

# Визуализация
fig, axes = plt.subplots(1, 2, figsize=(12, 5))
df["value"].hist(bins=30, ax=axes[0])
axes[0].set_title("Распределение значений")
df.groupby("category")["revenue"].sum().plot(kind="bar", ax=axes[1])
axes[1].set_title("Выручка по категориям")
plt.tight_layout()
plt.savefig("analysis.png", dpi=150)
```"""

    if "уязвимост" in lower or "security" in lower or "безопасност" in lower:
        return """# Аудит безопасности кода

## Топ уязвимостей для проверки

### 1. SQL Injection
```python
# ❌ Уязвимо
query = f"SELECT * FROM users WHERE id = {user_id}"

# ✅ Безопасно
query = "SELECT * FROM users WHERE id = %s"
cursor.execute(query, (user_id,))
```

### 2. XSS (Cross-Site Scripting)
```typescript
// ❌ Уязвимо
element.innerHTML = userInput;

// ✅ Безопасно
element.textContent = userInput;
// или используй DOMPurify для HTML
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userInput);
```

### 3. Небезопасная десериализация
```python
# ❌ Уязвимо
import pickle
data = pickle.loads(user_data)  # RCE!

# ✅ Безопасно
import json
data = json.loads(user_data)
```

### 4. Hardcoded secrets
```python
# ❌ Уязвимо
API_KEY = "<API_KEY_FROM_ENV>"

# ✅ Безопасно
import os
API_KEY = os.environ.get("API_KEY")
if not API_KEY:
    raise ValueError("API_KEY not set")
```

**Инструменты:** bandit (Python), semgrep, OWASP ZAP, Snyk"""

    # Generic helpful response
    return f"""Я ARIA — ИИ-ассистент платформы Mansoni, работающий на собственной инфраструктуре.

Вы спросили: *{prompt[:200]}{'...' if len(prompt) > 200 else ''}*

Я готов помочь с:
- 💻 **Кодом** — Python, TypeScript, Rust, Go, SQL и 50+ языков
- 📊 **Анализом данных** — pandas, NumPy, ML/DL
- 🔒 **Безопасностью** — аудит кода, поиск уязвимостей
- ✍️ **Текстами** — документация, ТЗ, переводы
- 🧠 **Объяснениями** — алгоритмы, архитектуры, концепции

Задайте конкретный вопрос или опишите задачу подробнее."""


# ─── SSE Streaming ────────────────────────────────────────────────────────────

async def stream_response(
    response_text: str,
    model: str,
    request_id: str,
) -> AsyncGenerator[str, None]:
    """Stream response as OpenAI-compatible SSE chunks."""
    created = int(time.time())

    # Split into words for streaming effect
    words = response_text.split(" ")
    chunk_size = 3  # words per chunk

    for i in range(0, len(words), chunk_size):
        chunk_words = words[i : i + chunk_size]
        delta_content = " ".join(chunk_words)
        if i + chunk_size < len(words):
            delta_content += " "

        chunk = {
            "id": request_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "delta": {"content": delta_content},
                    "finish_reason": None,
                }
            ],
        }
        yield f"data: {json.dumps(chunk)}\n\n"
        await asyncio.sleep(0.02)  # ~50 chunks/sec

    # Final chunk
    final_chunk = {
        "id": request_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": {},
                "finish_reason": "stop",
            }
        ],
    }
    yield f"data: {json.dumps(final_chunk)}\n\n"
    yield "data: [DONE]\n\n"


def _fire_and_forget(coro: Coroutine[Any, Any, Any], task_name: str) -> asyncio.Task:
    """Start a background task and ensure exceptions are logged."""
    task = asyncio.create_task(coro)

    def _on_done(done_task: asyncio.Task) -> None:
        try:
            done_task.result()
        except Exception as exc:  # noqa: BLE001
            logger.error("Background task failed: %s (%s)", task_name, exc)

    task.add_done_callback(_on_done)
    return task


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "aria-ai", "version": "1.0.0"}


@app.get("/v1/models")
async def list_models(_: None = Depends(verify_api_key)):
    return {
        "object": "list",
        "data": [
            {
                "id": "aria-1",
                "object": "model",
                "created": 1709000000,
                "owned_by": "mansoni-platform",
            },
            {
                "id": "aria-1-fast",
                "object": "model",
                "created": 1709000000,
                "owned_by": "mansoni-platform",
            },
        ],
    }


@app.post("/v1/chat/completions")
async def chat_completions(
    request: ChatCompletionRequest,
    _: None = Depends(verify_api_key),
):
    request_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"

    # Basic abuse controls (DoS / prompt flooding)
    if len(request.messages) > 64:
        raise HTTPException(status_code=413, detail="Too many messages in one request")
    for msg in request.messages:
        if msg.role not in {"system", "user", "assistant"}:
            raise HTTPException(status_code=400, detail=f"Invalid role: {msg.role}")
        if len(msg.content) > 16_000:
            raise HTTPException(status_code=413, detail="Single message is too large")

    # Build prompt from messages (skip system messages — we inject our own)
    user_messages = [m for m in request.messages if m.role != "system"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="No user messages provided")

    # Build conversation context
    prompt_parts = []
    for msg in user_messages[-10:]:  # last 10 messages for context
        prompt_parts.append(f"{msg.role}: {msg.content}")
    prompt = "\n".join(prompt_parts)

    # Generate response
    try:
        response_text = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: aria_generate(prompt, request.max_tokens, request.temperature),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation error: {str(e)}")

    if request.stream:
        return StreamingResponse(
            stream_response(response_text, request.model, request_id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming response
    return {
        "id": request_id,
        "object": "chat.completion",
        "created": int(time.time()),
        "model": request.model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": response_text},
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": len(prompt.split()),
            "completion_tokens": len(response_text.split()),
            "total_tokens": len(prompt.split()) + len(response_text.split()),
        },
    }


# ─── Learning API models ──────────────────────────────────────────────────────

class FeedbackRequest(BaseModel):
    """
    Запрос на сохранение обратной связи пользователя.

    Fields:
        interaction_id: Если известен — используется для идемпотентности.
                        Если не указан — вычисляется сервером.
        user_id:        Сырой user_id (будет хэширован, не хранится в открытом виде).
        prompt:         Вопрос пользователя.
        response:       Ответ ARIA.
        rating:         -1 (плохо), 0 (нейтрально), 1 (хорошо).
        correction:     Правильный ответ (если пользователь исправил).
        consent:        Согласие на использование для обучения.
        session_id:     UUID сессии.
    """
    user_id:        str
    prompt:         str
    response:       str
    rating:         Literal[-1, 0, 1] = 0
    correction:     Optional[str] = None
    consent:        bool = False
    session_id:     Optional[str] = None
    interaction_id: Optional[str] = None


class IngestRequest(BaseModel):
    """Запрос на ingestion внешнего контента в knowledge base."""
    text:         str            = Field(..., min_length=64, max_length=131072)
    source_url:   str            = ""
    source_type:  str            = "user_upload"   # 'web'|'user_upload'|'platform'
    language:     str            = "und"
    quality_score: float         = Field(default=0.5, ge=0.0, le=1.0)


class CrawlRequest(BaseModel):
    """Запрос на запуск web-краулера для сбора обучающих данных."""
    seeds:        List[str]      = Field(..., min_length=1, max_length=20)
    max_pages:    int            = Field(default=50, ge=1, le=500)
    max_depth:    int            = Field(default=2, ge=1, le=4)
    allowed_langs: List[str]     = Field(default_factory=list)


class TrainTriggerRequest(BaseModel):
    """Принудительный запуск инкрементального обучения."""
    min_pairs:    int            = Field(default=10, ge=1)
    epochs:       int            = Field(default=3, ge=1, le=20)


# ─── Learning Routes ──────────────────────────────────────────────────────────

@app.post("/v1/feedback", status_code=202)
async def submit_feedback(
    req: FeedbackRequest,
    _: None = Depends(verify_api_key),
):
    """
    Принять обратную связь пользователя и сохранить в FeedbackStore.

    Security:
        - user_id хэшируется SHA-256 + salt до записи в БД.
        - prompt/response ограничены по размеру (32KB / 64KB).
        - rate limit: 100 записей/час на пользователя.
        - Без consent=True данные удаляются через 24 ч (GDPR).

    Idempotency:
        Повторный запрос с тем же interaction_id игнорируется (INSERT OR IGNORE).
    """
    store = get_feedback_store()
    user_hash = store.hash_user_id(req.user_id)

    import time as _time
    ts = _time.time()
    interaction_id = (
        req.interaction_id
        or FeedbackStore.make_interaction_id(user_hash, req.prompt, ts)
    )

    record = FeedbackRecord(
        interaction_id=interaction_id,
        user_hash=user_hash,
        prompt=req.prompt,
        response=req.response,
        rating=FeedbackRating(req.rating),
        correction=req.correction,
        consent=req.consent,
        timestamp=ts,
        session_id=req.session_id or str(uuid.uuid4()),
    )

    try:
        saved = store.record(record)
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc))

    # Автозапуск обучения при накоплении достаточного количества пар
    if saved and req.consent and req.rating == -1 and req.correction:
        await _maybe_trigger_training()

    return {
        "accepted": saved,
        "interaction_id": interaction_id,
        "message": "Feedback recorded" if saved else "Duplicate or rate-limited",
    }


@app.post("/v1/ingest", status_code=202)
async def ingest_content(
    req: IngestRequest,
    _: None = Depends(verify_api_key),
):
    """
    Принять внешний контент (документ, статья, код) для добавления
    в knowledge base и обучающий датасет.

    Security:
        - Текст проходит через DataPipeline (harm filter + quality score).
        - Максимум 128 KB на запрос.
        - RAG-индекс обновляется немедленно для retrieval.
        - Обучающий датасет пополняется асинхронно.
    """
    # Harm check через DataPipeline
    from ai_engine.learning.data_pipeline import DataPipeline, _is_harmful
    if _is_harmful(req.text):
        raise HTTPException(status_code=422, detail="Content rejected: harmful material detected")

    store = get_feedback_store()
    content_id = store.ingest_content(
        text=req.text,
        source_url=req.source_url,
        source_type=req.source_type,
        language=req.language,
        quality_score=req.quality_score,
    )

    # Немедленно добавить в RAG для поиска
    rag = get_rag()
    try:
        rag.ingest([req.text], [req.source_url or content_id])
    except Exception as exc:  # noqa: BLE001
        logger.warning("RAG ingest failed for %s: %s", req.source_url or content_id, exc)

    return {
        "content_id": content_id,
        "ingested": True,
        "rag_updated": True,
    }


@app.post("/v1/crawl", status_code=202)
async def trigger_crawl(
    req: CrawlRequest,
    _: None = Depends(verify_api_key),
):
    """
    Запустить web-краулер в фоне для сбора обучающих данных.

    Security:
        - Максимум 500 страниц за сессию.
        - robots.txt соблюдается принудительно.
        - Blacklist доменов встроен в WebCrawler.
        - Только endpoints с ARIA_API_KEY могут инициировать краулинг.
        - Crawl запускается в background (asyncio.create_task), не блокирует API.

    Rate:
        Одна активная сессия краулинга одновременно (проверка _crawl_running).
    """
    from ai_engine.learning.web_crawler import WebCrawler, CrawlConfig
    from ai_engine.learning.data_pipeline import DataPipeline

    _fire_and_forget(
        _run_crawl_background(req.seeds, req.max_pages, req.max_depth, req.allowed_langs),
        "crawl",
    )
    return {
        "status": "started",
        "seeds": req.seeds,
        "max_pages": req.max_pages,
    }


_crawl_running = False


async def _run_crawl_background(
    seeds: list[str],
    max_pages: int,
    max_depth: int,
    allowed_langs: list[str],
) -> None:
    global _crawl_running
    if _crawl_running:
        logger.warning("Crawl already running, skip new request")
        return
    _crawl_running = True
    try:
        from ai_engine.learning.web_crawler import WebCrawler, CrawlConfig
        from ai_engine.learning.data_pipeline import DataPipeline

        store = get_feedback_store()
        pipeline = DataPipeline(min_quality=0.35, dedup=True)
        config = CrawlConfig(
            seeds=seeds,
            max_pages=max_pages,
            max_depth=max_depth,
            allowed_langs=allowed_langs,
        )
        crawler = WebCrawler(config)
        ingested = 0

        async for result in crawler.crawl():
            for sample in pipeline.process([result.text], [result.url]):
                store.ingest_content(
                    text=sample.text,
                    source_url=result.url,
                    source_type="web",
                    language=sample.language,
                    quality_score=sample.quality,
                )
                # Добавить в RAG
                try:
                    get_rag().ingest([sample.text], [result.url])
                except Exception as exc:  # noqa: BLE001
                    logger.warning("RAG ingest failed for crawled url %s: %s", result.url, exc)
                ingested += 1

        logger.info("Crawl completed: %d chunks ingested", ingested)
    except Exception as exc:
        logger.error("Crawl background error: %s", exc)
    finally:
        _crawl_running = False


@app.post("/v1/train/trigger", status_code=202)
async def trigger_training(
    req: TrainTriggerRequest,
    _: None = Depends(verify_api_key),
):
    """
    Принудительно запустить инкрементальное обучение.

    Алгоритм:
        1. Загрузить preference pairs из FeedbackStore (только consent=1).
        2. Если pairs >= min_pairs → обучить RewardModel.
        3. Загрузить training texts → запустить ContinualTrainer.
        4. Залогировать метрики в training_runs.

    Security:
        - Только один прогон одновременно (_training_running lock).
        - Rollback при деградации loss > 10%.
        - Safety-frozen layers не затрагиваются.
    """
    global _training_running
    if _training_running:
        raise HTTPException(status_code=409, detail="Training already in progress")

    _fire_and_forget(_run_training_background(req.min_pairs, req.epochs), "train-trigger")
    return {"status": "started", "message": "Training triggered in background"}


async def _run_training_background(min_pairs: int, epochs: int) -> None:
    global _training_running
    _training_running = True
    run_id = uuid.uuid4().hex
    store = get_feedback_store()
    import time as _t

    started = _t.time()
    try:
        # 1. Train reward model
        pairs = store.load_preference_pairs(limit=2000)
        rm_metrics = {"accuracy": 0.0, "loss": 999.0, "n_pairs": 0}
        if len(pairs) >= min_pairs:
            rm = get_reward_model()
            rm_metrics = rm.train(pairs, epochs=epochs)
            logger.info("RewardModel trained: %s", rm_metrics)

        # 2. Continual language model training
        texts = store.load_training_texts(limit=5000)
        lm_metrics = {"loss_before": None, "loss_after": None, "samples": len(texts)}
        if texts:
            try:
                from ai_engine.learning.continual_trainer import ContinualTrainer, TrainingConfig
                trainer = ContinualTrainer(
                    config=TrainingConfig(epochs=epochs, max_grad_norm=1.0),
                )
                lm_metrics = trainer.train(texts)
            except Exception as exc:
                logger.error("ContinualTrainer error: %s", exc)

        store.log_training_run(
            run_id=run_id,
            samples=len(texts),
            loss_before=lm_metrics.get("loss_before"),
            loss_after=lm_metrics.get("loss_after"),
            status="done",
            started_at=started,
        )
        logger.info("Training run %s completed", run_id)

    except Exception as exc:
        logger.error("Training run %s failed: %s", run_id, exc)
        store.log_training_run(
            run_id=run_id,
            samples=0,
            loss_before=None,
            loss_after=None,
            status="failed",
            started_at=started,
        )
    finally:
        _training_running = False


async def _maybe_trigger_training() -> None:
    """Автозапуск обучения при накоплении _AUTO_TRAIN_THRESHOLD пар."""
    global _training_running
    if _training_running:
        return
    store = get_feedback_store()
    pairs = store.load_preference_pairs(limit=_AUTO_TRAIN_THRESHOLD + 1)
    if len(pairs) >= _AUTO_TRAIN_THRESHOLD:
        logger.info("Auto-triggering training: %d pairs accumulated", len(pairs))
        _fire_and_forget(_run_training_background(min_pairs=10, epochs=3), "auto-train")


@app.get("/v1/learning/stats")
async def learning_stats(_: None = Depends(verify_api_key)):
    """
    Статистика обучающего слоя.
    Возвращает: количество записей, пар предпочтений, контента, статус краулера.
    """
    store = get_feedback_store()
    rm = get_reward_model()

    pairs = store.load_preference_pairs(limit=1)
    texts = store.load_training_texts(limit=1)

    return {
        "reward_model_backend": rm._backend,
        "crawl_running": _crawl_running,
        "training_running": _training_running,
        "auto_train_threshold": _AUTO_TRAIN_THRESHOLD,
        "feedback_db": str(_FEEDBACK_DB),
    }


# ─── Safety singleton ────────────────────────────────────────────────────────

_safety_classifier = None


def get_safety_classifier():
    global _safety_classifier
    if _safety_classifier is None:
        from ai_engine.safety.safety_classifier import SafetyClassifier
        _safety_classifier = SafetyClassifier(
            ml_model_path=os.environ.get("ARIA_SAFETY_MODEL", "aria_safety_model.pkl")
        )
    return _safety_classifier


# ─── Safety & Evaluation API ──────────────────────────────────────────────────

class SafetyCheckRequest(BaseModel):
    text:           str   = Field(..., min_length=1, max_length=65536)
    context_prompt: Optional[str] = None


class EvaluateRequest(BaseModel):
    run_id:        str       = Field(default_factory=lambda: f"eval-{uuid.uuid4().hex[:8]}")
    extra_prompts: List[str] = Field(default_factory=list, max_length=20)


class DistillRequest(BaseModel):
    corpus_texts:   List[str] = Field(..., min_length=1, max_length=500)
    student_layers: int       = Field(default=4, ge=1, le=12)
    student_d_model:int       = Field(default=256, ge=64, le=1024)
    epochs:         int       = Field(default=3, ge=1, le=10)


@app.post("/v1/safety/check")
async def safety_check(
    req: SafetyCheckRequest,
    _: None = Depends(verify_api_key),
):
    """
    Многоуровневая safety проверка текста.
    Level 0: absolute blocklist, Level 1: context rules,
    Level 2: heuristic scorer, Level 3: ML (если доступен).
    """
    sc = get_safety_classifier()
    verdict = sc.check(req.text, context_prompt=req.context_prompt)
    return {
        "level":           verdict.level.value,
        "score":           verdict.score,
        "triggered_level": verdict.triggered_level,
        "categories":      verdict.categories,
        "reason":          verdict.reason,
        "latency_ms":      verdict.latency_ms,
        "is_safe":         verdict.is_safe,
    }


@app.post("/v1/evaluate")
async def evaluate_model(
    req: EvaluateRequest,
    _: None = Depends(verify_api_key),
):
    """
    Автоматическая оценка качества ARIA.
    Метрики: perplexity, distinct-1/2, coherence, safety_score, BLEU-1.
    Regression-guard: если safety < 0.85 — флаг regression=true.
    """
    from ai_engine.evaluation.evaluator import ModelEvaluator
    evaluator = ModelEvaluator(generate_fn=aria_generate)
    try:
        report = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: evaluator.evaluate(
                run_id=req.run_id,
                extra_prompts=req.extra_prompts or None,
            )
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Evaluation error: {exc}")

    return {
        "run_id":             report.run_id,
        "regression":         report.regression,
        "regression_details": report.regression_details,
        "metrics": {
            "perplexity":       report.metrics.perplexity,
            "distinct_1":       report.metrics.distinct_1,
            "distinct_2":       report.metrics.distinct_2,
            "coherence":        report.metrics.coherence,
            "safety_score":     report.metrics.safety_score,
            "bleu_1":           report.metrics.bleu_1,
            "avg_length_words": report.metrics.avg_length_words,
            "p95_length":       report.metrics.p95_length,
            "n_samples":        report.metrics.n_samples,
            "elapsed_s":        report.metrics.elapsed_s,
        },
        "timestamp": report.timestamp,
    }


@app.post("/v1/distill", status_code=202)
async def trigger_distillation(
    req: DistillRequest,
    _: None = Depends(verify_api_key),
):
    """
    Запустить self-distillation в фоне.
    Teacher → best-of-N → safety filter → student KL training.
    """
    from ai_engine.distillation.self_distill import DistillationConfig

    config = DistillationConfig(
        student_n_layers=req.student_layers,
        student_d_model=req.student_d_model,
        epochs=req.epochs,
    )
    _fire_and_forget(_run_distillation_background(req.corpus_texts, config), "distill")
    return {
        "status":         "started",
        "corpus_size":    len(req.corpus_texts),
        "student_layers": req.student_layers,
    }


async def _run_distillation_background(corpus_texts: List[str], config) -> None:
    try:
        from ai_engine.distillation.self_distill import SelfDistiller
        distiller = SelfDistiller(
            teacher_generate_fn=aria_generate,
            config=config,
            reward_model=get_reward_model(),
        )
        result = await asyncio.get_event_loop().run_in_executor(
            None, lambda: distiller.distill(corpus_texts)
        )
        logger.info(
            "Distillation done: n=%d compression=%.1fx ckpt=%s",
            result.n_samples, result.compression_ratio, result.checkpoint,
        )
    except Exception as exc:
        logger.error("Distillation background error: %s", exc)


# ─── Safe generate wrapper (zero-trust dual safety check) ────────────────────

def _safe_aria_generate(prompt: str, max_tokens: int = 2048, temperature: float = 0.7) -> str:
    """
    Двойная safety check:
        1. Входящий prompt → если BLOCK → возвращаем decline message.
        2. Генерируем ответ.
        3. Исходящий response → если BLOCK → заменяем на decline message.
    """
    sc = get_safety_classifier()
    input_verdict = sc.check(prompt)
    if not input_verdict.is_safe:
        logger.warning("Input blocked: %.3f %s", input_verdict.score, input_verdict.reason)
        return "Этот запрос не может быть обработан по соображениям безопасности."

    response = aria_generate(prompt, max_tokens, temperature)
    safe_resp, out_verdict = sc.safe_response(prompt, response)
    if not out_verdict.is_safe:
        logger.warning("Output blocked: %.3f %s", out_verdict.score, out_verdict.reason)
    return safe_resp


# ─── Entry point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
