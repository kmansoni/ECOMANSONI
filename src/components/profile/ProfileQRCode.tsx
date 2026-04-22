import { useEffect, useRef } from "react";
import { Download, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import { buildProfileUrl } from "@/lib/users/profileLinks";

interface ProfileQRCodeProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  userId: string;
  avatarUrl?: string;
}

export function ProfileQRCode({ isOpen, onClose, username, userId, avatarUrl }: ProfileQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dayStamp = new Date().toISOString().slice(0, 10);
  const qrUrl = new URL(buildProfileUrl({ username, userId }));
  qrUrl.searchParams.set("qr_day", dayStamp);
  const profileUrl = qrUrl.toString();

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;

    const renderQr = async () => {
      try {
        await QRCode.toCanvas(canvas, profileUrl, {
          width: 250,
          margin: 1,
          errorCorrectionLevel: "M",
          color: {
            dark: "#111111",
            light: "#F7F7F7",
          },
        });
      } catch {
        // Fallback to strict black/white to guarantee scan reliability.
        await QRCode.toCanvas(canvas, profileUrl, {
          width: 250,
          margin: 1,
          errorCorrectionLevel: "M",
          color: {
            dark: "#000000",
            light: "#FFFFFF",
          },
        });
      }
    };

    void renderQr();
  }, [isOpen, profileUrl]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `${username}-qr.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-[200]"
          />
          <div className="fixed inset-0 z-[201] p-4 flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 18, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.92, y: 18, filter: "blur(10px)" }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto relative w-full max-w-[420px] rounded-3xl p-6 flex flex-col items-center gap-4 text-white bg-white/12 backdrop-blur-2xl border border-white/25 shadow-[0_12px_48px_rgba(0,0,0,0.35)]"
            >
              <button onClick={onClose} className="absolute top-4 right-4 text-white/75 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>

              <div className="relative flex flex-col items-center gap-2">
                {avatarUrl && (
                  <img loading="lazy" src={avatarUrl} alt={username} className="w-14 h-14 rounded-full object-cover ring-2 ring-white/40" />
                )}
                <p className="font-semibold text-lg">@{username}</p>
              </div>

              <div className="relative p-3 rounded-2xl border border-white/35 bg-white/14 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_30px_rgba(0,0,0,0.22)]">
                <canvas ref={canvasRef} className="rounded-lg" style={{ imageRendering: "pixelated" }} />
              </div>

              <p className="relative text-white/85 text-xs text-center">Отсканируйте QR-код для перехода в профиль</p>

              <button
                onClick={handleDownload}
                className="relative flex items-center gap-2 bg-white/20 hover:bg-white/28 text-white px-5 py-2.5 rounded-xl font-medium text-sm border border-white/35 transition-colors"
              >
                <Download className="w-4 h-4" />
                Скачать QR-код
              </button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
