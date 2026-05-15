/**
 * BotSettingsPage — настройки бота по адресу /bots/:id
 * Вкладки: Основное / Обработчики / Клавиатуры / Состояния / Аналитика / Webhook
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
  LayoutDashboard,
  Workflow,
  BarChart2,
  Coins,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { botApi } from '@/lib/bots/api';
import { StarsV2 } from '@/lib/stars/v2/payments';
import type { BotCommand, BotToken, BotWebhook, BotHandler, BotKeyboard, BotConversationState, BotSession, BotAnalytics, BotWithOwner } from '@/lib/bots/types';
import { FSMVisualEditor } from '@/components/bots/FSMVisualEditor';

type Tab = 'general' | 'handlers' | 'keyboards' | 'states' | 'analytics' | 'payments' | 'webhook';

const TABS: { id: Tab; label: string; icon?: React.ReactNode }[] = [
  { id: 'general',   label: 'Основное',     icon: <LayoutDashboard size={16} /> },
  { id: 'handlers',  label: 'Обработчики',  icon: <Workflow size={16} /> },
  { id: 'keyboards', label: 'Клавиатуры',   icon: <Zap size={16} /> },
  { id: 'states',    label: 'Состояния',     icon: <BarChart2 size={16} /> },
  { id: 'analytics', label: 'Аналитика',    icon: <Coins size={16} /> },
  { id: 'payments',  label: 'Платежи',      icon: <Coins size={16} /> },
  { id: 'webhook',   label: 'Webhook',      icon: <Webhook size={16} /> },
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
             className={`flex items-center gap-1.5 min-w-fit px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
               tab === t.id
                 ? 'bg-background text-foreground shadow-sm'
                 : 'text-muted-foreground hover:text-foreground'
             }`}
           >
             {t.icon}
             {t.label}
           </button>
         ))}
       </div>

       {/* Tab content */}
       {tab === 'general'    && <GeneralTab    bot={bot!} onUpdated={setBot} onDeleted={() => navigate('/bots')} />}
       {tab === 'handlers'   && <HandlersTab   botId={botId!} />}
       {tab === 'keyboards'  && <KeyboardsTab  botId={botId!} />}
       {tab === 'states'     && <StatesTab     botId={botId!} />}
       {tab === 'analytics'  && <AnalyticsTab  botId={botId!} />}
       {tab === 'payments'   && <PaymentsTab   botId={botId!} />}
       {tab === 'webhook'    && <WebhookTab    botId={botId!} />}
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

type TokenListItem = Omit<BotToken, "token"> & { token?: string };

