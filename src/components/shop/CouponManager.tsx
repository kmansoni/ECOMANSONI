/**
 * CouponManager — управление купонами для продавцов.
 *
 * Список купонов, создание новых, деактивация, статистика использования.
 */

import { useState, useCallback } from 'react';
import { Plus, Tag, Percent, DollarSign, X, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCoupons, type CreateCouponInput, type Coupon } from '@/hooks/useCoupons';

export function CouponManager() {
  const { myCoupons, createCoupon, deactivateCoupon, loading } = useCoupons();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold text-lg">Промокоды</h3>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors min-h-[44px]"
          aria-label="Создать промокод"
        >
          <Plus className="w-4 h-4" />
          Создать
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <CreateCouponForm
            onSubmit={async (input) => {
              const result = await createCoupon(input);
              if (result) setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
            loading={loading}
          />
        )}
      </AnimatePresence>

      {/* Список купонов */}
      {myCoupons.length === 0 && !showForm && (
        <div className="text-center py-12">
          <Tag className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">У вас пока нет промокодов</p>
          <p className="text-zinc-600 text-xs mt-1">Создайте промокод для привлечения покупателей</p>
        </div>
      )}

      <div className="space-y-2">
        {myCoupons.map(coupon => (
          <CouponCard
            key={coupon.id}
            coupon={coupon}
            onDeactivate={deactivateCoupon}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CouponCard
// ---------------------------------------------------------------------------

function CouponCard({ coupon, onDeactivate }: { coupon: Coupon; onDeactivate: (id: string) => void }) {
  const isExpired = coupon.valid_until && new Date(coupon.valid_until) < new Date();
  const isExhausted = coupon.max_uses !== null && coupon.used_count >= coupon.max_uses;
  const statusText = !coupon.is_active
    ? 'Неактивен'
    : isExpired
      ? 'Истёк'
      : isExhausted
        ? 'Исчерпан'
        : 'Активен';
  const statusColor = coupon.is_active && !isExpired && !isExhausted
    ? 'text-green-400'
    : 'text-zinc-500';

  return (
    <div className="bg-zinc-800/60 rounded-xl px-4 py-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center flex-shrink-0">
        {coupon.discount_type === 'percentage' ? (
          <Percent className="w-5 h-5 text-blue-400" />
        ) : (
          <DollarSign className="w-5 h-5 text-green-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white text-sm font-mono font-bold">{coupon.code}</p>
          <span className={`text-xs ${statusColor}`}>{statusText}</span>
        </div>
        <p className="text-zinc-400 text-xs mt-0.5">
          {coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `${coupon.discount_value} ₽`}
          {coupon.min_order_amount > 0 && ` от ${coupon.min_order_amount} ₽`}
          {' · '}
          {coupon.used_count}{coupon.max_uses !== null ? `/${coupon.max_uses}` : ''} использований
        </p>
        {coupon.description && (
          <p className="text-zinc-500 text-xs mt-0.5 truncate">{coupon.description}</p>
        )}
      </div>
      {coupon.is_active && (
        <button
          onClick={() => onDeactivate(coupon.id)}
          className="p-2 rounded-full hover:bg-zinc-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label={`Деактивировать промокод ${coupon.code}`}
          title="Деактивировать"
        >
          <ToggleRight className="w-5 h-5 text-green-400" />
        </button>
      )}
      {!coupon.is_active && (
        <div className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
          <ToggleLeft className="w-5 h-5 text-zinc-600" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateCouponForm
// ---------------------------------------------------------------------------

function CreateCouponForm({
  onSubmit,
  onCancel,
  loading,
}: {
  onSubmit: (input: CreateCouponInput) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}) {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = useCallback(() => {
    const e: Record<string, string> = {};
    if (!code.trim()) e.code = 'Укажите код';
    else if (code.length < 3) e.code = 'Минимум 3 символа';
    else if (code.length > 20) e.code = 'Максимум 20 символов';
    if (!discountValue || Number(discountValue) <= 0) e.discountValue = 'Укажите скидку > 0';
    if (discountType === 'percentage' && Number(discountValue) > 100) e.discountValue = 'Максимум 100%';
    return e;
  }, [code, discountType, discountValue]);

  const handleSubmit = useCallback(async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    await onSubmit({
      code: code.trim(),
      description: description.trim() || undefined,
      discount_type: discountType,
      discount_value: Number(discountValue),
      min_order_amount: minOrder ? Number(minOrder) : undefined,
      max_uses: maxUses ? Number(maxUses) : undefined,
      valid_until: validUntil || undefined,
    });
  }, [code, description, discountType, discountValue, minOrder, maxUses, validUntil, onSubmit, validate]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-zinc-800 rounded-xl p-4 space-y-3 border border-zinc-700"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-white font-medium text-sm">Новый промокод</h4>
        <button onClick={onCancel} className="p-1 rounded-full hover:bg-zinc-700" aria-label="Закрыть">
          <X className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      <FormField label="Код промокода" error={errors.code}>
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
          placeholder="SUMMER2026"
          maxLength={20}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm font-mono placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </FormField>

      <FormField label="Описание (необязательно)">
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Летняя распродажа"
          maxLength={100}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Тип скидки">
          <select
            value={discountType}
            onChange={e => setDiscountType(e.target.value as 'percentage' | 'fixed')}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="percentage">Процент (%)</option>
            <option value="fixed">Фиксированная (₽)</option>
          </select>
        </FormField>

        <FormField label="Размер скидки" error={errors.discountValue}>
          <input
            type="number"
            value={discountValue}
            onChange={e => setDiscountValue(e.target.value)}
            placeholder={discountType === 'percentage' ? '10' : '500'}
            min={1}
            max={discountType === 'percentage' ? 100 : undefined}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Мин. сумма заказа (₽)">
          <input
            type="number"
            value={minOrder}
            onChange={e => setMinOrder(e.target.value)}
            placeholder="0"
            min={0}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </FormField>

        <FormField label="Макс. использований">
          <input
            type="number"
            value={maxUses}
            onChange={e => setMaxUses(e.target.value)}
            placeholder="∞"
            min={1}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </FormField>
      </div>

      <FormField label="Действует до">
        <input
          type="date"
          value={validUntil}
          onChange={e => setValidUntil(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </FormField>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 text-white font-medium text-sm py-3 rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[44px]"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Создать промокод
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// FormField helper
// ---------------------------------------------------------------------------

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-zinc-400 text-xs">{label}</label>
      {children}
      {error && <p className="text-red-400 text-xs" role="alert">{error}</p>}
    </div>
  );
}
