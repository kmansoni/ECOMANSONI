# Enhanced Messenger Tester - Implementation Guide

## Integration with Existing Codebase

### 1. Protocol Testing (protocolV11.ts)
```typescript
// Test vectors for protocol V11
const protocolTests = {
  messageEnvelope: {
    encrypt: 'X3DH + Double Ratchet',
    decrypt: 'Session validation',
    rotate: 'Key rotation after 100 messages or 7 days'
  },
  schemaValidation: {
    version: '11.0',
    backwardCompatible: true,
    breakingChanges: []
  }
};
```

### 2. Schema Probe Testing (schemaProbe.ts)
- [ ] Message schema evolution (v1 → v11)
- [ ] Migration path validation
- [ ] Database schema compatibility
- [ ] Index performance on chat queries
- [ ] Realtime subscription performance

### 3. Bot Profile Testing (BotProfileSheet.tsx)
- [ ] Bot avatar rendering
- [ ] Bot metadata display
- [ ] Bot command discovery
- [ ] Bot interaction flows
- [ ] Bot permission validation

## Specific Test Cases

### E2E Encryption Tests
```typescript
describe('E2E Encryption', () => {
  test('X3DH handshake between new users', async () => {
    const alice = await createUser();
    const bob = await createUser();
    await expect(establishSession(alice, bob)).resolves.toBeDefined();
  });

  test('Double Ratchet message encryption', async () => {
    const message = await encryptMessage(session, 'Hello');
    const decrypted = await decryptMessage(session, message);
    expect(decrypted).toBe('Hello');
  });

  test('Key rotation after message threshold', async () => {
    for (let i = 0; i < 100; i++) {
      await sendMessage(session, `msg${i}`);
    }
    expect(session.keys.ratchet).toBeUpdated();
  });
});
```

### Chat State Synchronization
```typescript
describe('Chat State Sync', () => {
  test('Typing indicator propagation', async () => {
    const user1 = await login();
    const user2 = await login();
    await user1.startTyping(chatId);
    await expect(user2.seeTyping(chatId)).resolves.toBe(true);
  });

  test('Read receipt delivery', async () => {
    const msg = await sendMessage(user1, user2, 'Test');
    await user2.markAsRead(msg.id);
    await expect(user1.getReceipt(msg.id)).resolves.toBe('read');
  });
});
```

## Performance Benchmarks

| Operation | Target | Measurement Method |
|-----------|--------|-------------------|
| Message send → delivery | < 100ms | End-to-end timestamp diff |
| History load (1000 msgs) | < 1s | Query execution time |
| E2E encryption overhead | < 50ms | Crypto operation timing |
| Typing indicator latency | < 50ms | WebSocket roundtrip |

## Test Data Generation
```typescript
// factories/chatFactory.ts
export const chatFactory = Factory.define(() => ({
  id: uuid(),
  type: faker.helpers.arrayElement(['dm', 'group']),
  participants: userFactory.buildList(2),
  messages: messageFactory.buildList(50),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
}));
```

## Edge Cases
- Network interruption during message send
- Duplicate message detection
- Out-of-order message delivery
- Clock skew between devices
- Message size limits (text, media)
- Concurrent edits in group chat