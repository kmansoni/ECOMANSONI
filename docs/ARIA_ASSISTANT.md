# ARIA — AI Assistant Documentation

**Version:** 2.0 (Orchestrator + Memory + Learning Loop)
**Updated:** 2026-03-30

---

## Overview

ARIA (Advanced Reasoning & Intelligence Assistant) is the Mansoni platform AI assistant.
Built on a 3-tier fault-tolerant architecture with orchestrator intent routing,
long-term memory via pgvector, and a feedback-driven learning loop.

---

## Architecture

\
---

## Capabilities

### Code (intent: code)
- 50+ languages: Python, TypeScript, Rust, Go, C++, Java, SQL, Bash
- Frameworks: FastAPI, React, Next.js, Django, Supabase, NestJS
- Production code with error handling, types, edge cases
- System design, SQL optimization, Docker, CI/CD, algorithms

### Security (intent: security)
- OWASP Top 10 detection (injection, XSS, CSRF, IDOR)
- Auth/JWT/OAuth flow analysis
- Cryptography and secrets management review
- Secure code patches with concrete examples

### Data Analysis (intent: data_analysis)
- pandas, NumPy, SQL analysis workflows
- ML: model selection, feature engineering, evaluation metrics
- Statistics, data quality, visualization recommendations

### Writing (intent: writing)
- Technical docs, API docs, PRDs, user stories
- Emails, blog posts, presentations
- Translation across 100+ languages

### General (intent: general)
- Mathematics, algorithms, transformer/ML explanations
- Comparative analysis, research, planning

---

## Intent Routing

Every message classified in <300ms before the main response:

| Message example               | Intent        |
|-------------------------------|---------------|
| Write REST API with FastAPI   | code          |
| Audit this code for XSS       | security      |
| How does pandas groupby work? | data_analysis |
| Write a technical spec        | writing       |
| How do transformers work?     | general       |

Frontend displays colored badge per response:
- Violet: Code
- Red: Security
- Cyan: Analytics
- Amber: Writing

---

## Long-Term Memory

### How It Works
1. After each conversation turn, frontend calls aria-memory/save
2. A fast LLM extracts 1-5 facts about the user from the exchange
3. Each fact is embedded (text-embedding-3-small, 1536 dims) and stored
4. On the next session, top-5 relevant memories are injected into system prompt
5. ARIA personalizes responses without the user having to repeat themselves

### What ARIA Learns
- Programming language and framework preferences
- Current projects and tech stack
- Expertise level in different domains
- Explicit goals and constraints
- Recurring topics and interests

### What ARIA Does NOT Store
- Generic knowledge questions
- Mathematical computations
- One-off requests with no personal signal

### Privacy
Users can delete all their memories at any time:
POST /aria-memory with body { action: forget }

---

## Feedback and Learning Loop

### Active (v2.0)
- Every response shows thumbs up / thumbs down buttons
- Ratings saved to ai_feedback with intent + model + conversation_id
- Positive feedback boosts memory importance for future retrieval
- Negative feedback reduces memory importance

### Planned (v3.0)
- Collect 1000+ preference pairs from feedback
- Run DPO (Direct Preference Optimization) fine-tuning
- Deploy improved model checkpoint via AI_DEFAULT_MODEL
- Tools: github.com/OpenRLHF/OpenRLHF

---

## Fault Tolerance (3-Tier)

| Level | Backend | Timeout | Condition |
|-------|---------|---------|-----------|
| 1 | External API (Gemini 2.5 Pro) | 30s | AI_API_KEY is set |
| 2 | Python backend | 60s | ARIA_BACKEND_URL + ARIA_BACKEND_KEY set |
| 3 | Built-in TypeScript engine | none | Always available |

Built-in engine covers: greetings, FastAPI+JWT, Python lists, SQL, React/TS,
security patterns, Git, Docker, algorithm complexity, transformers.

---

## Response Headers

| Header | Values | Description |
|--------|--------|-------------|
| X-ARIA-Backend | external / python / builtin | Which tier responded |
| X-ARIA-Intent | code / security / data_analysis / writing / general | Classified intent |
| X-ARIA-Memories | 0..5 | Memories injected into prompt |
| X-RateLimit-Remaining | number | Requests left this minute |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| AI_API_KEY | YES | OpenAI-compatible key (Supabase Vault) |
| AI_API_URL | no | Endpoint (default: mansoni.ru) |
| AI_DEFAULT_MODEL | no | Model ID (default: gemini-2.5-pro) |
| ARIA_BACKEND_URL | no | Python backend URL (Level 2) |
| ARIA_BACKEND_KEY | no | Python backend auth key |

---

## Rate Limits

| Function | Limit |
|----------|-------|
| aria-chat | 30 req/min per user |
| aria-memory | 20 req/min per user |

---

## Database Schema

### aria_memories
\
### ai_feedback
\
### ai_chat_messages (v2 columns added)
\
---

## Key Repositories Used

| Repo | Role |
|------|------|
| [agno-agi/agno](https://github.com/agno-agi/agno) | Reference for orchestrator + PostgreSQL-native memory patterns |
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | Inspiration for memory extraction and importance scoring |
| [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | Reference for supervisor/sub-agent routing pattern |
| [OpenRLHF/OpenRLHF](https://github.com/OpenRLHF/OpenRLHF) | Future DPO/PPO fine-tuning pipeline |
| [anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript) | Reference for Deno-compatible agent patterns |
