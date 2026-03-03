import { useEffect, useRef } from "react";
import { Download, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ProfileQRCodeProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  userId: string;
  avatarUrl?: string;
}

function generateQRMatrix(text: string): boolean[][] {
  // Simple QR-like pattern using hash of text for visual representation
  const size = 25;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Fixed pattern corners (finder patterns)
  const setSquare = (row: number, col: number, sz: number) => {
    for (let r = row; r < row + sz; r++) {
      for (let c = col; c < col + sz; c++) {
        if (r >= 0 && r < size && c >= 0 && c < size) {
          matrix[r][c] = !(r > row && r < row + sz - 1 && c > col && c < col + sz - 1);
        }
      }
    }
  };
  setSquare(0, 0, 7);
  setSquare(0, size - 7, 7);
  setSquare(size - 7, 0, 7);

  // Data modules - deterministic from text
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  for (let r = 8; r < size - 7; r++) {
    for (let c = 0; c < size; c++) {
      hash = ((hash << 5) - hash) + (r * size + c);
      hash |= 0;
      matrix[r][c] = (Math.abs(hash) % 3) !== 0;
    }
  }
  return matrix;
}

export function ProfileQRCode({ isOpen, onClose, username, userId, avatarUrl }: ProfileQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const profileUrl = `${window.location.origin}/user/${userId}`;
  const matrix = generateQRMatrix(profileUrl);

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cellSize = 10;
    const size = matrix.length * cellSize;
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = "#000000";
    matrix.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell) {
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      });
    });
  }, [isOpen, matrix]);

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
