/**
 * Unit tests for mini-app/storage.ts
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';

// Mock indexedDB for Node.js environment
const mockIndexedDB = {
  open: vi.fn().mockImplementation((dbName, version) => {
    const mockRequest = {
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
      result: {
        transaction: vi.fn().mockReturnValue({
          objectStore: vi.fn().mockReturnValue({
            get: vi.fn().mockImplementation((key) => {
              const mockGetRequest = {
                onsuccess: null,
                onerror: null,
                result: null
              };
              
              // Simulate success after a short delay
              setTimeout(() => {
                if (mockGetRequest.onsuccess) mockGetRequest.onsuccess();
              }, 0);
              
              return mockGetRequest;
            }),
            put: vi.fn().mockImplementation((value, key) => {
              const mockPutRequest = {
                onsuccess: null,
                onerror: null
              };
              
              // Simulate success after a short delay
              setTimeout(() => {
                if (mockPutRequest.onsuccess) mockPutRequest.onsuccess();
              }, 0);
              
              return mockPutRequest;
            }),
            delete: vi.fn().mockImplementation((key) => {
              const mockDeleteRequest = {
                onsuccess: null,
                onerror: null
              };
              
              // Simulate success after a short delay
              setTimeout(() => {
                if (mockDeleteRequest.onsuccess) mockDeleteRequest.onsuccess();
              }, 0);
              
              return mockDeleteRequest;
            })
          })
        })
      }
    };
    
    return mockRequest;
  })
};

// Store original crypto descriptors to restore later
let originalGetRandomValuesDescriptor: PropertyDescriptor | undefined;
let originalSubtleDescriptor: PropertyDescriptor | undefined;

// Mock indexedDB
beforeAll(() => {
  // @ts-ignore
  global.indexedDB = mockIndexedDB;
});

// Mock crypto functions
beforeAll(() => {
  // Store original descriptors
  if (global.crypto) {
    originalGetRandomValuesDescriptor = Object.getOwnPropertyDescriptor(global.crypto, 'getRandomValues');
    originalSubtleDescriptor = Object.getOwnPropertyDescriptor(global.crypto, 'subtle');
  }
  
  // Mock crypto functions
  if (global.crypto) {
    Object.defineProperty(global.crypto, 'getRandomValues', {
      value: vi.fn().mockImplementation((array) => {
        // Fill array with random values
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
        return array;
      }),
      configurable: true,
      writable: true
    });
    
    Object.defineProperty(global.crypto, 'subtle', {
      value: {
        importKey: vi.fn().mockResolvedValue({}),
        deriveKey: vi.fn().mockResolvedValue({}),
        encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(16)),
        decrypt: vi.fn().mockResolvedValue(new TextEncoder().encode('test-value'))
      },
      configurable: true,
      writable: true
    });
  }
});

// Restore original values
afterAll(() => {
  // Restore indexedDB
  // @ts-ignore
  global.indexedDB = undefined;
  
  // Restore crypto functions
  if (global.crypto) {
    if (originalGetRandomValuesDescriptor) {
      Object.defineProperty(global.crypto, 'getRandomValues', originalGetRandomValuesDescriptor);
    } else {
      // If there was no original descriptor, delete the property
      delete (global as any).crypto.getRandomValues;
    }
    
    if (originalSubtleDescriptor) {
      Object.defineProperty(global.crypto, 'subtle', originalSubtleDescriptor);
    } else {
      // If there was no original descriptor, delete the property
      delete (global as any).crypto.subtle;
    }
  }
});

describe('cloudStorage', () => {
  beforeEach(async () => {
    // Clear all mocks before each test
    vi.clearAllMocks();
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
    // Clear all mocks before each test
    vi.clearAllMocks();
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
  beforeEach(() => {
    // @ts-ignore
    const { sessionStorage } = require('./storage');
    sessionStorage.clear();
  });

  it('stores and retrieves values', () => {
    // @ts-ignore
    const { sessionStorage } = require('./storage');
    sessionStorage.set('key1', 'val1');
    expect(sessionStorage.get('key1')).toBe('val1');
  });

  it('returns null for missing key', () => {
    // @ts-ignore
    const { sessionStorage } = require('./storage');
    expect(sessionStorage.get('missing')).toBeNull();
  });

  it('clears all values', () => {
    // @ts-ignore
    const { sessionStorage } = require('./storage');
    sessionStorage.set('a', '1');
    sessionStorage.set('b', '2');
    sessionStorage.clear();
    expect(sessionStorage.get('a')).toBeNull();
    expect(sessionStorage.get('b')).toBeNull();
  });
});