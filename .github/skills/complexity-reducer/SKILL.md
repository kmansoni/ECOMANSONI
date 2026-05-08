---
name: complexity-reducer
description: "Techniques and patterns for reducing code complexity while maintaining functionality."
category: refactoring
version: 1.0
---

# Complexity Reducer

## Purpose
Identify and eliminate unnecessary complexity in code.

## Complexity Indicators

### Cognitive Complexity
- Nested conditionals > 3 levels
- Multiple boolean operators in one condition
- Recursion without clear base case
- Switch statements with > 5 cases

### Cyclomatic Complexity
- Functions with > 10 decision points
- Deep inheritance chains
- Excessive use of polymorphism for simple cases

### Essential vs Accidental Complexity
- Essential: Domain complexity (keep)
- Accidental: Code structure complexity (reduce)

## Reduction Patterns

### 1. Extract Method
- Split large functions into smaller, named functions
- Each function should do ONE thing

### 2. Replace Conditional with Polymorphism
- When same condition appears in multiple places
- Strategy pattern for algorithms

### 3. Decompose Conditional
- Extract condition to well-named function
- Extract then/else branches to separate functions

### 4. Consolidate Conditional
- Multiple conditions leading to same result

## Metrics Target
- Cyclomatic complexity < 10 per function
- Functions < 50 lines
- Nesting depth < 3