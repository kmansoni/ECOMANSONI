---
name: "Memory Leak Detection"
description: "Finding and fixing memory leaks in JavaScript/TypeScript. Use when: investigating OOM errors, high memory usage, or profiling performance issues."
---

# Memory Leak Detection

Identifying and fixing memory leaks in browser and Node.js.

## Symptoms

- Memory usage grows continuously
- Performance degrades over time
- "Out of memory" errors
- High memory in DevTools profiler

## Detection Methods

### 1. Browser DevTools

1. Open DevTools → Performance tab
2. Record for 30 seconds with interaction
3. Look for: DOM nodes count growing
4. Check Memory tab for heap snapshots

### 2. Playwright Memory Tests

```typescript
test('no memory leak in chat', async ({ page }) => {
  const initialMemory = await page.evaluate(() =>
    (performance as any).memory?.usedJSHeapSize
  );

  // Send 100 messages
  for (let i = 0; i < 100; i++) {
    await page.fill('[data-testid="message-input"]', `Message ${i}`);
    await page.click('[data-testid="send-button"]');
  }

  // Force GC if available
  await page.evaluate(() => {
    if ((window as any).gc) (window as any).gc();
  });

  await page.waitForTimeout(1000);

  const finalMemory = await page.evaluate(() =>
    (performance as any).memory?.usedJSHeapSize
  );

  // Should not grow more than 10%
  const growth = (finalMemory - initialMemory) / initialMemory;
  expect(growth).toBeLessThan(0.1);
});
```

## Common Causes

| Pattern | Problem | Fix |
|---------|---------|-----|
| Event listeners | Not removed on unmount | cleanup in useEffect |
| setInterval | Never cleared | clearInterval on unmount |
| Closures | Retain large objects | WeakRef, clear references |
| Caches | Grow unbounded | LRU cache, TTL |
| Subscriptions | Not unsubscribed | cleanup in useEffect |

## React-Specific

```typescript
// BAD: Memory leak
useEffect(() => {
  window.addEventListener('resize', handleResize);
  // Missing return!
});

// GOOD: Properly cleaned up
useEffect(() => {
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
});

// BAD: setInterval leak
useEffect(() => {
  setInterval(() => checkNewMessages(), 5000);
  // Missing clearInterval!
});

// GOOD:
useEffect(() => {
  const interval = setInterval(() => checkNewMessages(), 5000);
  return () => clearInterval(interval);
});
```

## For Mansoni

Critical leak-prone areas:
1. WebSocket listeners (chat messages)
2. Real-time subscriptions
3. Event listeners on unmount
4. Cached data structures