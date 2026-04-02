import { useEffect, useState } from "react";
import { Lock, CheckCircle2, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useE2EEncryption } from "@/hooks/useE2EEncryption";
import { toast } from "sonner";

interface VerifyEncryptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  otherUserId: string;
  otherName: string;
}

const EMOJI_MAP = [
  "\u{1F600}", "\u{1F60D}", "\u{1F60E}", "\u{1F917}", "\u{1F914}", "\u{1F60A}",
  "\u{1F609}", "\u{1F611}", "\u{1F62E}", "\u{1F633}", "\u{1F629}", "\u{1F622}",
  "\u{1F620}", "\u{1F608}", "\u{1F47B}", "\u{1F480}", "\u{1F916}", "\u{1F648}",
  "\u{1F436}", "\u{1F431}", "\u{1F981}", "\u{1F427}", "\u{1F40D}", "\u{1F41D}",
  "\u{1F332}", "\u{1F33B}", "\u{1F30D}", "\u{2B50}", "\u{1F525}", "\u{2764}\u{FE0F}",
  "\u{1F4A5}", "\u{1F389}",
];

function hexToEmojis(hex: string): string {
  const bytes = hex.match(/.{1,2}/g) ?? [];
  return bytes
    .slice(0, 8)
    .map((b) => EMOJI_MAP[parseInt(b, 16) % EMOJI_MAP.length])
    .join(" ");
}

export function VerifyEncryptionDialog({
  open,
  onOpenChange,
  conversationId,
  otherUserId,
  otherName,
}: VerifyEncryptionDialogProps) {
  const { getSafetyNumber } = useE2EEncryption(conversationId);
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !otherUserId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const sn = await getSafetyNumber(otherUserId);
        if (!cancelled) setSafetyNumber(sn?.numeric ?? null);
      } catch {
        if (!cancelled) setSafetyNumber(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, otherUserId, getSafetyNumber]);

  const emojiFingerprint = safetyNumber ? hexToEmojis(safetyNumber) : "";

  const copyToClipboard = async () => {
    if (!safetyNumber) return;
    await navigator.clipboard.writeText(safetyNumber);
    toast.success("Скопировано");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-green-500" />
            Верификация шифрования
          </DialogTitle>
          <DialogDescription>
            Сравните эти эмодзи с {otherName}, чтобы убедиться, что чат защищён.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : safetyNumber ? (
            <>
              <div className="text-center text-3xl tracking-widest py-4 bg-muted/50 rounded-xl">
                {emojiFingerprint}
              </div>
              <p className="text-xs text-muted-foreground font-mono text-center break-all">
                {safetyNumber}
              </p>
            </>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-4">
              Не удалось получить ключ верификации.
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={copyToClipboard}
              disabled={!safetyNumber}
            >
              <Copy className="w-4 h-4" />
              Копировать
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={() => {
                toast.success("Контакт верифицирован");
                onOpenChange(false);
              }}
              disabled={!safetyNumber}
            >
              <CheckCircle2 className="w-4 h-4" />
              Проверено
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
