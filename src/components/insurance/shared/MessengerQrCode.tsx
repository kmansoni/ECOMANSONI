import { useRef, useEffect, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const APP_URL = "https://mansoni.ru/app";

// Простой детерминированный QR-паттерн на Canvas (визуализация без внешних библиотек)
function drawQrPattern(canvas: HTMLCanvasElement, url: string, size: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cellCount = 21;
  const cellSize = size / cellCount;

  ctx.clearRect(0, 0, size, size);

  // Генерируем псевдо-QR матрицу на основе URL
  const seed = url.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const matrix: boolean[][] = Array.from({ length: cellCount }, (_, row) =>
    Array.from({ length: cellCount }, (_, col) => {
      // Finder patterns (corners)
      if (
        (row < 8 && col < 8) ||
        (row < 8 && col >= cellCount - 8) ||
        (row >= cellCount - 8 && col < 8)
      ) {
        const r = row < 8 ? row : cellCount - 1 - row;
        const c = col < 8 ? col : cellCount - 1 - col;
        if (r === 0 || r === 6 || c === 0 || c === 6) return true;
        if (r >= 2 && r <= 4 && c >= 2 && c <= 4) return true;
        return false;
      }
      // Timing patterns
      if (row === 6 || col === 6) return (row + col) % 2 === 0;
      // Data
      const h = ((row * 31 + col * 17 + seed) * 2654435761) >>> 0;
      return h % 3 !== 0;
    })
  );

  // Рисуем
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < cellCount; r++) {
    for (let c = 0; c < cellCount; c++) {
      if (matrix[r][c]) {
        ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      }
    }
  }
}

interface MessengerQrCodeProps {
  size?: number;
  showButtons?: boolean;
}

export function MessengerQrCode({ size = 200, showButtons = true }: MessengerQrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      drawQrPattern(canvasRef.current, APP_URL, size);
    }
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
