import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useBubbleGradient, GRADIENT_PRESETS, GRADIENT_LABELS, BubbleGradientPreset } from "@/hooks/useBubbleGradient";

export function BubbleGradientPicker() {
  const { preset, setPreset } = useBubbleGradient();

  const presetKeys = Object.keys(GRADIENT_PRESETS) as BubbleGradientPreset[];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground dark:text-white">
        Цвет сообщений
      </h3>
      <div className="grid grid-cols-4 gap-2">
        {presetKeys.map((key) => (
          <motion.button
            key={key}
            whileTap={{ scale: 0.92 }}
            onClick={() => setPreset(key)}
            className="flex flex-col items-center gap-1"
          >
            <div className={`w-12 h-12 rounded-xl ${GRADIENT_PRESETS[key]} relative flex items-center justify-center shadow-sm border border-white/10`}>
              {preset === key && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center"
                >
                  <Check className="w-3 h-3 text-white" />
                </motion.div>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground dark:text-white/50">
              {GRADIENT_LABELS[key]}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
