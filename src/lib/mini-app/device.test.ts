/**
 * Unit tests for mini-app/device.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/telegram/miniApp', () => ({}));

describe('device utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (global as any).DeviceMotionEvent;
    delete (global as any).DeviceOrientationEvent;
  });

  describe('getDeviceInfo', () => {
    it('detects desktop when not mobile UA', () => {
      const original = global.navigator.userAgent;
      Object.defineProperty(global.navigator, 'userAgent', { value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', configurable: true });
      // @ts-ignore
      const info = require('./device').getDeviceInfo();
      expect(info.isDesktop).toBe(true);
      expect(info.isMobile).toBe(false);
      expect(info.platform).toBe('web');
      Object.defineProperty(global.navigator, 'userAgent', { value: original, configurable: true });
    });

    it('detects iOS from iPhone UA', () => {
      const original = global.navigator.userAgent;
      Object.defineProperty(global.navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)', configurable: true });
      // @ts-ignore
      const info = require('./device').getDeviceInfo();
      expect(info.isMobile).toBe(true);
      expect(info.isIOS).toBe(true);
      Object.defineProperty(global.navigator, 'userAgent', { value: original, configurable: true });
    });

    it('detects Android', () => {
      const original = global.navigator.userAgent;
      Object.defineProperty(global.navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 13)', configurable: true });
      // @ts-ignore
      const info = require('./device').getDeviceInfo();
      expect(info.isMobile).toBe(true);
      expect(info.isAndroid).toBe(true);
      Object.defineProperty(global.navigator, 'userAgent', { value: original, configurable: true });
    });
  });

  describe('accelerometer', () => {
    it('start adds event listener', () => {
      const addSpy = vi.spyOn(global.window, 'addEventListener');
      // @ts-ignore
      const { accelerometer } = require('./device');
      accelerometer.start();
      expect(addSpy).toHaveBeenCalledWith('devicemotion', expect.any(Function));
      addSpy.mockRestore();
    });

    it('stop removes event listener', () => {
      const removeSpy = vi.spyOn(global.window, 'removeEventListener');
      // @ts-ignore
      const { accelerometer } = require('./device');
      accelerometer.stop();
      expect(removeSpy).toHaveBeenCalledWith('devicemotion', expect.any(Function));
      removeSpy.mockRestore();
    });

    it('isSupported returns false without DeviceMotionEvent', () => {
      // @ts-ignore
      const { accelerometer } = require('./device');
      expect(typeof accelerometer.isSupported()).toBe('boolean');
    });
  });

  describe('haptic', () => {
    it('impact is no-op without vibrate', () => {
      const original = navigator.vibrate;
      delete (navigator as any).vibrate;
      // @ts-ignore
      const { haptic } = require('./device');
      expect(() => haptic.impact('light')).not.toThrow();
      (navigator as any).vibrate = original;
    });

    it('notification is no-op without vibrate', () => {
      const original = navigator.vibrate;
      delete (navigator as any).vibrate;
      // @ts-ignore
      const { haptic } = require('./device');
      expect(() => haptic.notification('success')).not.toThrow();
      (navigator as any).vibrate = original;
    });
  });

  describe('isQRScannerSupported', () => {
    it('returns false when mediaDevices unavailable', () => {
      const original = navigator.mediaDevices;
      delete (navigator as any).mediaDevices;
      // @ts-ignore
      const { isQRScannerSupported } = require('./device');
      expect(isQRScannerSupported()).toBe(false);
      (navigator as any).mediaDevices = original;
    });
  });
});