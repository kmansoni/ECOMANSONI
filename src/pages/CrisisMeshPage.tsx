import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Radio, Send, ShieldAlert, WifiOff, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

import { useCrisisMeshStore } from '@/stores/crisisMeshStore';
import type { EmergencyLevel, PeerId, SignalType } from '@/lib/crisis-mesh/types';

const SIGNAL_TYPES: Array<{ value: SignalType; label: string }> = [
  { value: 'medical', label: 'Нужна медицинская помощь' },
  { value: 'fire', label: 'Пожар' },
  { value: 'earthquake', label: 'Землетрясение' },
  { value: 'flood', label: 'Наводнение' },
  { value: 'violence', label: 'Насилие' },
  { value: 'trapped', label: 'Заблокирован(а)' },
  { value: 'need-help', label: 'Нужна помощь' },
  { value: 'safe', label: 'Я в безопасности' },
];

const LEVELS: Array<{ value: EmergencyLevel; label: string; tone: string }> = [
  { value: 'info', label: 'Инфо', tone: 'bg-muted text-muted-foreground' },
  { value: 'warning', label: 'Внимание', tone: 'bg-yellow-500/20 text-yellow-700' },
  { value: 'urgent', label: 'Срочно', tone: 'bg-orange-500/20 text-orange-700' },
  { value: 'critical', label: 'Критично', tone: 'bg-red-500/20 text-red-700' },
];

