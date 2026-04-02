/**
 * CouponInput — поле ввода промокода для корзины / чекаута.
 *
 * Валидирует промокод, показывает скидку или ошибку.
 */

import { useState, useCallback } from 'react';
import { Tag, Check, X, Loader2 } from 'lucide-react';
import { useCoupons, type ApplyCouponResult } from '@/hooks/useCoupons';

interface CouponInputProps {
  orderAmount: number;
  onApply: (result: ApplyCouponResult) => void;
  onClear: () => void;
}

export function CouponInput({ orderAmount, onApply, onClear }: CouponInputProps) {
  const { applyCoupon } = useCoupons();
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ApplyCouponResult | null>(null);

  const handleApply = useCallback(async () => {
    if (!code.trim()) return;

    setChecking(true);
    try {
      const res = await applyCoupon(code, orderAmount);
      setResult(res);
      onApply(res);
    } finally {
      setChecking(false);
    }
  }, [code, orderAmount, applyCoupon, onApply]);

  const handleClear = useCallback(() => {
    setCode('');
    setResult(null);
    onClear();
  }, [onClear]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleApply();
    }
  }, [handleApply]);

  // Купон уже применён
  if (result?.valid && result.coupon) {
    return (
      <div className="flex items-center gap-3 bg-green-900/20 border border-green-700/40 rounded-xl px-4 py-3">
        <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-green-400 text-sm font-medium">
            Промокод {result.coupon.code} применён
          </p>
          <p className="text-green-300/70 text-xs">
            Скидка: {formatDiscount(result.coupon.discount_type, result.coupon.discount_value)}
            {' '}(−{result.discount.toLocaleString('ru-RU')} ₽)
          </p>
        </div>
        <button
          onClick={handleClear}
          className="p-1.5 rounded-full hover:bg-green-800/30 transition-colors"
          aria-label="Убрать промокод"
        >
          <X className="w-4 h-4 text-green-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="Промокод"
            maxLength={20}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
            aria-label="Введите промокод"
            aria-invalid={result?.error ? true : undefined}
            aria-describedby={result?.error ? 'coupon-error' : undefined}
          />
        </div>
        <button
          onClick={handleApply}
          disabled={!code.trim() || checking}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium text-sm px-5 py-3 rounded-xl transition-colors min-w-[100px] flex items-center justify-center"
          aria-label="Применить промокод"
        >
          {checking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'Применить'
          )}
        </button>
      </div>

      {result?.error && (
        <p id="coupon-error" className="text-red-400 text-xs px-1" role="alert">
          {result.error}
        </p>
      )}
    </div>
  );
}

function formatDiscount(type: 'percentage' | 'fixed', value: number): string {
  if (type === 'percentage') return `${value}%`;
  return `${value.toLocaleString('ru-RU')} ₽`;
}
