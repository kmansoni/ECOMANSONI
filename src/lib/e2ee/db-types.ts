/**
 * E2EE database row types and typed query helpers.
 *
 * These supplement the auto-generated Database type until `supabase gen types typescript`
 * is re-run after the E2EE migrations (20260303150000, 20260304060000) are applied.
 *
 * Usage:
 *   import { e2eeDb } from '@/lib/e2ee/db-types';
 *   const { data, error } = await e2eeDb.userEncryptionKeys.upsert({ ... });
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Row types ────────────────────────────────────────────────────────────────

export interface UserEncryptionKeyRow {
  id?: string;
  user_id: string;
  public_key_raw: string | null;
  fingerprint: string | null;
  updated_at?: string;
  // Legacy / optional columns kept for migration compatibility
  conversation_id?: string | null;
  key_version?: number | null;
  encrypted_group_key?: string | null;
}

export interface ChatEncryptionKeyRow {
  id?: string;
  conversation_id: string;
  key_version: number;
  recipient_id: string | null;
  sender_id: string | null;
  wrapped_key: string | null;
  sender_public_key_raw: string | null;
  is_active: boolean;
  created_at?: string;
  // Legacy columns
  encrypted_key?: string | null;
  created_by?: string | null;
}

export interface ConversationParticipantRow {
  user_id: string;
  conversation_id: string;
}

export interface OneTimePreKeyRow {
  id: string;
  user_id: string;
  public_key_spki: string;
  created_at?: string;
}

export interface ConversationRow {
  id: string;
  encryption_enabled: boolean | null;
  created_by?: string | null;
}

export interface DisableConversationEncryptionResult {
  ok: boolean;
  error?: 'forbidden' | 'conversation_not_found' | string;
  deactivated?: number;
}

export interface EnableConversationEncryptionResult {
  ok: boolean;
  error?: 'conversation_not_found' | 'not_participant' | 'no_active_key' | 'key_version_mismatch' | string;
  active_key_version?: number;
}

// ─── Query result helpers ─────────────────────────────────────────────────────

type QueryResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;
type QueryResultList<T> = Promise<{ data: T[] | null; error: { message: string } | null }>;
type MutationResult = Promise<{ error: { message: string } | null }>;

// ─── Typed query helpers ──────────────────────────────────────────────────────

const db = supabase as unknown as any;

export const e2eeDb = {
  /**
   * user_encryption_keys — identity key storage per user.
   */
  userEncryptionKeys: {
    upsert(
      row: UserEncryptionKeyRow,
      opts: { onConflict: string },
    ): MutationResult {
      return db.from('user_encryption_keys').upsert(row, opts) as MutationResult;
    },

    selectByUserId(
      userId: string,
    ): QueryResult<Pick<UserEncryptionKeyRow, 'public_key_raw' | 'fingerprint'>> {
      return db
        .from('user_encryption_keys')
        .select('public_key_raw, fingerprint')
        .eq('user_id', userId)
        .maybeSingle() as QueryResult<Pick<UserEncryptionKeyRow, 'public_key_raw' | 'fingerprint'>>;
    },

    selectByUserIds(
      userIds: string[],
    ): QueryResultList<Pick<UserEncryptionKeyRow, 'user_id' | 'public_key_raw' | 'fingerprint'>> {
      return db
        .from('user_encryption_keys')
        .select('user_id, public_key_raw, fingerprint')
        .in('user_id', userIds) as QueryResultList<
          Pick<UserEncryptionKeyRow, 'user_id' | 'public_key_raw' | 'fingerprint'>
        >;
    },
  },

  /**
   * chat_encryption_keys — per-recipient wrapped group keys.
   */
  chatEncryptionKeys: {
    insert(row: ChatEncryptionKeyRow): MutationResult {
      return db.from('chat_encryption_keys').insert(row) as MutationResult;
    },

    selectRecipientKey(
      conversationId: string,
      recipientId: string,
      keyVersion: number,
    ): QueryResult<
      Pick<ChatEncryptionKeyRow, 'wrapped_key' | 'sender_public_key_raw' | 'key_version' | 'sender_id'>
    > {
      return db
        .from('chat_encryption_keys')
        .select('wrapped_key, sender_public_key_raw, key_version, sender_id')
        .eq('conversation_id', conversationId)
        .eq('recipient_id', recipientId)
        .eq('key_version', keyVersion)
        .maybeSingle() as QueryResult<
        Pick<ChatEncryptionKeyRow, 'wrapped_key' | 'sender_public_key_raw' | 'key_version' | 'sender_id'>
      >;
    },

    maxKeyVersion(conversationId: string): QueryResult<Pick<ChatEncryptionKeyRow, 'key_version'>> {
      return db
        .from('chat_encryption_keys')
        .select('key_version')
        .eq('conversation_id', conversationId)
        .order('key_version', { ascending: false })
        .limit(1)
        .maybeSingle() as QueryResult<Pick<ChatEncryptionKeyRow, 'key_version'>>;
    },

    selectActiveLatestVersion(
      conversationId: string,
    ): QueryResult<Pick<ChatEncryptionKeyRow, 'key_version'>> {
      return db
        .from('chat_encryption_keys')
        .select('key_version')
        .eq('conversation_id', conversationId)
        .eq('is_active', true)
        .order('key_version', { ascending: false })
        .limit(1)
        .maybeSingle() as QueryResult<Pick<ChatEncryptionKeyRow, 'key_version'>>;
    },

    selectActiveVersionForRecipient(
      conversationId: string,
      keyVersion: number,
      recipientId: string,
    ): QueryResult<Pick<ChatEncryptionKeyRow, 'sender_id' | 'key_version'>> {
      return db
        .from('chat_encryption_keys')
        .select('sender_id, key_version')
        .eq('conversation_id', conversationId)
        .eq('key_version', keyVersion)
        .eq('recipient_id', recipientId)
        .eq('is_active', true)
        .maybeSingle() as QueryResult<Pick<ChatEncryptionKeyRow, 'sender_id' | 'key_version'>>;
    },

    deactivateVersion(conversationId: string, keyVersion: number): MutationResult {
      return db
        .from('chat_encryption_keys')
        .update({ is_active: false })
        .eq('conversation_id', conversationId)
        .eq('key_version', keyVersion) as MutationResult;
    },
  },

  /**
   * conversation_participants — membership lookup.
   */
  conversationParticipants: {
    selectByConversation(
      conversationId: string,
    ): QueryResultList<Pick<ConversationParticipantRow, 'user_id'>> {
      return db
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId) as QueryResultList<
          Pick<ConversationParticipantRow, 'user_id'>
        >;
    },
  },

  conversations: {
    selectEncryptionEnabled(conversationId: string): QueryResult<Pick<ConversationRow, 'encryption_enabled'>> {
      return db
        .from('conversations')
        .select('encryption_enabled')
        .eq('id', conversationId)
        .maybeSingle() as QueryResult<Pick<ConversationRow, 'encryption_enabled'>>;
    },
  },

  rpc: {
    disableConversationEncryption(
      conversationId: string,
    ): QueryResult<DisableConversationEncryptionResult> {
      return db.rpc('disable_conversation_encryption', {
        p_conversation_id: conversationId,
      }) as QueryResult<DisableConversationEncryptionResult>;
    },

    enableConversationEncryption(
      conversationId: string,
      keyVersion: number,
    ): QueryResult<EnableConversationEncryptionResult> {
      return db.rpc('enable_conversation_encryption', {
        p_conversation_id: conversationId,
        p_key_version: keyVersion,
      }) as QueryResult<EnableConversationEncryptionResult>;
    },
  },

  /**
   * one_time_prekeys — X3DH one-time pre-key storage.
   */
  oneTimePrekeys: {
    insert(rows: OneTimePreKeyRow[]): MutationResult {
      return db.from('one_time_prekeys').insert(rows) as MutationResult;
    },

    countByUserId(userId: string): Promise<{ count: number | null; error: { message: string } | null }> {
      return db
        .from('one_time_prekeys')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId) as Promise<{ count: number | null; error: { message: string } | null }>;
    },

    deleteByIds(userId: string, ids: string[]): MutationResult {
      return db
        .from('one_time_prekeys')
        .delete()
        .eq('user_id', userId)
        .in('id', ids) as MutationResult;
    },

    deleteAllByUserId(userId: string): Promise<{ count: number | null; error: { message: string } | null }> {
      return db
        .from('one_time_prekeys')
        .delete()
        .eq('user_id', userId) as Promise<{ count: number | null; error: { message: string } | null }>;
    },
  },
};
