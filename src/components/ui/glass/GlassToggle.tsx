import { forwardRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { GlassTokens } from "./glassTokens";

export interface GlassToggleProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  tokens: GlassTokens;
  label?: ReactNode;
  thumbClassName?: string;
  trackClassName?: string;
}

/**
 * Стеклянный toggle-переключатель:
 *  - трек rgba(255,255,255,0.2)
 *  - thumb с бренд-градиентом
 *  - анимация движения thumb'а
 */
export const GlassToggle = forwardRef<HTMLButtonElement, GlassToggleProps>(
  function GlassToggle({ checked = false, onChange, disabled, tokens, label, thumbClassName, trackClassName }, ref) {
    const handleClick = () => {
      if (!disabled) onChange?.(!checked);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!disabled) onChange?.(!checked);
      }
    };

    return (
      <div className="inline-flex items-center gap-3">
        <motion.button
          ref={ref as any}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={handleClick}
          onKeyDown={handleKeyPress}
          className={cn(
            "relative flex h-8 w-14 items-center rounded-full p-1 transition-colors",
            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
            tokens.glassCardSoft,
            trackClassName,
          )}
          style={{
            background: `rgba(255,255,255,${tokens.isDark ? "0.2" : "0.15"})`,
            border: "none",
          }}
        >
          <motion.div
            className={cn(
              "h-6 w-6 rounded-full shadow-sm transition-shadow",
              "flex items-center justify-center",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
              thumbClassName,
            )}
            style={{
              background: tokens.glassPrimaryGradient,
            }}
            animate={{ x: checked ? 24 : 2 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            {checked && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="w-3.5 h-3.5 rounded-full bg-white"
              />
            )}
          </motion.div>
        </motion.button>
        {label && <span className={cn("text-sm", tokens.textSecondary)}>{label}</span>}
      </div>
    );
  },
);
