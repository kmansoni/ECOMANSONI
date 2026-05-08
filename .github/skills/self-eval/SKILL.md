---
name: self-eval
description: "Meta-skill for agents to evaluate their own output quality, confidence, and completeness."
category: meta
version: 1.0
---

# Self-Evaluation Protocol

## Purpose
Agents assess their own responses against objective criteria before returning results.

## Evaluation Criteria

### 1. Completeness (25%)
- All requested aspects addressed
- No skipped requirements
- Edge cases considered

### 2. Correctness (25%)  
- Facts verified against code/spec
- No logical errors
- Proper file:line references

### 3. Clarity (20%)
- Explanation follows logical flow
- No ambiguous statements
- Russian language rules followed

### 4. Safety (15%)
- No security oversights
- RLS/auth checks included
- No silent failures

### 5. Evidence (15%)
- File references provided
- Code snippets accurate
- Claims backed by proof

## Confidence Scoring
- 90-100%: High confidence, minimal review needed
- 70-89%: Medium confidence, spot check recommended  
- 50-69%: Low confidence, thorough review required
- <50%: Critical issues, rework needed

## Output Format
```
## SELF-EVAL
Completeness: 22/25
Correctness: 24/25
Clarity: 18/20
Safety: 14/15
Evidence: 13/15
**Total: 91/100**
```