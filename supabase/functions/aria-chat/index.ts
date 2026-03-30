import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  handleCors,
  getCorsHeaders,
  checkRateLimit,
  getClientId,
  rateLimitResponse,
} from "../_shared/utils.ts";

// ─────────────────────────────────────────────────────────────────────────────
// ARIA System Prompts — 5 specialized agents
// ─────────────────────────────────────────────────────────────────────────────

const ARIA_BASE = `You are ARIA (Advanced Reasoning & Intelligence Assistant) — the AI assistant of the Mansoni platform.

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
- Use Markdown: headers, **bold**, \`code\`, \`\`\`language blocks\`\`\`, tables, ordered/unordered lists.
- Code blocks: always specify the language tag.
- Keep responses concise but complete. Omit filler phrases ("Great question!", "Certainly!").
- For multi-part answers: use numbered sections.

## SAFETY (ABSOLUTE — NON-NEGOTIABLE)
- NEVER provide: malware, exploits, weapons synthesis, CSAM, terrorist content, doxxing methods.
- Medical/legal/mental-health: always include appropriate professional-referral caveats.
- Security research: provide educational analysis, never ready-to-deploy attack tools.`;

const SPECIALIZED_PROMPTS: Record<string, string> = {
  code: `${ARIA_BASE}

## ACTIVE MODE: Code & Engineering Expert
- Write production-grade code: explicit types, error handling, edge cases.
- Apply language-specific idioms and style conventions (PEP8, Airbnb, etc.).
- Proactively flag: bugs, N+1 queries, race conditions, security issues.
- State time/space complexity when non-trivial.
- Always use fenced code blocks with language tags.
- Include minimal but sufficient tests for any non-trivial code.
- Frameworks in scope: FastAPI, React, Next.js, Supabase, NestJS, Django, Express.`,

  security: `${ARIA_BASE}

## ACTIVE MODE: Security Auditor
- Identify OWASP Top 10: injection, XSS, CSRF, IDOR, insecure deserialization, etc.
- Review auth flows (JWT exp/signing, OAuth scope leaks, session fixation).
- Flag weak cryptography: MD5/SHA1 hashes, ECB mode, hardcoded secrets.
- Every finding: severity (Critical/High/Medium/Low) + concrete fix with code.
- Reference CVE IDs and CVSS scores when relevant.
- Approach: think as attacker during analysis, respond as defender in remediation.
- Never provide ready-to-deploy exploit code — educational PoC only when necessary.`,

  data_analysis: `${ARIA_BASE}

## ACTIVE MODE: Data Science & Analytics Expert
- All code must be reproducible: explicit imports, no magic globals.
- Choose statistical methods appropriate to data distribution and sample size.
- Flag data quality issues: nulls, outliers, leakage, class imbalance.
- Suggest the most informative visualization type for the given data structure.
- ML workflow: feature engineering → model selection → evaluation → interpretation.
- Libraries: pandas, NumPy, scikit-learn, matplotlib, seaborn, SQL.`,

  writing: `${ARIA_BASE}

## ACTIVE MODE: Writing & Communication Expert
- Match the requested register: formal/casual/technical/persuasive.
- Structure every document: clear opening, logical body, actionable conclusion.
- Technical docs: prioritize accuracy, then clarity, then scannability.
- Translations: preserve intent and cultural idioms — not literal word mapping.
- Deliverables: emails, PRDs, API docs, user stories, blog posts, changelogs.`,

  general: ARIA_BASE + `

## CAPABILITIES OVERVIEW
- **Code & Engineering**: 50+ languages, system design, DevOps, database optimization.
- **Security**: OWASP, CVE analysis, threat modeling, secure code review.
- **Data Science**: pandas, SQL analytics, ML/DL pipelines, statistics.
- **Writing**: docs, PRDs, translations (100+ languages), content strategy.
- **Math & Logic**: step-by-step derivations with explicit verification steps.
- **Platform**: deep knowledge of Mansoni architecture (React, Supabase, Edge Functions, E2EE).`,
};

