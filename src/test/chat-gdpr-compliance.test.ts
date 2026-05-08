import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deleteUserDataCompletely,
  exportUserData,
  anonymizeUser,
  revokeConsent,
  purgeExpiredMessages,
} from '@/lib/chat/gdpr';
import { supabase } from '@/lib/supabase';

describe('GDPR Compliance', () => {
  const userId = 'user-gdpr-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Right to be Forgotten (Art. 17)', () => {
    it('should delete from all user tables and return details', async () => {
      const deleteMock = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      }));

      vi.spyOn(supabase, 'from').mockReturnValue({ delete: deleteMock } as any);

      const result = await deleteUserDataCompletely(userId);

      expect(result.success).toBe(true);
      expect(result.details.length).toBeGreaterThan(0);
      expect(result.details.every((d: string) => d.startsWith('Deleted from '))).toBe(true);
      expect(deleteMock).toHaveBeenCalled();
    });

    it('should report failures per table without throwing', async () => {
      const error = new Error('permission denied');
      vi.spyOn(supabase, 'from').mockReturnValue({
        delete: vi.fn(() => ({
          eq: vi.fn(() => Promise.reject(error)),
        })),
      } as any);

      const result = await deleteUserDataCompletely(userId);

      expect(result.success).toBe(true);
      expect(result.details.some((d: string) => d.includes('Failed'))).toBe(true);
    });

    it('should also remove channel_participants', async () => {
      const eqSpy = vi.fn(() => Promise.resolve({ error: null }));
      const deleteSpy = vi.fn(() => ({ eq: eqSpy }));
      vi.spyOn(supabase, 'from').mockReturnValue({ delete: deleteSpy } as any);

      await deleteUserDataCompletely(userId);

      const calls = (supabase.from as any).mock.calls.map((c: any[]) => c[0]);
      expect(calls).toContain('channel_participants');
    });
  });

  describe('Data Portability (Art. 20)', () => {
    it('should export all user data as JSON with required fields', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { user_id: userId }, error: null }),
        order: vi.fn().mockResolvedValue({ data: [{ id: 1, sender_id: userId }], error: null }),
      } as any);

      const result = await exportUserData(userId, { format: 'json' });

      expect(result).toHaveProperty('messages');
      expect(result).toHaveProperty('contacts');
      expect(result).toHaveProperty('settings');
      expect(result).toHaveProperty('exported_at');
      expect(result.messages).toBeInstanceOf(Array);
      expect(typeof result.exported_at).toBe('string');
    });

    it('should include metadata timestamp in export', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: {}, error: null }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any);

      const before = new Date().toISOString();
      const data = await exportUserData(userId);
      expect(new Date(data.exported_at).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });
  });

  describe('Consent Management (Art. 7)', () => {
    it('should call update on user_consents with all flags false', async () => {
      const eqSpy = vi.fn(() => Promise.resolve({ error: null }));
      const updateSpy = vi.fn(() => ({ eq: eqSpy }));
      vi.spyOn(supabase, 'from').mockReturnValue({ update: updateSpy } as any);

      await revokeConsent(userId);

      expect(supabase.from).toHaveBeenCalledWith('user_consents');
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          consent_marketing: false,
          consent_analytics: false,
          consent_third_party: false,
        })
      );
    });
  });

  describe('Anonymization vs Deletion', () => {
    it('should return hash and preserve analytics when keepAggregates=true', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      } as any);

      const result = await anonymizeUser(userId, { keepAggregates: true });

      expect(result.personalDataRemoved).toBe(true);
      expect(result.analyticsPreserved).toBe(true);
      expect(result.userIdHash).toBeDefined();
      expect(result.userIdHash!.length).toBe(64); // SHA-256 hex
    });

    it('should not preserve analytics when keepAggregates=false', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      } as any);

      const result = await anonymizeUser(userId, { keepAggregates: false });

      expect(result.personalDataRemoved).toBe(true);
      expect(result.analyticsPreserved).toBe(false);
    });
  });

  describe('Auto-Purge (30-Day Retention)', () => {
    it('should delete messages older than ttl', async () => {
      const ltSpy = vi.fn(() => Promise.resolve({ error: null }));
      const deleteSpy = vi.fn(() => ({ lt: ltSpy }));
      vi.spyOn(supabase, 'from').mockReturnValue({ delete: deleteSpy } as any);

      await purgeExpiredMessages({ ttlDays: 30 });

      expect(supabase.from).toHaveBeenCalledWith('messages');
      expect(deleteSpy).toHaveBeenCalled();
      expect(ltSpy).toHaveBeenCalledWith('created_at', expect.any(String));
    });
  });
});
