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
    void QRCode.toCanvas(canvas, profileUrl, {
      width: 250,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#FFFFFF" },
    });
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
            className="fixed inset-0 bg-black/60 z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-white rounded-3xl p-6 flex flex-col items-center gap-4"
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400">
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center gap-2">
              {avatarUrl && (
                <img src={avatarUrl} alt={username} className="w-14 h-14 rounded-full object-cover" />
              )}
              <p className="text-black font-semibold text-lg">@{username}</p>
            </div>

            <div className="bg-white p-3 rounded-2xl shadow-inner border border-gray-100">
              <canvas ref={canvasRef} className="rounded-lg" style={{ imageRendering: "pixelated" }} />
            </div>

            <p className="text-zinc-500 text-xs text-center">Отсканируйте QR-код для перехода в профиль</p>

            <button
              onClick={handleDownload}
              className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-xl font-medium text-sm"
            >
              <Download className="w-4 h-4" />
              Скачать QR-код
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
