/**
 * Chat Cache Hook — simple cache abstraction
 */

export function useChatCache(options?: { useIndexedDB?: boolean }) {
  return {
    set: async (key: string, value: any, opts?: { storage?: 'localStorage' | 'indexeddb' }) => {
      // stub
    },
    get: async (key: string) => null,
    clear: async () => {},
  };
}
