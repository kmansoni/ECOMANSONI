import { useState, useCallback } from 'react';
import { dbLoose } from '@/lib/supabase';

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export type InlineKeyboardRow = InlineKeyboardButton[];

export interface BotKeyboard {
  id: string;
  message_id: string;
  keyboard_data: InlineKeyboardRow[];
}

export function useBotInteraction(conversationId: string | null) {
  const [botKeyboards, setBotKeyboards] = useState<Record<string, BotKeyboard>>({});

  const handleBotCommand = useCallback(async (command: string, botId: string) => {
    if (!conversationId) return;
    // Отправить команду боту через webhook или обработать встроенно
    try {
      const { data: bot } = await dbLoose
        .from('bots')
        .select('webhook_url, api_token')
        .eq('id', botId)
        .single();

      if (bot?.webhook_url) {
        await fetch(bot.webhook_url as string, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'command',
            command,
            conversation_id: conversationId,
            timestamp: new Date().toISOString(),
          }),
        });
      }
    } catch {
      // webhook unavailable — игнорируем
    }
  }, [conversationId]);

  const handleInlineCallback = useCallback(async (callbackData: string, messageId: string, botId: string) => {
    if (!conversationId) return;
    try {
      const { data: bot } = await dbLoose
        .from('bots')
        .select('webhook_url')
        .eq('id', botId)
        .single();

      if (bot?.webhook_url) {
        await fetch(bot.webhook_url as string, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'callback_query',
            callback_data: callbackData,
            message_id: messageId,
            conversation_id: conversationId,
            timestamp: new Date().toISOString(),
          }),
        });
      }
    } catch {
      // игнорируем
    }
  }, [conversationId]);

  const loadKeyboardForMessage = useCallback(async (messageId: string) => {
    if (botKeyboards[messageId]) return botKeyboards[messageId];

    const { data } = await dbLoose
      .from('bot_inline_keyboards')
      .select('*')
      .eq('message_id', messageId)
      .single();

    if (data) {
      setBotKeyboards(prev => ({ ...prev, [messageId]: data as BotKeyboard }));
      return data as BotKeyboard;
    }
    return null;
  }, [botKeyboards]);

  type BotCommandEntry = { command: string; description: string; bot_id: string; bot_name: string };
  const getBotCommandsForConversation = useCallback(async (): Promise<BotCommandEntry[]> => {
    if (!conversationId) return [];

    const { data: botConvs } = await dbLoose
      .from('bot_conversations')
      .select('bot_id, bots(display_name, username)')
      .eq('conversation_id', conversationId);

    if (!botConvs?.length) return [];

    const rows = botConvs as Array<{ bot_id: string; bots?: { display_name?: string } }>;
    const botIds = rows.map(bc => bc.bot_id);
    const { data: commands } = await dbLoose
      .from('bot_commands')
      .select('*')
      .in('bot_id', botIds)
      .order('sort_order');

    if (!commands) return [];

    const cmds = commands as Array<{ command: string; description: string; bot_id: string }>;
    return cmds.map(cmd => {
      const botConv = rows.find(bc => bc.bot_id === cmd.bot_id);
      return {
        command: cmd.command,
        description: cmd.description,
        bot_id: cmd.bot_id,
        bot_name: botConv?.bots?.display_name || 'Бот',
      };
    });
  }, [conversationId]);

  return { handleBotCommand, handleInlineCallback, botKeyboards, loadKeyboardForMessage, getBotCommandsForConversation };
}
