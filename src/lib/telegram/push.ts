/**
 * Telegram Push Notifications
 * Bot API 10.0 push notification support
 */

import { supabase } from '@/lib/supabase';

export interface PushNotificationPayload {
  userId: string;
  message: string;
  data?: Record<string, unknown>;
  priority?: 'high' | 'normal';
}

// Store device token for push notifications
export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: 'ios' | 'android' | 'web'
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('telegram_push_tokens')
    .upsert({
      user_id: userId,
      token,
      platform,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id, token' });
  
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Send push notification via Telegram Bot API
export async function sendPushNotification(
  botToken: string,
  userId: number,
  payload: PushNotificationPayload
): Promise<{ ok: boolean; error?: string }> {
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: userId,
      text: payload.message,
      disable_notification: payload.priority !== 'high',
    }),
  });

  const data = await resp.json();
  if (!data.ok) return { ok: false, error: data.description };
  return { ok: true };
}

export default {
  registerDeviceToken,
  sendPushNotification,
};