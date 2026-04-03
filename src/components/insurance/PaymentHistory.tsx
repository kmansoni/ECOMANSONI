import { useState, useMemo } from 'react';
import { CreditCard, Filter, RefreshCw, AlertCircle, Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useInsurancePayments } from '@/hooks/insurance/useInsurancePayments';
import type { PaymentStatus } from '@/hooks/insurance/useInsurancePayments';
import { formatPremium } from '@/lib/insurance/formatters';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<PaymentStatus, { label: string; variant: string; className: string }> = {
  pending: { label: 'Ожидает', variant: 'outline', className: 'border-yellow-500 text-yellow-700 dark:text-yellow-400' },
  processing: { label: 'Обработка', variant: 'outline', className: 'border-blue-500 text-blue-700 dark:text-blue-400' },
  completed: { label: 'Оплачен', variant: 'outline', className: 'border-green-500 text-green-700 dark:text-green-400' },
  failed: { label: 'Ошибка', variant: 'destructive', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  refunded: { label: 'Возврат', variant: 'outline', className: 'border-purple-500 text-purple-700 dark:text-purple-400' },
};

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Все статусы' },
  { value: 'pending', label: 'Ожидает' },
  { value: 'processing', label: 'Обработка' },
  { value: 'completed', label: 'Оплачен' },
  { value: 'failed', label: 'Ошибка' },
  { value: 'refunded', label: 'Возврат' },
];

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatMethod(method: string | null): string {
  if (!method) return '—';
  const map: Record<string, string> = {
    card: 'Банковская карта',
    sbp: 'СБП',
    wallet: 'Кошелёк',
    invoice: 'Счёт',
  };
  return map[method] ?? method;
}

/**
 * Таблица истории платежей по страховым полисам
 */
export function PaymentHistory() {
  const { paymentHistory, paymentTotal, isLoading, error, refetch } = useInsurancePayments();
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredPayments = useMemo(() => {
    if (statusFilter === 'all') return paymentHistory;
    return paymentHistory.filter((p) => p.status === statusFilter);
  }, [paymentHistory, statusFilter]);

  // ---------- Loading ----------
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // ---------- Error ----------
  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10">
          <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Не удалось загрузить историю платежей</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="min-h-[44px] min-w-[44px]"
            aria-label="Повторить загрузку платежей"
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Повторить
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ---------- Empty ----------
  if (paymentHistory.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10">
          <Inbox className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Платежей пока нет</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" aria-hidden="true" />
          История платежей
        </CardTitle>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            Итого: <span className="font-semibold text-foreground">{formatPremium(paymentTotal)}</span>
          </span>

          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger
                className="w-[160px] min-h-[44px]"
                aria-label="Фильтр по статусу платежа"
              >
                <SelectValue placeholder="Все статусы" />
              </SelectTrigger>
              <SelectContent>
                {FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 overflow-x-auto">
        {filteredPayments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Нет платежей с выбранным статусом</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Дата</TableHead>
                <TableHead className="min-w-[120px]">Полис</TableHead>
                <TableHead className="min-w-[120px] text-right">Сумма</TableHead>
                <TableHead className="min-w-[120px]">Статус</TableHead>
                <TableHead className="min-w-[140px]">Метод</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.map((payment) => {
                const cfg = STATUS_CONFIG[payment.status] ?? STATUS_CONFIG.pending;
                return (
                  <TableRow key={payment.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(payment.created_at)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {payment.policy_id.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">
                      {formatPremium(payment.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={cfg.variant as 'outline' | 'destructive'}
                        className={cn('whitespace-nowrap', cfg.className)}
                      >
                        {cfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatMethod(payment.payment_method)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
