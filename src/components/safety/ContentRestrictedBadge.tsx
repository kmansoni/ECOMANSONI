import React from 'react';
import { LockIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useState } from 'react';

interface ContentRestrictedBadgeProps {
  requiredAge: number;
  contentTitle?: string;
  onUnlock?: () => void;
  canUnlock?: boolean;
}

export const ContentRestrictedBadge: React.FC<ContentRestrictedBadgeProps> = ({
  requiredAge,
  contentTitle,
  onUnlock,
  canUnlock = false,
}) => {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
        <LockIcon className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1">
          <p className="text-sm font-medium">
            Контент с рейтингом {requiredAge}+
          </p>
          {contentTitle && (
            <p className="text-xs text-muted-foreground truncate">{contentTitle}</p>
          )}
        </div>
        {canUnlock && (
          <Button size="sm" variant="secondary" onClick={() => setShowDialog(true)}>
            Показать
          </Button>
        )}
      </div>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Возрастное ограничение</AlertDialogTitle>
            <AlertDialogDescription>
              Этот контент предназначен для пользователей {requiredAge} лет и старше.
              Подтверждаете, что вам есть {requiredAge} лет?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Нет</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onUnlock?.(); setShowDialog(false); }}>
              Да, мне есть {requiredAge}+
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
