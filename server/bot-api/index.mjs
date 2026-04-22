import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { loadConfig } from './env.mjs';

const app = express();
app.use(express.json());

const config = loadConfig();

const supabase = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey
);

// Rate limiter: 30 msg/sec per bot
const rateLimits = new Map();
function checkRateLimit(botId) {
  const now = Date.now();
  const entry = rateLimits.get(botId) || { count: 0, reset: now + 1000 };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + 1000;
  }
  entry.count++;
  rateLimits.set(botId, entry);
  return entry.count <= 30;
}

// Middleware: validate bot token
async function validateToken(req, res, next) {
  const { token } = req.params;
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });

  const { data: bot, error } = await supabase
    .from('bots')
    .select('*')
    .eq('api_token', token)
    .eq('is_active', true)
    .single();

  if (error || !bot) return res.status(401).json({ ok: false, error: 'Invalid token' });

  if (!checkRateLimit(bot.id)) {
    return res.status(429).json({ ok: false, error: 'Rate limit exceeded (30 msg/sec)' });
  }

  req.bot = bot;
  next();
}

// GET /bot/{token}/getMe
app.get('/bot/:token/getMe', validateToken, (req, res) => {
  const bot = req.bot;
  res.json({
    ok: true,
    result: {
      id: bot.id,
      username: bot.username,
      display_name: bot.display_name,
      description: bot.description,
      is_active: bot.is_active,
      capabilities: bot.capabilities,
    },
  });
});

// POST /bot/{token}/sendMessage
app.post('/bot/:token/sendMessage', validateToken, async (req, res) => {
  const { conversation_id, text, topic_id } = req.body;

  if (!conversation_id || !text) {
    return res.status(400).json({ ok: false, error: 'conversation_id and text are required' });
  }

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id,
      sender_id: req.bot.id,
      content: text,
      topic_id: topic_id || null,
      message_type: 'bot',
    })
    .select()
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });

  res.json({ ok: true, result: message });
});

// POST /bot/{token}/sendInlineKeyboard
app.post('/bot/:token/sendInlineKeyboard', validateToken, async (req, res) => {
  const { conversation_id, text, keyboard, topic_id } = req.body;

  if (!conversation_id || !text || !keyboard) {
    return res.status(400).json({ ok: false, error: 'conversation_id, text, keyboard are required' });
  }

  // Сначала отправить сообщение
  const { data: message, error: msgError } = await supabase
    .from('messages')
    .insert({
      conversation_id,
      sender_id: req.bot.id,
      content: text,
      topic_id: topic_id || null,
      message_type: 'bot',
    })
    .select()
    .single();

  if (msgError) return res.status(500).json({ ok: false, error: msgError.message });

  // Затем сохранить inline keyboard
  const { data: kb, error: kbError } = await supabase
    .from('bot_inline_keyboards')
    .insert({
      message_id: message.id,
      keyboard_data: keyboard,
    })
    .select()
    .single();

  if (kbError) return res.status(500).json({ ok: false, error: kbError.message });

  res.json({ ok: true, result: { message, keyboard: kb } });
});

// POST /bot/{token}/setWebhook
app.post('/bot/:token/setWebhook', validateToken, async (req, res) => {
  const { url } = req.body;

  const { error } = await supabase
    .from('bots')
    .update({ webhook_url: url || null })
    .eq('id', req.bot.id);

  if (error) return res.status(500).json({ ok: false, error: error.message });

  res.json({ ok: true, result: { webhook_url: url || null } });
});

// POST /bot/{token}/deleteWebhook
app.post('/bot/:token/deleteWebhook', validateToken, async (req, res) => {
  await supabase.from('bots').update({ webhook_url: null }).eq('id', req.bot.id);
  res.json({ ok: true, result: true });
});

// POST /bot/{token}/setCommands
app.post('/bot/:token/setCommands', validateToken, async (req, res) => {
  const { commands } = req.body;
  if (!Array.isArray(commands)) {
    return res.status(400).json({ ok: false, error: 'commands must be array' });
  }

  // Удалить старые команды
  await supabase.from('bot_commands').delete().eq('bot_id', req.bot.id);

  // Вставить новые
  if (commands.length > 0) {
    const rows = commands.map((cmd, i) => ({
      bot_id: req.bot.id,
      command: cmd.command,
      description: cmd.description,
      sort_order: i,
    }));
    await supabase.from('bot_commands').insert(rows);
  }

  res.json({ ok: true, result: true });
});

// GET /bot/{token}/getCommands
app.get('/bot/:token/getCommands', validateToken, async (req, res) => {
  const { data } = await supabase
    .from('bot_commands')
    .select('*')
    .eq('bot_id', req.bot.id)
    .order('sort_order');

  res.json({ ok: true, result: data || [] });
});

const PORT = config.port;
app.listen(PORT, () => {
  console.log('Bot API server running on port ' + PORT);
});

export default app;
