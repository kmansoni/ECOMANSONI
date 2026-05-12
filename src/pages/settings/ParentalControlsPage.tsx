import React, { useState } from 'react';
import { useParentalControls } from '@/hooks/useParentalControls';
import { useTeenMode } from '@/hooks/useTeenMode';
import { useProfileStore } from '@/stores/profileStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Users,
  UserX,
  Shield,
  ShieldCheck,
  Link2,
  Link2Off,
} from 'lucide-react';

export const ParentalControlsPage: React.FC = () => {
  const { profile } = useProfileStore();
  const { isTeen, parentalSettings, effectiveRatingLimit } = useTeenMode();
  const {
    links,
    createInvite,
    acceptInvite,
    fetchLinks,
    revokeLink,
    overrideContentLimit,
  } = useParentalControls();

  const [inviteCode, setInviteCode] = useState('');
  const [newLimit, setNewLimit] = useState(effectiveRatingLimit);
  const [strictMode, setStrictMode] = useState(parentalSettings?.strictLimitedContent || false);

  React.useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleSendInvite = async (relationship: 'mother' | 'father' | 'guardian' | 'other') => {
    if (!profile) return;
    try {
      const result = await createInvite(profile.id, relationship);
      toast.success('Приглашение отправлено', {
        description: `Код приглашения: ${result.invite_code}`,
      });
    } catch (err: any) {
      toast.error('Ошибка', { description: err.message });
    }
  };

  const handleAcceptInvite = async () => {
    if (!inviteCode.trim()) return;
    try {
      await acceptInvite(inviteCode);
      toast.success('Приглашение принято');
      setInviteCode('');
      fetchLinks();
    } catch (err: any) {
      toast.error('Ошибка', { description: err.message });
    }
  };

  const handleOverrideLimit = async (rating: string) => {
    if (!parentalSettings?.parentalGuardianId) return;
    try {
      await overrideContentLimit(profile!.id, rating as any);
      toast.success('Настройки обновлены');
      setNewLimit(rating as any);
      fetchLinks();
    } catch (err: any) {
      toast.error('Ошибка', { description: err.message });
    }
  };

  const handleRevoke = async (linkId: string) => {
    await revokeLink(linkId);
    toast.success('Связь отозвана');
  };

  // Teen-specific UI
  if (isTeen) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Режим Teen Account
            </CardTitle>
            <CardDescription>
              Ваш аккаунт имеет ограничения для пользователей 13-17 лет.
              {parentalSettings?.parentalGuardianId && (
                <span className="block text-green-600">
                  Родительский контроль активен
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Текущий лимит контента</Label>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{effectiveRatingLimit}</Badge>
                {parentalSettings?.strictLimitedContent && (
                  <Badge variant="destructive">Strict Mode</Badge>
                )}
              </div>
            </div>

            {parentalSettings?.parentalGuardianId ? (
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-300">
                  Родитель может управлять вашими настройками контента.
                </p>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Привяжите аккаунт родителя для расширенных возможностей управления.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleSendInvite('parent')}>
                    Отправить приглашение родителю
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Принять приглашение</CardTitle>
            <CardDescription>
              Если родитель отправил вам код, введите его здесь
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input
              placeholder="Код приглашения"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
            <Button onClick={handleAcceptInvite} disabled={!inviteCode.trim()}>
              Принять
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Adult UI — manage teens
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Привязанные аккаунты
          </CardTitle>
          <CardDescription>
            Управляйте аккаунтами подростков, которые вы подключили
          </CardDescription>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Нет привязанных аккаунтов
            </p>
          ) : (
            <div className="space-y-3">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <UserX className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Подросток</p>
                      <p className="text-xs text-muted-foreground">
                        Связан с: {link.created_at}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={link.status === 'active' ? 'default' : 'secondary'}>
                      {link.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRevoke(link.id)}
                    >
                      Отозвать
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Отправить приглашение</CardTitle>
          <CardDescription>
            Отправьте приглашение родителя подростку
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={() => handleSendInvite('parent')}>
            Создать приглашение (код)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Настройки Strict Limited Content</CardTitle>
          <CardDescription>
            Эти настройки применяются ко всем привязанным аккаунтам
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="strict-mode">Strict Limited Content</Label>
            <Switch
              id="strict-mode"
              checked={strictMode}
              onCheckedChange={setStrictMode}
            />
          </div>

          <div className="space-y-2">
            <Label>Максимальный рейтинг</Label>
            <div className="flex gap-2">
              {(['G', 'PG', 'PG-13', 'T', 'MA'] as const).map((rating) => (
                <Button
                  key={rating}
                  size="sm"
                  variant={newLimit === rating ? 'default' : 'outline'}
                  onClick={() => {
                    setNewLimit(rating);
                    handleOverrideLimit(rating);
                  }}
                >
                  {rating}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
