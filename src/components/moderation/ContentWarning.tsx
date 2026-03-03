import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EyeOff, Eye, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ContentWarningProps {
  children: React.ReactNode;
  message?: string;
  className?: string;
  defaultHidden?: boolean;
}

export function ContentWarning({
  children,
  message = "Этот контент может содержать неприемлемые материалы",
  className,
  defaultHidden = true,
}: ContentWarningProps) {
  const [hidden, setHidden] = useState(defaultHidden);

  return (
    <div className={cn("relative", className)}>
      {children}

      <AnimatePresence>
        {hidden && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 backdrop-blur-md rounded-xl z-10"
          >
            <ShieldAlert className="w-10 h-10 text-yellow-400" />
            <p className="text-white text-sm font-medium text-center px-6 leading-snug">
              {message}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10 gap-2"
              onClick={() => setHidden(false)}
            >
              <Eye className="w-4 h-4" />
              Показать
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {!hidden && (
        <Button
          size="sm"
          variant="ghost"
          className="absolute top-2 right-2 z-10 text-white/60 hover:text-white gap-1 text-xs bg-black/40 backdrop-blur-sm"
          onClick={() => setHidden(true)}
        >
          <EyeOff className="w-3 h-3" />
          Скрыть
        </Button>
      )}
    </div>
  );
}
