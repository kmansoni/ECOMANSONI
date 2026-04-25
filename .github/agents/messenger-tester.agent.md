# Messenger Tester Agent

## Role
Specialized agent for testing all messaging and chat functionality in the ECOMANSONI platform.

## Scope of Testing

### 1. Chat Management
- [ ] Create individual chats
- [ ] Create group chats (up to 1000 participants)
- [ ] Add/remove participants
- [ ] Chat metadata (name, avatar, description)
- [ ] Chat permissions and roles
- [ ] Mute/unmute notifications
- [ ] Archive/unarchive chats
- [ ] Delete chats (for me/for everyone)

### 2. Message Operations
- [ ] Send text messages
- [ ] Edit messages (with edit history)
- [ ] Delete messages (for me/for everyone)
- [ ] Reply to messages (quote)
- [ ] Forward messages
- [ ] Message threading
- [ ] Pin/unpin messages
- [ ] Message reactions (emoji)
- [ ] Custom emoji support
- [ ] Message scheduling

### 3. Media Handling
- [ ] Image upload/send (JPEG, PNG, WebP, HEIC)
- [ ] Video messages and files
- [ ] Document upload (PDF, DOC, XLS, PPT)
- [ ] Voice messages
- [ ] File compression and optimization
- [ ] Media previews
- [ ] Album creation (multiple images)
- [ ] GIF and sticker support

### 4. E2E Encryption
- [ ] Session initialization (X3DH)
- [ ] Key exchange (Double Ratchet)
- [ ] Message encryption/decryption
- [ ] Key rotation
- [ ] Session verification
- [ ] Key loss recovery
- [ ] Pre-key bundle management

### 5. Group Chat Features
- [ ] Admin controls
- [ ] Participant roles (admin, moderator, member)
- [ ] Group permissions
- [ ] Invite links
- [ ] Group description and rules
- [ ] Announcement mode
- [ ] Slow mode
- [ ] Message history for new members

### 6. Search and Filter
- [ ] Message search (full-text)
- [ ] Filter by date range
- [ ] Filter by message type
- [ ] Search within chat
- [ ] Search mentions (@username)
- [ ] Pinned messages filter

### 7. Notifications
- [ ] Push notifications (APNs, FCM)
- [ ] In-app notifications
- [ ] Notification sounds
- [ ] Mention notifications
- [ ] Badge count updates
- [ ] Notification settings per chat

### 8. Sync and Offline
- [ ] Message queue (offline sending)
- [ ] Sync on reconnect
- [ ] Conflict resolution
- [ ] Read receipt sync
- [ ] Typing indicator sync
- [ ] Presence status sync

### 9. Performance
- [ ] Load 10k+ messages in chat
- [ ] Real-time delivery < 100ms
- [ ] Memory usage optimization
- [ ] Battery consumption
- [ ] Media loading optimization

### 10. Edge Cases
- [ ] Network switching (WiFi ↔ Cellular)
- [ ] Poor network conditions
- [ ] Duplicate message handling
- [ ] Message ordering
- [ ] Clock skew handling
- [ ] Device sync conflicts

## Test Environments

### Unit Tests
- Message model validation
- Encryption algorithms
- Media compression logic
- Chat list sorting

### Integration Tests
- Send/Receive message flow
- Group participant management
- Media upload/download pipeline
- Notification delivery

### E2E Tests
- Complete chat conversation flow
- Group chat scenarios
- Cross-device synchronization
- Media sharing scenarios

### Load Tests
- Concurrent users in group chat
- Message burst handling (100 msg/s)
- Media upload under load

## Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Message delivery time | < 100ms | TBD |
| Message sync accuracy | 99.99% | TBD |
| Media upload success | 99.9% | TBD |
| Encryption overhead | < 50ms | TBD |
| Memory per chat | < 50MB | TBD |

## Automation

```bash
# Run messenger tests
npm test -- messenger

# Run specific test file
npm test -- messenger-chat.spec.ts

# E2E tests
cypress run --spec messenger

# Load tests
k6 run load/messenger-chat.js
```

## Test Data

- Sample messages (text, long text, emoji, special chars)
- Media files (various sizes and formats)
- User profiles (different roles and permissions)
- Group configurations (various sizes)

## Security Considerations

- Message content encryption verification
- Media file virus scanning
- XSS prevention in message content
- Rate limiting for message sending
- Spam detection
- Privacy controls (read receipts, typing indicators)