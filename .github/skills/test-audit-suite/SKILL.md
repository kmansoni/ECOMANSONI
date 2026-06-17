---
name: "Test Audit Suite"
description: "Comprehensive test suite validation and coverage analysis. Use when: assessing test quality, identifying gaps, or planning test improvements."
---

# Test Audit Suite

Comprehensive test suite analysis and improvement.

## Coverage Metrics

| Type | Target | Critical |
|------|--------|----------|
| Line coverage | > 80% | < 50% |
| Branch coverage | > 70% | < 40% |
| Function coverage | > 90% | < 60% |

## Audit Checklist

### 1. Test Organization
- [ ] Tests grouped by feature/domain
- [ ] Naming convention consistent
- [ ] Test files co-located with source

### 2. Test Quality
- [ ] No flaky tests
- [ ] Fast execution (< 100ms each)
- [ ] Clear assertion messages
- [ ] Proper setup/teardown

### 3. Coverage Gaps
- [ ] Happy path covered
- [ ] Error paths tested
- [ ] Edge cases addressed
- [ ] Security scenarios included

### 4. Maintenance
- [ ] Tests follow DRY
- [ ] Shared fixtures extracted
- [ ] Page objects used for UI
- [ ] Data builders for test data

## Coverage Report

```bash
# Generate coverage
npx vitest run --coverage

# HTML report
npx vitest run --coverage --coverage.reportType=html
```

## For Mansoni

Priority test areas:
1. **Auth** — login, register, logout, RLS
2. **Chat** — send, receive, reactions, real-time
3. **Storage** — upload, download, delete
4. **E2EE** — encryption, key exchange

## Improving Test Quality

```typescript
// BAD: Unclear test
test('works', async () => {
  const result = await send({ a: 1 });
  expect(result).toBeTruthy();
});

// GOOD: Descriptive test
test('sends message to channel successfully', async () => {
  const result = await messageService.send({
    channelId: 'general',
    content: 'Hello world',
    userId: 'user-123',
  });

  expect(result.id).toBeDefined();
  expect(result.channelId).toBe('general');
  expect(result.content).toBe('Hello world');
  expect(result.createdAt).toBeInstanceOf(Date);
});
```