import { motion } from "framer-motion";
import type { ThemeTokens } from "../types";

export function CharacterCounter({
  current,
  max,
  tokens,
}: {
  current: number;
  max: number;
  tokens: ThemeTokens;
}) {
  const remaining = max - current;
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`text-[10px] tabular-nums ${
        remaining <= 0
          ? "text-rose-400"
          : remaining <= 10
          ? "text-amber-400"
          : tokens.textMuted
      }`}
    >
      {remaining}/{max}
    </motion.span>
  );
}