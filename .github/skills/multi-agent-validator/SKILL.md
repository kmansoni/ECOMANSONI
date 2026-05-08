---
name: multi-agent-validator
description: "Coordinated validation protocol where multiple agent perspectives verify a solution."
category: meta
version: 1.0
---

# Multi-Agent Validator

## Purpose
Use multiple agent viewpoints to validate critical decisions and catch blind spots.

## Validation Patterns

### 1. Adversarial Review
- ARCHITECT challenges ENGINEER's implementation
- SECURITY finds vulnerabilities in logic
- DEBUGGER identifies edge case failures

### 2. Consensus Building
- Each agent rates confidence 1-10
- Disagreements trigger debate protocol
- Final verdict requires 4+ votes

### 3. Cross-Domain Check
- Messenger expert reviews navigation code
- Performance expert reviews business logic
- Security expert reviews UX decisions

## Output Format
```
## MULTI-AGENT VALIDATION
Architect: ✅ (confidence: 8)
Engineer: ✅ (confidence: 9)  
Security: ⚠️ (needs auth check)
Debugger: ✅ (confidence: 7)
**Result: 3/4 ready, minor revision needed**
```