export default function CrisisMeshPage() {
  const {
    engine,
    identity,
    state,
    transportAvailable,
    lastError,
    peers,
    messages,
    sosSignals,
    init,
    start,
    stop,
    sendText,
    sendSos,
  } = useCrisisMeshStore();

  const [displayName, setDisplayName] = useState('');
  const [broadcastText, setBroadcastText] = useState('');
  const [sosMessage, setSosMessage] = useState('');
  const [sosType, setSosType] = useState<SignalType>('need-help');
  const [sosLevel, setSosLevel] = useState<EmergencyLevel>('urgent');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!engine && identity === null && !lastError) {
      const stored = localStorage.getItem('crisis-mesh:last-display-name') ?? '';
      setDisplayName(stored);
    }
  }, [engine, identity, lastError]);

  const online = useMemo(() => peers.filter((p) => p.status === 'online' || p.status === 'connecting'), [peers]);
  const recentMessages = useMemo(() => messages.slice(0, 50), [messages]);

  async function handleInit() {
    const name = displayName.trim();
    if (name.length < 2) {
      toast.error('Введите имя (минимум 2 символа)');
      return;
    }
    try {
      localStorage.setItem('crisis-mesh:last-display-name', name);
      const devMode = import.meta.env.DEV;
      await init({ displayName: name, devMode });
      await start();
      toast.success('Mesh запущен');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось запустить mesh');
    }
  }

  async function handleSendBroadcast() {
    const text = broadcastText.trim();
    if (!text) return;
    setSending(true);
    try {
      await sendText('broadcast' as PeerId | 'broadcast', text);
      setBroadcastText('');
      toast.success('Сообщение отправлено');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка отправки');
    } finally {
      setSending(false);
    }
  }

  async function handleSendSos() {
    const text = sosMessage.trim();
    if (!text) {
      toast.error('Опишите ситуацию');
      return;
    }
    setSending(true);
    try {
      await sendSos({ type: sosType, level: sosLevel, message: text });
      setSosMessage('');
      toast.success('SOS отправлен');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка SOS');
    } finally {
      setSending(false);
    }
  }

  if (!engine) {
    return (
      <div className="container max-w-xl py-8 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Radio className="w-6 h-6" /> Crisis Mesh
          </h1>
          <p className="text-sm text-muted-foreground">
            Оффлайн-mesh для кризисных ситуаций. Работает без интернета через Bluetooth и Wi-Fi Direct
            на мобильных устройствах. В вебе доступен только dev-режим.
          </p>
        </header>

        {transportAvailable === false && (
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <WifiOff className="w-4 h-4" /> Транспорт недоступен
              </CardTitle>
              <CardDescription>{lastError ?? 'Окружение не поддерживает mesh.'}</CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Инициализация</CardTitle>
            <CardDescription>
              Имя будет видно другим участникам сети. Ключ-пара Ed25519 генерируется локально и не покидает устройство.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Ваше имя"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
            />
            <Button onClick={handleInit} className="w-full">
              Запустить mesh
            </Button>
            {lastError && transportAvailable !== false && (
              <p className="text-xs text-destructive">{lastError}</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Radio className="w-6 h-6" /> Crisis Mesh
          </h1>
          <p className="text-xs text-muted-foreground">
            {identity?.displayName} · {identity?.peerId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={state === 'running' ? 'default' : 'secondary'}>{state}</Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void stop();
            }}
          >
            Стоп
          </Button>
        </div>
      </header>

      {lastError && (
        <Card className="border-destructive/50">
          <CardContent className="pt-4 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {lastError}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-600" /> SOS
          </CardTitle>
          <CardDescription>
            Широковещательный сигнал бедствия. Подписан вашим ключом, ретранслируется всеми пирами.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Select value={sosType} onValueChange={(v) => setSosType(v as SignalType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SIGNAL_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sosLevel} onValueChange={(v) => setSosLevel(v as EmergencyLevel)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            placeholder="Опишите ситуацию…"
            value={sosMessage}
            onChange={(e) => setSosMessage(e.target.value)}
            maxLength={500}
            rows={3}
          />
          <Button
            variant="destructive"
            className="w-full"
            onClick={handleSendSos}
            disabled={sending}
          >
            <ShieldAlert className="w-4 h-4 mr-2" /> Отправить SOS
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> Пиры рядом ({online.length}/{peers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {peers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пиры не обнаружены. Поиск продолжается…</p>
          ) : (
            <ScrollArea className="max-h-48">
              <ul className="space-y-2">
                {peers.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${p.status === 'online' ? 'bg-green-500' : p.status === 'connecting' ? 'bg-yellow-500' : 'bg-muted-foreground/40'}`} />
                      <span>{p.displayName}</span>
                      <span className="text-xs text-muted-foreground">{p.deviceType}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">{p.status}</Badge>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Широковещание</CardTitle>
          <CardDescription>Текст виден всем пирам поблизости, подпись проверяется.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Сообщение всем…"
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
              maxLength={500}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendBroadcast();
                }
              }}
            />
            <Button onClick={handleSendBroadcast} disabled={sending || !broadcastText.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Активные SOS ({sosSignals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {sosSignals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет активных сигналов.</p>
          ) : (
            <ul className="space-y-3">
              {sosSignals.map((s) => {
                const level = LEVELS.find((l) => l.value === s.level);
                return (
                  <li key={s.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${level?.tone ?? ''}`}>{level?.label}</span>
                      <span className="text-sm font-medium">{s.senderDisplayName}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(s.timestamp).toLocaleTimeString('ru-RU')}
                      </span>
                    </div>
                    <p className="text-sm">{s.message}</p>
                    {s.coordinates && (
                      <p className="text-xs text-muted-foreground">
                        {s.coordinates.latitude.toFixed(5)}, {s.coordinates.longitude.toFixed(5)} · ±{s.coordinates.accuracyM}м
                      </p>
                    )}
                    <Separator />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Недавние сообщения</CardTitle>
        </CardHeader>
        <CardContent>
          {recentMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока пусто.</p>
          ) : (
            <ScrollArea className="max-h-72">
              <ul className="space-y-2">
                {recentMessages.map((m) => (
                  <li key={m.header.id} className="text-sm">
                    <span className="text-xs text-muted-foreground">
                      {new Date(m.header.timestamp).toLocaleTimeString('ru-RU')} · {m.header.senderId.slice(0, 8)}
                    </span>
                    <p>{safePlaintext(m.plaintext)}</p>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function safePlaintext(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'text' in parsed) {
      const text = (parsed as { text: unknown }).text;
      if (typeof text === 'string') return text;
    }
  } catch {
    // fallthrough
  }
  return raw;
}
