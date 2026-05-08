---
name: dead-code-elimination
description: "Identification and removal of unused code, imports, and unreachable branches."
category: refactoring
version: 1.0
---

# Dead Code Elimination

## Purpose
Remove code that provides no value and increases maintenance burden.

## Detection Methods

### Automated Detection
```bash
# TypeScript unused
npx ts-unused-exports --project tsconfig.json

# ESLint unused vars
eslint --rule "no-unused-vars: error"

# Unimported files
npx unimported
```

### Manual Detection
- Functions never called
- Variables assigned but never read
- Imports not used
- Props passed but ignored
- Branches never executed

## Common Patterns

### 1. Unused Exports
```typescript
// BAD
export const unusedHelper = () => {}

// GOOD
// Delete the function
```

### 2. Unused Imports
```typescript
// BAD
import { unused } from './utils'

// GOOD  
import { used } from './utils'
```

### 3. Commented Code
```typescript
// BAD
// const oldLogic = () => {}

// GOOD
// Delete it - git has history
```

### 4. Type-only Imports
```typescript
// BAD
import { type User } from './types'
function processUser(user: User) {}

// GOOD
import type { User } from './types'
```

## Safety Rules
1. Verify with TypeScript strict mode
2. Run tests after removal
3. Check across all entry points
4. Consider external consumers