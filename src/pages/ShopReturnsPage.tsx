/**
 * ShopReturnsPage — возвраты покупателя по внутренним заказам (shop_orders).
 *
 * Отличается от MarketplaceReturnsPage:
 *  - работает с shop_orders вместо marketplace_orders
 *  - нет marketplace-специфичных полей (connection_id, marketplace_order_id)
 *  - использует те же 4 шага: выбор заказа → выбор товаров → причина → подтверждение
 *
 * Бэкенд-таблица: marketplace_returns (уже создана в migration 20260426000000)
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, RotateCcw, Plus, Package, Truck, CheckCircle2,
  Image as ImageIcon, Send, ChevronDown, Clock, AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase, dbLoose } from '@/lib/supabase';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { useCheckout } from '@/hooks/useCheckout';

// ── Типы ─────────────────────────────────────────────────────────────────────

interface ShopOrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

interface ShopDeliveredOrder {
  id: string;
  shop_id: string;
  total_amount: number;
  created_at: string;
  status: string;
  items: ShopOrderItem[];
}

interface ShopReturn {
  id: string;
  order_id: string;
  marketplace_order_id: string;
  product_ids: string[];
  product_titles: string[];
  reason: string;
  reason_detail: string;
  photos: string[];
  status: 'pending' | 'approved' | 'rejected' | 'shipped_to_warehouse' | 'received' | 'refunded' | 'cancelled';
  refund_amount: number | null;
  refund_method: string | null;
  admin_comment: string | null;
  created_at: string;
  updated_at: string;
}

type Step = 'list' | 'select-order' | 'select-items' | 'reason' | 'submit';

const REASONS: Record<string, string> = {
  wrong_item:       'Не тот товар',
  damaged:          'Товар повреждён',
  not_as_described: 'Не соответствует описанию',
  changed_mind:     'Передумал покупать',
  quality_issue:    'Проблемы с качеством',
  other:            'Другое',
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:              { label: 'Ожидает рассмотрения', color: 'text-yellow-400' },
  approved:             { label: 'Одобрен',               color: 'text-blue-400'    },
  rejected:             { label: 'Отклонён',               color: 'text-red-400'     },
  shipped_to_warehouse: { label: 'Отправлен на склад',    color: 'text-purple-400'  },
  received:             { label: 'Получен на складе',      color: 'text-indigo-400'  },
  refunded:             { label: 'Деньги возвращены',     color: 'text-green-400'   },
  cancelled:            { label: 'Отменён',                color: 'text-zinc-400'    },
};

// ─────────────────────────────────────────────────────────────────────────────

export default function ShopReturnsPage() {
  const navigate = useNavigate();
  const { getMyOrders } = useCheckout();

  const [step, setStep]             = useState<Step>('list');
  const [loading, setLoading]       = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [returns, setReturns]       = useState<ShopReturn[]>([]);
  const [orders, setOrders]         = useState<ShopDeliveredOrder[]>([]);
  const [selectedOrder, setSelectedOrder]         = useState<ShopDeliveredOrder | null>(null);
  const [selectedItemIndices, setSelectedItemIndices] = useState<number[]>([]);
  const [selectedReason, setSelectedReason]       = useState('other');
  const [reasonDetail, setReasonDetail]           = useState('');
  const [submitting, setSubmitting]               = useState(false);

  // ── Загрузка возвратов (из marketplace_returns, привязанных к пользователю) ──
  const loadReturns = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }
      const { data, error } = await dbLoose
        .from('marketplace_returns')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setReturns((data ?? []) as ShopReturn[]);
    } catch (e: any) {
      logger.error('[ShopReturns] Ошибка загрузки', { error: e.message });
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  // ── Загрузка доставленных внутренних заказов ────────────────────────────────
  const loadDeliveredOrders = useCallback(async (onDone?: () => void) => {
    setLoadingOrders(true);
    try {
      const all = (await getMyOrders()) ?? [];
      setOrders(all
        .filter((o: any) => o.status === 'delivered')
        .map((o: any) => ({
          id: o.id,
          shop_id: o.shop_id ?? '',
          total_amount: o.total_amount ?? 0,
          created_at: o.created_at,
          status: o.status,
          items: (Array.isArray(o.items) ? o.items : []).map((it: any) => ({
            productId: it.productId ?? '',
            name: it.name ?? `Товар ${it.productId?.slice(0, 8)}`,
            quantity: it.quantity ?? 1,
            price: it.price ?? 0,
          })),
        })) as ShopDeliveredOrder[]);
      onDone?.();
    } catch (e: any) {
      toast.error('Не удалось загрузить заказы');
      logger.error('[ShopReturns] Ошибка заказа', { error: e.message });
    } finally {
      setLoadingOrders(false);
    }
  }, [getMyOrders]);

  // ── Отправка заявки ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!selectedOrder || selectedItemIndices.length === 0) return;
    if (!selectedReason) { toast.error('Выберите причину'); return; }
    if (!reasonDetail.trim()) { toast.error('Опишите причину'); return; }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Не авторизованы'); setSubmitting(false); return; }

      const items = selectedItemIndices.map(i => selectedOrder!.items[i]);
      const productIds = items.map(_i => crypto.randomUUID());
      const product_titles = items.map(i => i.name);

      const { error } = await dbLoose
        .from('marketplace_returns')
        .insert({
          user_id:            user.id,
          order_id:           selectedOrder.id,
          marketplace_order_id: selectedOrder.id.slice(0, 8),
          marketplace:        'internal',
          product_ids:        productIds,
          product_titles,
          reason:       selectedReason,
          reason_detail:reasonDetail.trim(),
          photos:       [],
          status:       'pending',
        });

      if (error) throw error;
      toast.success('Заявка на возврат отправлена');
      setStep('list');
      void loadReturns();
    } catch (e: any) {
      toast.error('Ошибка: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  }, [selectedOrder, selectedItemIndices, selectedReason, reasonDetail, loadReturns]);

  const resetToList = useCallback(() => {
    setStep('list');
    setSelectedOrder(null);
    setSelectedItemIndices([]);
    setSelectedReason('other');
    setReasonDetail('');
  }, []);

  // ── Эффекты ─────────────────────────────────────────────────────────────────
  useEffect(() => { void loadReturns(); }, [loadReturns]);

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: список возвратов
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'list') {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800 flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">Возвраты</h1>
          <button
            onClick={() => { resetToList(); void loadDeliveredOrders(() => setStep('select-order')); }}
            className="ml-auto flex items-center gap-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Новый возврат
          </button>
        </div>

        <div className="px-4 py-4 max-w-2xl mx-auto">
          {loading ? (
            <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : returns.length === 0 ? (
            <div className="text-center py-16 bg-zinc-900/50 rounded-2xl">
              <RotateCcw className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400 text-sm">Возвратов пока нет</p>
            </div>
          ) : (
            <AnimatePresence>
              {returns.map((r, i) => {
                const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
                return (
                  <motion.div key={r.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                    className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-zinc-500">Заказ {r.marketplace_order_id}</p>
                        <p className="text-white text-sm font-medium mt-0.5">{r.product_titles.join(', ')}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    {r.status === 'refunded' && r.refund_amount != null && (
                      <p className="text-green-400 text-sm">✓ Возвращено {r.refund_amount.toLocaleString()} ₽</p>
                    )}
                    {r.admin_comment && (
                      <div className="bg-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-400 border-l-2 border-blue-500">
                        <span className="text-zinc-500">Поддержка: </span>{r.admin_comment}
                      </div>
                    )}
                    <p className="text-zinc-500 text-[10px]">{new Date(r.created_at).toLocaleString('ru-RU')}</p>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: шаг 1 — выбор заказа
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'select-order') {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800 flex items-center gap-3 px-4 py-3">
          <button onClick={resetToList} className="text-zinc-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="font-bold text-lg">Выберите заказ</h1>
        </div>
        <div className="px-4 py-4 space-y-3 max-w-2xl mx-auto">
          {loadingOrders ? <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
          : orders.length === 0 ? (
            <div className="text-center py-16 bg-zinc-900/50 rounded-2xl"><Package className="w-12 h-12 text-zinc-600 mx-auto mb-4" /><p className="text-zinc-400 text-sm">Нет доставленных заказов</p></div>
          ) : orders.map(order => (
            <button key={order.id} onClick={() => { setSelectedOrder(order); setSelectedItemIndices([]); setStep('select-items'); }}
              className="w-full bg-zinc-900 rounded-2xl p-4 border border-zinc-800 text-left hover:border-zinc-600 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-zinc-500">{order.id.slice(0, 8)}…</p>
                  <p className="text-white text-sm font-medium mt-0.5">{order.items.length} товар{order.items.length > 1 ? 'ов' : ''}</p>
                  <p className="text-zinc-400 text-xs mt-0.5">{new Date(order.created_at).toLocaleDateString('ru-RU')} · {order.total_amount.toLocaleString()} ₽</p>
                </div>
                <ChevronDown className="w-4 h-4 text-zinc-500 rotate-[-90deg]" />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: шаг 2 — выбор товаров
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'select-items' && selectedOrder) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800 flex items-center gap-3 px-4 py-3">
          <button onClick={() => setStep('select-order')} className="text-zinc-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="font-bold text-lg">Выберите товары</h1>
          <button disabled={selectedItemIndices.length === 0} onClick={() => setStep('reason')}
            className="ml-auto bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 text-white px-4 py-1.5 rounded-lg text-sm">Далее</button>
        </div>
        <div className="px-4 py-4 space-y-2 max-w-2xl mx-auto">
          <p className="text-zinc-400 text-sm">Выбрано: {selectedItemIndices.length}</p>
          {selectedOrder.items.map((item, idx) => {
            const checked = selectedItemIndices.includes(idx);
            return (
              <button key={idx} onClick={() => setSelectedItemIndices(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])}
                className={`w-full rounded-2xl p-4 border transition-colors text-left ${checked ? 'bg-blue-500/10 border-blue-500/40' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${checked ? 'border-blue-500 bg-blue-500' : 'border-zinc-600'}`}>
                    {checked && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{item.name}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">×{item.quantity} · {(item.price * item.quantity).toLocaleString()} ₽</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: шаг 3 — причина
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'reason') {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800 flex items-center gap-3 px-4 py-3">
          <button onClick={() => setStep('select-items')} className="text-zinc-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="font-bold text-lg">Причина возврата</h1>
        </div>
        <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(REASONS).map(([key, label]) => (
              <button key={key} onClick={() => setSelectedReason(key)}
                className={`rounded-2xl p-3 border text-left transition-colors ${selectedReason === key ? 'bg-blue-500/10 border-blue-500/40 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}>
                <p className="text-xs">{label}</p>
              </button>
            ))}
          </div>
          <div>
            <label className="text-zinc-400 text-sm mb-1.5 block">Детали</label>
            <textarea value={reasonDetail} onChange={e => setReasonDetail(e.target.value)} rows={4}
              placeholder="Опишите подробнее причину возврата..."
              className="w-full bg-zinc-900 text-white placeholder-zinc-600 rounded-xl p-4 text-sm resize-none outline-none border border-zinc-800 focus:border-blue-500" />
          </div>
          <button disabled={!reasonDetail.trim()} onClick={() => setStep('submit')}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white py-4 rounded-2xl font-semibold">
            <Send className="w-4 h-4" /> Продолжить
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: шаг 4 — подтверждение
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'submit' && selectedOrder) {
    const items = selectedItemIndices.map(i => selectedOrder!.items[i]);
    const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

    return (
      <div className="min-h-screen bg-black text-white">
        <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800 flex items-center gap-3 px-4 py-3">
          <button onClick={() => setStep('reason')} className="text-zinc-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="font-bold text-lg">Подтвердить возврат</h1>
        </div>
        <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto">
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 space-y-3">
            <div className="flex justify-between text-sm"><span className="text-zinc-400">Заказ</span><span className="text-white font-mono">{selectedOrder.id.slice(0, 8)}…</span></div>
            <div className="flex justify-between text-sm"><span className="text-zinc-400">Причина</span><span className="text-white">{REASONS[selectedReason] ?? selectedReason}</span></div>
            <div className="border-t border-zinc-800 pt-3 space-y-1">
              <p className="text-zinc-400 text-xs uppercase">Товары на возврат</p>
              {items.map((it, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{it.name}</span>
                  <span className="text-zinc-500">×{it.quantity}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-zinc-800">
                <span className="text-zinc-400 text-sm">Сумма к возврату</span>
                <span className="text-white font-bold">{total.toLocaleString()} ₽</span>
              </div>
            </div>
          </div>
          <button onClick={handleSubmit} disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-white text-black font-bold py-4 rounded-2xl text-base active:scale-95 transition-transform disabled:opacity-50">
            <CheckCircle2 className="w-5 h-5" />
            {submitting ? 'Отправляем…' : 'Подтвердить заявку'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
