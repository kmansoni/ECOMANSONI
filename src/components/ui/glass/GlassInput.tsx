import { useState, type ReactNode, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type { GlassTokens } from "./glassTokens";

interface GlassInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  icon?: ReactNode;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  tokens: GlassTokens;
  className?: string;
}

/**
 * Стеклянный input с floating-label из AuthPage.
 * h-14, rounded-2xl, border + backdrop-blur, focus-ring cyan.
 */
export function GlassInput({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  icon,
  inputMode,
  tokens,
  className,
}: GlassInputProps) {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;
  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "relative flex items-center gap-3 h-14 px-4 rounded-2xl border backdrop-blur-xl transition-all",
          tokens.glassInput,
          focused && tokens.inputFocusRing,
        )}
      >
        {icon && <span className={cn(tokens.textSecondary, "shrink-0")}>{icon}</span>}
        <div className="relative flex-1">
          <label
            htmlFor={id}
            className={cn(
              "absolute left-0 pointer-events-none transition-all duration-200",
              active
                ? "top-0 text-[10px] tracking-[0.18em] uppercase opacity-80"
                : "top-1/2 -translate-y-1/2 text-sm opacity-90",
              tokens.textSecondary,
            )}
          >
            {label}
          </label>
          <input
            id={id}
            type={type}
            value={value}
            inputMode={inputMode}
            autoComplete={autoComplete}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              "w-full bg-transparent outline-none placeholder-transparent text-[15px]",
              tokens.textPrimary,
              active ? "pt-4 pb-0" : "pt-0 pb-0",
            )}
          />
        </div>
      </div>
    </div>
  );
}
