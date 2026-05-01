import { useState } from "react";
import type { GlassInputProps } from "../types";

export function GlassInput({ id, label, value, onChange, type = "text", autoComplete, icon, inputMode, tokens }: GlassInputProps) {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;
  return (
    <div className="relative">
      <div
        className={`relative flex items-center gap-3 h-14 px-4 rounded-2xl border backdrop-blur-xl transition-all
          ${tokens.inputSurface}
          ${focused ? tokens.inputFocusRing : ""}`}
      >
        {icon && <span className={`${tokens.textSecondary} shrink-0`}>{icon}</span>}
        <div className="relative flex-1">
          <label
            htmlFor={id}
            className={`absolute left-0 pointer-events-none transition-all duration-200
              ${active ? "top-0 text-[10px] tracking-[0.18em] uppercase opacity-80" : "top-1/2 -translate-y-1/2 text-sm opacity-90"}
              ${tokens.textSecondary}`}
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
            className={`w-full bg-transparent outline-none placeholder-transparent
              ${tokens.textPrimary}
              ${active ? "pt-4 pb-0" : "pt-0 pb-0"} text-[15px]`}
          />
        </div>
      </div>
    </div>
  );
}
