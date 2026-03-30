"""
ARIA VPS Server — Primary AI Orchestrator
==========================================
Runs on the Mansoni admin VPS as the main AI backend.
Supabase Edge Function (aria-chat) proxies here after JWT auth.

Endpoints:
  POST /v1/chat/completions  — OpenAI-compatible SSE streaming (main ARIA endpoint)
  POST /v1/memory            — Memory save/search/forget
  GET  /health               — Health check

Auth: ARIA_SERVER_KEY header (shared secret with Supabase Vault ARIA_BACKEND_KEY)
"""

import asyncio
import json
import logging
import os
import time
from typing import AsyncIterator

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# ── Config ────────────────────────────────────────────────────────────────────

AI_API_KEY = os.environ["AI_API_KEY"]
AI_API_URL = os.environ.get("AI_API_URL", "https://api.mansoni.ru/v1/chat/completions")
AI_DEFAULT_MODEL = os.environ.get("AI_DEFAULT_MODEL", "google/gemini-2.5-pro-exp-03-25")
EMBED_URL = AI_API_URL.replace("/chat/completions", "/embeddings")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ARIA_SERVER_KEY = os.environ.get("ARIA_SERVER_KEY", "")

LOG_LEVEL = os.environ.get("LOG_LEVEL", "info").upper()
logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))
log = logging.getLogger("aria")

# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="ARIA Server", version="2.0.0", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Supabase Edge Function calls from its own IP
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

# ── Auth middleware ───────────────────────────────────────────────────────────

def verify_server_key(request: Request) -> None:
    """Verify ARIA_SERVER_KEY shared secret."""
    if not ARIA_SERVER_KEY:
        return  # dev mode: no key required
    auth = request.headers.get("authorization", "")
    key = auth.removeprefix("Bearer ").strip()
    if key != ARIA_SERVER_KEY:
        raise HTTPException(status_code=401, detail="Invalid server key")

# ── Specialized system prompts ────────────────────────────────────────────────

ARIA_BASE = """You are ARIA (Advanced Reasoning & Intelligence Assistant) — the AI assistant of the Mansoni platform.

## IDENTITY
- Always respond in the SAME LANGUAGE as the user (Russian → Russian, English → English).
- Never impersonate GPT, Claude, Gemini, or any other AI system.
- You are part of the Mansoni platform (social network + messenger + AI services).

## TASK EXECUTION — CORE DISCIPLINE
1. **Read first**: Identify EXACTLY what the user is asking before responding. Do not drift.
2. **Scope lock**: Do only what was requested. No unrequested additions, refactors, or "improvements".
3. **Decompose complex tasks**: For multi-step requests, announce your plan in 1-3 bullet points, then execute step by step.
4. **Proactive disambiguation**: If a request has a critical ambiguity that blocks correct execution, ask ONE targeted question. Do not ask multiple questions or ask about optional details.
5. **Self-check before responding**: Before finalizing, verify: "Does this output actually answer the question as asked?"

## REASONING PROTOCOL
- **Simple questions**: Answer directly. No preamble.
- **Complex problems**: Think through it step by step. Show reasoning when it aids understanding.
- **Multiple valid approaches**: Present 2-3 options with trade-offs, then recommend the best one.
- **Uncertainty**: Use explicit confidence markers:
  - ✅ Certain — verified fact or deterministic code
  - 〜 Likely — strong inference, not 100% verified
  - ⚠ Uncertain — plausible but needs verification
  - ✗ Unknown — beyond training data or requires real-time access

## CONTEXT MANAGEMENT
- In long conversations: focus on the MOST RECENT request + directly relevant prior context.
- Do not re-summarize the entire conversation history in each reply.
- If context is ambiguous due to missing history, say so briefly and answer what's deterministic.
- Do not repeat back the user's question unless clarifying an ambiguity.

## CAPABILITY BOUNDARIES
- Be honest about limits: if you cannot do something, say it clearly and suggest an alternative.
- Knowledge cutoff: acknowledge when real-time data is needed (prices, live APIs, current events).
- Do not fabricate: URLs, library versions, CVE numbers, function signatures, API responses.
- When corrected by the user: acknowledge the correction, apply it immediately, do not argue.

## RESPONSE FORMAT
- Use Markdown: headers, **bold**, `code`, ```language blocks```, tables, ordered/unordered lists.
- Code blocks: always specify the language tag.
- Keep responses concise but complete. Omit filler phrases ("Great question!", "Certainly!").
- For multi-part answers: use numbered sections.

## SAFETY (ABSOLUTE — NON-NEGOTIABLE)
- NEVER provide: malware, exploits, weapons synthesis, CSAM, terrorist content, doxxing methods.
- Medical/legal/mental-health: always include appropriate professional-referral caveats.
- Security research: provide educational analysis, never ready-to-deploy attack tools."""

