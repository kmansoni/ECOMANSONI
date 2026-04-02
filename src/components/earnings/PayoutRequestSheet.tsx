/**
 * PayoutRequestSheet — Sheet для вывода средств.
 *
 * Функциональность:
 * - Сумма (min 1000 копеек = 10₽)
 * - Метод: банковский перевод / PayPal / крипто
 * - Реквизиты (зависят от метода)
 * - Подтверждение
 */
import { useState, useCallback, useMemo } from "react";
import {
  Wallet,
  CreditCard,
  Loader2,
  Building2,
  Globe,
  Bitcoin,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreatorEarnings } from "@/hooks/useCreatorEarnings";
import { toast } from "sonner";

interface PayoutRequestSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const METHODS = [
  { value: "bank_transfer" as const, label: "Банковский перевод", icon: Building2 },
  { value: "paypal" as const, label: "PayPal", icon: Globe },
  { value: "crypto" as const, label: "Криптовалюта", icon: Bitcoin },
] as const;

const METHOD_FIELDS: Record<string, Array<{ key: string; label: string; placeholder: string }>> = {
  bank_transfer: [
    { key: "bank_name", label: "Банк", placeholder: "Сбербанк" },
    { key: "account_number", label: "Номер счёта", placeholder: "40817810XXXXXXXXXXX" },
    { key: "bik", label: "БИК", placeholder: "044525225" },
  ],
  paypal: [
    { key: "paypal_email", label: "Email PayPal", placeholder: "user@example.com" },
  ],
  crypto: [
    { key: "wallet_address", label: "Адрес кошелька", placeholder: "0x..." },
    { key: "network", label: "Сеть", placeholder: "Ethereum / TRON / Bitcoin" },
  ],
};

const MIN_PAYOUT_RUB = 10;

export function PayoutRequestSheet({ open, onOpenChange }: PayoutRequestSheetProps) {
  const { summary, requestPayout } = useCreatorEarnings();
  const [method, setMethod] = useState<"bank_transfer" | "paypal" | "crypto">("bank_transfer");
  const [amountRub, setAmountRub] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const availableRub = useMemo(() => {
    return (summary.total - summary.paid) / 100;
  }, [summary]);

  const isValid = useMemo(() => {
    const amount = Number(amountRub);
    if (isNaN(amount) || amount < MIN_PAYOUT_RUB || amount > availableRub) return false;

    const fields = METHOD_FIELDS[method];
    return fields.every((f) => (details[f.key] ?? "").trim().length > 0);
  }, [amountRub, method, details, availableRub]);

  const handleSubmit = useCallback(async () => {
    const amountCents = Math.round(Number(amountRub) * 100);
    if (amountCents < 1000) {
      toast.error(`Минимальная сумма — ${MIN_PAYOUT_RUB} ₽`);
      return;
    }

    setSubmitting(true);
    try {
      await requestPayout(amountCents, method, details);
      onOpenChange(false);
      setAmountRub("");
      setDetails({});
    } finally {
      setSubmitting(false);
    }
  }, [amountRub, method, details, requestPayout, onOpenChange]);

  const updateDetail = useCallback((key: string, value: string) => {
    setDetails((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto rounded-t-2xl max-h-[85vh]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            Вывод средств
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 mt-4 overflow-y-auto max-h-[calc(85vh-140px)] pb-4">
          {/* Доступно */}
          <div className="bg-muted/50 dark:bg-muted/20 rounded-xl p-4 text-center">
            <p className="text-sm text-muted-foreground">Доступно для вывода</p>
            <p className="text-2xl font-bold">{availableRub.toFixed(2)} ₽</p>
          </div>

          {/* Сумма */}
          <div>
            <Label htmlFor="payout-amount">Сумма вывода (₽)</Label>
            <Input
              id="payout-amount"
              type="number"
              min={MIN_PAYOUT_RUB}
              max={availableRub}
              value={amountRub}
              onChange={(e) => setAmountRub(e.target.value)}
              placeholder={`Мин. ${MIN_PAYOUT_RUB} ₽`}
              className="mt-1"
            />
          </div>

          {/* Метод */}
          <div>
            <Label>Метод вывода</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {METHODS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setMethod(value); setDetails({}); }}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all min-h-[44px] ${
                    method === value
                      ? "border-primary bg-primary/10 dark:bg-primary/20"
                      : "border-border hover:border-primary/50"
                  }`}
                  aria-pressed={method === value}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs text-center">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Реквизиты */}
          <div className="space-y-3">
            {METHOD_FIELDS[method].map((field) => (
              <div key={field.key}>
                <Label htmlFor={`detail-${field.key}`}>{field.label}</Label>
                <Input
                  id={`detail-${field.key}`}
                  value={details[field.key] ?? ""}
                  onChange={(e) => updateDetail(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="mt-1"
                />
              </div>
            ))}
          </div>

          {/* Кнопка */}
          <Button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="min-h-[48px] text-base"
            aria-label="Отправить запрос на вывод"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Отправка...
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                Вывести {amountRub ? `${Number(amountRub).toFixed(0)} ₽` : ""}
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
