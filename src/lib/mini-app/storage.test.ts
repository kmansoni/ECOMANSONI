/**
 * Unit tests for mini-app/storage.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';

// IndexedDB mock via fake-indexeddb
import fakeIndexedDB from 'fake-indexeddb';
import Keyv from 'keyv';

vi.mock('@/lib/telegram/miniApp', () => ({}));

describe('cloudStorage', () => {
  beforeEach(async () => {
    // @ts-ignore
    const { cloudStorage } = await import('./storage');
    // Clear DB before each test
    await cloudStorage.delete(['test-key-1', 'test-key-2', 'ss_test']);
  });

  it('stores and retrieves a value', async () => {
    // @ts-ignore
    const { cloudStorage } = await import('./storage');
    await cloudStorage.set([{ key: 'test-key-1', value: 'hello-world' }]);
    const items = await cloudStorage.get(['test-key-1']);
    expect(items.length).toBe(1);
    expect(items[0].key).toBe('test-key-1');
    expect(items[0].value).toBe('hello-world');
  });

  it('returns empty array for missing keys', async () => {
    // @ts-ignore
    const { cloudStorage } = await import('./storage');
    const items = await cloudStorage.get(['nonexistent']);
    expect(items).toEqual([]);
  });

  it('deletes a key', async () => {
    // @ts-ignore
    const { cloudStorage } = await import('./storage');
    await cloudStorage.set([{ key: 'test-key-2', value: 'delete-me' }]);
    await cloudStorage.delete(['test-key-2']);
    const items = await cloudStorage.get(['test-key-2']);
    expect(items).toEqual([]);
  });
});

describe('secureStorage', () => {
  beforeEach(async () => {
    // @ts-ignore
    const { secureStorage } = await import('./storage');
    await secureStorage.delete('test-secure');
  });

  it('stores and retrieves an encrypted value', async () => {
    // @ts-ignore
    const { secureStorage } = await import('./storage');
    await secureStorage.set('test-secure', 'my-secret-value');
    const result = await secureStorage.get('test-secure');
    expect(result).toBe('my-secret-value');
  });

  it('returns null for missing key', async () => {
    // @ts-ignore
    const { secureStorage } = await import('./storage');
    const result = await secureStorage.get('nonexistent-secure');
    expect(result).toBeNull();
  });
});

describe('sessionStorage', () => {
  beforeEach(async () => {
    // @ts-ignore
    const { sessionStorage } = await import('./storage');
    sessionStorage.clear();
  });

  it('stores and retrieves values', () => {
    // @ts-ignore
    const { sessionStorage } = await import('./storage');
    sessionStorage.set('key1', 'val1');
    expect(sessionStorage.get('key1')).toBe('val1');
  });

  it('returns null for missing key', () => {
    // @ts-ignore
    const { sessionStorage } = await import('./storage');
    expect(sessionStorage.get('missing')).toBeNull();
  });

  it('clears all values', () => {
    // @ts-ignore
    const { sessionStorage } = await import('./storage');
    sessionStorage.set('a', '1');
    sessionStorage.set('b', '2');
    sessionStorage.clear();
    expect(sessionStorage.get('a')).toBeNull();
    expect(sessionStorage.get('b')).toBeNull();
  });
});