import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CreditCard, Bitcoin, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface PayoutRequestSheetProps {
  open: boolean;
  onClose: () => void;
  balance: number;
  onRequest: (amount: number, method: string) => Promise<void>;
}

const MIN_PAYOUT = 500;

const METHODS = [
  { id: 'card', label: 'Банковская карта', icon: CreditCard },
  { id: 'crypto', label: 'Криптовалюта', icon: Bitcoin },
];

export function PayoutRequestSheet({ open, onClose, balance, onRequest }: PayoutRequestSheetProps) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('card');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const isValid = numAmount >= MIN_PAYOUT && numAmount <= balance;

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await onRequest(numAmount, method);
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setAmount('');
        onClose();
      }, 2000);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка запроса выплаты');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 rounded-t-3xl p-6 pb-safe"
          >
            <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-5" />

            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Запросить выплату</h2>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            {done ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <CheckCircle2 className="w-14 h-14 text-green-400" />
                <p className="text-white font-semibold text-lg">Запрос отправлен!</p>
                <p className="text-zinc-400 text-sm text-center">Выплата будет обработана в течение 3-5 рабочих дней</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Balance info */}
                <div className="bg-zinc-800 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Доступно</span>
                  <span className="text-sm font-bold text-white">
                    {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(balance)}
                  </span>
                </div>

                {/* Amount */}
                <div>
                  <label className="text-xs text-zinc-400 mb-1.5 block">Сумма выплаты (мин. {MIN_PAYOUT} ₽)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0"
                      min={MIN_PAYOUT}
                      max={balance}
                      className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none border border-zinc-700 focus:border-zinc-500 pr-10"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">₽</span>
                  </div>
                  {numAmount > 0 && numAmount < MIN_PAYOUT && (
                    <p className="text-red-400 text-xs mt-1">Минимальная сумма — {MIN_PAYOUT} ₽</p>
                  )}
                  {numAmount > balance && (
                    <p className="text-red-400 text-xs mt-1">Превышает доступный баланс</p>
                  )}
                </div>

                {/* Method */}
                <div>
                  <label className="text-xs text-zinc-400 mb-1.5 block">Метод</label>
                  <div className="grid grid-cols-2 gap-2">
                    {METHODS.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setMethod(m.id)}
                        className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-sm font-medium transition-colors ${
                          method === m.id
                            ? 'border-white bg-zinc-800 text-white'
                            : 'border-zinc-700 bg-zinc-800/50 text-zinc-400'
                        }`}
                      >
                        <m.icon className="w-4 h-4" />
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={loading || !isValid}
                  className="w-full flex items-center justify-center gap-2 bg-white text-black font-semibold py-3.5 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed active:scale-98 transition-transform"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loading ? 'Обработка...' : 'Запросить'}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
