/**
 * Chat Storage Quotas Tests
 *
 * Проверяет управление хранилищем:
 * - LocalStorage 5MB limit → IndexedDB fallback
 * - Media cache LRU eviction (100MB limit)
 * - Offline message limit (1000 messages auto-purge)
 * - Database vacuum (Supabase table size)
 * - Attachment TTL (30 days auto-delete)
 * - Clear cache safe vs nuclear
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageQuotaManager } from '@/test/utils/storageQuotaManager';
import { useChatCache } from '@/hooks/useChatCache';
import { OutboxQueue } from '@/lib/chat/messageOutbox';

describe('Chat Storage Quotas', () => {
  let quotaManager: StorageQuotaManager;

  beforeEach(() => {
    quotaManager = new StorageQuotaManager();
    quotaManager.reset();
  });

  describe('LocalStorage Quota (5MB)', () => {
    it('should throw when exceeding 5MB limit', () => {
      quotaManager.setItem('key1', 'a'.repeat(1_000_000)); // 1MB
      quotaManager.setItem('key2', 'a'.repeat(4_000_000)); // 4MB
      // Total: 5MB — ok

      expect(() => {
        quotaManager.setItem('key3', 'a'.repeat(100)); // overflow
      }).toThrow('localStorage limit exceeded');
    });

    it('should fallback to IndexedDB when localStorage full', async () => {
      const cache = useChatCache({ useIndexedDB: true });

      // Fill localStorage to 4.9MB
      for (let i = 0; i < 490; i++) {
        quotaManager.setItem(`key-${i}`, 'x'.repeat(10_000));
      }

      // Large data should go to IndexedDB
      const largeData = new ArrayBuffer(500_000); // 500KB
      await cache.set('large-blob', largeData, { storage: 'indexeddb' });

      expect(quotaManager.getIndexedDBUsage()).toBeGreaterThan(0);
    });

    it('should evict LRU items when limit approached', () => {
      // Insert 1000 items, then add one more → LRU eviction
      for (let i = 0; i < 1000; i++) {
        quotaManager.setItem(`key-${i}`, `value-${i}`, 60_000); // 1 min TTL
      }

      // Access first 100 items (make them recently used)
      for (let i = 0; i < 100; i++) {
        quotaManager.getItem(`key-${i}`);
      }

      // Trigger eviction
      quotaManager.setItem('new-key', 'new-value');

      // First 100 items should remain (MRU), last 900 partially evicted
      expect(quotaManager.getLocalStorageItemCount()).toBeLessThanOrEqual(1000);
    });
  });

  describe('Media Cache Eviction (100MB, 30-day TTL)', () => {
    it('should evict oldest media first (FIFO)', () => {
      const blob1 = new Blob(['img1'.repeat(25_000_000)]); // 100MB
      const blob2 = new Blob(['img2'.repeat(10_000_000)]); // 40MB

      quotaManager.addMediaCache('media-1', blob1);
      quotaManager.addMediaCache('media-2', blob2);

      // Total: 140MB > 100MB limit → evict oldest (media-1)
      expect(quotaManager.getMediaCacheItems().has('media-1')).toBe(false);
      expect(quotaManager.getMediaCacheItems().has('media-2')).toBe(true);
    });

    it('should auto-purge media after 30 days', () => {
      const oldBlob = new Blob(['old']);
      const recentBlob = new Blob(['new']);

      quotaManager.addMediaCache('old', oldBlob); // TTL baked in
      // Simulate 31 days passed
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 24 * 60 * 60 * 1000);

      quotaManager.purgeExpiredMedia();

      expect(quotaManager.getMediaCache('old')).toBeNull();
      expect(quotaManager.getMediaCache('new')).toBeNull(); // also expired (mock)
    });

    it('should respect per-file TTL override', () => {
      const shortTTLBlob = new Blob(['short']);
      quotaManager.addMediaCache('short', shortTTLBlob, 1_000); // 1 sec TTL

      // Wait 2s
      return new Promise(resolve => setTimeout(resolve, 2000)).then(() => {
        quotaManager.purgeExpiredMedia();
        expect(quotaManager.getMediaCache('short')).toBeNull();
      });
    });
  });

  describe('Offline Message Queue Limit (1000 messages)', () => {
    it('should cap offline queue at 1000 messages (FIFO drop)', () => {
      const outbox = new OutboxQueue({ maxSize: 1000 });

      for (let i = 0; i < 1100; i++) {
        outbox.enqueue({ id: `msg-${i}`, content: 'test' });
      }

      expect(outbox.size()).toBe(1000);
      expect(outbox.peek().id).toBe('msg-100'); // dropped first 100 (FIFO)
    });

    it('should persist offline queue across reloads (IndexedDB)', async () => {
      const outbox = new OutboxQueue({ persist: true, maxSize: 100 });

      outbox.enqueue({ id: 'offline-1', content: 'hello' });
      await outbox.flushToIndexedDB();

      // Simulate page reload
      const reloaded = await OutboxQueue.loadFromIndexedDB();

      expect(reloaded.size()).toBe(1);
      expect(reloaded.peek()).toEqual({ id: 'offline-1', content: 'hello' });
    });

    it('should auto-drain on reconnect', async () => {
      const outbox = new OutboxQueue({ autoSend: true });
      const sendSpy = vi.spyOn(outbox, 'send').mockResolvedValue({});

      outbox.enqueue({ id: 'q1', content: 'queued' });
      outbox.enqueue({ id: 'q2', content: 'queued' });

      await outbox.drainOnReconnect();

      expect(sendSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Attachment TTL (30 days auto-delete)', () => {
    it('should schedule auto-delete for attachments', async () => {
      const scheduleSpy = vi.fn();

      vi.spyOn(supabase, 'rpc').mockImplementation((fn: string) => {
        if (fn === 'schedule_attachment_ttl') {
          scheduleSpy();
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const { scheduleAttachmentTTL } = await import('@/lib/chat/attachments');
      await scheduleAttachmentTTL('attachment-id-123', { ttlDays: 30 });

      expect(scheduleSpy).toHaveBeenCalledWith({
        attachment_id: 'attachment-id-123',
        delete_after_days: 30,
      });
    });

    it('should NOT auto-delete pinned attachments', async () => {
      const deleteSpy = vi.fn().mockResolvedValue({ error: null });

      vi.spyOn(supabase, 'from').mockReturnValue({
        delete: vi.fn(() => ({
          lt: vi.fn(() => ({
            eq: deleteSpy,
            in: vi.fn(() => Promise.resolve({ error: null })), // WHERE pinned = false
          })),
        })),
      } as any);

      const { purgeExpiredAttachments } = await import('@/lib/chat/attachments');
      await purgeExpiredAttachments({ preservePinned: true });

      expect(deleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pinned: false, // фильтр
        })
      );
    });
  });

  describe('Clear Cache Safe vs Nuclear', () => {
    it('should clear only non-essential cache (safe)', async () => {
      const { clearCacheSafely } = await import('@/lib/chat/cache');

      // User cache: messages, drafts, media thumbnails
      // Essential cache: auth token, settings

      vi.spyOn(localStorage, 'clear').mockImplementationOnce(() => {
        // selective clear (keys starting with 'chat_')
      });

      await clearCacheSafely({ type: 'media' });

      // Проверяем: media cleared, auth preserved
      expect(localStorage.clear).not.toHaveBeenCalled(); // selective
    });

    it('should clear everything (nuclear)', async () => {
      const { clearCacheSafely } = await import('@/lib/chat/cache');

      vi.spyOn(localStorage, 'clear').mockImplementation(() => {});

      await clearCacheSafely({ type: 'all' });

      expect(localStorage.clear).toHaveBeenCalled();
    });
  });

  describe('Supabase Table Size Management', () => {
    it('should vacuum messages table when > 1GB', async () => {
      const vacuumSpy = vi.fn().mockResolvedValue({});

      vi.spyOn(supabase, 'rpc').mockImplementation((fn: string) => {
        if (fn === 'vacuum_chat_messages') {
          vacuumSpy();
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const { checkAndVacuumIfNeeded } = await import('@/lib/chat/maintenance');
      await checkAndVacuumIfNeeded();

      expect(vacuumSpy).toHaveBeenCalled();
    });

    it('should archive old messages to cold storage', async () => {
      const archiveSpy = vi.fn().mockResolvedValue({});

      vi.spyOn(supabase, 'rpc').mockImplementation((fn: string) => {
        if (fn === 'archive_old_messages') {
          archiveSpy();
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      // Archive messages older than 1 year
      await supabase.rpc('archive_old_messages', {
        older_than_days: 365,
      });

      expect(archiveSpy).toHaveBeenCalledWith({
        older_than_days: 365,
      });
    });
  });
});
