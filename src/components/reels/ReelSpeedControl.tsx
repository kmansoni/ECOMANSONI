import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const SPEEDS = [0.3, 0.5, 1, 2, 3];

interface ReelSpeedControlProps {
  speed: number;
  onChange: (speed: number) => void;
}

export function ReelSpeedControl({ speed, onChange }: ReelSpeedControlProps) {
  return (
    <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-1">
      {SPEEDS.map((s) => (
        <motion.button
          key={s}
          whileTap={{ scale: 0.9 }}
          onClick={() => onChange(s)}
          className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium transition-colors",
            speed === s ? "bg-white text-black" : "text-white/70 hover:text-white"
          )}
        >
          {s}x
        </motion.button>
      ))}
    </div>
  );
}
