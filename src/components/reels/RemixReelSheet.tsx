import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Video, SplitSquareHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RemixReelSheetProps {
  isOpen: boolean;
  onClose: () => void;
  originalReelId: string;
  originalVideoUrl: string;
  onStartRecording: (originalReelId: string) => void;
}

export function RemixReelSheet({
  isOpen,
  onClose,
  originalReelId,
  originalVideoUrl,
  onStartRecording,
}: RemixReelSheetProps) {
  const [mode, setMode] = useState<"split" | "green">("split");

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25 }}
          className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-3xl"
        >
          <div className="flex items-center justify-between px-4 py-4">
            <h2 className="text-white font-semibold text-lg">Remixить рилс</h2>
            <button onClick={onClose} className="text-zinc-400">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Original preview */}
          <div className="px-4 mb-4">
            <div className="relative rounded-xl overflow-hidden bg-zinc-800 aspect-[9/16] max-h-40">
              <video
                src={originalVideoUrl}
                className="w-full h-full object-cover"
                muted
                autoPlay
                loop
                playsInline
              />
              <div className="absolute bottom-2 left-2 bg-black/60 rounded-lg px-2 py-0.5">
                <span className="text-white text-xs">Оригинал</span>
              </div>
            </div>
          </div>

          {/* Mode selector */}
          <div className="px-4 mb-4">
            <p className="text-zinc-400 text-sm mb-2">Режим ремикса</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode("split")}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border ${mode === "split" ? "border-primary bg-primary/10" : "border-zinc-700 bg-zinc-800"}`}
              >
                <SplitSquareHorizontal className={`w-6 h-6 ${mode === "split" ? "text-primary" : "text-zinc-400"}`} />
                <span className={`text-sm ${mode === "split" ? "text-white" : "text-zinc-400"}`}>Раздельный экран</span>
              </button>
              <button
                onClick={() => setMode("green")}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border ${mode === "green" ? "border-primary bg-primary/10" : "border-zinc-700 bg-zinc-800"}`}
              >
                <Video className={`w-6 h-6 ${mode === "green" ? "text-primary" : "text-zinc-400"}`} />
                <span className={`text-sm ${mode === "green" ? "text-white" : "text-zinc-400"}`}>Зелёный экран</span>
              </button>
            </div>
          </div>

          <div className="px-4 pb-8">
            <Button
              className="w-full"
              onClick={() => { onStartRecording(originalReelId); onClose(); }}
            >
              Начать запись
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
