import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "liquid-glass-interactive inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[calc(var(--radius)+0.15rem)] text-sm font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "glass-primary-btn text-primary-foreground hover:brightness-105",
        destructive: "bg-destructive/90 text-destructive-foreground shadow-[0_14px_36px_hsl(var(--destructive)/0.22)] hover:bg-destructive",
        outline: "glass-secondary-btn hover:bg-accent/20 hover:text-foreground",
        secondary: "glass-secondary-btn hover:bg-secondary/70",
        ghost: "bg-transparent hover:bg-accent/18 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline hover:bg-transparent",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };
