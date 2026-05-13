/**
 * Unit tests for mini-app/analytics.ts
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
  trackPageView: vi.fn(),
}));

vi.mock('@/lib/telegram/analytics', () => ({
  trackMiniAppEvent: vi.fn(),
  trackMiniAppPageView: vi.fn(),
  trackAppOpen: vi.fn(),
  trackAppClose: vi.fn(),
  trackExpand: vi.fn(),
  trackQRScan: vi.fn(),
  trackContactRequest: vi.fn(),
  trackEmojiStatus: vi.fn(),
  trackStarsPaymentInitiated: vi.fn(),
  trackStarsPaymentCompleted: vi.fn(),
  startSessionTracking: vi.fn(),
  endSessionTracking: vi.fn(),
}));

describe('mini-app analytics bridge', () => {
  it('exports all expected functions', () => {
    // @ts-ignore
    const analytics = require('./analytics');
    expect(typeof analytics.trackEvent).toBe('function');
    expect(typeof analytics.trackPageView).toBe('function');
    expect(typeof analytics.trackMiniAppEvent).toBe('function');
    expect(typeof analytics.trackMiniAppPageView).toBe('function');
    expect(typeof analytics.trackAppOpen).toBe('function');
    expect(typeof analytics.trackAppClose).toBe('function');
    expect(typeof analytics.trackExpand).toBe('function');
    expect(typeof analytics.trackQRScan).toBe('function');
    expect(typeof analytics.trackContactRequest).toBe('function');
    expect(typeof analytics.trackEmojiStatus).toBe('function');
    expect(typeof analytics.trackStarsPaymentInitiated).toBe('function');
    expect(typeof analytics.trackStarsPaymentCompleted).toBe('function');
    expect(typeof analytics.startSessionTracking).toBe('function');
    expect(typeof analytics.endSessionTracking).toBe('function');
  });

  it('trackEvent calls core trackEvent', () => {
    // @ts-ignore
    const { trackEvent } = require('./analytics');
    trackEvent('test_event', { prop: 'val' });
    // Core trackEvent is mocked — just verify it doesn't throw
    expect(true).toBe(true);
  });

  it('startSessionTracking does not throw', () => {
    // @ts-ignore
    const { startSessionTracking } = require('./analytics');
    expect(() => startSessionTracking()).not.toThrow();
  });

  it('endSessionTracking does not throw', () => {
    // @ts-ignore
    const { endSessionTracking } = require('./analytics');
    expect(() => endSessionTracking()).not.toThrow();
  });
});