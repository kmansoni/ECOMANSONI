/**
 * BotSettingsPage — настройки бота по адресу /bots/:id
 * Вкладки: Основное / Токены / Команды / Webhook
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bot as BotIcon,
  Check,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Webhook,
} from 'lucide-react';
import { toast } from 'sonner';
import { botApi } from '@/lib/bots/api';
import type { BotCommand, BotToken, BotWebhook, BotWithOwner } from '@/lib/bots/types';

// ---------------------------------------------------------------------------
// Tab definition
// ---------------------------------------------------------------------------
type Tab = 'general' | 'tokens' | 'commands' | 'webhook';

const TABS: { id: Tab; label: string }[] = [
  { id: 'general',  label: 'Основное' },
  { id: 'tokens',   label: 'Токены'   },
  { id: 'commands', label: 'Команды'  },
  { id: 'webhook',  label: 'Webhook'  },
];

// ---------------------------------------------------------------------------
// BotSettingsPage
// ---------------------------------------------------------------------------
export function BotSettingsPage() {
  const { id: botId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [bot, setBot] = useState<BotWithOwner | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('general');

  const loadBot = useCallback(async () => {
    if (!botId) return;
    try {
      const data = await botApi.getBot(botId);
      setBot(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Не удалось загрузить бота');
    }
  }, [botId]);

  useEffect(() => { void loadBot(); }, [loadBot]);

  // -------------------------------------------------------------------------
  // Loading / error states
  // -------------------------------------------------------------------------
  if (!bot && !loadError) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <button onClick={() => navigate('/bots')} className="flex items-center gap-2 text-sm text-muted-foreground mb-4 hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Назад к списку
        </button>
        <p className="text-destructive">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate('/bots')}
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate">{bot!.display_name}</h1>
          <p className="text-sm text-muted-foreground">@{bot!.username}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-muted rounded-xl p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-fit px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'general'  && <GeneralTab  bot={bot!} onUpdated={setBot} onDeleted={() => navigate('/bots')} />}
      {tab === 'tokens'   && <TokensTab   botId={botId!} />}
      {tab === 'commands' && <CommandsTab botId={botId!} />}
      {tab === 'webhook'  && <WebhookTab  botId={botId!} />}
    </div>
  );
}

// ===========================================================================
// GeneralTab
// ===========================================================================
interface GeneralTabProps {
  bot: BotWithOwner;
  onUpdated: (bot: BotWithOwner) => void;
  onDeleted: () => void;
}

function GeneralTab({ bot, onUpdated, onDeleted }: GeneralTabProps) {
  const [displayName, setDisplayName] = useState(bot.display_name);
  const [description, setDescription]  = useState(bot.description ?? '');
  const [about, setAbout]               = useState(bot.about ?? '');
  const [isPrivate, setIsPrivate]       = useState(bot.is_private);
  const [canJoinGroups, setCanJoinGroups] = useState(bot.can_join_groups);
  const [canReadAll, setCanReadAll]     = useState(bot.can_read_all_group_messages);
  const [langCode, setLangCode]         = useState(bot.language_code);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty =
    displayName !== bot.display_name ||
    description  !== (bot.description ?? '') ||
    about        !== (bot.about ?? '') ||
    isPrivate    !== bot.is_private ||
    canJoinGroups !== bot.can_join_groups ||
    canReadAll   !== bot.can_read_all_group_messages ||
    langCode     !== bot.language_code;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      const updated = await botApi.updateBot(bot.id, {
        display_name: displayName.trim() || undefined,
        description:  description.trim()  || undefined,
        about:        about.trim()         || undefined,
        is_private:   isPrivate,
        can_join_groups: canJoinGroups,
        can_read_all_group_messages: canReadAll,
        language_code: langCode || undefined,
      });
      onUpdated({ ...bot, ...updated });
      toast.success('Настройки сохранены');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await botApi.deleteBot(bot.id);
      toast.success(`Бот «${bot.display_name}» удалён`);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить бота');
      setDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="bg-card border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <BotIcon className="w-4 h-4 text-primary" />
          </div>
          <p className="font-medium">Профиль бота</p>
        </div>

        <Field label="Username (только для чтения)">
          <input value={`@${bot.username}`} readOnly className="w-full h-11 rounded-xl border bg-muted px-3 text-muted-foreground cursor-not-allowed" />
        </Field>

        <Field label="Название">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full h-11 rounded-xl border bg-background px-3"
            required
          />
        </Field>

        <Field label="Короткое описание">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Появляется в результатах поиска"
            className="w-full h-11 rounded-xl border bg-background px-3"
          />
        </Field>

        <Field label="О боте">
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="Полное описание на странице бота"
            rows={3}
            className="w-full rounded-xl border bg-background px-3 py-2 resize-none"
          />
        </Field>

        <Field label="Код языка (напр. ru, en)">
          <input
            value={langCode}
            onChange={(e) => setLangCode(e.target.value)}
            placeholder="ru"
            className="w-full h-11 rounded-xl border bg-background px-3"
          />
        </Field>
      </div>

      <div className="bg-card border rounded-2xl p-5 space-y-3">
        <p className="font-medium mb-1">Разрешения</p>
        <Toggle checked={isPrivate} onChange={setIsPrivate} label="Приватный бот" description="Только вы можете добавить бота" />
        <Toggle checked={canJoinGroups} onChange={setCanJoinGroups} label="Можно добавлять в группы" />
        <Toggle checked={canReadAll} onChange={setCanReadAll} label="Читать все сообщения в группе" description="Не только те, что адресованы боту" />
      </div>

      <button
        type="submit"
        disabled={!dirty || saving}
        className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Сохранить
      </button>

      {/* Danger zone */}
      <div className="bg-card border border-destructive/30 rounded-2xl p-5">
        <p className="font-medium text-destructive mb-3">Опасная зона</p>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Удалить бота
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Это действие необратимо. Все данные бота будут удалены.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Подтвердить удаление
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-4 h-10 rounded-xl border text-sm"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}

