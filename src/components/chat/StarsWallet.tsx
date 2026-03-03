import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StarsSheet } from "./StarsSheet";
import { useStars } from "@/hooks/useStars";

export function StarsWallet() {
  const { balance } = useStars();
  const [open, setOpen] = useState(false);

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 hover:bg-amber-400/20 active:scale-95 transition-all"
        whileTap={{ scale: 0.92 }}
        aria-label="Звёзды"
      >
        <span className="text-amber-400 text-sm">⭐</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={balance}
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="text-amber-300 text-xs font-semibold tabular-nums"
          >
            {balance}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <StarsSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
