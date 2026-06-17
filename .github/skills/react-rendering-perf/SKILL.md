---
name: "React Rendering Performance"
description: "React rendering optimization techniques. Use when: reducing re-renders, optimizing component trees, or improving React performance."
---

# React Rendering Performance

Optimizing React component rendering.

## Key Techniques

| Technique | Use Case | Impact |
|-----------|----------|--------|
| React.memo | Pure components | Medium |
| useMemo | Expensive calculations | High |
| useCallback | Stable function references | Medium |
| Virtual scroll | Long lists | High |
| Code splitting | Large apps | Medium |

## Profiling

```typescript
// React DevTools Profiler
// import { Profiler } from 'react';

function onRender(id, phase, actualDuration) {
  if (actualDuration > 16) { // > 60fps
    console.warn(`${id} took ${actualDuration}ms`);
  }
}
```

## Avoid Re-renders

```typescript
// ❌ New object every render
<ChatList items={channels} onClick={(id) => handleClick(id)} />

// ✅ Stable reference
const handleClick = useCallback((id: string) => {
  // ...
}, []);

<ChatList items={channels} onClick={handleClick} />
```

## For Mansoni

Hot components: ChatList, MessageList, VirtualScroll for 1000+ messages