// ===========================================================================
// TokensTab
// ===========================================================================
interface TokensTabProps { botId: string }

function TokensTab({ botId }: TokensTabProps) {
  const [tokens, setTokens]       = useState<(BotToken & { token?: never })[]>([]);
  const [loading, setLoading]     = useState(true);
  const [newToken, setNewToken]   = useState<string | null>(null); // shown only once
  const [newTokenName, setNewTokenName] = useState('');
  const [creating, setCreating]   = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    void botApi.listBotTokens(botId).then(({ tokens: t }) => {
      setTokens(t);
      setLoading(false);
    }).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки токенов');
      setLoading(false);
    });
  }, [botId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await botApi.createBotToken(botId, { name: newTokenName.trim() || undefined });
      setNewToken(result.token);
      void navigator.clipboard.writeText(result.token).catch(() => {/* ignore */});
      const placeholder = { id: result.id, bot_id: botId, name: newTokenName.trim() || undefined, created_at: new Date().toISOString() } as BotToken & { token?: never };
      setTokens((prev) => [placeholder, ...prev]);
      setNewTokenName('');
      toast.success('Токен создан и скопирован в буфер обмена');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось создать токен');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (tokenId: string) => {
    setDeletingId(tokenId);
    try {
      await botApi.deleteBotToken(botId, tokenId);
      setTokens((prev) => prev.filter((t) => t.id !== tokenId));
      toast.success('Токен удалён');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить токен');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* New token result */}
      {newToken && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-medium text-green-600 dark:text-green-400">Новый токен (показывается только один раз)</p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 text-xs break-all bg-background rounded-lg px-3 py-2 border">{newToken}</code>
            <button
              onClick={() => { void navigator.clipboard.writeText(newToken); toast.success('Скопировано'); }}
              className="p-2 rounded-lg border hover:bg-accent transition-colors flex-shrink-0"
              aria-label="Скопировать токен"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => setNewToken(null)} className="text-xs text-muted-foreground hover:text-foreground">
            Скрыть
          </button>
        </div>
      )}

      {/* Create */}
      <div className="bg-card border rounded-2xl p-5">
        <p className="font-medium mb-3">Создать новый токен</p>
        <div className="flex gap-2">
          <input
            value={newTokenName}
            onChange={(e) => setNewTokenName(e.target.value)}
            placeholder="Название (необязательно)"
            className="flex-1 h-10 rounded-xl border bg-background px-3 text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreate(); } }}
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Создать
          </button>
        </div>
      </div>

      {/* Token list */}
      <div className="bg-card border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Нет токенов</p>
        ) : (
          <ul className="divide-y">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.name ?? 'Токен без названия'}</p>
                  <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString('ru-RU')}</p>
                  {t.last_used_at && (
                    <p className="text-xs text-muted-foreground">Последнее использование: {new Date(t.last_used_at).toLocaleString('ru-RU')}</p>
                  )}
                </div>
                <button
                  onClick={() => void handleDelete(t.id)}
                  disabled={deletingId === t.id}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  aria-label="Удалить токен"
                >
                  {deletingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// CommandsTab
// ===========================================================================
interface CommandsTabProps { botId: string }
interface CommandRow { command: string; description: string }

function CommandsTab({ botId }: CommandsTabProps) {
  const [rows, setRows]     = useState<CommandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void botApi.getBotCommands(botId).then(({ commands }) => {
      setRows(commands.map((c: BotCommand) => ({ command: c.command, description: c.description ?? '' })));
      setLoading(false);
    }).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки команд');
      setLoading(false);
    });
  }, [botId]);

  const addRow = () => setRows((prev) => [...prev, { command: '', description: '' }]);

  const updateRow = (idx: number, field: keyof CommandRow, value: string) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    const clean = rows.filter((r) => r.command.trim().startsWith('/') && r.command.trim().length > 1);
    setSaving(true);
    try {
      await botApi.setBotCommands(botId, clean.map((r) => ({
        command:     r.command.trim().replace(/^\//, ''),
        description: r.description.trim(),
        language_code: 'default',
      })));
      setRows(clean); // drop empty/invalid rows after save
      toast.success('Команды обновлены');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить команды');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-2xl p-5 space-y-3">
        <p className="font-medium">Список команд</p>
        <p className="text-xs text-muted-foreground">Каждая команда начинается с /. Описание отображается подсказкой.</p>

        {rows.map((row, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              value={row.command}
              onChange={(e) => updateRow(idx, 'command', e.target.value)}
              placeholder="/start"
              className="w-32 h-10 rounded-xl border bg-background px-3 text-sm font-mono"
            />
            <input
              value={row.description}
              onChange={(e) => updateRow(idx, 'description', e.target.value)}
              placeholder="Описание команды"
              className="flex-1 h-10 rounded-xl border bg-background px-3 text-sm"
            />
            <button
              onClick={() => removeRow(idx)}
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Удалить строку"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        <button onClick={addRow} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <Plus className="w-4 h-4" /> Добавить команду
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Сохранить команды
      </button>
    </div>
  );
}

// ===========================================================================
// WebhookTab
// ===========================================================================
interface WebhookTabProps { botId: string }

function WebhookTab({ botId }: WebhookTabProps) {
  const [webhook, setWebhook]   = useState<BotWebhook | null>(null);
  const [url, setUrl]           = useState('');
  const [secret, setSecret]     = useState('');    // shown once after set
  const [setting, setSetting]   = useState(false);
  const [deleting, setDeleting] = useState(false);

  // We load via getBot which doesn't return webhook — so we have no direct
  // "getWebhook" endpoint. We show a neutral state and let user set/delete.
  // After setBotWebhook the response has the current webhook object.

  const handleSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setSetting(true);
    try {
      const result = await botApi.setBotWebhook(botId, { url: url.trim() });
      setWebhook(result.webhook);
      setSecret(result.secret);
      void navigator.clipboard.writeText(result.secret).catch(() => {/* ignore */});
      toast.success('Webhook установлен. Секрет скопирован в буфер обмена.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось установить webhook');
    } finally {
      setSetting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await botApi.deleteBotWebhook(botId);
      setWebhook(null);
      setUrl('');
      setSecret('');
      toast.success('Webhook удалён');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить webhook');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Current webhook status */}
      {webhook && (
        <div className="bg-card border rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Webhook className="w-4 h-4 text-primary" />
            <p className="font-medium">Активный webhook</p>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${webhook.is_active ? 'bg-green-500/15 text-green-500' : 'bg-muted text-muted-foreground'}`}>
              {webhook.is_active ? 'Активен' : 'Неактивен'}
            </span>
          </div>
          <p className="text-sm break-all text-muted-foreground">{webhook.url}</p>
          {webhook.last_triggered_at && (
            <p className="text-xs text-muted-foreground">Последний вызов: {new Date(webhook.last_triggered_at).toLocaleString('ru-RU')}</p>
          )}
          {webhook.last_error && (
            <p className="text-xs text-destructive">Последняя ошибка: {webhook.last_error}</p>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition-colors mt-2"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Удалить webhook
          </button>
        </div>
      )}

      {/* Secret shown once after set */}
      {secret && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-medium text-green-600 dark:text-green-400">Секрет webhook (показывается только один раз)</p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 text-xs break-all bg-background rounded-lg px-3 py-2 border">{secret}</code>
            <button
              onClick={() => { void navigator.clipboard.writeText(secret); toast.success('Скопировано'); }}
              className="p-2 rounded-lg border hover:bg-accent transition-colors flex-shrink-0"
              aria-label="Скопировать секрет"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => setSecret('')} className="text-xs text-muted-foreground hover:text-foreground">Скрыть</button>
        </div>
      )}

      {/* Set webhook form */}
      <form onSubmit={handleSet} className="bg-card border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <RefreshCw className="w-4 h-4 text-primary" />
          <p className="font-medium">{webhook ? 'Обновить URL' : 'Установить webhook'}</p>
        </div>
        <Field label="URL (HTTPS)">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/bot/hook"
            className="w-full h-11 rounded-xl border bg-background px-3"
            required
          />
        </Field>
        <p className="text-xs text-muted-foreground">Сервер сгенерирует случайный секрет и вернёт его один раз.</p>
        <button
          type="submit"
          disabled={setting || !url.trim()}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity"
        >
          {setting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {webhook ? 'Обновить' : 'Установить'}
        </button>
      </form>
    </div>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}

function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') onChange(!checked); }}
        className={`w-10 h-6 rounded-full relative transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${checked ? 'bg-primary' : 'bg-muted'}`}
      >
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'left-5' : 'left-1'}`} />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium leading-none">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </label>
  );
}
