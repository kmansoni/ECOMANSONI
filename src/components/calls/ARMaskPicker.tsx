/**
 * ARMaskPicker — пикер AR масок для видеозвонков.
 * Горизонтальный скролл масок, превью, мгновенное применение.
 */

import { useCallback } from "react";
import { motion } from "framer-motion";
import { useCallARMasks, AVAILABLE_MASKS, type MaskType } from "@/hooks/useCallARMasks";

interface ARMaskPickerProps {
  onMaskChange?: (mask: MaskType) => void;
}

export function ARMaskPicker({ onMaskChange }: ARMaskPickerProps) {
  const { currentMask, setMask } = useCallARMasks();

  const handleSelect = useCallback(
    (mask: MaskType) => {
      setMask(mask);
      onMaskChange?.(mask);
    },
    [setMask, onMaskChange],
  );

  return (
    <div className="w-full" role="radiogroup" aria-label="Выбор AR маски">
      <div className="flex gap-2 overflow-x-auto pb-2 px-2 scrollbar-hide">
        {AVAILABLE_MASKS.map((mask) => {
          const isActive = currentMask === mask.type;
          return (
            <motion.button
              key={mask.type}
              onClick={() => handleSelect(mask.type)}
              whileTap={{ scale: 0.9 }}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl shrink-0 transition-all min-h-[44px] min-w-[44px] ${
                isActive
                  ? "bg-primary/20 border border-primary/40 ring-2 ring-primary/30"
                  : "bg-white/5 border border-transparent hover:bg-white/10"
              }`}
              role="radio"
              aria-checked={isActive}
              aria-label={mask.name}
            >
              <span className="text-2xl leading-none">{mask.emoji}</span>
              <span
                className={`text-[10px] leading-tight ${
                  isActive ? "text-primary font-medium" : "text-muted-foreground"
                }`}
              >
                {mask.name}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