function TokensTab({ botId }: TokensTabProps) {
  const [tokens, setTokens]       = useState<TokenListItem[]>([]);
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
      const placeholder: TokenListItem = {
        id: result.id,
        bot_id: botId,
        name: newTokenName.trim() || undefined,
        created_at: new Date().toISOString(),
      };
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
// HandlersTab
// ===========================================================================
interface HandlersTabProps { botId: string }

function HandlersTab({ botId }: HandlersTabProps) {
  const [handlers, setHandlers]   = useState<BotHandler[]>([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newHandler, setNewHandler] = useState<Partial<BotHandler>>({
    name: '',
    trigger_type: 'keyword' as BotHandler['trigger_type'],
    trigger_value: '',
    response_type: 'text' as BotHandler['response_type'],
    response_content: { method: 'sendMessage', params: { text: '' }, options: {} },
    priority: 50,
    is_active: true,
    conditions: [],
  });

  useEffect(() => {
    void botApi.getBotHandlers(botId).then(({ handlers: h }) => {
      setHandlers(h);
      setLoading(false);
    }).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки');
      setLoading(false);
    });
  }, [botId]);

  const handleCreate = async () => {
    if (!newHandler.name || !newHandler.trigger_type || !newHandler.response_type) {
      toast.error('Заполните обязательные поля');
      return;
    }
    setCreating(true);
    try {
      const created = await botApi.createBotHandler(botId, {
        name: newHandler.name!,
        trigger_type: newHandler.trigger_type!,
        trigger_value: newHandler.trigger_value ?? '',
        response_type: newHandler.response_type!,
        response_content: newHandler.response_content ?? { method: 'sendMessage', params: { text: '' }, options: {} },
        priority: newHandler.priority ?? 50,
        is_active: newHandler.is_active ?? true,
        conditions: newHandler.conditions ?? [],
      });
      setHandlers((prev) => [...prev, created.handler].sort((a, b) => a.priority - b.priority));
      setNewHandler({
        name: '', trigger_type: 'keyword', trigger_value: '',
        response_type: 'text', response_content: { method: 'sendMessage', params: { text: '' }, options: {} },
        priority: 50, is_active: true, conditions: [],
      });
      toast.success('Обработчик создан');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось создать');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (handlerId: string, updates: Partial<BotHandler>) => {
    try {
      const updated = await botApi.updateBotHandler(botId, handlerId, updates);
      setHandlers((prev) => prev.map((h) => h.id === handlerId ? updated.handler : h));
      toast.success('Обработчик обновлён');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось обновить');
    }
  };

  const handleDelete = async (handlerId: string) => {
    try {
      await botApi.deleteBotHandler(botId, handlerId);
      setHandlers((prev) => prev.filter((h) => h.id !== handlerId));
      toast.success('Обработчик удалён');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить');
    }
  };

  const triggerTypes: BotHandler['trigger_type'][] = ['keyword', 'command', 'callback', 'regex', 'ai', 'schedule', 'welcome', 'fallback', 'media', 'reaction', 'member_joined', 'member_left'];
  const responseTypes: BotHandler['response_type'][] = ['text', 'photo', 'video', 'document', 'audio', 'voice', 'sticker', 'animation', 'location', 'venue', 'contact', 'poll', 'quiz', 'dice', 'keyboard', 'action', 'typing', 'leave', 'invite', 'topic', 'forward', 'media_group'];

  if (loading) return <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      {/* List */}
      <div className="bg-card border rounded-2xl overflow-hidden">
        {handlers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Нет обработчиков</p>
        ) : (
          <ul className="divide-y">
            {handlers.map((h) => (
              <li key={h.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    <span className="text-xs text-muted-foreground mr-1">#{h.priority}</span>
                    {h.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Триггер: {h.trigger_type} {h.trigger_value ? `(${h.trigger_value})` : ''} → Ответ: {h.response_type}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setEditingId(editingId === h.id ? null : h.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                    ✏️
                  </button>
                  <button onClick={() => handleDelete(h.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" aria-label="Удалить">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {editingId === h.id && (
                  <div className="w-full mt-3 p-3 bg-background rounded-xl border space-y-2">
                    <div className="flex gap-2">
                      <input value={h.name} onChange={(e) => handleUpdate(h.id, { name: e.target.value })} placeholder="Название" className="flex-1 h-9 rounded-lg border px-2 text-sm" />
                      <select value={h.trigger_type} onChange={(e) => handleUpdate(h.id, { trigger_type: e.target.value as BotHandler['trigger_type'] })} className="h-9 rounded-lg border px-2 text-sm">
                        {triggerTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <input value={h.trigger_value} onChange={(e) => handleUpdate(h.id, { trigger_value: e.target.value })} placeholder="Значение триггера (опционально)" className="h-9 rounded-lg border px-2 text-sm w-full" />
                    <select value={h.response_type} onChange={(e) => handleUpdate(h.id, { response_type: e.target.value as BotHandler['response_type'] })} className="h-9 rounded-lg border px-2 text-sm">
                      {responseTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <div className="flex gap-2 items-end">
                      <label className="text-xs text-muted-foreground">Приоритет (↑ = первый):</label>
                      <input type="number" value={h.priority} onChange={(e) => handleUpdate(h.id, { priority: Number(e.target.value) })} className="w-20 h-9 rounded-lg border px-2 text-sm" />
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={h.is_active} onChange={(e) => handleUpdate(h.id, { is_active: e.target.checked })} />
                        Активен
                      </label>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Create */}
      <div className="bg-card border rounded-2xl p-5 space-y-3">
        <p className="font-medium">Новый обработчик</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={newHandler.name} onChange={(e) => setNewHandler({ ...newHandler, name: e.target.value })} placeholder="Название" className="h-10 rounded-xl border px-3 text-sm col-span-2" />
          <select value={newHandler.trigger_type} onChange={(e) => setNewHandler({ ...newHandler, trigger_type: e.target.value as BotHandler['trigger_type'] })} className="h-10 rounded-xl border px-3 text-sm">
            {triggerTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={newHandler.trigger_value} onChange={(e) => setNewHandler({ ...newHandler, trigger_value: e.target.value })} placeholder="Триггер (опц.)" className="h-10 rounded-xl border px-3 text-sm" />
          <select value={newHandler.response_type} onChange={(e) => setNewHandler({ ...newHandler, response_type: e.target.value as BotHandler['response_type'] })} className="h-10 rounded-xl border px-3 text-sm">
            {responseTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="number" value={newHandler.priority} onChange={(e) => setNewHandler({ ...newHandler, priority: Number(e.target.value) || 50 })} placeholder="Приоритет (50)" className="h-10 rounded-xl border px-3 text-sm" />
        </div>
        <button onClick={handleCreate} disabled={creating} className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Создать обработчик
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// KeyboardsTab
// ===========================================================================
interface KeyboardsTabProps { botId: string }

function KeyboardsTab({ botId }: KeyboardsTabProps) {
  const [keyboards, setKeyboards] = useState<BotKeyboard[]>([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [newKeyboard, setNewKeyboard] = useState<Partial<BotKeyboard>>({
    name: '',
    keyboard_type: 'inline',
    buttons: [],
    is_persistent: false,
    is_active: true,
  });

  useEffect(() => {
    void botApi.getBotKeyboards(botId).then(({ keyboards: k }) => {
      setKeyboards(k);
      setLoading(false);
    }).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки');
      setLoading(false);
    });
  }, [botId]);

  const handleCreate = async () => {
    if (!newKeyboard.name || !newKeyboard.buttons.length) {
      toast.error('Укажите название и хотя бы одну кнопку');
      return;
    }
    setCreating(true);
    try {
      await botApi.createBotKeyboard(botId, {
        name: newKeyboard.name!,
        keyboard_type: newKeyboard.keyboard_type || 'inline',
        buttons: newKeyboard.buttons,
        is_persistent: newKeyboard.is_persistent ?? false,
        is_active: newKeyboard.is_active ?? true,
      });
      toast.success('Клавиатура создана');
      setNewKeyboard({ name: '', keyboard_type: 'inline', buttons: [], is_persistent: false, is_active: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось создать');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-2xl overflow-hidden">
        {keyboards.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Нет клавиатур</p>
        ) : (
          <ul className="divide-y">
            {keyboards.map((k) => (
              <li key={k.id} className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{k.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Тип: {k.keyboard_type} | Кнопок: {k.buttons.length} | {k.is_persistent ? 'Постоянная' : 'Одноразовая'}
                  </p>
                </div>
                <button onClick={() => handleDelete(k.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" aria-label="Удалить">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-card border rounded-2xl p-5 space-y-3">
        <p className="font-medium">Новая клавиатура</p>
        <input value={newKeyboard.name} onChange={(e) => setNewKeyboard({ ...newKeyboard, name: e.target.value })} placeholder="Название" className="h-10 rounded-xl border px-3 text-sm w-full" />
        <div className="flex gap-2">
          <select value={newKeyboard.keyboard_type} onChange={(e) => setNewKeyboard({ ...newKeyboard, keyboard_type: e.target.value as BotKeyboard['keyboard_type'] })} className="flex-1 h-10 rounded-xl border px-3 text-sm">
            <option value="inline">Inline</option>
            <option value="reply">Reply</option>
            <option value="remove">Remove</option>
          </select>
          <label className="flex items-center gap-2 h-10 px-3">
            <input type="checkbox" checked={newKeyboard.is_persistent} onChange={(e) => setNewKeyboard({ ...newKeyboard, is_persistent: e.target.checked })} />
            Постоянная
          </label>
        </div>
        <textarea
          value={JSON.stringify(newKeyboard.buttons, null, 2)}
          onChange={(e) => { try { setNewKeyboard({ ...newKeyboard, buttons: JSON.parse(e.target.value) }); } catch {} }}
          placeholder='Кнопки JSON: [[{"text": "Кнопка", "callback_data": "btn1"}]]'
          rows={3}
          className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono resize-none"
        />
        <button onClick={handleCreate} disabled={creating} className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Создать клавиатуру
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// StatesTab — FSM визуальный редактор
// ===========================================================================
interface StatesTabProps { botId: string }

function StatesTab({ botId }: StatesTabProps) {
  const [states, setStates]   = useState<BotConversationState[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newStateName, setNewStateName] = useState('');
  const [activeStateId, setActiveStateId] = useState<string | null>(null);

  // Индекс: id → state
  const stateMap = useMemo(() => {
    const m: Record<string, BotConversationState> = {};
    states.forEach(s => { m[s.id] = s; });
    return m;
  }, [states]);

  const activeState = activeStateId ? stateMap[activeStateId] : null;

  useEffect(() => {
    void botApi.getBotStates(botId).then(({ states: s }) => {
      setStates(s);
      setLoading(false);
      if (s.length > 0 && !activeStateId) setActiveStateId(s[0].id);
    }).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки');
      setLoading(false);
    });
  }, [botId]);

  const handleCreate = async () => {
    if (!newStateName.trim()) {
      toast.error('Укажите имя состояния');
      return;
    }
    setCreating(true);
    try {
      const created = await botApi.createBotState(botId, {
        name: newStateName.trim(),
        flow: { nodes: [], transitions: [] },
        initial_state: '',
        is_active: true,
      });
      setStates((prev) => [...prev, created.state]);
      setActiveStateId(created.state.id);
      setNewStateName('');
      toast.success('FSM-состояние создано');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось создать');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (stateId: string) => {
    try {
      await botApi.deleteBotState(botId, stateId);
      setStates((prev) => prev.filter((s) => s.id !== stateId));
      if (activeStateId === stateId) {
        const remaining = states.filter((s) => s.id !== stateId);
        setActiveStateId(remaining[0]?.id || null);
      }
      toast.success('FSM-состояние удалено');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить');
    }
  };

  const handleSaveState = async (stateId: string, flow: { nodes: any[]; transitions: any[] }, initialState: string) => {
    try {
      await botApi.updateBotState(botId, stateId, {
        flow,
        initial_state: initialState,
      });
      setStates((prev) => prev.map((s) => s.id === stateId ? { ...s, flow, initial_state: initialState } : s));
      toast.success('FSM-состояние сохранено');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      {/* Список состояний */}
      <div className="bg-card border rounded-2xl overflow-hidden">
        {states.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Нет FSM-состояний. Создайте первое.</p>
        ) : (
          <ul className="divide-y">
            {states.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "p-3 flex items-center justify-between cursor-pointer transition-colors",
                  activeStateId === s.id ? "bg-primary/5" : "hover:bg-accent/30"
                )}
                onClick={() => setActiveStateId(s.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Workflow className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Начало: <code className="bg-background px-1.5 py-0.5 rounded text-xs">{s.initial_state || '—'}</code>
                      {' · '}Узлов: {s.flow?.nodes?.length ?? 0}
                      {' · '}Переходов: {s.flow?.transitions?.length ?? 0}
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); void handleDelete(s.id); }}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                  aria-label="Удалить"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Создание нового состояния */}
      <div className="bg-card border rounded-2xl p-4 flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground mb-1 block">Имя нового FSM-состояния</label>
          <input
            value={newStateName}
            onChange={(e) => setNewStateName(e.target.value)}
            placeholder="main_flow, dialog_start, ..."
            className="w-full h-10 rounded-xl border bg-background px-3 text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') { void handleCreate(); } }}
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={creating || !newStateName.trim()}
          className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1.5 shrink-0"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Создать
        </button>
      </div>

      {/* Визуальный редактор выбранного состояния */}
      {activeState && (
        <div className="bg-card border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Workflow className="w-4 h-4 text-primary" />
              <p className="font-medium">Редактор: <code className="bg-background px-1.5 py-0.5 rounded text-sm font-mono">{activeState.name}</code></p>
            </div>
            <button
              onClick={() => {
                const flow = activeState.flow || { nodes: [], transitions: [] };
                void handleSaveState(
                  activeState.id,
                  flow,
                  activeState.initial_state || flow.nodes?.[0]?.id || ''
                );
              }}
              className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Сохранить
            </button>
          </div>
          <FSMVisualEditor
            flow={activeState.flow || { nodes: [], transitions: [] }}
            onChange={(flow) => {
              setStates((prev) =>
                prev.map((s) => s.id === activeState.id ? { ...s, flow } : s)
              );
            }}
            initialState={activeState.initial_state}
            onInitialStateChange={(stateId) => {
              setStates((prev) =>
                prev.map((s) => s.id === activeState.id ? { ...s, initial_state: stateId } : s)
              );
            }}
          />
          <p className="text-xs text-muted-foreground text-center">
            Кликните по ноде на холсте для редактирования · Удаляйте переходы кнопкой ✕
          </p>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// AnalyticsTab
// ===========================================================================
interface AnalyticsTabProps { botId: string }

function AnalyticsTab({ botId }: AnalyticsTabProps) {
  const [analytics, setAnalytics] = useState<BotAnalytics[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    void botApi.getBotAnalytics(botId, { days: 30 }).then(({ analytics: a }) => {
      setAnalytics(a);
      setLoading(false);
    }).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки');
      setLoading(false);
    });
  }, [botId]);

  if (loading) return <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  const totalSent     = analytics.reduce((s, a) => s + a.messages_sent, 0);
  const totalReceived = analytics.reduce((s, a) => s + a.messages_received, 0);
  const totalUsers    = analytics.reduce((s, a) => s + a.unique_users, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-primary/10 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-primary">{totalSent}</p>
          <p className="text-xs text-muted-foreground">Отправлено</p>
        </div>
        <div className="bg-accent/10 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{totalReceived}</p>
          <p className="text-xs text-muted-foreground">Получено</p>
        </div>
        <div className="bg-card border rounded-xl p-4 text-center col-span-2">
          <p className="text-2xl font-bold">{totalUsers}</p>
          <p className="text-xs text-muted-foreground">Уникальных пользователей</p>
        </div>
      </div>
      <div className="bg-card border rounded-2xl overflow-hidden">
        <ul className="divide-y">
          {analytics.map((a) => (
            <li key={a.date} className="p-3 flex items-center justify-between">
              <p className="text-sm">{a.date}</p>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>↑ {a.messages_sent}</span>
                <span>↓ {a.messages_received}</span>
                <span>👥 {a.unique_users}</span>
              </div>
            </li>
          ))}
          {analytics.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Нет данных</p>
          )}
        </ul>
      </div>
    </div>
  );
}

// ===========================================================================
// PaymentsTab
// ===========================================================================
interface PaymentsTabProps { botId: string }

function PaymentsTab({ botId }: PaymentsTabProps) {
  const [balance, setBalance]     = useState<number | null>(null);
  const [loading, setLoading]     = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    loadBalance();
    loadTransactions();
  }, [botId]);

async function loadBalance() {
     try {
       const balance = await StarsV2.getBalance();
       setBalance(balance);
       setLoading(false);
     } catch {
       setLoading(false);
     }
   }

async function loadTransactions() {
     try {
       const result = await botApi.getBotRuns(botId, { limit: 20 });
       setTransactions(result.runs.filter((r) => r.response_method === 'sendMessage'));
     } catch {
       // noop
     }
   }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-yellow-500/10 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{loading ? '...' : balance ?? '—'}</p>
          <p className="text-xs text-muted-foreground">Stars (XTR) баланс</p>
        </div>
        <div className="bg-card border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{transactions.length}</p>
          <p className="text-xs text-muted-foreground">Транзакций</p>
        </div>
      </div>
      <div className="bg-card border rounded-2xl p-5">
        <p className="font-medium mb-3">Интеграция с Stars v2</p>
        <p className="text-sm text-muted-foreground">
          Платёжная система Stars v2 реализована через собственный протокол без зависимости от Telegram API.
          Используйте <code className="bg-background px-1.5 py-0.5 rounded text-xs">StarsV2</code> из{' '}
          <code className="bg-background px-1.5 py-0.5 rounded text-xs">@/lib/stars/v2/payments</code> для создания
          инвойсов, оплаты и возвратов.
        </p>
        <div className="mt-3 p-3 bg-background rounded-lg text-xs font-mono space-y-1">
          <pre>{String.raw`import { StarsV2 } from "@/lib/stars/v2/payments";`}</pre>
          <pre>{String.raw`const invoice = await StarsV2.createInvoice({`}</pre>
          <pre>{String.raw`  botId, chatId, title: "Подписка",`}</pre>
          <pre>{String.raw`  amount: 100, currency: "XTR"`}</pre>
          <pre>{String.raw`});`}</pre>
          <pre>{String.raw`const result = await StarsV2.payInvoice(invoice.id);`}</pre>
        </div>
      </div>
    </div>
  );
}
