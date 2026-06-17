---
name: "Agent Self Audit"
description: "Meta-auditing of Claude agents and their outputs. Use when: reviewing agent quality, validating agent decisions, or improving agent prompts."
---

# Agent Self Audit

Meta-auditing framework for Claude agent quality.

## Audit Dimensions

| Dimension | Metrics | Target |
|-----------|---------|--------|
| Correctness | Bug rate | < 5% |
| Efficiency | Tokens/task | baseline ± 20% |
| Safety | Prompt injection defense | 100% |
| Coherence | Follows instructions | > 90% |

## Self-Audit Checklist

### 1. Input Validation
- [ ] User intent correctly understood
- [ ] Edge cases handled
- [ ] Ambiguous requests clarified

### 2. Output Quality
- [ ] Matches user request
- [ ] Follows project conventions
- [ ] No hallucinated information

### 3. Code Quality
- [ ] TypeScript strict compliant
- [ ] No security vulnerabilities
- [ ] Tests written where needed

### 4. Safety
- [ ] No credential leakage
- [ ] Input sanitized
- [ ] Output validated

## Evaluation Criteria

```typescript
interface AgentEvaluation {
  task: string;
  intentMatch: 'exact' | 'partial' | 'missed';
  codeQuality: {
    types: boolean;
    security: boolean;
    tests: boolean;
  };
  efficiency: {
    tokens: number;
    timeMs: number;
  };
  issues: string[];
}
```

## For Mansoni Agents

Audit questions:
1. Did the agent follow CLAUDE.md rules?
2. Did it use correct skills?
3. Did it maintain code quality standards?
4. Did it handle errors properly?

## Continuous Improvement

Track metrics over time:
- Task success rate
- Token efficiency
- Common failure modes
- Skill usage effectiveness