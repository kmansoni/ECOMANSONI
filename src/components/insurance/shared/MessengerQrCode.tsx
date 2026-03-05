import { useRef, useEffect, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import QRCode from "qrcode";

const APP_URL = "https://mansoni.ru/app";

interface MessengerQrCodeProps {
  size?: number;
  showButtons?: boolean;
}

export function MessengerQrCode({ size = 200, showButtons = true }: MessengerQrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, APP_URL, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#FFFFFF" },
    });
  }, [size]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(APP_URL);
    setCopied(true);
    toast.success("Ссылка скопирована");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: "Mansoni — мессенджер", url: APP_URL });
    } else {
      handleCopy();
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="bg-white p-3 rounded-xl shadow-md">
        <canvas ref={canvasRef} width={size} height={size} style={{ display: "block", imageRendering: "pixelated" }} />
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold">Скачайте наш мессенджер</p>
        <p className="text-xs text-muted-foreground mt-0.5">{APP_URL}</p>
      </div>

      {/* Значки платформ */}
      <div className="flex gap-2 text-xs text-muted-foreground">
        <span className="bg-secondary px-2 py-1 rounded-full">App Store</span>
        <span className="bg-secondary px-2 py-1 rounded-full">Google Play</span>
        <span className="bg-secondary px-2 py-1 rounded-full">Web App</span>
      </div>

      {showButtons && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="w-3.5 h-3.5 mr-1.5" />
            {copied ? "Скопировано" : "Копировать"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 className="w-3.5 h-3.5 mr-1.5" />
            Поделиться
          </Button>
        </div>
      )}
    </div>
  );
}
