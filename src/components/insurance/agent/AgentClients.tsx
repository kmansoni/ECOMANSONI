import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Phone, Mail, FileText, ChevronRight, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

const db = supabase as SupabaseClient<any>;

interface ClientRow {
  user_id: string;
  count: number;
  total_premium: number;
  last_date: string;
}

export function AgentClients() {
  const [search, setSearch] = useState("");
  const [detailClient, setDetailClient] = useState<ClientRow | null>(null);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["agent-clients"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Получаем полисы агента и группируем по user_id (клиенту)
      const { data, error } = await db
        .from("insurance_policies")
        .select("id, user_id, premium, start_date")
        .eq("user_id", user.id)
        .order("start_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      if (!data?.length) return [];

      // Группировка по user_id
      const map = new Map<string, ClientRow>();
      for (const p of data) {
        const uid = p.user_id as string;
        const existing = map.get(uid);
        if (existing) {
          existing.count++;
          existing.total_premium += p.premium ?? 0;
          if (p.start_date > existing.last_date) existing.last_date = p.start_date;
        } else {
          map.set(uid, { user_id: uid, count: 1, total_premium: p.premium ?? 0, last_date: p.start_date });
        }
      }
      return Array.from(map.values());
    },
  });

  const filtered = clients.filter((c) =>
    c.user_id.toLowerCase().includes(search.toLowerCase())
  );

  const fmt = (v: number) => v.toLocaleString("ru-RU") + " ₽";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
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
          <p className="text-xs mt-1">Они появятся после оформления полисов</p>
        </div>
      ) : (
      <div className="space-y-2">
        {filtered.map((client, i) => (
          <motion.div
            key={client.user_id}
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
                  <p className="font-medium text-sm text-foreground truncate">{client.user_id.slice(0, 8)}...</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                      {client.count} полис{client.count > 4 ? "ов" : client.count > 1 ? "а" : ""}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(client.last_date).toLocaleDateString("ru-RU")}
                    </span>
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
                <p className="font-semibold text-foreground">ID: {detailClient.user_id.slice(0, 12)}...</p>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Полисов</p>
                  <p className="text-lg font-bold text-foreground flex items-center gap-1">
                    <FileText className="w-4 h-4" />{detailClient.count}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Общая сумма</p>
                  <p className="text-lg font-bold text-foreground">{fmt(detailClient.total_premium)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Последняя активность: {new Date(detailClient.last_date).toLocaleDateString("ru-RU")}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
