import { useState } from 'react';
import { Shield, Share2, Phone, AlertTriangle, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { shareTrip, sendSos } from '@/lib/taxi/api';

interface SafetyPanelProps {
  orderId: string;
  className?: string;
}

export function SafetyPanel({ orderId, className }: SafetyPanelProps) {
  const [sosDialogOpen, setSosDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [sosSent, setSosSent] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // ─── Отправить SOS ────────────────────────────────────────────────────────
  const handleSos = async () => {
    try {
      await sendSos(orderId);
      setSosSent(true);
    } catch {
      // Показать ошибку
    }
  };

  // ─── Поделиться поездкой ──────────────────────────────────────────────────
  const handleShare = async () => {
    const link = await shareTrip(orderId);
    setShareLink(link);
    setShareDialogOpen(true);

    // Нативный share если доступен
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Моя поездка',
          text: 'Следите за моей поездкой в реальном времени',
          url: link,
        });
        setShareDialogOpen(false);
        return;
      } catch {
        // Пользователь отказался — показываем диалог
      }
    }
  };

  // ─── Копировать ссылку ────────────────────────────────────────────────────
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <>
      <div className={cn('flex items-center gap-2', className)}>
        {/* SOS */}
        <Button
          variant="destructive"
          size="sm"
          className="flex-1 flex items-center gap-2 h-10 rounded-xl font-semibold"
          onClick={() => setSosDialogOpen(true)}
        >
          <Shield className="h-4 w-4" />
          SOS
        </Button>

        {/* Share */}
        <Button
          variant="outline"
          size="sm"
          className="flex-1 flex items-center gap-2 h-10 rounded-xl font-semibold"
          onClick={handleShare}
        >
          <Share2 className="h-4 w-4" />
          Поделиться
        </Button>
      </div>

      {/* SOS Dialog */}
      <Dialog open={sosDialogOpen} onOpenChange={setSosDialogOpen}>
        <DialogContent className="max-w-sm mx-auto rounded-2xl">
          <DialogTitle className="text-center">
            {sosSent ? '✅ Сигнал SOS отправлен' : '🚨 Экстренная помощь'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {sosSent
              ? 'Служба безопасности получила ваш сигнал. Помощь уже в пути.'
              : 'Вызвать экстренную помощь? Ваше местоположение будет автоматически передано.'}
          </DialogDescription>

          {!sosSent ? (
            <div className="flex flex-col gap-3 mt-2">
              <Button
                variant="destructive"
                className="h-12 text-base font-semibold rounded-xl"
                onClick={handleSos}
              >
                <AlertTriangle className="h-5 w-5 mr-2" />
                Вызвать помощь
              </Button>
              <a
                href="tel:112"
                className="flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-border text-base font-semibold"
              >
                <Phone className="h-5 w-5 text-red-500" />
                Позвонить 112
              </a>
              <Button
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => setSosDialogOpen(false)}
              >
                Отмена
              </Button>
            </div>
          ) : (
            <Button
              className="mt-2 w-full h-12 rounded-xl"
              onClick={() => {
                setSosDialogOpen(false);
                setSosSent(false);
              }}
            >
              Понятно
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-sm mx-auto rounded-2xl">
          <DialogTitle>Поделиться поездкой</DialogTitle>
          <DialogDescription>
            Отправьте ссылку близким, чтобы они следили за вашей поездкой в реальном времени.
          </DialogDescription>

          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 bg-muted rounded-xl px-3 py-2 text-xs text-muted-foreground truncate">
              {shareLink}
            </div>
            <Button
              size="sm"
              variant={isCopied ? 'outline' : 'default'}
              className="rounded-xl flex-shrink-0"
              onClick={handleCopyLink}
            >
              {isCopied ? (
                <><Check className="h-4 w-4 mr-1 text-emerald-500" />Скопировано</>
              ) : (
                'Копировать'
              )}
            </Button>
          </div>

          <Button
            variant="ghost"
            className="mt-1 text-muted-foreground"
            onClick={() => setShareDialogOpen(false)}
          >
            Закрыть
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
