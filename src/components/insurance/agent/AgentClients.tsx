import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Phone, Mail, FileText, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  policiesCount: number;
  lastActivity: string;
  totalPremium: string;
}

const mockClients: Client[] = [
  { id: "c1", name: "Иванов Александр Владимирович", phone: "+7 (916) 123-45-67", email: "ivanov@mail.ru", policiesCount: 3, lastActivity: "02.03.2026", totalPremium: "45 600 ₽" },
  { id: "c2", name: "Смирнова Елена Петровна", phone: "+7 (903) 234-56-78", email: "smirnova@gmail.com", policiesCount: 1, lastActivity: "01.03.2026", totalPremium: "34 100 \u20bd" },
  { id: "c3", name: "Козлов Дмитрий Иванович", phone: "+7 (925) 345-67-89", email: "kozlov@yandex.ru", policiesCount: 2, lastActivity: "28.02.2026", totalPremium: "26 300 \u20bd" },
  { id: "c4", name: "Петрова Мария Сергеевна", phone: "+7 (967) 456-78-90", email: "petrova@mail.ru", policiesCount: 1, lastActivity: "27.02.2026", totalPremium: "4 200 \u20bd" },
  { id: "c5", name: "Сидоров Кирилл Николаевич", phone: "+7 (985) 567-89-01", email: "sidorov@gmail.com", policiesCount: 2, lastActivity: "25.02.2026", totalPremium: "18 400 \u20bd" },
  { id: "c6", name: "Федорова Ольга Андреевна", phone: "+7 (916) 678-90-12", email: "fedorova@yandex.ru", policiesCount: 4, lastActivity: "22.02.2026", totalPremium: "92 700 \u20bd" },
];

interface NewClientForm {
  name: string;
  phone: string;
  email: string;
  birthDate: string;
}

export function AgentClients() {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [form, setForm] = useState<NewClientForm>({ name: "", phone: "", email: "", birthDate: "" });

  const filtered = mockClients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = () => {
    setAddOpen(false);
    setForm({ name: "", phone: "", email: "", birthDate: "" });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск клиента..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Добавить
        </Button>
      </div>

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
                  <p className="font-medium text-sm text-foreground truncate">{client.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" />{client.phone}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">{client.policiesCount} полис{client.policiesCount > 1 ? "а" : ""}</Badge>
                    <span className="text-[11px] text-muted-foreground">последняя активность {client.lastActivity}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Add Client Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Добавить клиента</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ФИО</label>
              <Input placeholder="Иванов Иван Иванович" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Телефон</label>
              <Input placeholder="+7 (999) 000-00-00" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <Input placeholder="email@example.com" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Дата рождения</label>
              <Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
            </div>
            <Button className="w-full" onClick={handleAdd}>Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Client Detail Dialog */}
      <Dialog open={!!detailClient} onOpenChange={(v) => !v && setDetailClient(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Детали клиента</DialogTitle>
          </DialogHeader>
          {detailClient && (
            <div className="space-y-4">
              <div>
                <p className="font-semibold text-foreground">{detailClient.name}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">{detailClient.phone}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">{detailClient.email}</span>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Полисов</p>
                  <p className="text-lg font-bold text-foreground flex items-center gap-1">
                    <FileText className="w-4 h-4" />{detailClient.policiesCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Общая сумма</p>
                  <p className="text-lg font-bold text-foreground">{detailClient.totalPremium}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Последняя активность: {detailClient.lastActivity}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
