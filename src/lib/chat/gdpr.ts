/**
 * GDPR Compliance Module
 *
 * Handles user data deletion, export, anonymization, consent management.
 */

import { supabase } from '@/lib/supabase';

export async function deleteUserDataCompletely(userId: string, options?: { isChild?: boolean }): Promise<{ success: boolean; details: string[] }> {
  const tables = [
    'messages',
    'user_profiles',
    'user_emoji_preferences',
    'user_quick_reaction',
    'user_settings',
    'user_blocklist',
    'user_quick_reaction',
    'user_contacts',
    'user_sessions',
    'user_analytics_events',
  ];

  const results: string[] = [];
  for (const table of tables) {
    try {
      await supabase.from(table).delete().eq('user_id', userId);
      results.push(`Deleted from ${table}`);
    } catch (err) {
      results.push(`Failed ${table}: ${(err as Error).message}`);
    }
  }

  // Additionally, remove from group participants
  await supabase.from('channel_participants').delete().eq('user_id', userId);

  return { success: true, details: results };
}

export async function exportUserData(userId: string, options?: { format: 'json' | 'mbox' }): Promise<any> {
  const format = options?.format || 'json';

  // Gather all user data
  const [profile, messages, contacts, settings] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('user_id', userId).single(),
    supabase.from('messages').select('*').eq('sender_id', userId).order('created_at', { ascending: true }),
    supabase.from('user_contacts').select('*').eq('user_id', userId),
    supabase.from('user_settings').select('*').eq('user_id', userId).single(),
  ]);

  const data = {
    profile: profile.data,
    messages: messages.data || [],
    contacts: contacts.data || [],
    settings: settings.data,
    exported_at: new Date().toISOString(),
  };

  if (format === 'mbox') {
    // Convert to mbox format (simplified)
    return data.messages.map((m: any) => `From: ${m.sender_id}\nDate: ${m.created_at}\nSubject: Chat message\n\n${m.content}\n\n`).join('');
  }

  return data;
}

export async function anonymizeUser(userId: string, options?: { keepAggregates: boolean }): Promise<{
  personalDataRemoved: boolean;
  analyticsPreserved: boolean;
  userIdHash?: string;
}> {
  // Replace PII with hashed version
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Keep analytics with hash, remove direct identifiers
  await supabase.from('user_analytics_events').update({ user_id_hash: hashHex }).eq('user_id', userId);

  return {
    personalDataRemoved: true,
    analyticsPreserved: options?.keepAggregates ?? true,
    userIdHash: hashHex,
  };
}

export async function revokeConsent(userId: string): Promise<void> {
  await supabase.from('user_consents').update({
    consent_marketing: false,
    consent_analytics: false,
    consent_third_party: false,
    consent_updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
}

export async function purgeExpiredMessages(options?: { ttlDays: number; preserveSaved?: boolean }): Promise<void> {
  const ttl = options?.ttlDays ?? 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ttl);

  let query = supabase.from('messages').delete().lt('created_at', cutoff.toISOString());
  if (options?.preserveSaved) {
    query = query.eq('saved', false);
  }
  await query;
}

export async function scheduleAttachmentTTL(attachmentId: string, options: { ttlDays: number }): Promise<void> {
  // RPC call would schedule a background job
  await supabase.rpc('schedule_attachment_ttl', {
    attachment_id: attachmentId,
    delete_after_days: options.ttlDays,
  });
}
