import * as RadixSelect from "@radix-ui/react-select";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlassSelectOption {
  value: string;
  label: string;
}

interface GlassSelectProps {
  id?: string;
  label: string;
  value: string;
  options: GlassSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export function GlassSelect({
  id,
  label,
  value,
  options,
  onChange,
  placeholder = "Выберите"
}: GlassSelectProps) {
  return (
    <div className="relative">
      <label className="text-[10px] tracking-[0.18em] uppercase opacity-70 mb-1.5 block text-white/60">
        {label}
      </label>
      <RadixSelect.Root value={value} onValueChange={onChange}>
        <RadixSelect.Trigger
          id={id}
          className={cn(
            "inline-flex items-center justify-between w-full h-14 px-4 rounded-2xl",
            "border border-white/[0.08]",
            "bg-white/[0.05]",
            "backdrop-blur-xl",
            "text-white/90 text-[15px]",
            "outline-none",
            "transition-all duration-200",
            "hover:border-white/15",
            "focus:border-white/20",
            "data-[placeholder]:text-white/40"
          )}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon className="ml-2">
            <ChevronDown className="h-4 w-4 opacity-50" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content
            className={cn(
              "z-[100] overflow-hidden rounded-2xl",
              "border border-white/10",
              "bg-[#0a0a14]/90 backdrop-blur-2xl",
              "shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]"
            )}
            position="popper"
            sideOffset={6}
          >
            <RadixSelect.Viewport className="p-1.5">
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  className={cn(
                    "relative flex items-center h-11 px-4 rounded-xl cursor-pointer",
                    "text-white/60 text-[15px]",
                    "outline-none transition-all duration-150",
                    "data-[highlighted]:bg-white/[0.08] data-[highlighted]:text-white",
                    "data-[state=checked]:text-white data-[state=checked]:font-medium"
                  )}
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="absolute right-3">
                    <Check className="h-4 w-4 text-white/50" />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
}