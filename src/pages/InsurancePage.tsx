import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Shield, Car, Home, Plane, Heart, Building, 
  Calculator, ChevronRight, Star, BadgeCheck,
  Sparkles, TrendingUp, Clock, Users, ChevronLeft
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { OsagoCalculator } from "@/components/insurance/OsagoCalculator";
import { InsuranceAssistant } from "@/components/insurance/InsuranceAssistant";
import { 
  useInsuranceProducts, 
  usePopularProducts, 
  useInsuranceCompanies,
  categoryLabels,
  categoryIcons,
  type InsuranceProduct 
} from "@/hooks/useInsurance";

const categories = [
  { id: "all", label: "Все", icon: Shield },
  { id: "osago", label: "ОСАГО", icon: Car },
  { id: "kasko", label: "КАСКО", icon: Car },
  { id: "mortgage", label: "Ипотека", icon: Home },
  { id: "property", label: "Имущество", icon: Building },
  { id: "travel", label: "Путешествия", icon: Plane },
  { id: "dms", label: "ДМС", icon: Heart },
];

const features = [
  {
    icon: Clock,
    title: "Быстрое оформление",
    description: "Полис за 5 минут онлайн"
  },
  {
    icon: TrendingUp,
    title: "Лучшие цены",
    description: "Сравнение от 10+ компаний"
  },
  {
    icon: BadgeCheck,
    title: "Гарантия подлинности",
    description: "Проверка по базе РСА"
  },
  {
    icon: Users,
    title: "Поддержка 24/7",
    description: "Помощь на каждом этапе"
  }
];

function formatPrice(price: number): string {
  return new Intl.NumberFormat("ru-RU").format(price);
}

