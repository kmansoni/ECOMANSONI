import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { dbLoose } from "@/lib/supabase";
import { Loader2, QrCode, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QRCodeLoginProps {
  onSuccess: (session: any) => void;
}

export function QRCodeLogin({ onSuccess }: QRCodeLoginProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"generating" | "waiting" | "expired" | "success">("generating");
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const expiryRef = useRef<ReturnType<typeof setTimeout>>();

  const generateToken = async () => {
    setStatus("generating");
    const newToken = crypto.randomUUID();
    setToken(newToken);

    // Generate QR code with deep link
    const qrData = `ecomansoni://qr-login?token=${newToken}`;
    if (canvasRef.current) {
      await QRCode.toCanvas(canvasRef.current, qrData, {
        width: 220,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });
    }

    // Сохраняем токен в БД (таблица не в сгенерированных типах — используем dbLoose)
    await dbLoose.from("qr_login_tokens").upsert({
      token: newToken,
      status: "pending",
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    setStatus("waiting");

    // Poll for confirmation
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { data } = await dbLoose
        .from("qr_login_tokens")
        .select("status, user_id")
        .eq("token", newToken)
        .maybeSingle();

      if (data?.status === "confirmed" && data?.user_id) {
        setStatus("success");
        clearInterval(pollRef.current);
        onSuccess(data);
      } else if (data?.status === "expired" || !data) {
        setStatus("expired");
        clearInterval(pollRef.current);
      }
    }, 2000);

    // Auto-expire after 5 minutes
    if (expiryRef.current) clearTimeout(expiryRef.current);
    expiryRef.current = setTimeout(() => {
      setStatus((prev) => {
        if (prev === "waiting") {
          if (pollRef.current) clearInterval(pollRef.current);
          return "expired";
        }
        return prev;
      });
    }, 5 * 60 * 1000);
  };

  useEffect(() => {
    void generateToken();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (expiryRef.current) clearTimeout(expiryRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <QrCode className="w-8 h-8 text-primary" />
      <h3 className="text-lg font-semibold">Вход по QR-коду</h3>
      <p className="text-sm text-muted-foreground text-center max-w-[280px]">
        Откройте ECOMANSONI на телефоне, перейдите в Настройки → Устройства → Сканировать QR-код
      </p>

      <div className={cn(
        "relative rounded-2xl overflow-hidden bg-white p-3",
        status === "expired" && "opacity-40"
      )}>
        <canvas ref={canvasRef} />
        {status === "generating" && (
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
      </div>

      {status === "expired" && (
        <Button
          variant="outline"
          onClick={generateToken}
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Обновить QR-код
        </Button>
      )}

      {status === "waiting" && (
        <p className="text-xs text-muted-foreground animate-pulse">
          Ожидание подтверждения...
        </p>
      )}
    </div>
  );
}
