import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Car, Package, ShoppingBag, Home, Shield, Briefcase, Building2, TrendingUp, Plane, Hotel, Film, Dumbbell, GraduationCap, Music, Truck, Users } from "lucide-react";
import logoImage from "@/assets/logo.png";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface ServiceItem {
  id: string;
  name: string;
  icon: React.ElementType;
  route?: string;
  available: boolean;
}

const services: ServiceItem[] = [
  { id: "taxi", name: "Такси", icon: Car, available: true },
  { id: "carsharing", name: "Каршеринг", icon: Car, available: true },
  { id: "delivery", name: "Доставка", icon: Truck, available: true },
  { id: "marketplace", name: "Маркетплейс", icon: ShoppingBag, available: true },
  { id: "realestate", name: "Недвижимость", icon: Home, route: "/realestate", available: true },
  { id: "insurance", name: "Страхование", icon: Shield, route: "/insurance", available: true },
  { id: "crm", name: "CRM", icon: Users, route: "/crm", available: true },
  { id: "jobs", name: "Работа", icon: Briefcase, available: false },
  { id: "banking", name: "Банк", icon: Building2, available: false },
  { id: "investments", name: "Инвестиции", icon: TrendingUp, available: false },
  { id: "auto", name: "Автопродажи", icon: Car, available: false },
  { id: "travel", name: "Путешествия", icon: Plane, available: false },
  { id: "hotels", name: "Отели", icon: Hotel, available: false },
  { id: "entertainment", name: "Развлечения", icon: Film, available: false },
  { id: "sport", name: "Спорт", icon: Dumbbell, available: false },
  { id: "education", name: "Образование", icon: GraduationCap, available: false },
  { id: "music", name: "Музыка", icon: Music, available: false },
];

export function ServicesMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleServiceClick = (service: ServiceItem) => {
    if (service.route && service.available) {
      navigate(service.route);
      setOpen(false);
    }
  };

  const availableServices = services.filter(s => s.available);
  const comingSoonServices = services.filter(s => !s.available);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted/70 backdrop-blur-sm transition-colors">
          <img 
            src={logoImage} 
            alt="Menu" 
            className="w-7 h-7 object-contain"
          />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="!inset-y-auto !top-0 !h-auto w-[300px] bg-card/85 backdrop-blur-xl border-border p-0 shadow-[0_0_0_1px_hsl(var(--border)),0_16px_40px_rgba(0,0,0,0.28)]"
        style={{ bottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}
      >
        <SheetHeader className="p-4 border-b border-border/60">
          <SheetTitle className="text-left">Сервисы</SheetTitle>
        </SheetHeader>
        
        <div className="overflow-y-auto max-h-full">
          {/* Available Services */}
          <div className="p-3">
            <div className="grid grid-cols-3 gap-2">
              {availableServices.map((service) => {
                const Icon = service.icon;
                const isActive = service.route && location.pathname.startsWith(service.route);
                
                return (
                  <button
                    key={service.id}
                    onClick={() => handleServiceClick(service)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors",
                      isActive 
                        ? "bg-primary/10 text-primary" 
                        : "hover:bg-muted text-foreground",
                      !service.route && "opacity-60"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      isActive ? "bg-primary text-primary-foreground shadow-md" : "bg-muted/70 backdrop-blur-sm"
                    )}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-medium text-center leading-tight">
                      {service.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Coming Soon */}
          <div className="p-3 pt-0">
            <p className="text-xs text-muted-foreground mb-2 px-1">Скоро</p>
            <div className="grid grid-cols-3 gap-2">
              {comingSoonServices.map((service) => {
                const Icon = service.icon;
                
                return (
                  <div
                    key={service.id}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl opacity-40"
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-muted/60">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-medium text-center leading-tight text-muted-foreground">
                      {service.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
