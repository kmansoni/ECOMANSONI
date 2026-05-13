/**
 * Unit tests for mini-app/router.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/telegram/deepLinks', () => ({
  parseDeepLink: vi.fn(),
  buildMiniAppLink: vi.fn(),
  extractStartAppPayload: vi.fn(),
}));

describe('parseLocation', () => {
  it('parses a full URL correctly', () => {
    // @ts-ignore
    const { parseLocation } = require('./router');
    const loc = parseLocation('https://example.com/path/to/page?foo=bar&baz=123#section');
    expect(loc.path).toBe('/path/to/page');
    expect(loc.query.foo).toBe('bar');
    expect(loc.query.baz).toBe('123');
    expect(loc.hash).toBe('section');
  });

  it('handles root URL', () => {
    // @ts-ignore
    const { parseLocation } = require('./router');
    const loc = parseLocation('https://example.com/');
    expect(loc.path).toBe('/');
    expect(loc.name).toBe('');
  });

  it('handles invalid URL gracefully', () => {
    // @ts-ignore
    const { parseLocation } = require('./router');
    const loc = parseLocation('invalid-url');
    expect(loc.path).toBe('/');
  });
});

describe('navigate', () => {
  beforeEach(() => {
    delete (global as any)._currentRoute;
    vi.stubGlobal('window', {
      ...global.window,
      history: {
        ...global.window.history,
        pushState: vi.fn(),
        replaceState: vi.fn(),
        back: vi.fn(),
      },
      location: { href: 'https://example.com/' },
    });
  });

  it('pushes new URL to history', () => {
    // @ts-ignore
    const { navigate } = require('./router');
    navigate('/test-page');
    expect(window.history.pushState).toHaveBeenCalled();
  });

  it('replaces URL when replace=true', () => {
    // @ts-ignore
    const { navigate } = require('./router');
    navigate('/test-page', true);
    expect(window.history.replaceState).toHaveBeenCalled();
  });
});

describe('goBack', () => {
  it('calls history.back()', () => {
    // @ts-ignore
    const { goBack } = require('./router');
    goBack();
    expect(window.history.back).toHaveBeenCalled();
  });
});

describe('handleDeepLink', () => {
  it('parses t.me startapp links', () => {
    // @ts-ignore
    const { handleDeepLink } = require('./router');
    const parseMock = vi.mocked(require('@/lib/telegram/deepLinks').parseDeepLink);
    parseMock.mockReturnValue({
      command: 'startapp',
      botUsername: 'mybot',
      payload: 'test-payload',
      raw: 'https://t.me/mybot?startapp=test-payload',
    });

    const handlers: Record<string, vi.Mock> = {
      onStartApp: vi.fn(),
      onStart: vi.fn(),
      onResolve: vi.fn(),
    };
    const result = handleDeepLink('https://t.me/mybot?startapp=test-payload', handlers);
    expect(result).toBe(true);
    expect(handlers.onStartApp).toHaveBeenCalledWith('test-payload', 'mybot');
  });

  it('parses tg:// resolve links', () => {
    // @ts-ignore
    const { handleDeepLink } = require('./router');
    const parseMock = vi.mocked(require('@/lib/telegram/deepLinks').parseDeepLink);
    parseMock.mockReturnValue({
      command: 'resolve',
      botUsername: 'coolbot',
      payload: '',
      raw: 'tg://resolve?domain=coolbot',
    });

    const handlers: Record<string, vi.Mock> = {
      onResolve: vi.fn(),
    };
    const result = handleDeepLink('tg://resolve?domain=coolbot', handlers);
    expect(result).toBe(true);
    expect(handlers.onResolve).toHaveBeenCalledWith('coolbot');
  });

  it('returns false for invalid URLs', () => {
    // @ts-ignore
    const { handleDeepLink } = require('./router');
    const parseMock = vi.mocked(require('@/lib/telegram/deepLinks').parseDeepLink);
    parseMock.mockReturnValue(null);

    const result = handleDeepLink('https://google.com', {});
    expect(result).toBe(false);
  });
});

describe('initHashRouter', () => {
  it('calls handler for matching hash', () => {
    // @ts-ignore
    const { initHashRouter } = require('./router');
    const handler = vi.fn();
    global.location = { hash: '#/test' } as unknown as Location;
    initHashRouter({ '/test': handler, '*': vi.fn() });
    expect(handler).toHaveBeenCalled();
  });
});