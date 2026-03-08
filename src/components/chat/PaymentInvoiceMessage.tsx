import React from "react";
import { CheckCircle2, RotateCcw, Clock, Star, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentInvoice } from "@/hooks/useBotPayments";

interface PaymentInvoiceMessageProps {
  invoice: PaymentInvoice;
  onPay: (invoice: PaymentInvoice) => void;
  className?: string;
}

function formatAmount(amount: number, currency: PaymentInvoice["currency"]): string {
  if (currency === "XTR") {
    return `${amount} Stars`;
  }
  const divisor = currency === "USD" || currency === "EUR" ? 100 : 100;
  const formatted = (amount / divisor).toFixed(2);
  const symbols: Record<string, string> = { USD: "$", EUR: "€", RUB: "₽" };
  return `${symbols[currency] ?? ""}${formatted}`;
}

const StatusBadge: React.FC<{ status: PaymentInvoice["status"] }> = ({ status }) => {
  if (status === "paid") {
    return (
      <div className="flex items-center gap-1 text-green-400 text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Оплачено</span>
      </div>
    );
  }
  if (status === "refunded") {
    return (
      <div className="flex items-center gap-1 text-yellow-400 text-xs font-medium">
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Возвращено</span>
      </div>
    );
  }
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-1 text-zinc-400 text-xs font-medium">
        <Clock className="w-3.5 h-3.5" />
        <span>Отменено</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-zinc-400 text-xs font-medium">
      <Clock className="w-3.5 h-3.5" />
      <span>Ожидает оплаты</span>
    </div>
  );
};

const CurrencyIcon: React.FC<{ currency: PaymentInvoice["currency"] }> = ({ currency }) => {
  if (currency === "XTR") {
    return <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />;
  }
  return <DollarSign className="w-4 h-4 text-blue-400" />;
};

export const PaymentInvoiceMessage: React.FC<PaymentInvoiceMessageProps> = ({
  invoice,
  onPay,
  className,
}) => {
  const isPending = invoice.status === "pending";

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden border border-white/10 bg-zinc-800/90 max-w-xs w-full shadow-lg",
        className
      )}
    >
      {/* Photo */}
      {invoice.photo_url && (
        <div className="w-full aspect-video bg-zinc-900 overflow-hidden">
          <img
            src={invoice.photo_url}
            alt={invoice.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      <div className="p-3 space-y-2">
        {/* Title + status */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-white text-sm font-semibold leading-tight line-clamp-2">
            {invoice.title}
          </p>
          <StatusBadge status={invoice.status} />
        </div>

        {/* Description */}
        <p className="text-zinc-400 text-xs leading-relaxed line-clamp-3">
          {invoice.description}
        </p>

        {/* Price row */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <CurrencyIcon currency={invoice.currency} />
            <span className="text-white font-bold text-base">
              {formatAmount(invoice.amount, invoice.currency)}
            </span>
          </div>

          {isPending && (
            <button
              onClick={() => onPay(invoice)}
              className="px-3 py-1.5 rounded-xl bg-accent text-white text-xs font-semibold
                         hover:bg-accent/90 active:scale-95 transition-all duration-150"
            >
              Оплатить
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
