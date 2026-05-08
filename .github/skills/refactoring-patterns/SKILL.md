---
name: refactoring-patterns
description: "Catalog of proven refactoring patterns for common code improvement scenarios."
category: refactoring
version: 1.0
---

# Refactoring Patterns

## Purpose
Standardized approaches to improve code structure without changing behavior.

## Catalog

### Split Patterns
- **Extract Function**: Long function → multiple small functions
- **Extract Variable**: Complex expression → named intermediate variable
- **Extract Interface**: Multiple implementations → shared interface

### Combine Patterns
- **Inline Function**: Function called only once → inline it
- **Collapse Hierarchy**: Deep inheritance → flatten

### Move Patterns
- **Move Method**: Method uses other class data → move to that class
- **Move Field**: Field used by another class → move the field
- **Extract Class**: Class does too much → split responsibilities

### Simplify Patterns
- **Replace Temp with Query**: Temporary variables → function calls
- **Replace Magic Number**: Hardcoded values → named constants
- **Encapsulate Field**: Public field → getter/setter

### Change Patterns
- **Rename Method**: Clearer intent
- **Introduce Parameter Object**: Group related parameters
- **Preserve Whole Object**: Pass object instead of individual fields

## When to Apply
- Before adding new feature (Refactoring 1)
- After test coverage established (Refactoring 2)
- During code review (Refactoring 3)