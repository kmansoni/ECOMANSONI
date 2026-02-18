import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface VerifiedBadgeProps {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}

const sizeClasses = {
  xs: "w-3 h-3",
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

export function VerifiedBadge({ className, size = "sm" }: VerifiedBadgeProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button 
          type="button" 
          className="inline-flex items-center justify-center focus:outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          <BadgeCheck 
            className={cn(
              sizeClasses[size],
              "text-blue-500 fill-blue-500 stroke-white flex-shrink-0 cursor-pointer",
              className
            )} 
          />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        side="top" 
        className="w-auto px-3 py-2 text-sm font-medium"
        onClick={(e) => e.stopPropagation()}
      >
        Владелец соцсети mansoni
      </PopoverContent>
    </Popover>
  );
}
