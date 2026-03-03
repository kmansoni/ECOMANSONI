import { useState } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, TrendingUp, Clock, CheckCircle2, XCircle, Loader2, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCreatorFund } from '@/hooks/useCreatorFund';
import { EarningsChart } from '@/components/creator/EarningsChart';
import { PayoutRequestSheet } from '@/components/creator/PayoutRequestSheet';

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  pending: { label: 'Обрабатывается', color: 'text-yellow-400', Icon: Clock },
  completed: { label: 'Выполнено', color: 'text-green-400', Icon: CheckCircle2 },
  rejected: { label: 'Отклонено', color: 'text-red-400', Icon: XCircle },
};

export default function CreatorFundPage() {
  const navigate = useNavigate();
  const { account, balance, totalEarned, isEligible, payouts, earnings, loading, requestPayout } = useCreatorFund();
  const [payoutOpen, setPayoutOpen] = useState(false);

  const formatRub = (v: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(v);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-zinc-900">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-zinc-900 flex items-center justify-center">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">Creator Fund</h1>
      </div>

      <div className="px-4 space-y-4 pt-4">
        {/* Balance card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-3xl p-5 border border-zinc-700"
        >
          <p className="text-zinc-400 text-sm mb-1">Доступный баланс</p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-4xl font-black text-white"
          >
            {formatRub(balance)}
          </motion.p>

          <div className="flex items-center gap-4 mt-4">
            <div>
              <p className="text-xs text-zinc-500">Всего заработано</p>
              <p className="text-sm font-semibold text-white">{formatRub(totalEarned)}</p>
            </div>
            <div className="w-px h-8 bg-zinc-700" />
            <div>
              <p className="text-xs text-zinc-500">Статус</p>
              <p className={`text-sm font-semibold ${isEligible ? 'text-green-400' : 'text-orange-400'}`}>
                {isEligible ? 'Активен' : 'Не участвует'}
              </p>
            </div>
          </div>

          {isEligible && balance >= 500 && (
            <button
              onClick={() => setPayoutOpen(true)}
              className="mt-4 w-full flex items-center justify-center gap-2 bg-white text-black font-semibold py-3 rounded-2xl active:scale-95 transition-transform"
            >
              <DollarSign className="w-4 h-4" />
              Запросить выплату
            </button>
          )}

          {!isEligible && (
            <div className="mt-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl p-3">
              <p className="text-orange-400 text-xs">
                Для участия необходимо минимум {account?.min_followers_required?.toLocaleString('ru-RU') ?? '10 000'} подписчиков
              </p>
            </div>
          )}
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Выплат', value: payouts.length.toString(), Icon: DollarSign },
            { label: 'Дней активности', value: earnings.length.toString(), Icon: TrendingUp },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
              <Icon className="w-5 h-5 text-zinc-500 mb-2" />
              <p className="text-2xl font-bold text-white">{value}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        {earnings.length > 0 && <EarningsChart earnings={earnings} />}

        {/* Payouts history */}
        {payouts.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">История выплат</h3>
            <div className="space-y-2">
              {payouts.map(payout => {
                const cfg = STATUS_CONFIG[payout.status] ?? STATUS_CONFIG.pending;
                return (
                  <div key={payout.id} className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center">
                        <cfg.Icon className={`w-4 h-4 ${cfg.color}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{formatRub(payout.amount)}</p>
                        <p className="text-xs text-zinc-500">
                          {payout.method === 'card' ? 'Банковская карта' : 'Криптовалюта'} · {new Date(payout.created_at).toLocaleDateString('ru-RU')}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Eligibility conditions */}
        <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
          <h3 className="text-sm font-semibold text-white mb-3">Условия участия</h3>
          <ul className="space-y-2 text-sm text-zinc-400">
            {[
              'Минимум 10 000 подписчиков',
              'Публикация оригинального контента',
              'Соответствие правилам сообщества',
              'Активность не менее 30 дней',
            ].map((cond, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-zinc-600 mt-0.5 flex-shrink-0" />
                {cond}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <PayoutRequestSheet
        open={payoutOpen}
        onClose={() => setPayoutOpen(false)}
        balance={balance}
        onRequest={async (amount, method) => { await requestPayout(amount, method); }}
      />
    </div>
  );
}
