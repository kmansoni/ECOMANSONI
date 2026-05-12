import React, { useState } from 'react';
import { useAgeVerification } from '@/hooks/useAgeVerification';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InfoCircledIcon } from '@radix-ui/react-icons';

interface AgeGateOverlayProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const AgeGateOverlay: React.FC<AgeGateOverlayProps> = ({ onSuccess, onCancel }) => {
  const { verifyAge, isVerifying } = useAgeVerification();
  const [dob, setDob] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dob) {
      setError('Пожалуйста, укажите дату рождения');
      return;
    }

    setError(null);
    const result = await verifyAge(dob);
    if (result.success) {
      onSuccess?.();
    } else {
      setError(result.error || 'Не удалось проверить возраст');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Возрастная верификация</CardTitle>
          <CardDescription>
            Для продолжения использования Mansoni необходимо подтвердить ваш возраст.
            Данные используются только для фильтрации контента и не передаются третьим лицам.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <Alert>
              <InfoCircledIcon className="h-4 w-4" />
              <AlertDescription>
                Пользователям младше 13 лет требуется аккаунт родителя.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <label htmlFor="dob" className="text-sm font-medium">
                Дата рождения
              </label>
              <Input
                id="dob"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                required
              />
              <p className="text-xs text-muted-foreground">
                Вы должны быть старше 13 лет для регистрации без родительского контроля.
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={isVerifying} className="flex-1">
                {isVerifying ? 'Проверка...' : 'Подтвердить'}
              </Button>
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Отмена
                </Button>
              )}
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  );
};