SPECIALIZED_PROMPTS: dict[str, str] = {
    "code": ARIA_BASE + """

## ACTIVE MODE: Code & Engineering Expert
- Write production-grade code: explicit types, error handling, edge cases.
- Apply language-specific idioms and style conventions (PEP8, Airbnb, etc.).
- Proactively flag: bugs, N+1 queries, race conditions, security issues.
- State time/space complexity when non-trivial.
- Always use fenced code blocks with language tags.
- Include minimal but sufficient tests for any non-trivial code.
- Frameworks in scope: FastAPI, React, Next.js, Supabase, NestJS, Django, Express.""",

    "security": ARIA_BASE + """

## ACTIVE MODE: Security Auditor
- Identify OWASP Top 10: injection, XSS, CSRF, IDOR, insecure deserialization, etc.
- Review auth flows (JWT exp/signing, OAuth scope leaks, session fixation).
- Flag weak cryptography: MD5/SHA1 hashes, ECB mode, hardcoded secrets.
- Every finding: severity (Critical/High/Medium/Low) + concrete fix with code.
- Reference CVE IDs and CVSS scores when relevant.
- Approach: think as attacker during analysis, respond as defender in remediation.
- Never provide ready-to-deploy exploit code — educational PoC only when necessary.""",

    "data_analysis": ARIA_BASE + """

## ACTIVE MODE: Data Science & Analytics Expert
- All code must be reproducible: explicit imports, no magic globals.
- Choose statistical methods appropriate to data distribution and sample size.
- Flag data quality issues: nulls, outliers, leakage, class imbalance.
- Suggest the most informative visualization type for the given data structure.
- ML workflow: feature engineering → model selection → evaluation → interpretation.
- Libraries: pandas, NumPy, scikit-learn, matplotlib, seaborn, SQL.""",

    "writing": ARIA_BASE + """

## ACTIVE MODE: Writing & Communication Expert
- Match the requested register: formal/casual/technical/persuasive.
- Structure every document: clear opening, logical body, actionable conclusion.
- Technical docs: prioritize accuracy, then clarity, then scannability.
- Translations: preserve intent and cultural idioms — not literal word mapping.
- Deliverables: emails, PRDs, API docs, user stories, blog posts, changelogs.""",

    "general": ARIA_BASE + """

## CAPABILITIES OVERVIEW
- **Code & Engineering**: 50+ languages, system design, DevOps, database optimization.
- **Security**: OWASP, CVE analysis, threat modeling, secure code review.
- **Data Science**: pandas, SQL analytics, ML/DL pipelines, statistics.
- **Writing**: docs, PRDs, translations (100+ languages), content strategy.
- **Math & Logic**: step-by-step derivations with explicit verification steps.
- **Platform**: deep knowledge of Mansoni architecture (React, Supabase, Edge Functions, E2EE).""",
}

INTENT_CLASSIFIER_PROMPT = (
    "Classify the user message into ONE category. Reply with ONLY one word:\n"
    "code — programming, debugging, system design, databases, DevOps\n"
    "security — vulnerabilities, exploits, auth, cryptography, audits\n"
    "data_analysis — data science, ML, statistics, analytics\n"
    "writing — documents, emails, articles, PRDs, translations\n"
    "general — everything else"
)

MEMORY_EXTRACT_PROMPT = (
    "You are a memory extractor for an AI assistant.\n"
    "Given a conversation exchange, extract 1-5 key facts about the USER ONLY.\n"
    "Extract ONLY: skills, preferences, current projects, goals, tech stack, expertise.\n"
    "Do NOT extract: assistant facts, general knowledge.\n"
    "Format: one fact per line, starting with 'User '.\n"
    "Example: 'User prefers TypeScript over JavaScript for new projects.'\n"
    "If no useful facts: reply with exactly NONE"
)

# ── Models ────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    model: str | None = None
    temperature: float = 0.7
    max_tokens: int = 4096
    stream: bool = True
    conversation_id: str | None = None
    user_id: str | None = None  # passed by Supabase Edge Function after JWT verification

class MemoryRequest(BaseModel):
    action: str  # save | search | forget
    user_id: str
    conversation_id: str | None = None
    user_message: str | None = None
    assistant_message: str | None = None
    query: str | None = None
    intent: str | None = None
    limit: int = 5
    threshold: float = 0.65

