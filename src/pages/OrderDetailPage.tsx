import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, MapPin, Loader2, CheckCircle2, Clock, Truck, XCircle } from 'lucide-react';
import { supabase, dbLoose } from '@/lib/supabase';
import { toast } from 'sonner';

type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

interface ShopOrder {
  id: string;
  status: OrderStatus;
  total_amount: number;
  currency: string;
  shipping_address: Record<string, string> | null;
  created_at: string;
  shop_id: string;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; icon: typeof CheckCircle2; color: string }> = {
  pending:   { label: 'Ожидает подтверждения', icon: Clock,         color: 'text-yellow-400' },
  confirmed: { label: 'Подтверждён',           icon: CheckCircle2,  color: 'text-blue-400'   },
  shipped:   { label: 'Отправлен',              icon: Truck,         color: 'text-indigo-400' },
  delivered: { label: 'Доставлен',              icon: CheckCircle2,  color: 'text-green-400'  },
  cancelled: { label: 'Отменён',               icon: XCircle,       color: 'text-red-400'    },
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      setLoading(true);
      try {
        const { data, error } = await dbLoose
          .from('shop_orders')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        setOrder(data as unknown as ShopOrder);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Ошибка загрузки заказа';
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 px-6 text-center">
        <Package className="w-12 h-12 text-zinc-600" />
        <p className="text-white font-semibold">Заказ не найден</p>
        <p className="text-zinc-500 text-sm">Возможно, он был удалён или принадлежит другому аккаунту.</p>
        <button
          onClick={() => navigate('/shop')}
          className="mt-2 px-6 py-2 rounded-xl bg-zinc-800 text-white text-sm"
        >
          В магазин
        </button>
      </div>
    );
  }

  const status = (order.status ?? 'pending') as OrderStatus;
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;
  const addr = order.shipping_address;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-lg">Заказ</h1>
      </div>

      <div className="px-4 py-6 space-y-6 max-w-lg mx-auto">
        {/* Status */}
        <div className="flex items-center gap-3 bg-zinc-900 rounded-2xl p-4">
          <StatusIcon className={`w-6 h-6 ${cfg.color}`} />
          <div>
            <p className="font-semibold text-white">{cfg.label}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {new Date(order.created_at).toLocaleString('ru-RU')}
            </p>
          </div>
        </div>

        {/* Order ID */}
        <div className="bg-zinc-900 rounded-2xl p-4 space-y-1">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Номер заказа</p>
          <p className="font-mono text-sm text-zinc-300 break-all">{order.id}</p>
        </div>

        {/* Total */}
        <div className="bg-zinc-900 rounded-2xl p-4 flex items-center justify-between">
          <span className="text-zinc-400 text-sm">Итого</span>
          <span className="font-bold text-white text-lg">
            {Number(order.total_amount).toLocaleString('ru-RU')} {order.currency ?? 'RUB'}
          </span>
        </div>

        {/* Delivery address */}
        {addr && (
          <div className="bg-zinc-900 rounded-2xl p-4 space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wide flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> Адрес доставки
            </p>
            {addr.fullName && <p className="text-white text-sm">{addr.fullName}</p>}
            {addr.phone && <p className="text-zinc-400 text-sm">{addr.phone}</p>}
            {(addr.city || addr.street || addr.building) && (
              <p className="text-zinc-300 text-sm">
                {[addr.postalCode, addr.city, addr.street, addr.building, addr.apartment]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Back to shop */}
        <button
          onClick={() => navigate('/shop')}
          className="w-full py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition-colors"
        >
          Продолжить покупки
        </button>
      </div>
    </div>
  );
}
