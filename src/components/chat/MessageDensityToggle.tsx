/**
 * MessageDensityToggle — UI toggle for compact/expanded message mode.
 * Used in chat settings.
 */

import { motion } from "framer-motion";
import { AlignLeft, AlignJustify } from "lucide-react";
import { useMessageDensity, type MessageDensity } from "@/hooks/useMessageDensity";

export function MessageDensityToggle() {
  const { density, setDensity } = useMessageDensity();

  const options: { value: MessageDensity; label: string; icon: typeof AlignLeft }[] = [
    { value: "expanded", label: "Стандартный", icon: AlignJustify },
    { value: "compact", label: "Компактный", icon: AlignLeft },
  ];

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground dark:text-white">
        Плотность сообщений
      </h3>
      <div className="flex gap-2">
        {options.map((opt) => {
          const Icon = opt.icon;
          const isActive = density === opt.value;
          return (
            <motion.button
              key={opt.value}
              whileTap={{ scale: 0.95 }}
              onClick={() => setDensity(opt.value)}
              className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors ${
                isActive
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-border/40 dark:border-white/10 bg-muted/30 dark:bg-white/5 text-muted-foreground dark:text-white/50"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{opt.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
