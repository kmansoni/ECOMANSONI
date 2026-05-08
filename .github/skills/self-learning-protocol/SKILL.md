---
name: self-learning-protocol
description: "Autonomous skill for agents to analyze patterns, extract lessons from completed tasks, and generate improvement suggestions for future work."
category: meta
version: 1.0
---

# Self-Learning Protocol

## Purpose
Enable agents to autonomously extract patterns from task completions and improve future responses.

## Key Functions

### 1. Pattern Extraction
- Analyze completed tasks for recurring solutions
- Identify anti-patterns and what NOT to do
- Build internal knowledge base of "lessons learned"

### 2. Confidence Calibration
- Compare self-assessment scores with actual outcomes
- Adjust certainty levels based on past accuracy
- Flag areas where judgment was incorrect

### 3. Improvement Suggestions
- Generate specific recommendations for skill gaps
- Suggest process improvements
- Recommend new skills to activate for similar tasks

## Protocol Steps

```
1. COMPLETION → Analyze what was built/fixed
2. OUTCOME → Compare with initial confidence score  
3. GAP → Identify misses, surprises, or overconfidence
4. LESSON → Capture specific learning (file:line format)
5. UPDATE → Apply lesson to future similar contexts
```

## Memory Storage
Lessons stored in `/memories/repo/self-learning/` with format:
- `YYYY-MM-DD_task-type_pattern.md`
- Include: context, decision, outcome, lesson

## Integration
Called automatically after:
- 5 task completions
- Any P0 bug discovery
- Failed quality gates