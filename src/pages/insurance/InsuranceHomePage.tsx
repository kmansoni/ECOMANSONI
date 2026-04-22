import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Car,
  Shield,
  Stethoscope,
  Plane,
  Home,
  Building2,
  Heart,
  Bot,
  BarChart3,
  Zap,
  Lock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InsuranceHero } from "@/components/insurance/shared/InsuranceHero";
import { InsuranceAssistant } from "@/components/insurance/InsuranceAssistant";
import { InsuranceStories } from "@/components/insurance/media/InsuranceStories";
import { InsuranceReelsBanner } from "@/components/insurance/media/InsuranceReelsBanner";
import { InsuranceAdPricing } from "@/components/insurance/media/InsuranceAdPricing";
import { DownloadAppBanner } from "@/components/insurance/shared/DownloadAppBanner";
import { DraftsList } from "@/components/insurance/drafts/DraftsList";
import type { InsuranceCategory } from "@/types/insurance";

const HERO_CATEGORY_ROUTES: Record<InsuranceCategory, string> = {
  osago: "/insurance/osago",
  kasko: "/insurance/kasko",
  mini_kasko: "/insurance/kasko",
  property: "/insurance/property",
  travel: "/insurance/travel",
  mortgage: "/insurance/mortgage",
  life: "/insurance/life",
  health: "/insurance/dms",
  dms: "/insurance/dms",
  auto: "/insurance/osago",
  osgop: "/insurance/osago",
};

const ADVANTAGES = [
  {
    icon: Bot,
    title: "AI-консультант",
    desc: "Персональные рекомендации на основе ваших потребностей",
  },
  {
    icon: BarChart3,
    title: "Сравнение цен",
    desc: "Мгновенное сравнение предложений 50+ компаний",
  },
  {
    icon: Zap,
    title: "Быстрое оформление",
    desc: "Оформление полиса за 5 минут не выходя из дома",
  },
  {
    icon: Lock,
    title: "Защита данных",
    desc: "Все данные надёжно защищены по стандарту ISO 27001",
  },
];

const STATS = [
  { value: "50+", label: "Страховых компаний" },
  { value: "1 000+", label: "Продуктов" },
  { value: "100 000+", label: "Оформленных полисов" },
];

export default function InsuranceHomePage() {
  const navigate = useNavigate();

  const handleHeroCategoryClick = (category: InsuranceCategory) => {
    navigate(HERO_CATEGORY_ROUTES[category] ?? "/insurance/osago");
  };

  useEffect(() => {
    document.title = "Страхование — Сравните и оформите полис";
  }, []);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Hero */}
      <InsuranceHero
        onCategoryClick={handleHeroCategoryClick}
        onCalculatorClick={() => navigate("/insurance/osago")}
      />

      {/* Stories */}
      <div className="pt-4 pb-1">
        <InsuranceStories />
      </div>

      <div className="px-4 space-y-8 pt-4">
        {/* Drafts */}
        <DraftsList />

        {/* Stats */}
        <section>
          <div className="grid grid-cols-3 gap-3">
            {STATS.map((stat) => (
              <Card key={stat.label} className="border-border/50 bg-card">
                <CardContent className="p-4 text-center">
                  <p className="text-xl font-bold text-primary">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-tight">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Advantages */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Наши преимущества</h2>
          <div className="grid grid-cols-2 gap-3">
            {ADVANTAGES.map((adv) => {
              const Icon = adv.icon;
              return (
                <Card key={adv.title} className="border-border/50 bg-card">
                  <CardContent className="p-4 flex flex-col gap-2">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium">{adv.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{adv.desc}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Quick links */}
        <section className="flex gap-3">
          <Link to="/insurance/companies" className="flex-1">
            <Card className="border-border/50 bg-card hover:bg-card/80 active:scale-95 transition-all">
              <CardContent className="p-4 text-center">
                <p className="text-sm font-medium">Страховые компании</p>
                <p className="text-xs text-muted-foreground mt-1">50+ партнёров</p>
              </CardContent>
            </Card>
          </Link>
          <Link to="/insurance/policies" className="flex-1">
            <Card className="border-border/50 bg-card hover:bg-card/80 active:scale-95 transition-all">
              <CardContent className="p-4 text-center">
                <p className="text-sm font-medium">Мои полисы</p>
                <p className="text-xs text-muted-foreground mt-1">Управление полисами</p>
              </CardContent>
            </Card>
          </Link>
        </section>

        {/* Download App Banner */}
        <section>
          <DownloadAppBanner />
        </section>

        {/* Reels */}
        <section className="-mx-4">
          <InsuranceReelsBanner />
        </section>

        {/* Ad Pricing */}
        <section>
          <InsuranceAdPricing />
        </section>
      </div>

      {/* AI Assistant */}
      <InsuranceAssistant />
    </div>
  );
}
