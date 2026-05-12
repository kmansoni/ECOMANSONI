import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import type { ThemeTokens } from "../types";
import { cn } from "@/lib/utils";

export function PasswordInput({
  id,
  label,
  value,
  onChange,
  tokens,
  error,
  strength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  tokens: ThemeTokens;
  error?: string;
  strength?: "empty" | "weak" | "medium" | "strong";
}) {
  const [visible, setVisible] = useState(false);

  const strengthColors = {
    empty: "transparent",
    weak: "#ef4444",
    medium: "#f59e0b",
    strong: "#22c55e",
  };

  const strengthLabels = {
    empty: "",
    weak: "Слабый",
    medium: "Средний",
    strong: "Надёжный",
  };

  return (
    <div className="relative">
      <GlassInput
        id={id}
        label={label}
        value={value}
        onChange={onChange}
        type={visible ? "text" : "password"}
        autoComplete="new-password"
        tokens={tokens}
        error={error}
        rightElement={
          <motion.button
            type="button"
            onClick={() => setVisible(!visible)}
            whileTap={{ scale: 0.9 }}
            className={`p-2 rounded-xl transition-colors ${tokens.iconBtn}`}
            aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          >
            {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </motion.button>
        }
      />

      {/* Strength indicator */}
      <AnimatePresence>
        {strength && strength !== "empty" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-2 flex items-center gap-2"
          >
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "w-8 h-1 rounded-full transition-all duration-300",
                    i <= (strength === "weak" ? 1 : strength === "medium" ? 2 : 4)
                      ? strength === "strong"
                        ? "bg-green-400"
                        : strength === "medium"
                        ? "bg-amber-400"
                        : "bg-rose-400"
                      : tokens.isDark
                      ? "bg-white/10"
                      : "bg-slate-200"
                  )}
                />
              ))}
            </div>
            <span
              className={cn(
                "text-[11px] font-medium ml-1",
                strength === "strong"
                  ? "text-green-400"
                  : strength === "medium"
                  ? "text-amber-400"
                  : "text-rose-400"
              )}
            >
              {strengthLabels[strength]}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-[11px] mt-1.5 ${tokens.isDark ? "text-rose-300" : "text-rose-500"}`}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}