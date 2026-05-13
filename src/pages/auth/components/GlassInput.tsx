import { useState } from "react";
import { cn } from "@/lib/utils";
import type { GlassInputProps } from "../types";

export function GlassInput({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  icon,
  inputMode,
  tokens
}: GlassInputProps) {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;

  const baseInputClass = cn(
    "relative flex items-center gap-3 h-14 px-4 rounded-2xl border transition-all duration-200",
    "border-white/[0.08]",
    "bg-white/[0.05]",
    "backdrop-blur-xl",
    focused
      ? "border-white/20 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_20px_rgba(0,180,216,0.1)]"
      : "hover:border-white/15"
  );

  return (
    <div className="relative">
      <div className={baseInputClass}>
        {icon && <span className="shrink-0 opacity-60">{icon}</span>}
        <div className="relative flex-1">
          <label
            htmlFor={id}
            className={cn(
              "absolute left-0 pointer-events-none transition-all duration-200",
              active
                ? "top-0 text-[10px] tracking-[0.18em] uppercase opacity-70"
                : "top-1/2 -translate-y-1/2 text-sm opacity-90",
              "text-white"
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
              "w-full bg-transparent outline-none placeholder-transparent",
              "text-white text-[15px]",
              active ? "pt-4 pb-0" : "pt-0 pb-0"
            )}
          />
        </div>
      </div>
    </div>
  );
}