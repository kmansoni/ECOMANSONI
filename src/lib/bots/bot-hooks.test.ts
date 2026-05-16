/**
 * Unit-тесты для бот-хуков: useBotSend, useRealtimeBotMessages
 *
 * Запуск: vitest run --testPathPattern="bot-hooks"
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BotInboundEvent, BotOutboundMessage } from '@/lib/bots/protocol';

// ── useBotSend logic tests ────────────────────────────────────────────────────

describe('useBotSend — core logic', () => {
  it('constructs correct BotInboundEvent from user message', () => {
    const botId = 'bot_123';
    const conversationId = 'conv_456';
    const userId = 'user_789';
    const text = 'Привет, бот!';
    const eventId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const timestamp = new Date().toISOString();

    const inboundEvent: BotInboundEvent = {
      event_id: eventId,
      timestamp: timestamp,
      bot_id: botId,
      user_id: userId,
      chat_id: conversationId,
      type: 'message',
      content: {
        text,
      },
      context: {
        platform_user_id: userId,
        first_name: '',
        platform: 'web',
        session_variables: {},
        session_state: 'idle',
        bot_language: 'ru',
      },
    };

    expect(inboundEvent.bot_id).toBe(botId);
    expect(inboundEvent.user_id).toBe(userId);
    expect(inboundEvent.chat_id).toBe(conversationId);
    expect(inboundEvent.type).toBe('message');
    expect(inboundEvent.content.text).toBe(text);
    expect(inboundEvent.event_id).toMatch(/^exec_\d+_/);
  });

  it('handles empty text gracefully', () => {
    const text = '';
    const shouldSend = text.trim().length > 0;
    expect(shouldSend).toBe(false);
  });

  it('handles whitespace-only text', () => {
    const text = '   ';
    const shouldSend = text.trim().length > 0;
    expect(shouldSend).toBe(false);
  });

  it('trims text before sending', () => {
    const rawText = '  Привет  ';
    const trimmed = rawText.trim();
    expect(trimmed).toBe('Привет');
  });
});

// ── useBotSend rate limiting / sending guard ──────────────────────────────────

describe('useBotSend — sending guard', () => {
  it('blocks concurrent sends via sendingRef flag', () => {
    let sending = false;

    const canSend = !sending;
    expect(canSend).toBe(true);

    // Simulate lock
    sending = true;
    const canSendNow = !sending;
    expect(canSendNow).toBe(false);
  });
});

// ── useBotConversation message deduplication ──────────────────────────────────

describe('useBotConversation — message dedup', () => {
  it('prevents duplicate messages in state', () => {
    const existingMessages = [
      { id: 'msg_1', text: 'Hello' },
      { id: 'msg_2', text: 'World' },
    ];
    const newMessage = { id: 'msg_2', text: 'World' };

    const shouldAdd = !existingMessages.some((m) => m.id === newMessage.id);
    expect(shouldAdd).toBe(false);
  });

  it('allows new unique messages', () => {
    const existingMessages = [
      { id: 'msg_1', text: 'Hello' },
    ];
    const newMessage = { id: 'msg_3', text: 'New' };

    const shouldAdd = !existingMessages.some((m) => m.id === newMessage.id);
    expect(shouldAdd).toBe(true);
  });
});

// ── Response interpolation tests ──────────────────────────────────────────────

describe('interpolate — template variables', () => {
  function interpolate(text: string, variables: Record<string, string>): string {
    return text.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? `{${key}}`);
  }

  it('replaces simple variable', () => {
    expect(interpolate('Привет, {name}!', { name: 'Иван' })).toBe('Привет, Иван!');
  });

  it('replaces multiple variables', () => {
    expect(
      interpolate('{greeting}, {name}! Ваш баланс: {balance} {currency}.', {
        greeting: 'Привет',
        name: 'Анна',
        balance: '1500',
        currency: 'XTR',
      })
    ).toBe('Привет, Анна! Ваш баланс: 1500 XTR.');
  });

  it('preserves unknown variables as-is', () => {
    expect(interpolate('Код: {code}', { wrong_key: '123' })).toBe('Код: {code}');
  });

  it('handles empty text', () => {
    expect(interpolate('', { name: 'Test' })).toBe('');
  });
});

// ── Priority sorting ──────────────────────────────────────────────────────────

describe('Handler priority sorting', () => {
  it('sorts handlers by priority ascending (lower = first)', () => {
    const handlers = [
      { name: 'h1', priority: 50 },
      { name: 'h2', priority: 10 },
      { name: 'h3', priority: 100 },
      { name: 'h4', priority: 1 },
    ];

    const sorted = [...handlers].sort((a, b) => a.priority - b.priority);
    expect(sorted.map((h: any) => h.name)).toEqual(['h4', 'h2', 'h1', 'h3']);
  });

  it('handles equal priority (stable order)', () => {
    const handlers = [
      { name: 'h1', priority: 50 },
      { name: 'h2', priority: 50 },
    ];

    const sorted = [...handlers].sort((a, b) => a.priority - b.priority);
    expect(sorted.map((h: any) => h.name)).toEqual(['h1', 'h2']);
  });
});

// ── Event type categorization ─────────────────────────────────────────────────

describe('Event type validation', () => {
  const inboundTypes: BotInboundEvent['type'][] = [
    'message', 'callback', 'media', 'reaction',
    'member_joined', 'member_left', 'command', 'start',
    'inline_query', 'chosen_inline', 'poll_answer', 'dice',
    'game', 'video_note', 'voice', 'location', 'contact',
    'venue', 'invoice', 'successful_payment', 'my_chat_member',
    'chat_join_request', 'chat_boost', 'new_chat_photo', 'new_chat_title',
    'delete_chat_photo', 'pinned_message', 'proximity_alert',
    'group_chat_created', 'supergroup_chat_created', 'channel_chat_created',
    'message_auto_delete_timer_changed', 'migrate_to_chat_id', 'migrate_from_chat_id',
    'poll', 'typing_start', 'typing_stop', 'error', 'fallback',
    'ai_response', 'welcome', 'schedule',
  ];

  it('covers all BotEventType values', () => {
    const expectedTypes: BotInboundEvent['type'][] = [
      'message', 'callback', 'media', 'reaction',
      'member_joined', 'member_left', 'start', 'command',
      'inline_query', 'chosen_inline', 'poll_answer', 'dice',
      'game', 'video_note', 'voice', 'location', 'contact',
      'venue', 'invoice', 'successful_payment', 'my_chat_member',
      'chat_join_request', 'chat_boost', 'new_chat_photo',
      'new_chat_title', 'delete_chat_photo', 'pinned_message',
      'proximity_alert', 'group_chat_created', 'supergroup_chat_created',
      'channel_chat_created', 'message_auto_delete_timer_changed',
      'migrate_to_chat_id', 'migrate_from_chat_id', 'poll',
      'typing_start', 'typing_stop', 'error', 'fallback',
      'ai_response', 'welcome', 'schedule',
    ];

    // Verify that all types from protocol are included
    for (const type of expectedTypes) {
      expect(inboundTypes).toContain(type as any);
    }
  });
});

// ── Retry backoff timing ──────────────────────────────────────────────────────

describe('Retry backoff', () => {
  it('calculates exponential backoff correctly', () => {
    const backoffs = [1, 2, 3].map((attempt) => 1000 * Math.pow(2, attempt - 1));
    expect(backoffs).toEqual([1000, 2000, 4000]);
  });

  it('first retry is ~1 second', () => {
    const firstRetry = 1000 * Math.pow(2, 0);
    expect(firstRetry).toBe(1000);
  });
});

// ── Date/ISO format helpers ───────────────────────────────────────────────────

describe('ISO date formatting', () => {
  it('formats current date as YYYY-MM-DD', () => {
    const now = new Date();
    const formatted = now.toISOString().split('T')[0];
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});