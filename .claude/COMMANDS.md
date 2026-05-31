# Mansoni Commands

## Workflow Commands

```bash
# Set workflow
node .claude/helpers/workflow-context.cjs workflow <name>

# Available workflows: general, feature, bug, security, audit, review, refactor, hardening

# Infer workflow from description
node .claude/helpers/workflow-context.cjs infer "your task description"

# Record evidence
node .claude/helpers/workflow-context.cjs evidence tsc "type check passed"

# Set review stage
node .claude/helpers/workflow-context.cjs review-stage review-pass
node .claude/helpers/workflow-context.cjs review-stage review-risky
node .claude/helpers/workflow-context.cjs review-stage review-fail

# Reset context
node .claude/helpers/workflow-context.cjs reset

# Show current context
node .claude/helpers/workflow-context.cjs
```

## Quick Reference

| Command | Purpose |
|---------|---------|
| `workflow feature` | Activate feature delivery workflow |
| `workflow bug` | Activate bug fix workflow |
| `workflow refactor` | Activate refactoring workflow |
| `workflow security` | Activate security hardening workflow |
| `infer "..."` | Auto-detect workflow from description |
| `evidence tsc "..."` | Record type-check evidence |
| `evidence tests "..."` | Record test evidence |
| `evidence manual "..."` | Record manual verification |
| `review-stage review-pass` | Mark review as passed |
| `review-stage review-fail` | Mark review as failed |

## Workflow Pipelines

### Feature Delivery
```
researcher → architect → coder → reviewer → tester
```

### Bug Fix
```
debugger → coder → reviewer
```

### Security
```
security-engineer → reviewer-security → coder
```

### Refactor
```
research → plan → implement → review
```

## Verification Gates

- **tsc**: TypeScript compilation
- **tests**: Test suite (vitest, playwright)
- **lint**: Linting
- **review**: Code review
- **manual**: Manual verification

## Mansoni Principles

1. **Root Cause**: Always fix the root cause, never the symptom
2. **Clean Code**: No noise, no AI artifacts, human-like code
3. **Anti-Duplicate**: Research before creating anything new
4. **TypeScript Strict**: Zero errors after every change
5. **RLS Required**: Every table must have Row Level Security
6. **No Stubs**: No fake success, no empty catches, no TODOs without dates

## Memory System

- **Project memories**: `memories/repo/` — persistent across sessions
- **Session memories**: `memories/session/swarm/` — current session context
- **Auto-sync**: Enabled via hooks
- **Decisions log**: `memories/session/swarm/decisions.md`
