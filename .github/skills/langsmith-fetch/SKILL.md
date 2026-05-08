---
name: langsmith-fetch
description: "Fetch and analyze traces from LangSmith/LangChain observability platform for debugging and optimization."
category: debugging
version: 1.0
---

# LangSmith Fetch

## Purpose
Retrieve execution traces from LangSmith to diagnose agent behavior and optimize prompts.

## Key Functions

### 1. Trace Retrieval
- Fetch traces by run_id, project, or time range
- Extract prompts, responses, and metadata
- Analyze token usage and latency

### 2. Pattern Analysis
- Identify common failure patterns in prompt chains
- Find token waste in verbose responses
- Detect hallucination or inconsistency patterns

### 3. Optimization Suggestions
- Recommend prompt refinements based on trace analysis
- Suggest temperature/top_p adjustments
- Identify redundant chain steps

## Protocol
```
trace_id → langsmith.getTrace(trace_id) → analyze() → suggest_fixes()
```

## Integration
Activated when agent debugging requires historical execution context.