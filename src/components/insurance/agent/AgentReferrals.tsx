import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Copy, Link2, Check, ToggleLeft, ToggleRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useReferralLinks, useCreateReferralLink } from "@/hooks/insurance/useInsuranceReferral";
import { dbLoose } from "@/lib/supabase";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/insurance/loyalty";
import type { ReferralLinkType, ReferralLink } from "@/types/insurance";

const linkTypes: { value: ReferralLinkType; label: string }[] = [
  { value: "osago", label: "ОСАГО" },
  { value: "kasko", label: "КАСКО" },
  { value: "mortgage", label: "Ипотечное" },
  { value: "travel", label: "ВЗР" },
  { value: "mentorship", label: "Наставничество" },
  { value: "partnership", label: "Партнёрство" },
];

function typeLabel(t: string) {
  return linkTypes.find(l => l.value === t)?.label ?? t;
}

export function AgentReferrals() {
  const { data: links, isLoading, error, refetch } = useReferralLinks();
  const createLink = useCreateReferralLink();
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 text-center text-sm text-destructive">
          Ошибка загрузки ссылок
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          Реферальные ссылки{links?.length ? ` (${links.length})` : ""}
        </h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="w-4 h-4 mr-1" /> Создать ссылку
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новая реферальная ссылка</DialogTitle>
            </DialogHeader>
            <CreateLinkForm
              isPending={createLink.isPending}
              onSubmit={params => {
                createLink.mutate(params, { onSuccess: () => setOpen(false) });
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {!links?.length ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <Link2 className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Создайте первую ссылку</p>
          </CardContent>
        </Card>
      ) : (
        links.map((link, i) => (
          <motion.div
            key={link.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <LinkCard link={link} onToggle={() => toggleActive(link, refetch)} />
          </motion.div>
        ))
      )}
    </div>
  );
}

// --- карточка ссылки ---

function LinkCard({ link, onToggle }: { link: ReferralLink; onToggle: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = `ref.app/a/${link.code}`;

  async function copy() {
    await navigator.clipboard.writeText(`https://${url}`);
    setCopied(true);
    toast.success("Скопировано");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{typeLabel(link.type)}</Badge>
            {link.name && <span className="text-sm text-foreground">{link.name}</span>}
          </div>
          <button
            onClick={onToggle}
            className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={link.is_active ? "Деактивировать ссылку" : "Активировать ссылку"}
          >
            {link.is_active
              ? <ToggleRight className="w-6 h-6 text-green-400" />
              : <ToggleLeft className="w-6 h-6" />}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{url}</span>
          <button
            onClick={copy}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Копировать ссылку"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
          <span>{link.activations} переходов</span>
          <span>{link.calculations} расчётов</span>
          <span>{link.policies} полисов</span>
          <span className="text-foreground font-medium">{formatCurrency(link.revenue)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// --- форма создания ---

function CreateLinkForm({
  isPending,
  onSubmit,
}: {
  isPending: boolean;
  onSubmit: (p: { type: ReferralLinkType; name?: string; quotaPercent?: number }) => void;
}) {
  const [type, setType] = useState<ReferralLinkType>("osago");
  const [name, setName] = useState("");
  const [quota, setQuota] = useState("");

  return (
    <div className="space-y-4 pt-2">
      <Select value={type} onValueChange={v => setType(v as ReferralLinkType)}>
        <SelectTrigger>
          <SelectValue placeholder="Тип ссылки" />
        </SelectTrigger>
        <SelectContent>
          {linkTypes.map(t => (
            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input placeholder="Название (необязательно)" value={name} onChange={e => setName(e.target.value)} />

      <Input
        type="number"
        placeholder="Квота %"
        min={0}
        max={100}
        value={quota}
        onChange={e => setQuota(e.target.value)}
      />

      <Button
        className="w-full"
        disabled={isPending}
        onClick={() => onSubmit({ type, name: name || undefined, quotaPercent: Number(quota) || undefined })}
      >
        {isPending ? "Создание…" : "Создать"}
      </Button>
    </div>
  );
}

// --- toggle ---

async function toggleActive(link: ReferralLink, refetch: () => void) {
  const { error } = await dbLoose
    .from("insurance_referral_links")
    .update({ is_active: !link.is_active })
    .eq("id", link.id);

  if (error) {
    toast.error("Не удалось изменить статус");
    return;
  }
  toast.success(link.is_active ? "Ссылка деактивирована" : "Ссылка активирована");
  refetch();
}
