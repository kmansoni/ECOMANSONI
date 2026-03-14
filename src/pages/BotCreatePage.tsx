import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Bot as BotIcon } from 'lucide-react';
import { toast } from 'sonner';
import { botApi } from '@/lib/bots/api';

type BotChatType = 'private' | 'group' | 'supergroup' | 'channel';

const USERNAME_RE = /^[a-z0-9_]{5,32}$/;

export function BotCreatePage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [about, setAbout] = useState('');
  const [botChatType, setBotChatType] = useState<BotChatType>('private');
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);

  const normalizedUsername = useMemo(() => username.trim().toLowerCase().replace(/^@+/, ''), [username]);
  const canSubmit = normalizedUsername.length > 0 && displayName.trim().length > 0 && !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!USERNAME_RE.test(normalizedUsername)) {
      toast.error('Username должен быть 5-32 символа: a-z, 0-9, _');
      return;
    }

    setSaving(true);
    try {
      const result = await botApi.createBot({
        username: normalizedUsername,
        display_name: displayName.trim(),
        description: description.trim() || undefined,
        about: about.trim() || undefined,
        bot_chat_type: botChatType,
        is_private: isPrivate,
      });

      navigate('/bots', {
        replace: true,
        state: {
          createdBotId: result.bot.id,
          createdBotToken: result.token,
          createdBotName: result.bot.display_name,
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось создать бота');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/bots')}
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Создать бота</h1>
          <p className="text-muted-foreground">Настройте базовые параметры нового бота</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 bg-card border rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <BotIcon className="w-5 h-5 text-primary" />
          </div>
          <p className="font-medium">Основная информация</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="bot-username" className="text-sm font-medium">Username</label>
          <input
            id="bot-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="my_new_bot"
            className="w-full h-11 rounded-xl border bg-background px-3"
            autoComplete="off"
            required
          />
          <p className="text-xs text-muted-foreground">Только a-z, 0-9 и _. Длина 5-32.</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="bot-display-name" className="text-sm font-medium">Название</label>
          <input
            id="bot-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Мой чат-бот"
            className="w-full h-11 rounded-xl border bg-background px-3"
            required
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="bot-description" className="text-sm font-medium">Описание</label>
          <textarea
            id="bot-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Короткое описание бота"
            className="w-full min-h-20 rounded-xl border bg-background px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="bot-about" className="text-sm font-medium">О боте</label>
          <textarea
            id="bot-about"
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="Подробная информация"
            className="w-full min-h-20 rounded-xl border bg-background px-3 py-2"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="bot-chat-type" className="text-sm font-medium">Тип чата</label>
            <select
              id="bot-chat-type"
              value={botChatType}
              onChange={(e) => setBotChatType(e.target.value as BotChatType)}
              className="w-full h-11 rounded-xl border bg-background px-3"
            >
              <option value="private">Private</option>
              <option value="group">Group</option>
              <option value="supergroup">Supergroup</option>
              <option value="channel">Channel</option>
            </select>
          </div>

          <label className="flex items-center gap-2 rounded-xl border px-3 py-2.5 h-11 mt-[22px] cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            <span className="text-sm">Приватный бот</span>
          </label>
        </div>

        <div className="pt-2 flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/bots')}
            className="h-11 px-4 rounded-xl border hover:bg-accent transition-colors"
            disabled={saving}
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="h-11 px-4 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Создание...' : 'Создать бота'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default BotCreatePage;