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
  it('parses a full URL correctly', async () => {
    // @ts-ignore
    const { parseLocation } = await import('./router');
    const loc = parseLocation('https://example.com/path/to/page?foo=bar&baz=123#section');
    expect(loc.path).toBe('/path/to/page');
    expect(loc.query.foo).toBe('bar');
    expect(loc.query.baz).toBe('123');
    expect(loc.hash).toBe('section');
  });

  it('handles root URL', async () => {
    // @ts-ignore
    const { parseLocation } = await import('./router');
    const loc = parseLocation('https://example.com/');
    expect(loc.path).toBe('/');
    expect(loc.name).toBe('');
  });
});

describe('handleDeepLink', () => {
  it('parses t.me startapp links', async () => {
    // @ts-ignore
    const { handleDeepLink } = await import('./router');
    const { parseDeepLink } = await import('@/lib/telegram/deepLinks');
    const parseMock = vi.mocked(parseDeepLink, true);
    parseMock.mockReturnValue({
      command: 'startapp',
      botUsername: 'mybot',
      payload: 'test-payload',
      raw: 'https://t.me/mybot?startapp=test-payload',
    });

    const handlers = {
      onStartApp: vi.fn(),
      onStart: vi.fn(),
      onResolve: vi.fn(),
    };
    const result = handleDeepLink('https://t.me/mybot?startapp=test-payload', handlers);
    expect(result).toBe(true);
    expect(handlers.onStartApp).toHaveBeenCalledWith('test-payload', 'mybot');
  });

  it('parses tg:// resolve links', async () => {
    // @ts-ignore
    const { handleDeepLink } = await import('./router');
    const { parseDeepLink } = await import('@/lib/telegram/deepLinks');
    const parseMock = vi.mocked(parseDeepLink, true);
    parseMock.mockReturnValue({
      command: 'resolve',
      botUsername: 'coolbot',
      payload: '',
      raw: 'tg://resolve?domain=coolbot',
    });

    const handlers = {
      onResolve: vi.fn(),
    };
    const result = handleDeepLink('tg://resolve?domain=coolbot', handlers);
    expect(result).toBe(true);
    expect(handlers.onResolve).toHaveBeenCalledWith('coolbot');
  });

  it('returns false for invalid URLs', async () => {
    // @ts-ignore
    const { handleDeepLink } = await import('./router');
    const { parseDeepLink } = await import('@/lib/telegram/deepLinks');
    const parseMock = vi.mocked(parseDeepLink, true);
    parseMock.mockReturnValue(null);

    const handlers = { onStartApp: vi.fn(), onStart: vi.fn(), onResolve: vi.fn() };
    const result = handleDeepLink('invalid-url', handlers);
    expect(result).toBe(false);
    expect(handlers.onStartApp).not.toHaveBeenCalled();
    expect(handlers.onStart).not.toHaveBeenCalled();
    expect(handlers.onResolve).not.toHaveBeenCalled();
  });
});

describe('navigate', () => {
  it('pushes new route', async () => {
    // @ts-ignore
    const { navigate } = await import('./router');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    navigate('/test');
    expect(pushSpy).toHaveBeenCalledWith(expect.any(Object), '', '/test');
    pushSpy.mockRestore();
  });

  it('replaces current route', async () => {
    // @ts-ignore
    const { navigate } = await import('./router');
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    navigate('/test', true);
    expect(replaceSpy).toHaveBeenCalledWith(expect.any(Object), '', '/test');
    replaceSpy.mockRestore();
  });
});

describe('goBack', () => {
  it('calls window.history.back', async () => {
    // @ts-ignore
    const { goBack } = await import('./router');
    const backSpy = vi.spyOn(window.history, 'back');
    goBack();
    expect(backSpy).toHaveBeenCalled();
    backSpy.mockRestore();
  });
});
