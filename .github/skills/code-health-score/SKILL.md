---
name: code-health-score
description: "Quantitative assessment of code quality across multiple dimensions."
category: quality
version: 1.0
---

# Code Health Score

## Purpose
Provide objective metrics for code quality assessment.

## Dimensions (100 points total)

### Readability (20 pts)
- Clear naming: 5 pts
- Function length < 50 lines: 5 pts
- Comment quality: 5 pts
- Structure consistency: 5 pts

### Maintainability (20 pts)
- Single responsibility: 5 pts
- Low coupling: 5 pts
- High cohesion: 5 pts
- Test coverage: 5 pts

### Correctness (20 pts)
- Type safety: 5 pts
- Error handling: 5 pts
- Edge cases: 5 pts
- No dead code: 5 pts

### Performance (20 pts)
- No N+1 queries: 5 pts
- Proper memoization: 5 pts
- Efficient algorithms: 5 pts
- Resource cleanup: 5 pts

### Security (20 pts)
- Input validation: 5 pts
- Auth checks: 5 pts
- No hardcoded secrets: 5 pts
- RLS on tables: 5 pts

## Score Interpretation
- 90-100: Excellent
- 70-89: Good
- 50-69: Needs improvement
- <50: Requires refactoring