# ── Helpers ───────────────────────────────────────────────────────────────────

async def classify_intent(msg: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.post(
                AI_API_URL,
                headers={"Authorization": f"Bearer {AI_API_KEY}"},
                json={
                    "model": "google/gemini-flash-1.5",
                    "messages": [
                        {"role": "system", "content": INTENT_CLASSIFIER_PROMPT},
                        {"role": "user", "content": msg[:600]},
                    ],
                    "max_tokens": 5,
                    "temperature": 0,
                },
            )
            if r.status_code != 200:
                return "general"
            raw = r.json()["choices"][0]["message"]["content"].strip().lower()
            return raw if raw in ("code", "security", "data_analysis", "writing") else "general"
    except Exception:
        return "general"


async def generate_embedding(text: str) -> list[float] | None:
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.post(
                EMBED_URL,
                headers={"Authorization": f"Bearer {AI_API_KEY}"},
                json={"model": "text-embedding-3-small", "input": text[:2000]},
            )
            if r.status_code != 200:
                return None
            return r.json()["data"][0]["embedding"]
    except Exception:
        return None


async def retrieve_memories(user_id: str, query: str) -> list[str]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return []
    embedding = await generate_embedding(query)
    if not embedding:
        return []
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/search_aria_memories",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "p_user_id": user_id,
                    "p_embedding": embedding,
                    "p_limit": 5,
                    "p_threshold": 0.65,
                },
            )
            if r.status_code != 200:
                return []
            rows = r.json()
            return [row["content"] for row in rows if row.get("content")]
    except Exception as e:
        log.warning("retrieve_memories error: %s", e)
        return []


