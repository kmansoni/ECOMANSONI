import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { uploadMedia } from '@/lib/mediaUpload';

export interface ChatSettings {
  notifications_enabled: boolean;
  notification_sound: string;
  notification_vibration: boolean;
  muted_until: string | null;
  chat_wallpaper: string;
  font_size: string;
  bubble_style: string;
  auto_download_media: boolean;
  send_by_enter: boolean;
}

export interface GlobalChatSettings {
  message_sound: string;
  group_sound: string;
  show_preview: boolean;
  in_app_sounds: boolean;
  in_app_vibrate: boolean;
  default_wallpaper: string;
  chat_text_size: number;
  bubble_corners: string;
  swipe_to_reply: boolean;
  double_tap_reaction: string;
  auto_download_wifi: boolean;
  auto_download_mobile: boolean;
  auto_play_gifs: boolean;
  auto_play_videos: boolean;
  read_receipts_enabled: boolean;
  typing_indicator_enabled: boolean;
  link_preview_enabled: boolean;
}

const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  notifications_enabled: true,
  notification_sound: 'default',
  notification_vibration: true,
  muted_until: null,
  chat_wallpaper: 'default',
  font_size: 'medium',
  bubble_style: 'modern',
  auto_download_media: true,
  send_by_enter: true,
};

const DEFAULT_GLOBAL_SETTINGS: GlobalChatSettings = {
  message_sound: 'default',
  group_sound: 'default',
  show_preview: true,
  in_app_sounds: true,
  in_app_vibrate: true,
  default_wallpaper: 'default',
  chat_text_size: 16,
  bubble_corners: 'rounded',
  swipe_to_reply: true,
  double_tap_reaction: '❤️',
  auto_download_wifi: true,
  auto_download_mobile: false,
  auto_play_gifs: true,
  auto_play_videos: false,
  read_receipts_enabled: true,
  typing_indicator_enabled: true,
  link_preview_enabled: true,
};

export function useChatSettings(conversationId?: string) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_CHAT_SETTINGS);
  const [globalSettings, setGlobalSettings] = useState<GlobalChatSettings>(DEFAULT_GLOBAL_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [globalTableAvailable, setGlobalTableAvailable] = useState(true);
  const [chatTableAvailable, setChatTableAvailable] = useState(true);

  const isMissingTableError = (error: any): boolean => {
    const msg = String(error?.message ?? '');
    return error?.code === '42P01' || error?.code === 'PGRST205' || msg.includes('Could not find the table') || msg.includes('does not exist');
  };

  const loadGlobalSettings = useCallback(async () => {
    if (!user || !globalTableAvailable) return;
    const { data, error } = await supabase
      .from('user_global_chat_settings' as never)
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) setGlobalTableAvailable(false);
      return;
    }
    if (data) setGlobalSettings({ ...DEFAULT_GLOBAL_SETTINGS, ...(data as object) });
  }, [user, globalTableAvailable]);

  const loadChatSettings = useCallback(async () => {
    if (!user || !conversationId || !chatTableAvailable) return;
    const { data, error } = await supabase
      .from('user_chat_settings' as never)
      .select('*')
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) setChatTableAvailable(false);
      return;
    }
    if (data) setSettings({ ...DEFAULT_CHAT_SETTINGS, ...(data as object) });
  }, [user, conversationId, chatTableAvailable]);

  useEffect(() => {
    if (!user) return;
    void loadGlobalSettings();
    if (conversationId) {
      void loadChatSettings();
    }
  }, [user, conversationId, loadChatSettings, loadGlobalSettings]);

  const updateSetting = useCallback(async <K extends keyof ChatSettings>(
    key: K,
    value: ChatSettings[K]
  ) => {
    if (!user || !conversationId) return;
    setSettings(prev => ({ ...prev, [key]: value }));
    if (!chatTableAvailable) return;
    const { error } = await supabase
      .from('user_chat_settings' as never)
      .upsert({
        user_id: user.id,
        conversation_id: conversationId,
        [key]: value,
        updated_at: new Date().toISOString(),
      } as never, { onConflict: 'user_id,conversation_id' });
    if (error && isMissingTableError(error)) {
      setChatTableAvailable(false);
    }
  }, [user, conversationId, chatTableAvailable]);

  const updateGlobalSetting = useCallback(async <K extends keyof GlobalChatSettings>(
    key: K,
    value: GlobalChatSettings[K]
  ) => {
    if (!user) return;
    setGlobalSettings(prev => ({ ...prev, [key]: value }));
    if (!globalTableAvailable) return;
    const { error } = await supabase
      .from('user_global_chat_settings' as never)
      .upsert({
        user_id: user.id,
        [key]: value,
        updated_at: new Date().toISOString(),
      } as never, { onConflict: 'user_id' });
    if (error && isMissingTableError(error)) {
      setGlobalTableAvailable(false);
    }
  }, [user, globalTableAvailable]);

  const uploadCustomWallpaper = useCallback(async (file: File): Promise<string> => {
    if (!user || !conversationId) {
      throw new Error('Нужен авторизованный пользователь и открытый чат');
    }

    const extensionFromName = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const extensionFromType = file.type.startsWith('image/')
      ? file.type.replace('image/', '').toLowerCase()
      : extensionFromName;
    const extension = extensionFromType || 'jpg';

    const result = await uploadMedia(file, { bucket: 'chat-media' });
    const publicUrl = result.url;
    await updateSetting('chat_wallpaper', publicUrl);
    return publicUrl;
  }, [conversationId, updateSetting, user]);

  const muteChat = useCallback(async (duration: '1h' | '8h' | '1d' | 'forever') => {
    let until: string | null = null;
    if (duration !== 'forever') {
      const durations: Record<string, number> = { '1h': 3600000, '8h': 28800000, '1d': 86400000 };
      until = new Date(Date.now() + durations[duration]).toISOString();
    }
    await updateSetting('muted_until', until);
    await updateSetting('notifications_enabled', false);
  }, [updateSetting]);

  const unmuteChat = useCallback(async () => {
    await updateSetting('muted_until', null);
    await updateSetting('notifications_enabled', true);
  }, [updateSetting]);

  const isMuted = settings.muted_until === null
    ? !settings.notifications_enabled
    : new Date(settings.muted_until) > new Date();

  return {
    settings,
    globalSettings,
    loading,
    updateSetting,
    updateGlobalSetting,
    uploadCustomWallpaper,
    muteChat,
    unmuteChat,
    isMuted,
  };
}
