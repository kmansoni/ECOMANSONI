import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, MapPin, Truck, CreditCard, DollarSign, ChevronRight } from 'lucide-react';
import { useCheckout, type DeliveryAddress } from '@/hooks/useCheckout';
import { toast } from 'sonner';

const DELIVERY_METHODS = [
  { id: 'courier', label: 'Курьер', description: 'Доставка до двери', cost: 350, icon: Truck },
  { id: 'pickup', label: 'Самовывоз', description: 'Из пункта выдачи', cost: 0, icon: MapPin },
  { id: 'mail', label: 'Почта России', description: '3–7 дней', cost: 200, icon: ChevronRight },
] as const;

const PAYMENT_METHODS = [
  { id: 'card', label: 'Банковская карта', icon: CreditCard },
  { id: 'cash', label: 'При получении', icon: DollarSign },
] as const;

export default function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { createOrder, loading } = useCheckout();

  const cartItems = (location.state as any)?.items ?? [];
  const shopId = (location.state as any)?.shopId ?? '';
  const itemsTotal: number = cartItems.reduce((s: number, i: any) => s + i.price * (i.quantity ?? 1), 0);

  const [address, setAddress] = useState<Partial<DeliveryAddress>>({
    fullName: '',
    phone: '',
    city: '',
    street: '',
    building: '',
    apartment: '',
    postalCode: '',
  });
  const [deliveryMethod, setDeliveryMethod] = useState<'courier' | 'pickup' | 'mail'>('courier');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');

  const deliveryCost = DELIVERY_METHODS.find(d => d.id === deliveryMethod)?.cost ?? 0;
  const totalAmount = itemsTotal + deliveryCost;

  const set = (field: keyof DeliveryAddress, value: string) =>
    setAddress(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    const order = await createOrder({
      items: cartItems,
      address: address as DeliveryAddress,
      deliveryMethod,
      paymentMethod,
      shopId,
      totalAmount,
      deliveryCost,
    });
    if (order) {
      toast.success('Заказ оформлен!');
      navigate(`/orders/${order.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-lg">Оформление заказа</h1>
      </div>

      <div className="px-4 py-4 space-y-6 pb-32">
        {/* Delivery address */}
        <section className="space-y-3">
          <h2 className="font-semibold text-zinc-300 flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Адрес доставки
          </h2>
          <div className="space-y-2">
            {[
              { field: 'fullName', label: 'Имя получателя', placeholder: 'Иванов Иван Иванович' },
              { field: 'phone', label: 'Телефон', placeholder: '+7 900 000 00 00' },
              { field: 'city', label: 'Город', placeholder: 'Москва' },
              { field: 'street', label: 'Улица', placeholder: 'ул. Пушкина' },
              { field: 'building', label: 'Дом', placeholder: '10' },
              { field: 'apartment', label: 'Квартира', placeholder: '25 (необязательно)' },
              { field: 'postalCode', label: 'Индекс', placeholder: '123456' },
            ].map(({ field, label, placeholder }) => (
              <div key={field}>
                <label className="text-zinc-500 text-xs mb-1 block">{label}</label>
                <input
                  type="text"
                  value={(address as any)[field] ?? ''}
                  onChange={e => set(field as keyof DeliveryAddress, e.target.value)}
                  placeholder={placeholder}
                  className="w-full bg-zinc-900 text-white placeholder-zinc-600 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-zinc-600"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Delivery method */}
        <section className="space-y-3">
          <h2 className="font-semibold text-zinc-300 flex items-center gap-2">
            <Truck className="w-4 h-4" /> Способ доставки
          </h2>
          <div className="space-y-2">
            {DELIVERY_METHODS.map(m => (
              <label
                key={m.id}
                className={`flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  deliveryMethod === m.id ? 'border-white bg-white/5' : 'border-zinc-800 bg-zinc-900'
                }`}
              >
                <input
                  type="radio"
                  name="delivery"
                  value={m.id}
                  checked={deliveryMethod === m.id}
                  onChange={() => setDeliveryMethod(m.id)}
                  className="sr-only"
                />
                <div>
                  <p className="text-white font-medium">{m.label}</p>
                  <p className="text-zinc-500 text-xs">{m.description}</p>
                </div>
                <span className="text-white font-semibold">
                  {m.cost === 0 ? 'Бесплатно' : `${m.cost} ₽`}
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* Payment method */}
        <section className="space-y-3">
          <h2 className="font-semibold text-zinc-300 flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Способ оплаты
          </h2>
          <div className="space-y-2">
            {PAYMENT_METHODS.map(m => (
              <label
                key={m.id}
                className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  paymentMethod === m.id ? 'border-white bg-white/5' : 'border-zinc-800 bg-zinc-900'
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  value={m.id}
                  checked={paymentMethod === m.id}
                  onChange={() => setPaymentMethod(m.id)}
                  className="sr-only"
                />
                <m.icon className="w-5 h-5 text-zinc-400" />
                <span className="text-white font-medium">{m.label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Summary */}
        <section className="bg-zinc-900 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Товары ({cartItems.length})</span>
            <span className="text-white">{itemsTotal.toLocaleString('ru-RU')} ₽</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Доставка</span>
            <span className="text-white">{deliveryCost === 0 ? 'Бесплатно' : `${deliveryCost} ₽`}</span>
          </div>
          <div className="flex justify-between font-bold text-lg pt-2 border-t border-zinc-800">
            <span className="text-white">Итого</span>
            <span className="text-white">{totalAmount.toLocaleString('ru-RU')} ₽</span>
          </div>
        </section>
      </div>

      {/* Submit */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-black/90 backdrop-blur border-t border-zinc-800">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-white text-black font-bold py-4 rounded-2xl text-base disabled:opacity-50 active:scale-95 transition-transform"
        >
          {loading ? 'Оформляем...' : `Оформить заказ · ${totalAmount.toLocaleString('ru-RU')} ₽`}
        </button>
      </div>
    </div>
  );
}
