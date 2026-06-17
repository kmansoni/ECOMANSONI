---
name: "Contract Testing"
description: "API contract validation between services. Use when: testing API compatibility, validating schemas, or preventing breaking changes."
---

# Contract Testing

API contract testing to prevent breaking changes.

## Concept

```
┌──────────┐    Contract    ┌──────────┐
│  Client  │◄─────────────►│   Server │
│   (pact) │   shared spec  │  (broker)│
└──────────┘                └──────────┘
```

## Pact Setup

```typescript
// consumer.test.ts
import { Pact } from '@pact-foundation/pact';

const provider = new Pact({
  consumer: 'chat-client',
  provider: 'chat-api',
});

describe('Chat API contract', () => {
  beforeAll(async () => {
    await provider.setup();
  });

  it('validates message creation contract', async () => {
    await provider.addInteraction({
      state: 'user exists',
      uponReceiving: 'a request to create a message',
      withRequest: {
        method: 'POST',
        path: '/api/messages',
        headers: { 'Content-Type': 'application/json' },
        body: { content: 'hello', channel_id: '123' },
      },
      willRespondWith: {
        status: 201,
        body: {
          id: Matchers.string('uuid'),
          content: 'hello',
          created_at: Matchers.iso8601DateTime(),
        },
      },
    });
  });
});
```

## For Supabase API

```typescript
// Validate response shapes
test('messages endpoint contract', async () => {
  const { data } = await supabase
    .from('messages')
    .select('id, content, created_at, user_id')
    .limit(1);

  expect(data[0]).toMatchSchema({
    id: { type: 'string', format: 'uuid' },
    content: { type: 'string' },
    created_at: { type: 'string' },
    user_id: { type: 'string', format: 'uuid' },
  });
});
```

## CI Integration

```yaml
# Publish contract on merge to main
- name: Publish contract
  run: npx pact-broker publish pacts/ --auto-detect

# Can I Deploy
- name: Check compatibility
  run: npx pact-broker can-i-deploy --pacticipant chat-client --version $GITHUB_SHA
```