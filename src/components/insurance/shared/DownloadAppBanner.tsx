import { useState, useEffect } from "react";
import { X, Smartphone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MessengerQrCode } from "./MessengerQrCode";

const STORAGE_KEY = "mansoni_download_banner_closed";
const APP_URL = "https://mansoni.ru/app";

export function DownloadAppBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const closed = localStorage.getItem(STORAGE_KEY);
    if (!closed) {
      setVisible(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/90 to-primary p-4 text-white shadow-xl"
        >
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex gap-4 items-center">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Smartphone className="w-4 h-4 shrink-0" />
                <span className="text-xs font-medium text-white/80">Mansoni App</span>
              </div>
              <h3 className="font-bold text-base leading-tight mb-2">
                Управляйте полисами в мессенджере Mansoni
              </h3>
              <ul className="text-xs text-white/80 space-y-0.5 mb-3">
                <li>• Все полисы в одном месте</li>
                <li>• Уведомления о продлении</li>
                <li>• Оформление за 2 минуты</li>
              </ul>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-xs h-7 px-3"
                  onClick={() => window.open(APP_URL, "_blank")}
                >
                  App Store
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-xs h-7 px-3"
                  onClick={() => window.open(APP_URL, "_blank")}
                >
                  Google Play
                </Button>
              </div>
            </div>
            <div className="shrink-0 hidden sm:block">
              <MessengerQrCode size={80} showButtons={false} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
