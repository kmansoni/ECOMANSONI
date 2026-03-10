import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Car, ShoppingBag, Home, Shield, Briefcase, Building2, TrendingUp, Plane, Hotel, Film, Dumbbell, GraduationCap, Music, Truck, Users, Mail, Bot, Navigation, Bug, Radio, Clapperboard } from "lucide-react";
import logoImage from "@/assets/logo.png";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type AvailableServiceItem = {
  id: string;
  name: string;
  icon: React.ElementType;
  route: string;
  available: true;
};

type ComingSoonServiceItem = {
  id: string;
  name: string;
  icon: React.ElementType;
  route?: undefined;
  available: false;
};

type ServiceItem = AvailableServiceItem | ComingSoonServiceItem;

function isAvailableService(item: ServiceItem): item is AvailableServiceItem {
  return item.available;
}

function validateServiceConfig(items: ServiceItem[]): void {
  if (!import.meta.env.DEV) return;
  for (const item of items) {
    if (item.available && !item.route) {
      console.error("[ServicesMenu] Invalid config: available service without route", item.id);
    }
    if (!item.available && item.route) {
      console.warn("[ServicesMenu] Potentially inconsistent config: coming soon service has route", item.id);
    }
  }
}

const services: ServiceItem[] = [
  { id: "ai-assistant", name: "ИИ-ассистент", icon: Bot, route: "/ai-assistant", available: true },
  { id: "live", name: "Прямой эфир", icon: Radio, route: "/live/explore", available: true },
  { id: "navigation", name: "Навигация", icon: Navigation, route: "/navigation", available: true },
  { id: "taxi", name: "Такси", icon: Car, route: "/taxi", available: true },
  // Not routed yet: keep in "Coming Soon" to avoid dead-click UX.
  { id: "carsharing", name: "Каршеринг", icon: Car, available: false },
  { id: "delivery", name: "Доставка", icon: Truck, available: false },
  { id: "marketplace", name: "Маркетплейс", icon: ShoppingBag, available: false },
  { id: "realestate", name: "Недвижимость", icon: Home, route: "/realestate", available: true },
  { id: "insurance", name: "Страхование", icon: Shield, route: "/insurance", available: true },
  { id: "crm", name: "CRM", icon: Users, route: "/crm", available: true },
  { id: "email", name: "Почта", icon: Mail, route: "/email", available: true },
  { id: "service-bugs", name: "Баги сервисов", icon: Bug, route: "/services/bugs", available: true },
  { id: "video-editor", name: "Видеоредактор", icon: Clapperboard, route: "/editor", available: true },
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

validateServiceConfig(services);

export function ServicesMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleServiceClick = (service: AvailableServiceItem) => {
    navigate(service.route);
    setOpen(false);
  };

  const availableServices = services.filter(isAvailableService);
  const comingSoonServices = services.filter((s) => !s.available);

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
                const isActive = location.pathname.startsWith(service.route);
                
                return (
                  <button
                    key={service.id}
                    onClick={() => handleServiceClick(service)}
                    aria-label={`Открыть сервис: ${service.name}`}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors",
                      isActive 
                        ? "bg-primary/10 text-primary" 
                        : "hover:bg-muted text-foreground"
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
