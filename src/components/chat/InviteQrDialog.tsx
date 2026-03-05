import { useEffect, useRef } from "react";
import { Copy, Download, Share2 } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface InviteQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  inviteUrl: string;
  downloadFileName: string;
}

export function InviteQrDialog({
  open,
  onOpenChange,
  title,
  description,
  inviteUrl,
  downloadFileName,
}: InviteQrDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open || !inviteUrl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    void QRCode.toCanvas(canvas, inviteUrl, {
      width: 260,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#FFFFFF" },
    });
  }, [open, inviteUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать ссылку");
    }
  };

  const handleShare = async () => {
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share({ title, url: inviteUrl });
        return;
      }
      await handleCopy();
    } catch {
      // Share can be canceled by user; keep silent.
    }
  };

  const handleDownload = () => {
    if (!canvasRef.current) {
      toast.error("QR-код пока не готов");
      return;
    }
    const link = document.createElement("a");
    link.download = downloadFileName;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="mx-auto rounded-2xl border border-border bg-card p-3">
          <canvas ref={canvasRef} className="rounded-lg" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => void handleCopy()}>
            <Copy className="w-4 h-4 mr-2" />
            Скопировать
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={() => void handleShare()}>
            <Share2 className="w-4 h-4 mr-2" />
            Поделиться
          </Button>
          <Button type="button" className="w-full" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" />
            Скачать QR
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}