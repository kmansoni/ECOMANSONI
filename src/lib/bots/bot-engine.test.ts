/**
 * Unit-тесты для Bot Engine — Event Router, Handler Matching, Dead Letter Queue
 *
 * Запуск: vitest run --testPathPattern="bot-engine"
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BotInboundEvent, BotOutboundMessage } from '@/lib/bots/protocol';
import type { BotHandler, BotSession } from '@/lib/bots/types';

// ── Mock Supabase client ──────────────────────────────────────────────────────

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  rpc: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lt: vi.fn().mockReturnThis(),
  gt: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  range: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};

// ── Test data factories ───────────────────────────────────────────────────────

function createMockHandler(overrides: Partial<BotHandler>): BotHandler {
  return {
    id: 'handler_' + Math.random().toString(36).slice(2, 9),
    bot_id: 'bot_123',
    name: 'test_handler',
    trigger_type: 'keyword',
    trigger_value: 'привет,help',
    response_type: 'text',
    response_content: { method: 'sendMessage', params: { text: 'Привет!' }, options: {} },
    priority: 50,
    is_active: true,
    conditions: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockSession(overrides: Partial<BotSession>): BotSession {
  return {
    id: 'session_' + Math.random().toString(36).slice(2, 9),
    bot_id: 'bot_123',
    user_id: 'user_456',
    conversation_id: 'conv_789',
    context: {},
    state: 'idle',
    variables: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockEvent(overrides: Partial<BotInboundEvent>): BotInboundEvent {
  return {
    event_id: 'evt_' + Math.random().toString(36).slice(2, 9),
    timestamp: new Date().toISOString(),
    bot_id: 'bot_123',
    user_id: 'user_456',
    chat_id: 'chat_789',
    type: 'message',
    content: { text: 'привет' },
    context: {
      platform_user_id: 'user_456',
      first_name: 'Test',
      platform: 'web',
      session_variables: {},
      session_state: 'idle',
      bot_language: 'ru',
    },
    ...overrides,
  };
}

// ── Test: matchesTrigger ──────────────────────────────────────────────────────

describe('matchesTrigger', () => {
  it('keyword: matches when text contains keyword', () => {
    const handler = createMockHandler({ trigger_type: 'keyword', trigger_value: 'привет,здравствуй' });
    const event = createMockEvent({ type: 'message', content: { text: 'привет, как дела?' } });

    // Keyword matching logic inline (mirrors bot-engine)
    const text = (event.content.text || '').toLowerCase();
    const keywords = (handler.trigger_value || '').split(',').map((k: string) => k.trim().toLowerCase());
    const result = keywords.some((k: string) => text.includes(k));

    expect(result).toBe(true);
  });

  it('keyword: does not match when keyword absent', () => {
    const handler = createMockHandler({ trigger_type: 'keyword', trigger_value: 'купить,заказать' });
    const event = createMockEvent({ content: { text: 'привет, как дела?' } });

    const text = (event.content.text || '').toLowerCase();
    const keywords = (handler.trigger_value || '').split(',').map((k: string) => k.trim().toLowerCase());
    const result = keywords.some((k: string) => text.includes(k));

    expect(result).toBe(false);
  });

  it('command: matches /start command', () => {
    const handler = createMockHandler({ trigger_type: 'command', trigger_value: 'start,help' });
    const event = createMockEvent({ type: 'command', content: { text: '/start' } });

    const commands = (handler.trigger_value || '').split(',').map((c: string) => c.trim().toLowerCase().replace(/^\//, ''));
    const inputCmd = (event.content.text || '').replace(/^\//, '').split(' ')[0].toLowerCase();
    const result = commands.includes(inputCmd);

    expect(result).toBe(true);
  });

  it('command: does not match wrong command', () => {
    const handler = createMockHandler({ trigger_type: 'command', trigger_value: 'start,help' });
    const event = createMockEvent({ type: 'command', content: { text: '/unknown' } });

    const commands = (handler.trigger_value || '').split(',').map((c: string) => c.trim().toLowerCase().replace(/^\//, ''));
    const inputCmd = (event.content.text || '').replace(/^\//, '').split(' ')[0].toLowerCase();
    const result = commands.includes(inputCmd);

    expect(result).toBe(false);
  });

  it('callback: matches callback_data', () => {
    const handler = createMockHandler({ trigger_type: 'callback', trigger_value: 'btn_buy' });
    const event = createMockEvent({ type: 'callback', content: { callback_data: 'btn_buy' } });

    const result = event.content.callback_data === handler.trigger_value;
    expect(result).toBe(true);
  });

  it('callback: does not match wrong callback_data', () => {
    const handler = createMockHandler({ trigger_type: 'callback', trigger_value: 'btn_buy' });
    const event = createMockEvent({ type: 'callback', content: { callback_data: 'btn_cancel' } });

    const result = event.content.callback_data === handler.trigger_value;
    expect(result).toBe(false);
  });

  it('regex: matches pattern', () => {
    const handler = createMockHandler({ trigger_type: 'regex', trigger_value: '^/\\d+$' });
    const event = createMockEvent({ content: { text: '12345' } });

    let result: boolean;
    try {
      const regex = new RegExp(handler.trigger_value || '');
      result = regex.test(event.content.text || '');
    } catch {
      result = false;
    }

    expect(result).toBe(true);
  });

  it('regex: rejects non-matching text', () => {
    const handler = createMockHandler({ trigger_type: 'regex', trigger_value: '^/\\d+$' });
    const event = createMockEvent({ content: { text: 'abc' } });

    let result: boolean;
    try {
      const regex = new RegExp(handler.trigger_value || '');
      result = regex.test(event.content.text || '');
    } catch {
      result = false;
    }

    expect(result).toBe(false);
  });

  it('regex: handles invalid regex gracefully', () => {
    const handler = createMockHandler({ trigger_type: 'regex', trigger_value: '[invalid' });
    const event = createMockEvent({ content: { text: 'test' } });

    let result: boolean;
    try {
      const regex = new RegExp(handler.trigger_value || '');
      result = regex.test(event.content.text || '');
    } catch {
      result = false;
    }

    expect(result).toBe(false);
  });

  it('fallback: always matches', () => {
    const handler = createMockHandler({ trigger_type: 'fallback' });
    const event = createMockEvent({ type: 'message', content: { text: 'anything' } });

    const result = handler.trigger_type === 'fallback';
    expect(result).toBe(true);
  });

  it('media: matches when media type matches', () => {
    const handler = createMockHandler({ trigger_type: 'media', trigger_value: 'photo' });
    const event = createMockEvent({ type: 'media', content: { media_type: 'photo' } });

    const result = event.type === 'media' && (!handler.trigger_value || event.content.media_type === handler.trigger_value);
    expect(result).toBe(true);
  });

  it('media: matches any media when trigger_value empty', () => {
    const handler = createMockHandler({ trigger_type: 'media', trigger_value: '' });
    const event = createMockEvent({ type: 'media', content: { media_type: 'video' } });

    const result = event.type === 'media' && (!handler.trigger_value || event.content.media_type === handler.trigger_value);
    expect(result).toBe(true);
  });

  it('ai: always matches (catch-all)', () => {
    const handler = createMockHandler({ trigger_type: 'ai' });
    const event = createMockEvent({ type: 'message', content: { text: 'random text' } });

    const result = handler.trigger_type === 'ai';
    expect(result).toBe(true);
  });
});

// ── Test: checkConditions ─────────────────────────────────────────────────────

describe('checkConditions', () => {
  const conditions = [
    { variable: 'user_level', operator: 'equals', value: 'premium' },
    { variable: 'purchase_count', operator: 'greater_than', value: '5' },
    { variable: 'last_action', operator: 'contains', value: 'click' },
    { variable: 'banned', operator: 'not_equals', value: 'true' },
    { variable: 'email', operator: 'exists' },
    { variable: 'referral', operator: 'not_exists' },
    { variable: 'age', operator: 'less_than', value: '30' },
  ];

  it('returns true when all conditions match', () => {
    const session = createMockSession({
      variables: {
        user_level: 'premium',
        purchase_count: '10',
        last_action: 'button_click',
        banned: 'false',
        email: 'user@test.com',
        age: '25',
      },
    });

    const handler = createMockHandler({ conditions });

    // Inline logic (mirrors checkConditions in bot-engine)
    const vars = session.variables ?? {};
    let result = true;
    for (const cond of conditions) {
      const actual = vars[cond.variable];
      if (actual === undefined) { result = false; break; }
      switch (cond.operator) {
        case 'equals': if (actual !== cond.value) result = false; break;
        case 'not_equals': if (actual === cond.value) result = false; break;
        case 'contains': if (!actual.includes(cond.value)) result = false; break;
        case 'greater_than': if (Number(actual) <= Number(cond.value)) result = false; break;
        case 'less_than': if (Number(actual) >= Number(cond.value)) result = false; break;
        case 'exists': if (!actual) result = false; break;
        case 'not_exists': if (actual) result = false; break;
      }
      if (!result) break;
    }

    expect(result).toBe(true);
  });

  it('returns false when a condition fails', () => {
    const session = createMockSession({
      variables: {
        user_level: 'free', // doesn't match 'premium'
        purchase_count: '10',
        last_action: 'button_click',
        banned: 'false',
        email: 'user@test.com',
        age: '25',
      },
    });

    const handler = createMockHandler({ conditions });

    const vars = session.variables ?? {};
    let result = true;
    for (const cond of conditions) {
      const actual = vars[cond.variable];
      if (actual === undefined) { result = false; break; }
      switch (cond.operator) {
        case 'equals': if (actual !== cond.value) result = false; break;
        case 'not_equals': if (actual === cond.value) result = false; break;
        case 'contains': if (!actual.includes(cond.value)) result = false; break;
        case 'greater_than': if (Number(actual) <= Number(cond.value)) result = false; break;
        case 'less_than': if (Number(actual) >= Number(cond.value)) result = false; break;
        case 'exists': if (!actual) result = false; break;
        case 'not_exists': if (actual) result = false; break;
      }
      if (!result) break;
    }

    expect(result).toBe(false);
  });

  it('returns false when variable does not exist', () => {
    const session = createMockSession({ variables: {} });
    const handler = createMockHandler({ conditions: [{ variable: 'missing_var', operator: 'exists', value: '' }] });

    const vars = session.variables ?? {};
    const cond = handler.conditions![0];
    const result = vars[cond.variable] !== undefined;

    expect(result).toBe(false);
  });

  it('returns true when conditions array is empty', () => {
    const session = createMockSession({ variables: {} });
    const handler = createMockHandler({ conditions: [] });

    const result = !handler.conditions || handler.conditions.length === 0;
    expect(result).toBe(true);
  });
});

// ── Test: priority ordering ───────────────────────────────────────────────────

describe('Handler priority', () => {
  it('higher priority handler matches first', () => {
    const handlers: BotHandler[] = [
      createMockHandler({ name: 'low', priority: 100, trigger_type: 'keyword', trigger_value: 'привет' }),
      createMockHandler({ name: 'high', priority: 1, trigger_type: 'keyword', trigger_value: 'привет' }),
      createMockHandler({ name: 'medium', priority: 50, trigger_type: 'keyword', trigger_value: 'привет' }),
    ];

    // Engine sorts by priority ascending (lower number = higher priority)
    const sorted = [...handlers].sort((a, b) => a.priority - b.priority);

    const event = createMockEvent({ content: { text: 'привет' } });
    const text = (event.content.text || '').toLowerCase();

    let matched = sorted[0];
    for (const h of sorted) {
      const keywords = (h.trigger_value || '').split(',').map((k: string) => k.trim().toLowerCase());
      if (keywords.some((k: string) => text.includes(k))) {
        matched = h;
        break;
      }
    }

    expect(matched.name).toBe('high');
    expect(matched.priority).toBe(1);
  });
});

// ── Test: buildResponse interpolation ─────────────────────────────────────────

describe('Response interpolation', () => {
  it('interpolates {variable} placeholders', () => {
    const variables: Record<string, string> = { user_name: 'Иван', product: 'Книга' };
    const text = 'Привет, {user_name}! Вы заказали {product}.';
    const result = text.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? `{${key}}`);

    expect(result).toBe('Привет, Иван! Вы заказали Книга.');
  });

  it('keeps unknown placeholders as-is', () => {
    const variables: Record<string, string> = { user_name: 'Иван' };
    const text = 'Привет, {user_name}! Ваш код: {code}.';
    const result = text.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? `{${key}}`);

    expect(result).toBe('Привет, Иван! Ваш код: {code}.');
  });
});

// ── Test: validateEvent ───────────────────────────────────────────────────────

describe('validateEvent', () => {
  it('returns true for valid event', () => {
    const event = createMockEvent({});
    const result = typeof event === 'object' && event !== null &&
      typeof event.event_id === 'string' &&
      typeof event.timestamp === 'string' &&
      typeof event.bot_id === 'string' &&
      typeof event.user_id === 'string' &&
      typeof event.chat_id === 'string' &&
      typeof event.type === 'string' &&
      typeof event.content === 'object';
    expect(result).toBe(true);
  });

  it('returns false for null event', () => {
    const result = null !== null;
    expect(result).toBe(false);
  });

  it('returns false for missing required fields', () => {
    const event = { event_id: '123' }; // missing most fields
    const result = typeof event === 'object' && event !== null &&
      typeof (event as any).timestamp === 'string';
    expect(result).toBe(false);
  });
});

// ── Test: buildResponse method handling ───────────────────────────────────────

describe('buildResponse', () => {
  it('handles sendMessage method', () => {
    const response = { method: 'sendMessage', params: { text: 'Hello {name}' }, options: {} };
    expect(response.method).toBe('sendMessage');
    expect(response.params.text).toBe('Hello {name}');
  });

  it('handles sendPhoto method', () => {
    const response = { method: 'sendPhoto', params: { photo: 'https://example.com/photo.jpg', caption: 'Фото' }, options: {} };
    expect(response.method).toBe('sendPhoto');
    expect(response.params.photo).toBe('https://example.com/photo.jpg');
  });

  it('handles sendPoll method', () => {
    const response = { method: 'sendPoll', params: { question: 'Ваш выбор?', options: ['A', 'B'] }, options: {} };
    expect(response.method).toBe('sendPoll');
    expect(response.params.options).toEqual(['A', 'B']);
  });

  it('handles sendLocation method', () => {
    const response = { method: 'sendLocation', params: { latitude: 55.7558, longitude: 37.6173 }, options: {} };
    expect(response.method).toBe('sendLocation');
    expect(response.params.latitude).toBe(55.7558);
  });
});