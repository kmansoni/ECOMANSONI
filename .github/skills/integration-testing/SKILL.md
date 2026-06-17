---
name: "Integration Testing"
description: "API and service integration testing patterns. Use when: testing database interactions, API contracts, or multi-service flows."
---

# Integration Testing

End-to-end integration testing for connected systems.

## When to Use

- Database queries with real data
- API endpoints with external services
- Multi-step workflows
- WebSocket connections

## For Supabase

```typescript
import { createClient } from '@supabase/supabase-js';

describe('Messages integration', () => {
  let supabase;

  beforeAll(async () => {
    supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY
    );
  });

  test('create and retrieve message', async () => {
    // Insert
    const { data, error } = await supabase
      .from('messages')
      .insert({ content: 'Test', user_id: 'test-user' })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data.content).toBe('Test');

    // Verify
    const { data: retrieved } = await supabase
      .from('messages')
      .select()
      .eq('id', data.id)
      .single();

    expect(retrieved.content).toBe('Test');

    // Cleanup
    await supabase.from('messages').delete().eq('id', data.id);
  });
});
```

## RLS Testing

```typescript
test('RLS prevents unauthorized access', async () => {
  // Create test user
  const { data: user } = await createTestUser();

  // As different user, should be denied
  const { error } = await supabase
    .from('messages')
    .select()
    .eq('user_id', user.id)
    .single();

  expect(error).not.toBeNull();
  expect(error.message).toContain('RLS');
});
```

## Edge Function Testing

```typescript
test('edge function integration', async () => {
  const response = await fetch('http://localhost:54321/functions/v1/health', {
    headers: { Authorization: `Bearer ${anonKey}` },
  });

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.status).toBe('ok');
});
```

## Best Practices

1. Use test database (not production)
2. Clean up after each test
3. Test RLS policies explicitly
4. Mock external services when possible
5. Use transactions for rollback