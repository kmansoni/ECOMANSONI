import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAgentBalance, useAgentTransactions, useRequestWithdrawal } from "@/hooks/insurance/useInsuranceAgent";
import { formatCurrency } from "@/lib/insurance/loyalty";

const methods = [
  { value: "card", label: "Банковская карта" },
  { value: "bank_account", label: "Банковский счёт" },
  { value: "sbp", label: "СБП" },
] as const;

const payoutStatusMap: Record<string, { text: string; variant: "default" | "secondary" | "destructive" }> = {
  completed: { text: "Выполнено", variant: "default" },
  pending: { text: "В обработке", variant: "secondary" },
  processing: { text: "В обработке", variant: "secondary" },
  rejected: { text: "Отклонено", variant: "destructive" },
};

function methodLabel(val: string) {
  return methods.find(m => m.value === val)?.label ?? val;
}

export function AgentPayouts() {
  const { data: balance, isLoading: balLoading } = useAgentBalance();
  const { data: txData, isLoading: txLoading } = useAgentTransactions("all");
  const withdrawal = useRequestWithdrawal();

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("card");

  const available = balance?.available ?? 0;
  const numAmount = Number(amount) || 0;
  const canSubmit = numAmount >= 1000 && numAmount <= available && !withdrawal.isPending;

  const payouts = (txData?.items ?? []).filter(t => t.kind === "payout");

  function handleSubmit() {
    if (!canSubmit) return;
    withdrawal.mutate(
      { amount: numAmount, paymentMethod: method },
      { onSuccess: () => { setAmount(""); } },
    );
  }

  if (balLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Запрос на вывод</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Доступно: <span className="text-foreground font-medium">{formatCurrency(available)}</span>
            </p>

            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="number"
                  placeholder="Сумма"
                  min={1000}
                  max={available}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {methods.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Мин. 1 000 ₽</span>
              <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
                <ArrowUpRight className="w-4 h-4 mr-1" />
                {withdrawal.isPending ? "Отправка…" : "Запросить вывод"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">История выводов</CardTitle>
        </CardHeader>
        <CardContent>
          {txLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Выводов пока нет</p>
          ) : (
            <div className="space-y-2">
              {payouts.map(p => {
                const st = payoutStatusMap[p.status] ?? { text: p.status, variant: "secondary" as const };
                return (
                  <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                    <span className="font-medium">{formatCurrency(p.amount)}</span>
                    <span className="text-muted-foreground text-xs">{methodLabel(p.payment_method ?? "")}</span>
                    <Badge variant={st.variant}>{st.text}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
