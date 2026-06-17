import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Loader2, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

import { dbLoose } from "@/lib/supabase";
import { GlassSecondaryButton } from "@/components/ui/glass/GlassSecondaryButton";
import { useGlassTokens, type GlassTheme } from "@/components/ui/glass/glassTokens";
import { cn } from "@/lib/utils";

interface QRCodeLoginProps {
  onSuccess: (session: any) => void;
  /** Optional theme override; defaults to "dark" to match AuthPage. */
  theme?: GlassTheme;
}

export function QRCodeLogin({ onSuccess, theme = "dark" }: QRCodeLoginProps) {
  const tokens = useGlassTokens(theme);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"generating" | "waiting" | "expired" | "success">("generating");
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const expiryRef = useRef<ReturnType<typeof setTimeout>>();

  const generateToken = async () => {
    setStatus("generating");
    const newToken = crypto.randomUUID();
    setToken(newToken);

    const qrData = `ecomansoni://qr-login?token=${newToken}`;
    if (canvasRef.current) {
      await QRCode.toCanvas(canvasRef.current, qrData, {
        width: 220,
        margin: 2,
        color: { dark: "#0a1628", light: "#ffffff" },
      });
    }

    await dbLoose.from("qr_login_tokens").upsert({
      token: newToken,
      status: "pending",
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    setStatus("waiting");

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
    <div className="flex flex-col items-center gap-5">
      <p className={cn("text-sm text-center max-w-[280px]", tokens.textMuted)}>
        Откройте mansoni на телефоне → Настройки → Устройства → Сканировать QR-код
      </p>

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "relative rounded-2xl p-3 transition-opacity",
          tokens.glassCard,
          status === "expired" && "opacity-40",
        )}
      >
        <canvas ref={canvasRef} />
        {status === "generating" && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        )}
        <div
          className="pointer-events-none absolute -inset-1 rounded-[1.25rem] -z-10 blur-xl opacity-70"
          style={{ background: "linear-gradient(135deg,#00b4d8 0%,#00c896 50%,#4fd080 100%)" }}
        />
      </motion.div>

      {status === "expired" && (
        <GlassSecondaryButton
          size="md"
          icon={<RefreshCw className="w-4 h-4" />}
          onClick={generateToken}
        >
          Обновить QR-код
        </GlassSecondaryButton>
      )}

      {status === "waiting" && (
        <p className={cn("text-xs animate-pulse", tokens.textFaint)}>
          Ожидание подтверждения...
        </p>
      )}
    </div>
  );
}
