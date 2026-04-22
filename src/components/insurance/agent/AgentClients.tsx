import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Phone, Mail, FileText, ChevronRight, Users, Plus, ExternalLink, Calculator } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase, dbLoose } from "@/lib/supabase";
import { toast } from "sonner";
import { CRMLib } from "@/lib/crm";

const crmInsurance = new CRMLib("insurance");

interface InsuranceClient {
  id: string;
  agent_id: string | null;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  address: string | null;
  passport_series: string | null;
  passport_number: string | null;
  notes: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  // joined
  policies_count?: number;
  total_premium?: number;
}

async function getAgentId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Не авторизован");
  const { data, error } = await dbLoose
    .from("agent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (error || !data) throw new Error("Профиль агента не найден");
  return (data as any).id;
}

export function AgentClients() {
  const [search, setSearch] = useState("");
  const [detailClient, setDetailClient] = useState<InsuranceClient | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["agent-clients"],
    queryFn: async () => {
      const agentId = await getAgentId();

      const { data, error } = await dbLoose
        .from("insurance_clients")
        .select("*")
        .eq("agent_id", agentId)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      if (!data?.length) return [];

      // Подтягиваем кол-во полисов для каждого клиента
      const clientIds = (data as any[]).map((c: any) => c.id);
      const { data: policiesData } = await dbLoose
        .from("insurance_policies")
        .select("client_id, premium")
        .in("client_id", clientIds);

      const policyMap = new Map<string, { count: number; total: number }>();
      for (const p of (policiesData ?? []) as any[]) {
        const existing = policyMap.get(p.client_id);
        if (existing) {
          existing.count++;
          existing.total += p.premium ?? 0;
        } else {
          policyMap.set(p.client_id, { count: 1, total: p.premium ?? 0 });
        }
      }

      return (data as any[]).map((c: any) => ({
        ...c,
        policies_count: policyMap.get(c.id)?.count ?? 0,
        total_premium: policyMap.get(c.id)?.total ?? 0,
      })) as InsuranceClient[];
    },
  });

  const createClientMutation = useMutation({
    mutationFn: async (form: { full_name: string; phone?: string; email?: string; birth_date?: string; address?: string; notes?: string }) => {
      const agentId = await getAgentId();

      // 1. Создаём в insurance_clients
      const { data, error } = await dbLoose
        .from("insurance_clients")
        .insert({
          agent_id: agentId,
          full_name: form.full_name,
          phone: form.phone || null,
          email: form.email || null,
          birth_date: form.birth_date || null,
          address: form.address || null,
          notes: form.notes || null,
        })
        .select()
        .single();
      if (error) throw error;

      // 2. Синхронизируем с CRM
      try {
        await crmInsurance.createClient({
          name: form.full_name,
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          notes: form.notes || null,
          tags: ["insurance"],
          custom_fields: { insurance_client_id: (data as any).id },
        });
      } catch (e) {
        // CRM sync не блокирует основную операцию
        console.warn("CRM sync failed:", e);
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-clients"] });
      toast.success("Клиент добавлен");
      setAddOpen(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Не удалось добавить клиента");
    },
  });

  const filtered = clients.filter((c) =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone && c.phone.includes(search)) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  const fmt = (v: number) => v.toLocaleString("ru-RU") + " \u20bd";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени, телефону, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" /> Добавить
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новый клиент</DialogTitle>
            </DialogHeader>
            <AddClientForm
              isPending={createClientMutation.isPending}
              onSubmit={(form) => createClientMutation.mutate(form)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Клиентов пока нет</p>
          <p className="text-xs mt-1">Добавьте первого клиента</p>
        </div>
      ) : (
      <div className="space-y-2">
        {filtered.map((client, i) => (
          <motion.div
            key={client.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <Card
              className="bg-card border-border cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setDetailClient(client)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{client.full_name}</p>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                    {client.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />{client.phone}
                      </span>
                    )}
                    {client.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />{client.email}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                      {client.policies_count} полис{(client.policies_count ?? 0) > 4 ? "ов" : (client.policies_count ?? 0) > 1 ? "а" : ""}
                    </Badge>
                    {(client.total_premium ?? 0) > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {fmt(client.total_premium ?? 0)}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
      )}

      <Dialog open={!!detailClient} onOpenChange={(v) => !v && setDetailClient(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Детали клиента</DialogTitle>
          </DialogHeader>
          {detailClient && (
            <div className="space-y-4">
              <div>
                <p className="font-semibold text-foreground">{detailClient.full_name}</p>
                {detailClient.phone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Phone className="w-3.5 h-3.5" /> {detailClient.phone}
                  </p>
                )}
                {detailClient.email && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Mail className="w-3.5 h-3.5" /> {detailClient.email}
                  </p>
                )}
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Полисов</p>
                  <p className="text-lg font-bold text-foreground flex items-center gap-1">
                    <FileText className="w-4 h-4" />{detailClient.policies_count ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Общая сумма</p>
                  <p className="text-lg font-bold text-foreground">{fmt(detailClient.total_premium ?? 0)}</p>
                </div>
              </div>
              {detailClient.birth_date && (
                <p className="text-xs text-muted-foreground">
                  Дата рождения: {new Date(detailClient.birth_date).toLocaleDateString("ru-RU")}
                </p>
              )}
              {detailClient.address && (
                <p className="text-xs text-muted-foreground">Адрес: {detailClient.address}</p>
              )}
              {detailClient.notes && (
                <p className="text-xs text-muted-foreground">Заметки: {detailClient.notes}</p>
              )}
              <Separator />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    navigate(`/insurance/calculator?client_id=${detailClient.id}&name=${encodeURIComponent(detailClient.full_name)}`);
                    setDetailClient(null);
                  }}
                >
                  <Calculator className="w-4 h-4 mr-1" />
                  Рассчитать
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    navigate("/crm/insurance");
                    setDetailClient(null);
                  }}
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Открыть в CRM
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddClientForm({
  isPending,
  onSubmit,
}: {
  isPending: boolean;
  onSubmit: (form: { full_name: string; phone?: string; email?: string; birth_date?: string; address?: string; notes?: string }) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-3 pt-2">
      <Input placeholder="ФИО *" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <Input placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input placeholder="Дата рождения" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      <Input placeholder="Адрес" value={address} onChange={(e) => setAddress(e.target.value)} />
      <Input placeholder="Заметки" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button
        className="w-full"
        disabled={!fullName.trim() || isPending}
        onClick={() => onSubmit({
          full_name: fullName.trim(),
          phone: phone || undefined,
          email: email || undefined,
          birth_date: birthDate || undefined,
          address: address || undefined,
          notes: notes || undefined,
        })}
      >
        {isPending ? "Создание..." : "Добавить клиента"}
      </Button>
    </div>
  );
}
