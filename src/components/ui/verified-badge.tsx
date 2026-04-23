import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { VerifiedIcon } from "@/components/ui/app-icons";

interface VerifiedBadgeProps {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}

const sizeClasses = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
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
          <VerifiedIcon
            active
            noAnimate
            size={sizeClasses[size]}
            className={cn("flex-shrink-0 cursor-pointer", className)}
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
