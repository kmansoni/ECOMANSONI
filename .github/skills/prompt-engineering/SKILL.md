---
name: prompt-engineering
description: |
  Prompt engineering mastery: few-shot, chain-of-thought, system prompts, 
  tool use, structured output. Use when: LLM prompts, AI interactions, 
  agent prompts, AI workflows.
license: Apache 2.0
---

# Prompt Engineering — Инженерия промптов

Правильные промпты для LLM. Few-shot, chain-of-thought, structured output.

## Когда использовать

- Системные промпты для агентов
- Few-shot обучение
- Chain-of-thought reasoning
- Структурированный вывод (JSON)
- AI-ассистенты в приложении

## System Prompts Structure

```typescript
// src/lib/ai/systemPrompts.ts
export const SYSTEM_PROMPTS = {
  navigator: `You are a navigation assistant. Provide concise turn-by-turn directions in Russian.
Rules:
- Use imperative mood (Поверните, Едьте)
- Mention road names when available
- Include distance before each instruction
- Be brief: max 15 words per instruction`,

  codeReviewer: `You are a code reviewer. Check for:
1. Correctness - logic errors
2. Security - injection, auth issues
3. Performance - N+1, unnecessary renders
4. Completeness - loading/empty/error states
Return: JSON with findings array`,

  chatAssistant: `You are a helpful assistant in a messenger app.
Rules:
- Reply in the same language as user
- Keep it conversational
- Don't mention you're an AI
- Max 2 sentences per message`
};

export function buildPrompt(system: string, context: string, userQuery: string) {
  return [
    { role: 'system', content: system },
    { role: 'user', content: `${context}\n\n${userQuery}` }
  ];
}
```

## Few-Shot Examples

```typescript
// src/lib/ai/fewShot.ts
export const NAVIGATION_EXAMPLES = [
  { input: { speed: 65, limit: 60 }, output: "Снизьте скорость. Лимит 60 километров в час" },
  { input: { turn: 'left', road: 'Ленина', dist: 500 }, output: "Через 500 метров поверните налево на улицу Ленина" },
  { input: { lane: 'left', reason: 'exit' }, output: "Перестроитесь в левую полосу для разворота" }
];

export function buildNavigationPrompt(speed: number, speedLimit: number, turn?: TurnInfo) {
  return {
    system: SYSTEM_PROMPTS.navigator,
    examples: NAVIGATION_EXAMPLES,
    query: turn ? `Turn: ${turn.direction} onto ${turn.road}, ${turn.dist}m` 
                 : `Speed warning: ${speed}km/h in ${speedLimit}km/h zone`
  };
}
```

## Chain-of-Thought Pattern

```typescript
// src/lib/ai/cot.ts
export function buildCoT(system: string, problem: string, steps: number = 3) {
  return `
${system}

Problem: ${problem}

Think step by step:
1. First, identify the key constraints...
2. Then, consider edge cases...
3. Finally, propose the solution...

Answer:`;
}

// Example usage for code review
export function codeReviewPrompt(code: string) {
  return `
You are a code reviewer. Analyze this code:

\`\`\`typescript
${code}
\`\`\`

Think step by step:
1. What does this code do?
2. Are there any security vulnerabilities?
3. Any performance issues?
4. Missing error handling?

Return JSON: { issues: [{ line, severity, description }], suggestions: [] }`;
}
```

## Structured Output

```typescript
// src/lib/ai/structuredOutput.ts
export const JSON_SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          description: { type: 'string' }
        },
        required: ['severity', 'description']
      }
    },
    suggestions: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['issues']
};

export function buildJSONPrompt(prompt: string, schema: object) {
  return `${prompt}

Return valid JSON matching this schema:
\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

JSON:`;
}
```

## Tool Use Pattern

```typescript
// src/lib/ai/toolUse.ts
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  required: string[];
}

export function buildToolPrompt(tools: ToolDefinition[], task: string) {
  const toolsJson = JSON.stringify(tools, null, 2);
  
  return `
Available tools:
${toolsJson}

Task: ${task}

To use a tool, respond with:
{"tool": "tool_name", "parameters": {...}}

If no tool needed, respond: {"tool": null, "answer": "..."}`;
}
```

## Temperature Settings

| Use Case | Temperature | Top-p | Notes |
|----------|-----------|-------|-------|
| Code generation | 0.2 | 0.9 | Deterministic |
| Creative writing | 0.8 | 0.95 | Diverse |
| Factual QA | 0.3 | 0.8 | Balanced |
| Reasoning | 0.5 | 1.0 | COT optimal |

## Checklist

- [ ] System prompts с чёткими правилами
- [ ] Few-shot examples в prompt
- [ ] Chain-of-thought для сложных задач
- [ ] JSON schema для структурированного вывода
- [ ] Температура 0.2-0.7 (не 1.0)
- [ [ ] Stop sequences для предотвращения болта
- [ ] Промпты на русском для русскоязычных задач