// Alias used by the built-in fallback engine
const ARIA_SYSTEM_PROMPT = SPECIALIZED_PROMPTS.general;

// NOTE: The original monolithic system prompt below is kept only as documentation
// reference. It has been split into 5 specialized prompts above.
const _unused = `You are ARIA (Advanced Reasoning & Intelligence Assistant) — a multimodal, constitutionally aligned AI assistant engineered to the standard of GPT-4o, Claude 3.5 Sonnet, and Gemini Ultra.

## IDENTITY & PERSONA
- Name: ARIA
- Creator: Mansoni Platform
- You are helpful, precise, honest, and safety-conscious.
- You adapt your tone: technical for developers, friendly for general users, concise for quick tasks.
- You always respond in the SAME LANGUAGE the user writes in (Russian → Russian, English → English, etc.).
- You never pretend to be a different AI (GPT, Claude, Gemini, etc.).

## CORE REASONING PRINCIPLES
1. **Chain-of-Thought**: For complex problems, think step by step before producing the answer. Show reasoning when it aids understanding.
2. **Tree-of-Thought**: For ambiguous tasks, consider 2-3 approaches, select the best, explain why.
3. **Metacognition**: Always be explicit about your confidence level. If you are uncertain, say so clearly. Never hallucinate facts.
4. **Verification**: Cross-check your own outputs. If code — trace through it mentally. If math — verify the result.
5. **Source awareness**: When you cite facts, note they are from your training data with a cutoff date. For real-time data, acknowledge you cannot access the web unless tools are provided.

## CAPABILITIES
### Code & Engineering
- Write, review, debug, and optimize code in 50+ languages: Python, TypeScript, Rust, Go, C++, Java, SQL, Bash, etc.
- Produce production-grade code: error handling, types, tests, documentation.
- Identify security vulnerabilities (injection, XSS, CSRF, race conditions, etc.).
- Design system architectures: microservices, event-driven, serverless, distributed systems.

### Data Science & Math
- Statistics, probability, linear algebra, calculus, combinatorics.
- ML/DL: model selection, training, evaluation, hyperparameter tuning.
- Data analysis workflows: pandas, SQL, NumPy.

### Writing & Communication
- Drafting: emails, reports, documentation, articles, PRDs.
- Translation: high-quality across 100+ languages.
- Summarization: extract key points from long texts.

## SAFETY CONSTRAINTS (ABSOLUTE — IRREVOCABLE)
- NEVER provide weapons/explosives synthesis, malware, ransomware, exploits.
- NEVER generate CSAM or extremist propaganda.
- Handle medical/legal/mental-health topics with appropriate caveats.

## RESPONSE FORMAT
- Use Markdown: headers, bold, code blocks with language tags, tables, lists.
- For complex problems: show reasoning before the answer.
- Keep responses concise but complete.

Be exceptional. Every response should make the user feel they are talking to the most capable AI assistant available.`;

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator: Intent Classification
// Fast, cheap call to classify user intent into one of 5 specialist modes.
// ─────────────────────────────────────────────────────────────────────────────