// Product Card Component
function ProductCard({ product }: { product: InsuranceProduct }) {
  const navigate = useNavigate();
  const productFeatures = Array.isArray(product.features) 
    ? product.features 
    : typeof product.features === 'string' 
      ? JSON.parse(product.features) 
      : [];

  const company = product.company as unknown as { name: string; rating?: number };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{categoryIcons[product.category] || "📋"}</span>
            <div>
              <p className="font-semibold text-sm">{product.name}</p>
              <p className="text-xs text-muted-foreground">
                {company?.name}
              </p>
            </div>
          </div>
          {product.badge && (
            <Badge variant="secondary" className="text-xs">
              {product.badge}
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
          {product.description}
        </p>

        {productFeatures.length > 0 && (
          <div className="space-y-1 mb-3">
            {productFeatures.slice(0, 3).map((feature: string, idx: number) => (
              <div key={idx} className="flex items-center gap-1.5 text-xs">
                <BadgeCheck className="h-3 w-3 text-primary" />
                <span className="text-muted-foreground">{feature}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t">
          <div>
            <p className="text-xs text-muted-foreground">от</p>
            <p className="font-bold text-lg">{formatPrice(product.price_from)} ₽</p>
          </div>
          <Button 
            size="sm"
            onClick={() => navigate(`/insurance/calculate/${product.category}`)}
          >
            Рассчитать
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Popular Product Card (horizontal)
function PopularProductCard({ product }: { product: InsuranceProduct }) {
  const navigate = useNavigate();
  const company = product.company as unknown as { name: string; rating?: number };
  
  return (
    <Card className="min-w-[280px] overflow-hidden hover:shadow-lg transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">
            {categoryIcons[product.category] || "📋"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{product.name}</p>
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="text-xs text-muted-foreground">
                {company?.rating || 4.5}
              </span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground truncate">
                {company?.name}
              </span>
            </div>
          </div>
          {product.badge && (
            <Badge className="shrink-0 text-xs">{product.badge}</Badge>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-muted-foreground">от </span>
            <span className="font-bold">{formatPrice(product.price_from)} ₽</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-primary"
            onClick={() => navigate(`/insurance/calculate/${product.category}`)}
          >
            Подробнее
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Loading skeletons
function ProductSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-2 mb-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-3 w-full mb-2" />
        <Skeleton className="h-3 w-3/4 mb-4" />
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

export function InsurancePage() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("all");
  const { data: products, isLoading: productsLoading } = useInsuranceProducts(activeCategory);
  const { data: popularProducts, isLoading: popularLoading } = usePopularProducts();
  const { data: companies } = useInsuranceCompanies();

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate("/")} className="p-1 -ml-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="font-semibold">Страхование</span>
          <div className="w-6" />
        </div>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-6 pb-8">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-6 w-6" />
          <h1 className="text-xl font-bold">Страхование онлайн</h1>
        </div>
        <p className="text-primary-foreground/80 text-sm mb-4">
          Сравните предложения от {companies?.length || 10}+ страховых компаний
        </p>

        {/* Quick actions */}
        <div className="flex gap-2">
          <OsagoCalculator />
          <Button 
            variant="secondary" 
            size="sm"
            className="flex items-center gap-2"
            onClick={() => navigate("/insurance/policies")}
          >
            <Shield className="h-4 w-4" />
            Мои полисы
          </Button>
        </div>
      </div>

      {/* Features */}
      <div className="px-4 -mt-4">
        <Card className="bg-card/95 backdrop-blur">
          <CardContent className="p-3">
            <div className="grid grid-cols-2 gap-3">
              {features.map((feature, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <feature.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-medium">{feature.title}</p>
                    <p className="text-[10px] text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Categories */}
      <div className="px-4 mt-6">
        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <ScrollArea className="w-full">
            <TabsList className="inline-flex w-max gap-1 bg-transparent p-0">
              {categories.map((cat) => (
                <TabsTrigger
                  key={cat.id}
                  value={cat.id}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-4 py-2 text-sm"
                >
                  <cat.icon className="h-4 w-4 mr-1.5" />
                  {cat.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <ScrollBar orientation="horizontal" className="invisible" />
          </ScrollArea>
        </Tabs>
      </div>

      {/* Popular Products */}
      {activeCategory === "all" && (
        <div className="mt-6">
          <div className="px-4 flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Популярные предложения</h2>
            </div>
          </div>
          
          <ScrollArea className="w-full">
            <div className="flex gap-3 px-4 pb-2">
              {popularLoading ? (
                <>
                  <Skeleton className="min-w-[280px] h-[120px] rounded-lg" />
                  <Skeleton className="min-w-[280px] h-[120px] rounded-lg" />
                </>
              ) : (
                popularProducts?.map((product) => (
                  <PopularProductCard key={product.id} product={product} />
                ))
              )}
            </div>
            <ScrollBar orientation="horizontal" className="invisible" />
          </ScrollArea>
        </div>
      )}

      {/* All Products Grid */}
      <div className="px-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">
            {activeCategory === "all" ? "Все продукты" : categoryLabels[activeCategory] || "Продукты"}
          </h2>
          <span className="text-xs text-muted-foreground">
            {products?.length || 0} предложений
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {productsLoading ? (
            <>
              <ProductSkeleton />
              <ProductSkeleton />
              <ProductSkeleton />
            </>
          ) : products?.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  Нет продуктов в данной категории
                </p>
              </CardContent>
            </Card>
          ) : (
            products?.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))
          )}
        </div>
      </div>

      {/* Insurance Companies */}
      {activeCategory === "all" && companies && companies.length > 0 && (
        <div className="px-4 mt-8">
          <h2 className="font-semibold mb-3">Страховые компании</h2>
          <ScrollArea className="w-full">
            <div className="flex gap-4 pb-2">
              {companies.map((company) => (
                <div 
                  key={company.id} 
                  className="flex flex-col items-center min-w-[80px]"
                >
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-2 overflow-hidden">
                    {company.logo_url ? (
                      <img 
                        src={company.logo_url} 
                        alt={company.name}
                        className="w-10 h-10 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Building className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-xs text-center text-muted-foreground line-clamp-2">
                    {company.name}
                  </p>
                  {company.rating && (
                    <div className="flex items-center gap-0.5 mt-1">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span className="text-xs">{company.rating}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <ScrollBar orientation="horizontal" className="invisible" />
          </ScrollArea>
        </div>
      )}

      {/* AI Assistant */}
      <InsuranceAssistant />
    </div>
  );
}

export default InsurancePage;
