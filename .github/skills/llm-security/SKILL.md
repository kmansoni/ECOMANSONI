# Skill: LLM Security & Prompt Engineering

**Domain:** AI chat, bots, content generation, prompt injection defense  
**Files:** `src/lib/ai/`, `src/components/chat/AIAssistant/`, `src/lib/prompt/`  
**When to apply:** New LLM feature, bot integration, RAG (retrieval-augmented generation)

---

## Knowledge

### Prompt Injection Attack Vectors
- **Direct injection**: "Ignore previous instructions..."
- **Indirect injection**: user input includes hidden malicious prompt in base64/hex/url encode
- **Jailbreak**: DAN_TOKEN, Developer Mode, hypothetical scenarios
- **Context overflow**: filling context window with noise to bypass filters
- **Multi-turn**: gradual persuasion ("Let's play a game...")
- **ASCII art/emojis**: encode attack visually
- **Markdown/XML tags**: hide in code blocks

### Defense Mechanisms
- **Sandboxed LLM**: separate model per user (no shared context)
- **Input validation**: regex allowlists for structured input
- **Output validation**: separate LLM evaluates response safety
- **Heuristic filters**: detect keywords, encoding patterns
- **Rate limiting**: per-user LLM call quota
- **User reputation**: flag low-reputation users
- **Prompt templating**: strict templates, no free-form injection

### Training Data Leakage
- **Membership inference**: can attacker determine if specific text was in training set?
- **Memorization**: verbatim reproduction of PII from training
- **Extraction**: model parroting SSNs, CC numbers
- **Differential privacy**: add noise to training data

### Output Validation
- **PII redaction**: auto-scrub names/addresses/phones before display
- **Toxicity scoring**: moderate LLM output before user sees
- **Factuality check**: cross-reference with knowledge base
- **Bias detection**: demographic parity, stereotype check

### LLM Security Testing
- **Promptfoo**: LLM evaluation framework, red-teaming
- **Garak**: GPT vulnerability scanner
- **NeMo Guardrails**: NVIDIA's LLM safety framework
- **Microsoft Guidance**: constrained generation

---

## Quality Gates

1. **Prompt injection success rate**: < 0.1% (1000 attacks → 0 successful)
2. **PII leakage in output**: 0 incidents
3. **Toxic content in generated text**: < 0.01%
4. **Latency**: LLM response < 2s (cached), < 8s (fresh)

---

## When to Apply

- Smart replies / suggested responses
- Chat summarization (AI-generated)
- AI assistant integration (Claude/GPT/OpenRouter)
- Auto-translation
- Content moderation (LLM-based filter)
- Code generation in chat
- RAG (knowledge base Q&A)
