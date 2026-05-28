import { useNavigate } from "react-router-dom";
import {
  Camera,
  BarChart3,
  Music,
} from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

interface ServicesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SERVICES = [
  { label: "AR",            path: "/ar",             icon: Camera,      accent: "from-pink-400 to-rose-500" },
  { label: "CRM",           path: "/crm",            icon: BarChart3,   accent: "from-orange-400 to-orange-600" },
  { label: "Музыка",        path: "/services/music", icon: Music,       accent: "from-red-400 to-rose-600" },
] as const;

export function ServicesSheet({ open, onOpenChange }: ServicesSheetProps) {
  const navigate = useNavigate();

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="flex items-center gap-2 text-base font-semibold">
            <img src="/brand/logo.png" className="w-6 h-6 rounded-lg" alt="" aria-hidden="true" />
            Сервисы
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-safe-or-8 grid grid-cols-3 gap-3 overflow-y-auto">
          {SERVICES.map(({ label, path, icon: Icon, accent }) => (
            <button
              key={path}
              onClick={() => go(path)}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-muted/50 hover:bg-muted active:scale-95 transition-all touch-manipulation"
            >
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br", accent)}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs font-medium text-foreground/80 text-center leading-tight">
                {label}
              </span>
            </button>
          ))}
        </div>

        <div className="h-safe-or-4" />
      </DrawerContent>
    </Drawer>
  );
}
