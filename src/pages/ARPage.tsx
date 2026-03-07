import { useState } from "react";
import { Sparkles, Camera, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ARFilterCamera } from "@/components/ar/ARFilterCamera";
import { motion } from "framer-motion";

export function ARPage() {
  const navigate = useNavigate();
  const [cameraOpen, setCameraOpen] = useState(false);

  if (cameraOpen) {
    return (
      <ARFilterCamera
        onClose={() => setCameraOpen(false)}
        onCapture={() => {
          // Capture is handled inside ARFilterCamera preview/save/share flow.
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">AR Камера</h1>
      </div>

      {/* Hero */}
      <div className="p-6 flex flex-col items-center gap-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"
        >
          <Sparkles className="w-16 h-16 text-white" />
        </motion.div>

        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">AR Фильтры</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Применяй красивые фильтры к своим фото и видео в реальном времени
          </p>
        </div>

        {/* Filter previews */}
        <div className="grid grid-cols-4 gap-3 w-full max-w-sm">
          {['🌅', '❄️', '📽️', '🤖', '🌸', '⚡', '🎮', '📼'].map((emoji, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="aspect-square rounded-xl bg-muted flex items-center justify-center text-2xl"
            >
              {emoji}
            </motion.div>
          ))}
        </div>

        <Button
          size="lg"
          className="w-full max-w-sm gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0"
          onClick={() => setCameraOpen(true)}
        >
          <Camera className="w-5 h-5" />
          Открыть камеру
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          18+ уникальных фильтров: красота, цвет, фон, эффекты
        </p>
      </div>
    </div>
  );
}
