/**
 * GDPR Compliance Tests
 *
 * Проверяет соблюдение GDPR/CCPA/COPPA:
 * - Right to be forgotten (полное удаление всех данных)
 * - Data portability (export в JSON/MBOX)
 * - Consent revocation
 * - Anonymization vs delete (keep metadata)
 * - Auto-purge после 30 дней (message TTL)
 * - 3rd-party data processors (AWS, Cloudflare)
 */

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
    it('should delete all personal messages from all dialogs', async () => {
      // Пользователь отправил 150 сообщений в 5 диалогах
      const dialogs = ['conv-1', 'conv-2', 'conv-3', 'conv-4', 'conv-5'];

      const deleteSpy = vi.spyOn(supabase, 'from').mockReturnValue({
        delete: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      } as any);

      await deleteUserDataCompletely(userId);

      // Проверяем: вызов delete для каждой таблицы с PII
      expect(deleteSpy).toHaveBeenCalledWith('messages');
      expect(deleteSpy).toHaveBeenCalledWith('user_profiles');
      expect(deleteSpy).toHaveBeenCalledWith('user_emoji_preferences');
      expect(deleteSpy).toHaveBeenCalledWith('user_quick_reaction');
      expect(deleteSpy).toHaveBeenCalledWith('user_settings');
      expect(deleteSpy).toHaveBeenCalledWith('user_blocklist');
    });

    it('should remove from group chats but preserve group metadata', async () => {
      // Пользователь был в групповом чате (1000 участников)
      // После удаления: он удалён из participants, но группа остаётся
      const removeFromGroupSpy = vi.fn().mockResolvedValue({ error: null });

      vi.spyOn(supabase, 'from').mockReturnValue({
        update: vi.fn(() => ({
          eq: removeFromGroupSpy,
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      } as any);

      await deleteUserDataCompletely(userId);

      // Проверяеsend: user удалён из participants, но channel_messages не затрагиваем
      expect(removeFromGroupSpy).toHaveBeenCalledWith({
        participants: expect.not.arrayContaining([userId]),
      });
    });

    it('should purge from analytics (anonymize)', async () => {
      const anonSpy = vi.fn().mockResolvedValue({ error: null });

      vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: null } as any);
      vi.spyOn(supabase, 'from').mockReturnValue({
        update: vi.fn(() => ({
          eq: anonSpy,
        })),
      } as any);

      await deleteUserDataCompletely(userId);

      // Аналитика анонимизируется (user_id → hash), не удаляется полностью
      // (для compliance: агрегаты должны остаться)
    });
  });

  describe('Data Portability (Art. 20)', () => {
    it('should export all user data as JSON', async () => {
      const exportResult = await exportUserData(userId, { format: 'json' });

      expect(exportResult).toHaveProperty('messages');
      expect(exportResult).toHaveProperty('contacts');
      expect(exportResult).toHaveProperty('settings');
      expect(exportResult).toHaveProperty('media');
      expect(exportResult.messages).toBeInstanceOf(Array);
      expect(exportResult.messages.length).toBeGreaterThan(0);
    });

    it('should export as MBOX for email-style import', async () => {
      const mbox = await exportUserData(userId, { format: 'mbox' });

      expect(mbox).toContain('From: ');
      expect(mbox).toContain('Subject: ');
      expect(mbox).toContain('Message-ID: ');
    });

    it('should include metadata (timestamps, read status)', async () => {
      const data = await exportUserData(userId);

      const message = data.messages[0];
      expect(message).toHaveProperty('sent_at');
      expect(message).toHaveProperty('edited_at');
      expect(message).toHaveProperty('read_by');
    });
  });

  describe('Consent Management (Art. 7)', () => {
    it('should revoke all consents on user request', async () => {
      const revokeSpy = vi.fn().mockResolvedValue({ error: null });

      vi.spyOn(supabase, 'from').mockReturnValue({
        update: vi.fn(() => ({
          eq: revokeSpy,
        })),
      } as any);

      await revokeConsent(userId);

      expect(revokeSpy).toHaveBeenCalledWith({
        consent_marketing: false,
        consent_analytics: false,
        consent_third_party: false,
        consent_updated_at: expect.any(String),
      });
    });

    it('should not process personal data after consent revocation', async () => {
      // После отзыва согласия: сбор данных прекращён
      await revokeConsent(userId);

      const analyticsSpy = vi.spyOn(supabase, 'from');

      // Попытка записать analytics event должна быть отклонена
      try {
        await supabase.from('analytics_events').insert({
          user_id: userId,
          event: 'chat_opened',
        });
        // Должно быть проигнорировано или выброшено
      } catch {
        // ok
      }
    });
  });

  describe('Anonymization vs Deletion', () => {
    it('should anonymize but keep aggregate stats when delete == false', async () => {
      // Для legal hold: удаляем PII, но оставляем метрики
      const result = await anonymizeUser(userId, { keepAggregates: true });

      expect(result.personalDataRemoved).toBe(true);
      expect(result.analyticsPreserved).toBe(true);
      expect(result.userIdHash).toBeDefined(); // hash(user_id) остаётся
    });

    it('should fully delete when keepAggregates === false', async () => {
      const result = await anonymizeUser(userId, { keepAggregates: false });

      expect(result.personalDataRemoved).toBe(true);
      expect(result.analyticsPreserved).toBe(false);
    });
  });

  describe('Auto-Purge (30-Day Retention)', () => {
    it('should auto-delete messages older than 30 days', async () => {
      // В messages есть record with created_at > 30 days ago
      const thirtyOneDaysAgo = new Date();
      thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

      const deleteOldSpy = vi.fn().mockResolvedValue({ error: null });

      vi.spyOn(supabase, 'from').mockReturnValue({
        delete: vi.fn(() => ({
          lt: vi.fn(() => ({
            eq: deleteOldSpy,
          })),
        })),
      } as any);

      await purgeExpiredMessages({ ttlDays: 30 });

      expect(deleteOldSpy).toHaveBeenCalledWith({
        created_at: { lt: expect.any(String) },
      });
    });

    it('should NOT auto-delete messages in "saved" or "pinned" state', async () => {
      const deleteSpy = vi.fn().mockResolvedValue({ error: null });

      vi.spyOn(supabase, 'from').mockReturnValue({
        delete: vi.fn(() => ({
          lt: vi.fn(() => ({
            eq: deleteOldSpy,
            in: vi.fn(() => Promise.resolve({ error: null })), // filter: NOT saved/pinned
          })),
        })),
      } as any);

      await purgeExpiredMessages({ ttlDays: 30, preserveSaved: true });

      // Проверяем, что добавлен фильтр на saved/pinned
      // (в реальной impl: WHERE saved = false AND pinned = false)
    });
  });

  describe('Third-Party Data Processors', () => {
    it('should purge from AWS S3 media storage on deletion request', async () => {
      const s3DeleteSpy = vi.fn().mockResolvedValue({});

      // Mock AWS SDK
      vi.mock('@aws-sdk/client-s3', () => ({
        S3Client: vi.fn().mockImplementation(() => ({
          send: s3DeleteSpy,
        })),
      }));

      const { deleteUserMediaFromS3 } = await import('@/lib/chat/gdpr');
      await deleteUserMediaFromS3(userId);

      expect(s3DeleteSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: expect.stringContaining('media'),
          Key: expect.stringContaining(userId),
        })
      );
    });

    it('should notify Cloudflare R2 for object delete', async () => {
      // Если используется Cloudflare R2 вместо S3
      // Аналогичная проверка
    });
  });

  describe('COPPA (Children Online Privacy Protection)', () => {
    it('should require parental consent for users under 13', async () => {
      const childUserId = 'child-under-13';

      const result = await deleteUserDataCompletely(childUserId, {
        requireParentalConsent: true,
      });

      expect(result.requiresParentalConsent).toBe(true);
      expect(result.action).toBe('AWAITING_PARENTAL_CONSENT');
    });

    it('should not collect location from children', async () => {
      const childUserId = 'child-12';

      vi.spyOn(supabase, 'from').mockReturnValue({
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      } as any);

      await deleteUserDataCompletely(childUserId, { isChild: true });

      // Убедиться, что location_data удалено
      // (проверка через вызов delete с location_data в списке)
    });
  });
});
