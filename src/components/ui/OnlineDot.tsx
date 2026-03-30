import { cn } from "@/lib/utils";

interface OnlineDotProps {
  isOnline: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "w-2 h-2",
  md: "w-2.5 h-2.5",
  lg: "w-3 h-3",
};

export function OnlineDot({ isOnline, size = "md", className }: OnlineDotProps) {
  if (!isOnline) return null;

  return (
    <span
      className={cn(
        "absolute bottom-0 right-0 rounded-full bg-green-500 border-2 border-background",
        sizeMap[size],
        className
      )}
      aria-label="В сети"
    />
  );
}