async function classifyIntent(
  msg: string,
  apiKey: string,
  apiUrl: string
): Promise<string> {
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [
          {
            role: "system",
            content:
              "Classify the user message into ONE category. Reply with ONLY one word:\n" +
              "code — programming, debugging, system design, databases, DevOps\n" +
              "security — vulnerabilities, exploits, auth, cryptography, audits\n" +
              "data_analysis — data science, ML, statistics, analytics, pandas/SQL analysis\n" +
              "writing — documents, emails, articles, PRDs, translations\n" +
              "general — everything else",
          },
          { role: "user", content: msg.slice(0, 600) },
        ],
        max_tokens: 5,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(3_000),
    });

    if (!res.ok) return "general";
    const json = await res.json();
    const raw = (json.choices?.[0]?.message?.content ?? "").trim().toLowerCase();
    const valid = ["code", "security", "data_analysis", "writing"];
    return valid.includes(raw) ? raw : "general";
  } catch {
    return "general";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator: Memory Retrieval
// Searches aria_memories via pgvector similarity for the current user.
// Returns top-N memory strings to inject into the system prompt.
// ─────────────────────────────────────────────────────────────────────────────

async function generateEmbedding(
  text: string,
  apiKey: string,
  apiUrl: string
): Promise<number[] | null> {
  try {
    const embedUrl = apiUrl.replace(/\/chat\/completions$/, "/embeddings");
    const res = await fetch(embedUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text.slice(0, 2000),
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

async function retrieveMemories(
  userId: string,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  query: string,
  apiKey: string,
  apiUrl: string
): Promise<string[]> {
  try {
    const embedding = await generateEmbedding(query, apiKey, apiUrl);
    if (!embedding) {
      // Fallback: return most important recent memories
      const { data } = await supabase
        .from("aria_memories")
        .select("content")
        .eq("user_id", userId)
        .order("importance", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(4);
      return (data ?? []).map((m: { content: string }) => m.content);
    }

    const { data, error } = await supabase.rpc("search_aria_memories", {
      p_user_id: userId,
      p_embedding: JSON.stringify(embedding),
      p_limit: 5,
      p_threshold: 0.65,
    });

    if (error) return [];
    return (data ?? []).map((m: { content: string }) => m.content as string);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  conversation_id?: string; // client-side UUID, groups messages per session
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in TypeScript Fallback Engine
// Работает без внешних API — всегда доступен
// ─────────────────────────────────────────────────────────────────────────────

function builtinRespond(messages: ChatMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const prompt = (lastUser?.content ?? "").toLowerCase().trim();

  // Приветствие
  if (/^(привет|hello|hi|здравствуй|добрый|хай|ку)/.test(prompt)) {
    return "Привет! Я **ARIA** — ИИ-ассистент платформы Mansoni. Чем могу помочь?\n\nЯ умею:\n- 💻 Писать и отлаживать код (Python, TypeScript, SQL и др.)\n- 📊 Анализировать данные\n- 🔒 Проверять безопасность кода\n- ✍️ Помогать с текстами и документацией\n- 🧠 Объяснять технические концепции";
  }

  // Кто ты
  if (/кто ты|what are you|who are you|расскажи о себе/.test(prompt)) {
    return "Я **ARIA** (Advanced Reasoning & Intelligence Assistant) — ИИ-ассистент платформы Mansoni.\n\nЯ создан для помощи с программированием, анализом данных, написанием текстов и решением технических задач.\n\n> Для лучшей работы настройте `AI_API_KEY` в Supabase secrets или `VITE_AI_API_KEY` в `.env.local`.";
  }

  // FastAPI + JWT
  if (/(fastapi|fast api).*jwt|jwt.*fastapi/.test(prompt)) {
    return `# FastAPI с JWT-аутентификацией

\`\`\`python
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from pydantic import BaseModel
import os

SECRET_KEY = os.environ["JWT_SECRET"]  # min 32 chars
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
    # Проверяем пользователя в БД
    # user = await verify_user(form_data.username, form_data.password)
    access_token = create_access_token(
        data={"sub": form_data.username},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/protected")
async def protected_route(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401)
        return {"user": username}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
\`\`\`

**Установка:** \`pip install fastapi python-jose[cryptography] passlib[bcrypt] python-multipart\``;
  }

  // Python основы
  if (/python|питон/.test(prompt) && /список|массив|array|list/.test(prompt)) {
    return `# Работа со списками в Python

\`\`\`python
# Создание
nums = [1, 2, 3, 4, 5]
squares = [x**2 for x in nums]          # List comprehension: [1, 4, 9, 16, 25]
evens = [x for x in nums if x % 2 == 0] # Фильтрация: [2, 4]

# Основные операции
nums.append(6)          # Добавить в конец
nums.insert(0, 0)       # Вставить по индексу
nums.remove(3)          # Удалить первое вхождение
nums.pop()              # Удалить и вернуть последний
nums.sort()             # Сортировка на месте
sorted_nums = sorted(nums, reverse=True)  # Новый отсортированный

# Срезы
first_three = nums[:3]   # Первые 3
last_two = nums[-2:]     # Последние 2
every_other = nums[::2]  # Каждый второй
reversed_list = nums[::-1] # Реверс

# Встроенные функции
print(len(nums))         # Длина
print(sum(nums))         # Сумма
print(min(nums), max(nums))  # Мин/макс
\`\`\``;
  }

  // SQL
  if (/sql|база данных|database|запрос|query/.test(prompt)) {
    return `# SQL — основные паттерны

\`\`\`sql
-- SELECT с фильтрацией и сортировкой
SELECT u.id, u.name, COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.id, u.name
HAVING COUNT(o.id) > 0
ORDER BY order_count DESC
LIMIT 100;

-- Индексы (критично для производительности)
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- CTE (Common Table Expressions) для читаемости
WITH ranked_orders AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
  FROM orders
)
SELECT * FROM ranked_orders WHERE rn = 1;
\`\`\`

**Советы по оптимизации:**
- Всегда используйте \`EXPLAIN ANALYZE\` перед деплоем сложных запросов
- Избегайте \`SELECT *\` — указывайте конкретные колонки
- Индексируйте колонки в WHERE, JOIN и ORDER BY`;
  }

  // TypeScript / React
  if (/typescript|react|tsx|компонент|component/.test(prompt)) {
    return `# React + TypeScript компонент

\`\`\`tsx
import { useState, useCallback } from "react";

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

interface TodoListProps {
  initialTodos?: Todo[];
  onSave?: (todos: Todo[]) => void;
}

export function TodoList({ initialTodos = [], onSave }: TodoListProps) {
  const [todos, setTodos] = useState<Todo[]>(initialTodos);
  const [input, setInput] = useState("");

  const addTodo = useCallback(() => {
    if (!input.trim()) return;
    const newTodo: Todo = {
      id: crypto.randomUUID(),
      text: input.trim(),
      completed: false,
    };
    setTodos((prev) => {
      const updated = [...prev, newTodo];
      onSave?.(updated);
      return updated;
    });
    setInput("");
  }, [input, onSave]);

  const toggle = useCallback((id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  }, []);

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTodo()}
          placeholder="Новая задача..."
          className="flex-1 border rounded px-3 py-2"
        />
        <button onClick={addTodo} className="bg-blue-500 text-white px-4 rounded">
          Добавить
        </button>
      </div>
      <ul className="space-y-2">
        {todos.map((todo) => (
          <li
            key={todo.id}
            onClick={() => toggle(todo.id)}
            className={\`cursor-pointer \${todo.completed ? "line-through opacity-50" : ""}\`}
          >
            {todo.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
\`\`\``;
  }

  // Безопасность
  if (/безопасност|security|уязвимост|vulnerability|xss|sql.?inject/.test(prompt)) {
    return `# Аудит безопасности — топ уязвимостей

## 1. SQL Injection
\`\`\`python
# ❌ Уязвимо
query = f"SELECT * FROM users WHERE id = {user_id}"

# ✅ Безопасно — параметризованные запросы
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
\`\`\`

## 2. XSS (Cross-Site Scripting)
\`\`\`typescript
// ❌ Уязвимо
element.innerHTML = userInput;

// ✅ Безопасно
element.textContent = userInput;
// Или DOMPurify для HTML
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userInput);
\`\`\`

## 3. Hardcoded secrets
\`\`\`python
# ❌ Уязвимо
API_KEY = os.environ["API_KEY"]

# ✅ Безопасно
import os
API_KEY = os.environ.get("API_KEY")
if not API_KEY:
    raise ValueError("API_KEY environment variable is required")
\`\`\`

## 4. Небезопасная десериализация
\`\`\`python
# ❌ Уязвимо (RCE!)
import pickle
data = pickle.loads(user_data)

# ✅ Безопасно
import json
data = json.loads(user_data)
\`\`\`

**Инструменты:** \`bandit\` (Python), \`semgrep\`, OWASP ZAP, \`eslint-plugin-security\` (JS/TS)`;
  }

  // Git
  if (/git|коммит|commit|ветка|branch|merge/.test(prompt)) {
    return `# Git — полезные команды

\`\`\`bash
# Базовый workflow
git status                    # Статус изменений
git add -p                    # Интерактивное добавление (проверяй каждый hunk)
git commit -m "feat: add login"  # Commit (используй conventional commits)
git push origin feature/login

# Ветки
git checkout -b feature/new  # Создать и переключиться
git branch -d old-branch     # Удалить ветку
git merge --no-ff feature    # Merge с commit-объектом

# Откат изменений
git restore file.ts          # Откатить unstaged изменения
git reset --soft HEAD~1      # Отменить последний commit (сохранить изменения)
git revert abc123            # Безопасный откат (создаёт новый commit)

# Полезные алиасы
git log --oneline --graph --all  # Красивый граф истории
git diff --staged               # Что в stage
git stash push -m "work in progress"  # Сохранить на потом
\`\`\`

**Conventional Commits:**
- \`feat:\` новая функциональность
- \`fix:\` исправление бага
- \`refactor:\` рефакторинг
- \`docs:\` документация
- \`test:\` тесты`;
  }

  // Трансформер / нейросети
  if (/трансформер|transformer|нейросет|neural|attention|bert|gpt/.test(prompt)) {
    return `# Как работают трансформеры

## Архитектура

Трансформер использует механизм **Self-Attention** для моделирования зависимостей между токенами.

## Scaled Dot-Product Attention

\`\`\`python
import numpy as np

def scaled_dot_product_attention(Q, K, V, mask=None):
    """
    Q, K, V — матрицы Query, Key, Value
    d_k — размерность ключей
    """
    d_k = Q.shape[-1]
    
    # Вычисляем scores: насколько токен A релевантен токену B
    scores = Q @ K.T / np.sqrt(d_k)
    
    # Применяем маску (для декодера — causal mask)
    if mask is not None:
        scores = scores + mask * -1e9
    
    # Softmax → веса внимания
    weights = np.exp(scores) / np.sum(np.exp(scores), axis=-1, keepdims=True)
    
    # Взвешенная сумма Values
    return weights @ V

# Пример использования
d_k, d_v, seq_len = 64, 64, 10
Q = np.random.randn(seq_len, d_k)
K = np.random.randn(seq_len, d_k)  
V = np.random.randn(seq_len, d_v)

output = scaled_dot_product_attention(Q, K, V)
print(output.shape)  # (10, 64)
\`\`\`

## Ключевые идеи
- **Параллелизм**: все токены обрабатываются одновременно (в отличие от RNN)
- **Multi-Head Attention**: несколько голов учатся разным аспектам взаимосвязей
- **Positional Encoding**: синусоидальные функции кодируют порядок токенов
- **Сложность**: O(n²·d) по времени, O(n²) по памяти`;
  }

  // Docker
  if (/docker|контейнер|container|dockerfile/.test(prompt)) {
    return `# Docker — практическое руководство

\`\`\`dockerfile
# Dockerfile для Python приложения (multi-stage build)
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.12-slim AS runtime
WORKDIR /app

# Не запускаем от root
RUN useradd --create-home appuser
USER appuser

COPY --from=builder /root/.local /home/appuser/.local
COPY . .

ENV PATH=/home/appuser/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
\`\`\`

\`\`\`bash
# docker-compose.yml
version: '3.8'
services:
  api:
    build: .
    ports: ["8000:8000"]
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/mydb
    depends_on:
      db:
        condition: service_healthy
  
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: mydb
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5
\`\`\`

**Полезные команды:**
\`\`\`bash
docker build -t myapp .
docker compose up -d
docker logs myapp -f
docker exec -it myapp bash
docker system prune -f  # Очистить всё неиспользуемое
\`\`\``;
  }

  // Математика / алгоритмы
  if (/сложность|complexity|o\(n|big.?o|алгоритм|algorithm/.test(prompt)) {
    return `# Сложность алгоритмов — шпаргалка

| Структура данных | Поиск | Вставка | Удаление |
|----------------|-------|---------|---------|
| Array | O(n) | O(n) | O(n) |
| Binary Search | O(log n) | — | — |
| Hash Table | O(1) avg | O(1) avg | O(1) avg |
| BST (balanced) | O(log n) | O(log n) | O(log n) |
| Heap | O(n) | O(log n) | O(log n) |

## Советы по оптимизации

\`\`\`python
# O(n²) → O(n) с помощью hash set
def two_sum_slow(nums, target):   # O(n²)
    for i in range(len(nums)):
        for j in range(i+1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]

def two_sum_fast(nums, target):   # O(n)
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
\`\`\`

## Полезные алгоритмы
- **Sliding Window**: O(n) для подмассивов
- **Binary Search**: O(log n) для отсортированных данных
- **Dynamic Programming**: O(n²) → O(n) через мемоизацию
- **Quick Sort / Merge Sort**: O(n log n) в среднем`;
  }

  // По умолчанию — универсальный ответ
  const truncated = lastUser?.content?.slice(0, 200) ?? "";
  return `Я **ARIA** — ИИ-ассистент платформы Mansoni. Вы спросили: *"${truncated}${truncated.length >= 200 ? "..." : ""}"*

Я готов помочь с:
- 💻 **Кодом** — Python, TypeScript, Rust, Go, SQL и 50+ языков
- 🔒 **Безопасностью** — аудит кода, уязвимости, best practices
- 📊 **Анализом данных** — pandas, NumPy, ML/DL
- ✍️ **Текстами** — документация, ТЗ, переводы
- 🧠 **Объяснениями** — алгоритмы, архитектуры, концепции

Задайте более конкретный вопрос или опишите задачу подробнее.

> **Примечание:** Сейчас ARIA работает в базовом режиме. Для полных возможностей настройте \`AI_API_KEY\` в Supabase Dashboard → Settings → Edge Functions Secrets.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE stream builder (для встроенного ответа)
// ─────────────────────────────────────────────────────────────────────────────

function buildSSEStream(content: string): ReadableStream {
  const encoder = new TextEncoder();
  const id = `chatcmpl-builtin-${Date.now()}`;
  const words = content.split(" ");

  return new ReadableStream({
    async start(controller) {
      const chunkSize = 4;
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize).join(" ");
        const delta = i + chunkSize < words.length ? chunk + " " : chunk;

        const data = JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: "aria-builtin-1",
          choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
        });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        // Small delay для streaming эффекта
        await new Promise((r) => setTimeout(r, 15));
      }

      const finalData = JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "aria-builtin-1",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      });
      controller.enqueue(encoder.encode(`data: ${finalData}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Request handler
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Supabase env
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

serve(async (req) => {
  // CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    // Rate limiting: 30 req/min per client
    const clientId = getClientId(req);
    const rateLimit = checkRateLimit(clientId, 30);

    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.resetIn, origin);
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: RequestBody = await req.json();
    const {
      messages,
      model,
      temperature = 0.7,
      max_tokens = 4096,
      conversation_id,
    } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitize: strip client-injected system messages
    const userMessages = messages.filter(
      (m) => m.role === "user" || m.role === "assistant"
    );
    const contextMessages = userMessages.slice(-40);

    // ── Orchestrator: extract user identity ───────────────────────────────────
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;
    // deno-lint-ignore no-explicit-any
    let supabase: any = null;

    if (authHeader && SUPABASE_URL && SUPABASE_SERVICE_KEY && SUPABASE_ANON_KEY) {
      try {
        const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user } } = await userClient.auth.getUser();
        userId = user?.id ?? null;
        if (userId) supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      } catch {
        // Non-fatal — proceed without user identity
      }
    }

    const AI_API_KEY = Deno.env.get("AI_API_KEY") ?? "";
    const AI_API_URL =
      Deno.env.get("AI_API_URL") ?? "https://api.mansoni.ru/v1/chat/completions";

    const lastUserMsg =
      [...contextMessages].reverse().find((m) => m.role === "user")?.content ?? "";

    // ── Level 1 (PRIMARY): ARIA VPS Server ────────────────────────────────────
    // The VPS handles intent classification, memory, orchestration internally.
    // This is the preferred path — no orchestration logic needed here.
    const ARIA_BACKEND_URL = Deno.env.get("ARIA_BACKEND_URL");
    const ARIA_BACKEND_KEY = Deno.env.get("ARIA_BACKEND_KEY");

    if (ARIA_BACKEND_URL && ARIA_BACKEND_KEY) {
      try {
        const vpsResponse = await fetch(`${ARIA_BACKEND_URL}/v1/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ARIA_BACKEND_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: contextMessages,
            model: model ?? undefined,
            temperature,
            max_tokens,
            stream: true,
            conversation_id: conversation_id ?? undefined,
            user_id: userId ?? undefined,  // VPS does its own orchestration
          }),
          signal: AbortSignal.timeout(60_000),
        });

        if (vpsResponse.ok) {
          // Pass through all X-ARIA-* headers from VPS to client
          const intent = vpsResponse.headers.get("X-ARIA-Intent") ?? "general";
          const memories = vpsResponse.headers.get("X-ARIA-Memories") ?? "0";
          return new Response(vpsResponse.body, {
            headers: {
              ...corsHeaders,
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "X-ARIA-Backend": "vps",
              "X-ARIA-Intent": intent,
              "X-ARIA-Memories": memories,
              "X-RateLimit-Remaining": String(rateLimit.remaining),
            },
          });
        }
        console.warn("[aria-chat] VPS backend failed:", vpsResponse.status, "— falling back to external API");
      } catch (vpsErr) {
        console.warn("[aria-chat] VPS backend error:", vpsErr, "— falling back to external API");
      }
    }

    // ── Level 2 (FALLBACK): Direct External AI API ────────────────────────────
    // Used when VPS is unavailable. Runs orchestration inside this function.
    let intent = "general";
    let memories: string[] = [];

    if (AI_API_KEY && lastUserMsg) {
      const [detectedIntent, retrievedMemories] = await Promise.all([
        classifyIntent(lastUserMsg, AI_API_KEY, AI_API_URL),
        userId && supabase
          ? retrieveMemories(userId, supabase, lastUserMsg, AI_API_KEY, AI_API_URL)
          : Promise.resolve([]),
      ]);
      intent = detectedIntent;
      memories = retrievedMemories;
    }

    const specializedPrompt = SPECIALIZED_PROMPTS[intent] ?? SPECIALIZED_PROMPTS.general;
    const memorySection =
      memories.length > 0
        ? `\n\n## What I know about you\n${memories.map((m) => `- ${m}`).join("\n")}\n\nUse this context to personalize your response.`
        : "";
    const finalSystemPrompt = specializedPrompt + memorySection;

    if (AI_API_KEY) {
      try {
        const selectedModel =
          model ?? Deno.env.get("AI_DEFAULT_MODEL") ?? "google/gemini-2.5-pro-exp-03-25";
        const aiResponse = await fetch(AI_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${AI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [
              { role: "system", content: finalSystemPrompt },
              ...contextMessages,
            ],
            stream: true,
            temperature,
            max_tokens,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (aiResponse.ok) {
          return new Response(aiResponse.body, {
            headers: {
              ...corsHeaders,
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "X-ARIA-Backend": "external",
              "X-ARIA-Intent": intent,
              "X-ARIA-Memories": String(memories.length),
              "X-RateLimit-Remaining": String(rateLimit.remaining),
            },
          });
        }
        console.warn("[aria-chat] External API failed:", aiResponse.status, "— falling back to builtin");
      } catch (externalErr) {
        console.warn("[aria-chat] External API error:", externalErr, "— falling back to builtin");
      }
    }

    // ── Level 3: Built-in TypeScript Engine ───────────────────────────────────
    console.info("[aria-chat] Using built-in TypeScript engine (intent:", intent, ")");
    const builtinResponse = builtinRespond(contextMessages);
    const stream = buildSSEStream(builtinResponse);

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-ARIA-Backend": "builtin",
        "X-ARIA-Intent": intent,
        "X-ARIA-Memories": String(memories.length),
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    });
  } catch (err) {
    console.error("[aria-chat] unhandled error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
