/**
 * MarketplaceReturnsPage — страница возвратов покупателя B2C.
 *
 * Цикл заявки на возврат:
 *  1. Выбор заказа и товаров (есть только для доставленных заказов из marketplace_orders)
 *  2. Выбор причины и описание
 *  3. Отправка заявки (INSERT в marketplace_returns)
 *  4. Отслеживание статуса возврата
 *
 * Бэкенд-таблица: marketplace_returns (сущется в миграции marketplace_platform.sql)
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, RotateCcw, Plus, X, Package, Truck, CheckCircle2, Clock, AlertCircle,
  Image as ImageIcon, Send, ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase, dbLoose } from '@/lib/supabase';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

// ── UI helpers (локальные, без внешних зависимостей) ──────────────────────────

const RETURN_REASONS: Record<string, { label: string; icon: string }> = {
  wrong_item:        { label: 'Не тот товар',             icon: '📦' },
  damaged:           { label: 'Товар повреждён',           icon: '⚠️' },
  not_as_described:  { label: 'Не соответствует описанию', icon: '❓' },
  changed_mind:      { label: 'Передумал покупать',        icon: '🤔' },
  quality_issue:     { label: 'Проблемы с качеством',      icon: '🔧' },
  other:             { label: 'Другое',                    icon: '💬' },
};

interface MarketplaceDeliveredOrder {
  id: string;
  connection_id: string;
  marketplace_order_id: string;
  marketplace: string;
  total_amount: number;
  ordered_at: string;
  order_items: { sku: string; name: string; quantity: number; price?: number }[];
  delivery_address?: any;
}

// B2C заказы покупателя — берём из shop_orders
interface ShopOrderForReturn {
  id: string;
  shop_order_id?: string;
  total_amount: number;
  created_at: string;
  items: { product_id: string; product_name: string; quantity: number; price?: number }[];
  status: string;
}

interface MarketplaceReturn {
  id: string;
  order_id: string;
  connection_id?: string;
  marketplace_order_id: string;
  marketplace: string;
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

type Step = 'select-order' | 'select-items' | 'reason' | 'submit' | 'list';

const RETURN_STATUS_CONFIG: Record<MarketplaceReturn['status'], { label: string; color: string }> = {
  pending:              { label: 'Ожидает рассмотрения', color: 'text-yellow-400 bg-yellow-500/10' },
  approved:             { label: 'Одобрен',               color: 'text-blue-400    bg-blue-500/10'    },
  rejected:             { label: 'Отклонён',               color: 'text-red-400     bg-red-500/10'     },
  shipped_to_warehouse: { label: 'Отправлен на склад',    color: 'text-purple-400  bg-purple-500/10'  },
  received:             { label: 'Получен на складе',      color: 'text-indigo-400  bg-indigo-500/10'  },
  refunded:             { label: 'Деньги возвращены',     color: 'text-green-400   bg-green-500/10'   },
  cancelled:            { label: 'Отменён',                color: 'text-zinc-400    bg-zinc-500/10'    },
};

// ─────────────────────────────────────────────────────────────────────────────

export default function MarketplaceReturnsPage() {
  const navigate = useNavigate();

  const [step, setStep]                           = useState<Step>('list');
  const [loadingReturns, setLoadingReturns]       = useState(false);
  const [loadingOrders, setLoadingOrders]         = useState(false);
  const [returns, setReturns]                     = useState<MarketplaceReturn[]>([]);
  const [deliveredOrders, setDeliveredOrders]     = useState<MarketplaceDeliveredOrder[]>([]);
  const [selectedOrder, setSelectedOrder]         = useState<MarketplaceDeliveredOrder | null>(null);
  const [selectedItemIds, setSelectedItemIds]     = useState<string[]>([]);
  const [selectedReason, setSelectedReason]       = useState<string>('other');
  const [reasonDetail, setReasonDetail]           = useState('');
  const [selectedPhotos, setSelectedPhotos]       = useState<string[]>([]);
  const [submitting, setSubmitting]               = useState(false);

  // ── Загрузка списка возвратов ──────────────────────────────────────────────
  useEffect(() => {
    void loadReturns();
  }, []);

  const loadReturns = useCallback(async () => {
    setLoadingReturns(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/login'); return; }

      const { data, error } = await dbLoose
        .from('marketplace_returns')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReturns((data ?? []) as MarketplaceReturn[]);
    } catch (e: any) {
      logger.error('[Returns] Ошибка загрузки возвратов', { error: e.message });
    } finally {
      setLoadingReturns(false);
    }
  }, [navigate]);

  // ── Загрузка доставленных заказов покупателя для выбора ───────────────────────
  const loadDeliveredOrders = useCallback(async (onDone?: () => void) => {
    setLoadingOrders(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // B2C: берём доставленные заказы покупателя из shop_orders
      const { data, error } = await dbLoose
        .from('shop_orders')
        .select('id, shop_id, buyer_id, total_amount, created_at, items, status, shipping_address')
        .eq('buyer_id', user.id)
        .eq('status', 'delivered')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Маппим на внутренний тип
      const mapped: MarketplaceDeliveredOrder[] = (data ?? []).map((o: any) => ({
        id: o.id,
        connection_id: o.shop_id,
        marketplace_order_id: o.id.slice(0, 8),
        marketplace: 'internal',
        total_amount: o.total_amount,
        ordered_at: o.created_at,
        order_items: (o.items || []).map((i: any) => ({
          sku: i.productId || i.sku,
          name: i.productName || i.name || 'Товар',
          quantity: i.quantity,
          price: i.price,
        })),
        delivery_address: o.shipping_address,
      }));

      setDeliveredOrders(mapped);
      onDone?.();
    } catch (e: any) {
      logger.error('[Returns] Ошибка загрузки заказов', { error: e.message });
      toast.error('Не удалось загрузить заказы');
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  // ── Отправка заявки на возврат ─────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!selectedOrder || selectedItemIds.length === 0) { toast.error('Выберите товары'); return; }
    if (!selectedReason)                       { toast.error('Выберите причину возврата'); return; }
    if (!reasonDetail.trim())                  { toast.error('Опишите причину возврата'); return; }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Не авторизованы'); setSubmitting(false); return; }

      const items = selectedOrder.order_items.filter((oi: any) => selectedItemIds.includes(oi.sku));
      const productIds   = items.map((_oi: any, i: number) => crypto.randomUUID());
      const productTitles = items.map((oi: any) => oi.name);

      const { data, error } = await dbLoose
        .from('marketplace_returns')
        .insert({
          user_id:            user.id,
          order_id:           selectedOrder.id,
          connection_id:      selectedOrder.connection_id ?? null,
          marketplace_order_id: selectedOrder.marketplace_order_id,
          marketplace:        selectedOrder.marketplace,
          product_ids:       productIds,
          product_titles,
          reason:            selectedReason,
          reason_detail:     reasonDetail.trim(),
          photos:            selectedPhotos,
          status:            'pending',
          refund_amount:     null,
          refund_method:     null,
        })
        .select()
        .single();

      if (error) throw error;
      toast.success('Заявка на возврат отправлена');
      setStep('list');
      await loadReturns();
    } catch (e: any) {
      toast.error('Ошибка подачи заявки: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  }, [selectedOrder, selectedItemIds, selectedReason, reasonDetail, selectedPhotos, loadReturns]);

  // ── Сброс формы и начало новой заявки ─────────────────────────────────────
  const startNewReturn = useCallback(async () => {
    setSelectedOrder(null);
    setSelectedItemIds([]);
    setSelectedReason('other');
    setReasonDetail('');
    setSelectedPhotos([]);
    await loadDeliveredOrders(() => setStep('select-order'));
  }, [loadDeliveredOrders]);

  // ── Полный сброс к списку ──────────────────────────────────────────────────
  const resetToList = useCallback(() => {
    setStep('list');
    setSelectedOrder(null);
    setSelectedItemIds([]);
    setSelectedReason('other');
    setReasonDetail('');
    setSelectedPhotos([]);
  }, []);

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
            onClick={startNewReturn}
            className="ml-auto flex items-center gap-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Новый возврат
          </button>
        </div>

        <div className="px-4 py-4 space-y-3 max-w-2xl mx-auto">
          {loadingReturns ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : returns.length === 0 ? (
            <div className="text-center py-16 bg-zinc-900/50 rounded-2xl">
              <RotateCcw className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400 text-sm">Возвратов пока нет</p>
            </div>
          ) : (
            <AnimatePresence>
              {returns.map((r, i) => {
                const cfg = RETURN_STATUS_CONFIG[r.status] ?? RETURN_STATUS_CONFIG.pending;
                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs text-zinc-500">{r.marketplace_order_id}</p>
                        <p className="text-white text-sm font-medium mt-0.5">
                          {RETURN_REASONS[r.reason]?.icon} {RETURN_REASONS[r.reason]?.label ?? r.reason}
                        </p>
                        <p className="text-zinc-400 text-xs mt-0.5">
                          {r.product_titles.join(', ')}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    {r.status === 'refunded' && r.refund_amount != null && (
                      <p className="text-green-400 text-sm">
                        ✓ Возвращено {r.refund_amount.toLocaleString()} ₽
                        {r.refund_method ? ` (${r.refund_method})` : ''}
                      </p>
                    )}
                    {r.admin_comment && (
                      <div className="bg-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-400 border-l-2 border-blue-500">
                        <span className="text-zinc-500">Примечание от поддержки: </span>
                        {r.admin_comment}
                      </div>
                    )}
                    <p className="text-zinc-500 text-[10px]">
                      {new Date(r.created_at).toLocaleString('ru-RU')}
                    </p>
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
          <button onClick={resetToList} className="text-zinc-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">Выберите заказ</h1>
        </div>

        <div className="px-4 py-4 space-y-3 max-w-2xl mx-auto">
          {loadingOrders ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : deliveredOrders.length === 0 ? (
            <div className="text-center py-16 bg-zinc-900/50 rounded-2xl">
              <Package className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400 text-sm">Нет доставленных заказов для возврата</p>
            </div>
          ) : (
            deliveredOrders.map((order) => (
              <button
                key={order.id}
                onClick={() => {
                  setSelectedOrder(order);
                  setSelectedItemIds([]);
                  setStep('select-items');
                }}
                className="w-full bg-zinc-900 rounded-2xl p-4 border border-zinc-800 text-left hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-zinc-500">{order.marketplace_order_id}</p>
                    <p className="text-white text-sm font-medium mt-0.5">
                      {order.order_items.length} товар{order.order_items.length > 1 ? 'ов' : ''}
                    </p>
                    <p className="text-zinc-400 text-xs mt-0.5">
                      {new Date(order.ordered_at).toLocaleDateString('ru-RU')} · {order.total_amount.toLocaleString()} ₽
                    </p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-zinc-500 rotate-[-90deg] shrink-0" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: шаг 2 — выбор товаров для возврата
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'select-items' && selectedOrder) {
    const toggleItem = (sku: string) => {
      setSelectedItemIds(prev =>
        prev.includes(sku) ? prev.filter(x => x !== sku) : [...prev, sku]
      );
    };

    return (
      <div className="min-h-screen bg-black text-white">
        <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800 flex items-center gap-3 px-4 py-3">
          <button onClick={() => setStep('select-order')} className="text-zinc-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">Выберите товары</h1>
          <button
            disabled={selectedItemIds.length === 0}
            onClick={() => setStep('reason')}
            className="ml-auto flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white px-4 py-1.5 rounded-lg text-sm transition-colors"
          >
            Далее
          </button>
        </div>

        <div className="px-4 py-4 space-y-2 max-w-2xl mx-auto">
          <p className="text-zinc-400 text-sm mb-2">
            Заказ {selectedOrder.marketplace_order_id} · {selectedItemIds.length} выбрано
          </p>
          {selectedOrder.order_items.map((item) => {
            const checked = selectedItemIds.includes(item.sku);
            return (
              <button
                key={item.sku}
                onClick={() => toggleItem(item.sku)}
                className={`w-full rounded-2xl p-4 border transition-colors text-left ${
                  checked ? 'bg-blue-500/10 border-blue-500/40' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                    checked ? 'border-blue-500 bg-blue-500' : 'border-zinc-600'
                  }`}>
                    {checked && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{item.name}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      SKU: {item.sku} · Количество: {item.quantity}
                    </p>
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
  // RENDER: шаг 3 — выбор причины
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'reason') {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800 flex items-center gap-3 px-4 py-3">
          <button onClick={() => setStep('select-items')} className="text-zinc-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">Причина возврата</h1>
        </div>

        <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto">
          {/* Причины */}
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(RETURN_REASONS).map(([key, { label, icon }]) => (
              <button
                key={key}
                onClick={() => setSelectedReason(key)}
                className={`rounded-2xl p-3 border text-left transition-colors ${
                  selectedReason === key
                    ? 'bg-blue-500/10 border-blue-500/40 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                <span className="text-lg">{icon}</span>
                <p className="text-xs mt-1">{label}</p>
              </button>
            ))}
          </div>

          {/* Описание */}
          <div>
            <label className="text-zinc-400 text-sm mb-1.5 block">Опишите детали</label>
            <textarea
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              rows={4}
              placeholder="Опишите подробнее причину возврата..."
              className="w-full bg-zinc-900 text-white placeholder-zinc-600 rounded-xl p-4 text-sm resize-none outline-none border border-zinc-800 focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Фото (заглушка — в будущем можно интегрировать FilePicker / ImageKit) */}
          <div>
            <label className="text-zinc-400 text-sm mb-1.5 block flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" /> Фото товара (необязательно)
            </label>
            <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded-xl p-4 text-center text-zinc-500 text-xs">
              Прикрепите фото товара. В текущей версии отправляются без изображений.
            </div>
          </div>

          {/* Кнопка продолжить */}
          <button
            disabled={!reasonDetail.trim()}
            onClick={() => setStep('submit')}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white py-4 rounded-2xl font-semibold transition-colors"
          >
            <Send className="w-4 h-4" />
            Отправить заявку
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER: шаг 4 — подтверждение отправки
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'submit' && selectedOrder) {
    const items = selectedOrder.order_items.filter((oi: any) => selectedItemIds.includes(oi.sku));
    const total = items.reduce((s: number, i: any) => s + (i.price || selectedOrder.total_amount / selectedOrder.order_items.length) * i.quantity, 0);

    return (
      <div className="min-h-screen bg-black text-white">
        <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800 flex items-center gap-3 px-4 py-3">
          <button onClick={() => setStep('reason')} className="text-zinc-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">Подтвердить возврат</h1>
        </div>

        <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto">
          {/* Сводка */}
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-zinc-400 text-sm">Заказ</p>
              <p className="text-white text-sm font-mono">{selectedOrder.marketplace_order_id}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-zinc-400 text-sm">Причина</p>
              <p className="text-white text-sm">
                {RETURN_REASONS[selectedReason]?.icon} {RETURN_REASONS[selectedReason]?.label}
              </p>
            </div>
            <div className="border-t border-zinc-800 pt-3 space-y-1">
              <p className="text-zinc-400 text-xs uppercase tracking-wide">Товары на возврат</p>
              {items.map((i: any) => (
                <div key={i.sku} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{i.name}</span>
                  <span className="text-zinc-500">×{i.quantity}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                <p className="text-zinc-400 text-sm">Сумма к возврату</p>
                <p className="text-white font-bold">{total.toLocaleString()} ₽</p>
              </div>
            </div>
          </div>

          <p className="text-zinc-500 text-xs">
            Подтверждая заявку, вы подтверждаете что товар не был использован и сохранён в исходном виде.
            Администратор рассмотрит заявку в течение 1–3 рабочих дней.
          </p>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-white text-black font-bold py-4 rounded-2xl text-base active:scale-95 transition-transform disabled:opacity-50"
          >
            <CheckCircle2 className="w-5 h-5" />
            {submitting ? 'Отправляем…' : 'Подтвердить заявку'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