async def extract_and_save_memories(
    user_id: str,
    user_msg: str,
    assistant_msg: str,
    intent: str,
    conversation_id: str | None,
) -> None:
    """Background task: extract facts, embed, store in Supabase aria_memories."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return
    try:
        # 1. Extract facts
        async with httpx.AsyncClient(timeout=12.0) as client:
            r = await client.post(
                AI_API_URL,
                headers={"Authorization": f"Bearer {AI_API_KEY}"},
                json={
                    "model": "google/gemini-flash-1.5",
                    "messages": [
                        {"role": "system", "content": MEMORY_EXTRACT_PROMPT},
                        {
                            "role": "user",
                            "content": f'User said: "{user_msg[:800]}"\n\nAssistant replied: "{assistant_msg[:400]}"',
                        },
                    ],
                    "max_tokens": 300,
                    "temperature": 0,
                },
            )
        if r.status_code != 200:
            return
        text = r.json()["choices"][0]["message"]["content"].strip()
        if text == "NONE":
            return

        facts = [
            line.strip()
            for line in text.splitlines()
            if line.strip().startswith("User ") and 10 < len(line.strip()) < 300
        ][:5]

        if not facts:
            return

        # 2. Embed each fact and upsert
        async with httpx.AsyncClient(timeout=20.0) as client:
            for fact in facts:
                emb = await generate_embedding(fact)
                row = {
                    "user_id": user_id,
                    "content": fact,
                    "embedding": emb,
                    "topic": intent,
                    "importance": 0.5,
                    "metadata": {"source_intent": intent, "conversation_id": conversation_id},
                }
                await client.post(
                    f"{SUPABASE_URL}/rest/v1/aria_memories",
                    headers={
                        "apikey": SUPABASE_SERVICE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                        "Content-Type": "application/json",
                        "Prefer": "return=minimal",
                    },
                    json=row,
                )

        # 3. Save messages to ai_chat_messages
        if conversation_id:
            msgs = [
                {
                    "user_id": user_id,
                    "role": "user",
                    "content": user_msg,
                    "tokens_used": 0,
                    "model": AI_DEFAULT_MODEL,
                    "intent": intent,
                    "conversation_id_v2": conversation_id,
                },
                {
                    "user_id": user_id,
                    "role": "assistant",
                    "content": assistant_msg,
                    "tokens_used": 0,
                    "model": AI_DEFAULT_MODEL,
                    "intent": intent,
                    "conversation_id_v2": conversation_id,
                },
            ]
            async with httpx.AsyncClient(timeout=6.0) as client:
                await client.post(
                    f"{SUPABASE_URL}/rest/v1/ai_chat_messages",
                    headers={
                        "apikey": SUPABASE_SERVICE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                        "Content-Type": "application/json",
                        "Prefer": "return=minimal",
                    },
                    json=msgs,
                )
    except Exception as e:
        log.warning("extract_and_save_memories error: %s", e)


async def stream_from_ai_api(
    system_prompt: str,
    messages: list[ChatMessage],
    model: str,
    temperature: float,
    max_tokens: int,
) -> AsyncIterator[bytes]:
    """Stream SSE from upstream AI API and forward to client."""
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system_prompt}]
        + [{"role": m.role, "content": m.content} for m in messages],
        "stream": True,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=5.0)) as client:
        async with client.stream(
            "POST",
            AI_API_URL,
            headers={
                "Authorization": f"Bearer {AI_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        ) as resp:
            if resp.status_code != 200:
                error_body = await resp.aread()
                log.error("AI API error %d: %s", resp.status_code, error_body[:200])
                raise HTTPException(502, "AI service error")
            async for chunk in resp.aiter_bytes():
                yield chunk

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0", "model": AI_DEFAULT_MODEL}


@app.post("/v1/chat/completions")
async def chat_completions(request: Request, body: ChatRequest):
    verify_server_key(request)

    if not body.messages:
        raise HTTPException(400, "messages array is required")

    # Strip client-injected system messages
    context = [m for m in body.messages if m.role in ("user", "assistant")][-40:]
    last_user = next((m.content for m in reversed(context) if m.role == "user"), "")

    user_id: str | None = body.user_id

    # ── Orchestrator: intent + memories in parallel ───────────────────────────
    intent, memories = await asyncio.gather(
        classify_intent(last_user) if last_user else asyncio.coroutine(lambda: "general")(),
        retrieve_memories(user_id, last_user) if (user_id and last_user) else asyncio.coroutine(lambda: [])(),
    )

    # ── Build specialized prompt with memory context ──────────────────────────
    system_prompt = SPECIALIZED_PROMPTS.get(intent, SPECIALIZED_PROMPTS["general"])
    if memories:
        memory_block = "\n".join(f"- {m}" for m in memories)
        system_prompt += (
            f"\n\n## What I know about you\n{memory_block}\n\n"
            "Use this context to personalize your response. Do not mention that you have memory unless asked."
        )

    model = body.model or AI_DEFAULT_MODEL
    log.info("chat user_id=%s intent=%s memories=%d model=%s", user_id, intent, len(memories), model)

    # ── Stream response ───────────────────────────────────────────────────────
    async def sse_generator() -> AsyncIterator[bytes]:
        accumulated = []
        try:
            async for chunk in stream_from_ai_api(system_prompt, context, model, body.temperature, body.max_tokens):
                if chunk:
                    accumulated.append(chunk)
                    yield chunk
        finally:
            # Background: extract memories after streaming completes
            if user_id and last_user and accumulated:
                full_response = b"".join(accumulated).decode("utf-8", errors="replace")
                # Parse accumulated SSE to get text (best-effort)
                response_text = ""
                for line in full_response.splitlines():
                    if line.startswith("data: ") and line != "data: [DONE]":
                        try:
                            data = json.loads(line[6:])
                            delta = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            response_text += delta
                        except Exception:
                            pass
                if response_text:
                    asyncio.create_task(
                        extract_and_save_memories(
                            user_id, last_user, response_text, intent, body.conversation_id
                        )
                    )

    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",  # disable Nginx buffering for SSE
        "X-ARIA-Intent": intent,
        "X-ARIA-Memories": str(len(memories)),
        "X-ARIA-Backend": "vps",
    }
    return StreamingResponse(sse_generator(), media_type="text/event-stream", headers=headers)


@app.post("/v1/memory")
async def memory_endpoint(request: Request, body: MemoryRequest):
    verify_server_key(request)

    if body.action == "search":
        memories = await retrieve_memories(body.user_id, body.query or "")
        return {"ok": True, "memories": memories}

    if body.action == "save":
        if body.user_message and body.assistant_message:
            asyncio.create_task(
                extract_and_save_memories(
                    body.user_id,
                    body.user_message,
                    body.assistant_message,
                    body.intent or "general",
                    body.conversation_id,
                )
            )
        return {"ok": True}

    if body.action == "forget":
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            return {"ok": False, "error": "Supabase not configured"}
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.delete(
                f"{SUPABASE_URL}/rest/v1/aria_memories?user_id=eq.{body.user_id}",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                },
            )
        return {"ok": r.status_code in (200, 204)}

    raise HTTPException(400, f"Unknown action: {body.action}")
