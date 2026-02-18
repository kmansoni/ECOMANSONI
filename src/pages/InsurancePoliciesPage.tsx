import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ChevronLeft, Shield, FileText, Clock, AlertCircle, 
  CheckCircle, Plus, Calendar, Car, Home, Plane, Heart
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryIcons } from "@/hooks/useInsurance";
import { format, differenceInDays, isPast, addDays } from "date-fns";
import { ru } from "date-fns/locale";

interface Policy {
  id: string;
  policy_number: string;
  status: string;
  start_date: string;
  end_date: string;
  premium_amount: number;
  insured_name: string;
  created_at: string;
  product?: {
    id: string;
    name: string;
    category: string;
    company?: {
      name: string;
    };
  };
}

function usePolicies() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ["my-policies", user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from("insurance_policies")
        .select(`
          *,
          product:insurance_products(
            id,
            name,
            category,
            company:insurance_companies(name)
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Policy[];
    },
    enabled: !!user,
  });
}

function PolicyStatusBadge({ status, endDate }: { status: string; endDate: string }) {
  const end = new Date(endDate);
  const daysUntilEnd = differenceInDays(end, new Date());
  
  if (status === "cancelled") {
    return <Badge variant="destructive">Отменён</Badge>;
  }
  
  if (isPast(end)) {
    return <Badge variant="secondary">Истёк</Badge>;
  }
  
  if (daysUntilEnd <= 30) {
    return (
      <Badge variant="outline" className="border-orange-500 text-orange-600">
        <AlertCircle className="h-3 w-3 mr-1" />
        Истекает через {daysUntilEnd} дн.
      </Badge>
    );
  }
  
  if (status === "active") {
    return (
      <Badge variant="outline" className="border-green-500 text-green-600">
        <CheckCircle className="h-3 w-3 mr-1" />
        Активен
      </Badge>
    );
  }
  
  if (status === "pending") {
    return (
      <Badge variant="outline" className="border-yellow-500 text-yellow-600">
        <Clock className="h-3 w-3 mr-1" />
        Ожидает оплаты
      </Badge>
    );
  }
  
  return <Badge variant="secondary">{status}</Badge>;
}

function PolicyCard({ policy }: { policy: Policy }) {
  const navigate = useNavigate();
  const category = policy.product?.category || "auto";
  const icon = categoryIcons[category] || "📋";
  const endDate = new Date(policy.end_date);
  const daysUntilEnd = differenceInDays(endDate, new Date());
  const isExpiring = daysUntilEnd <= 30 && daysUntilEnd > 0;
  
  return (
    <Card className={isExpiring ? "border-orange-300" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">
            {icon}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div>
                <p className="font-semibold text-sm">
                  {policy.product?.name || "Страховой полис"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {policy.product?.company?.name}
                </p>
              </div>
              <PolicyStatusBadge status={policy.status} endDate={policy.end_date} />
            </div>
            
            <p className="text-xs text-muted-foreground mt-2">
              Полис № {policy.policy_number}
            </p>
            
            <div className="flex items-center gap-4 mt-2 text-xs">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>
                  {format(new Date(policy.start_date), "d MMM yyyy", { locale: ru })} — {format(endDate, "d MMM yyyy", { locale: ru })}
                </span>
              </div>
            </div>
            
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <span className="font-semibold">
                {new Intl.NumberFormat("ru-RU").format(Number(policy.premium_amount))} ₽
              </span>
              <div className="flex gap-2">
                {isExpiring && (
                  <Button 
                    size="sm" 
                    onClick={() => navigate(`/insurance/renew/${policy.id}`)}
                  >
                    Продлить
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate(`/insurance/policy/${policy.id}`)}
                >
                  Подробнее
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PolicySkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="w-12 h-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-48 mt-2" />
            <div className="flex justify-between items-center mt-3">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ tab }: { tab: string }) {
  const navigate = useNavigate();
  
  const messages: Record<string, { title: string; description: string }> = {
    active: {
      title: "Нет активных полисов",
      description: "Оформите свой первый полис и он появится здесь"
    },
    expiring: {
      title: "Нет истекающих полисов",
      description: "Здесь будут отображаться полисы, которые скоро истекают"
    },
    archived: {
      title: "Нет архивных полисов",
      description: "Истёкшие полисы будут храниться здесь"
    }
  };
  
  const msg = messages[tab] || messages.active;
  
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-semibold mb-1">{msg.title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{msg.description}</p>
        <Button onClick={() => navigate("/insurance")}>
          <Plus className="h-4 w-4 mr-2" />
          Оформить полис
        </Button>
      </CardContent>
    </Card>
  );
}

export default function InsurancePoliciesPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data: policies, isLoading } = usePolicies();
  const [activeTab, setActiveTab] = useState("active");
  
  // Filter policies
  const now = new Date();
  const activePolicies = policies?.filter(p => 
    p.status === "active" && !isPast(new Date(p.end_date))
  ) || [];
  
  const expiringPolicies = policies?.filter(p => {
    const daysUntil = differenceInDays(new Date(p.end_date), now);
    return p.status === "active" && daysUntil <= 30 && daysUntil > 0;
  }) || [];
  
  const archivedPolicies = policies?.filter(p => 
    p.status === "cancelled" || isPast(new Date(p.end_date))
  ) || [];

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Skeleton className="h-8 w-48 mb-4" />
        <PolicySkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => navigate("/insurance")} className="p-1 -ml-1">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <span className="font-semibold">Мои полисы</span>
            <div className="w-6" />
          </div>
        </div>
        
        <Card className="m-4">
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold mb-1">Войдите в аккаунт</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Чтобы увидеть свои полисы, войдите в аккаунт
            </p>
            <Button onClick={() => navigate("/auth")}>
              Войти
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate("/insurance")} className="p-1 -ml-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="font-semibold">Мои полисы</span>
          <Button variant="ghost" size="icon" onClick={() => navigate("/insurance")}>
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 p-4">
        <Card className="bg-primary/10">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{activePolicies.length}</p>
            <p className="text-xs text-muted-foreground">Активных</p>
          </CardContent>
        </Card>
        <Card className={expiringPolicies.length > 0 ? "bg-orange-100" : ""}>
          <CardContent className="p-3 text-center">
            <p className={`text-2xl font-bold ${expiringPolicies.length > 0 ? "text-orange-600" : ""}`}>
              {expiringPolicies.length}
            </p>
            <p className="text-xs text-muted-foreground">Истекают</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{archivedPolicies.length}</p>
            <p className="text-xs text-muted-foreground">В архиве</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="px-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active">
            Активные
            {activePolicies.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
                {activePolicies.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="expiring">
            Истекают
            {expiringPolicies.length > 0 && (
              <Badge className="ml-1.5 h-5 px-1.5 bg-orange-500">
                {expiringPolicies.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="archived">
            Архив
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4 space-y-4">
          {isLoading ? (
            <>
              <PolicySkeleton />
              <PolicySkeleton />
            </>
          ) : activePolicies.length === 0 ? (
            <EmptyState tab="active" />
          ) : (
            activePolicies.map((policy) => (
              <PolicyCard key={policy.id} policy={policy} />
            ))
          )}
        </TabsContent>

        <TabsContent value="expiring" className="mt-4 space-y-4">
          {isLoading ? (
            <PolicySkeleton />
          ) : expiringPolicies.length === 0 ? (
            <EmptyState tab="expiring" />
          ) : (
            expiringPolicies.map((policy) => (
              <PolicyCard key={policy.id} policy={policy} />
            ))
          )}
        </TabsContent>

        <TabsContent value="archived" className="mt-4 space-y-4">
          {isLoading ? (
            <PolicySkeleton />
          ) : archivedPolicies.length === 0 ? (
            <EmptyState tab="archived" />
          ) : (
            archivedPolicies.map((policy) => (
              <PolicyCard key={policy.id} policy={policy} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
