import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Home, Briefcase, MapPin, CreditCard, Wallet,
  Smartphone, Building, Edit2, Check, X, Car
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { PaymentMethod, FavoriteAddress } from '@/types/taxi';
import { getFavoriteAddresses, saveFavoriteAddress, getPaymentMethod, updatePaymentMethod } from '@/lib/taxi/api';
import { formatPaymentMethod } from '@/lib/taxi/formatters';

const PAYMENT_METHODS: Array<{ id: PaymentMethod; label: string; icon: React.ElementType }> = [
  { id: 'card', label: '💳 Банковская карта', icon: CreditCard },
  { id: 'cash', label: '💵 Наличные', icon: Wallet },
  { id: 'apple_pay', label: '🍎 Apple Pay', icon: Smartphone },
  { id: 'google_pay', label: '🌐 Google Pay', icon: Smartphone },
  { id: 'corporate', label: '🏢 Корпоративный', icon: Building },
];

export default function TaxiSettingsPage() {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<FavoriteAddress[]>([]);
  const [paymentMethod, setPayment] = useState<PaymentMethod>('card');
  const [editingFav, setEditingFav] = useState<string | null>(null);
  const [editAddress, setEditAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Загрузить данные
  useEffect(() => {
    getFavoriteAddresses().then(setFavorites);
    getPaymentMethod().then(setPayment);
  }, []);

  // ─── Сохранить адрес ──────────────────────────────────────────────────────
  const handleSaveFavorite = async (fav: FavoriteAddress) => {
    if (!editAddress.trim()) return;
    setIsSaving(true);
    try {
      const updated = await saveFavoriteAddress({
        type: fav.type,
        label: fav.label,
        address: editAddress,
        coordinates: fav.coordinates, // В production: геокодировать адрес
      });
      setFavorites((prev) => prev.map((f) => (f.id === fav.id ? updated : f)));
      setEditingFav(null);
      setEditAddress('');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Сменить способ оплаты ────────────────────────────────────────────────
  const handlePaymentChange = async (method: PaymentMethod) => {
    setPayment(method);
    await updatePaymentMethod(method);
  };

  const favIcons: Record<string, React.ElementType> = {
    home: Home,
    work: Briefcase,
    custom: MapPin,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3 pt-safe">
          <button
            onClick={() => navigate('/taxi')}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
            aria-label="Назад"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold">Настройки такси</h1>
        </div>
      </div>

      {/* Контент */}
      <div className="px-4 py-6 space-y-8">

        {/* Избранные адреса */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Сохранённые адреса
          </h2>
          <div className="space-y-2">
            {[
              { id: 'home', type: 'home' as const, label: 'Дом', icon: '🏠' },
              { id: 'work', type: 'work' as const, label: 'Работа', icon: '💼' },
            ].map((item) => {
              const existing = favorites.find((f) => f.type === item.type);
              const isEditing = editingFav === item.id;

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-muted/50 border border-border"
                >
                  <span className="text-2xl flex-shrink-0">{item.icon}</span>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{item.label}</div>
                    {isEditing ? (
                      <input
                        type="text"
                        autoFocus
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        placeholder="Введите адрес"
                        className="mt-1 w-full text-sm bg-background border border-blue-400 rounded-lg px-2 py-1 outline-none"
                      />
                    ) : (
                      <div className="text-xs text-muted-foreground truncate">
                        {existing?.address || 'Не задан'}
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSaveFavorite({ ...item, address: editAddress, coordinates: { lat: 55.7558, lng: 37.6173 } })}
                        disabled={isSaving || !editAddress.trim()}
                        className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingFav(null); setEditAddress(''); }}
                        className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFav(item.id);
                        setEditAddress(existing?.address ?? '');
                      }}
                      className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
                    >
                      <Edit2 className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Способ оплаты */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Способ оплаты по умолчанию
          </h2>
          <div className="space-y-2">
            {PAYMENT_METHODS.map((method) => {
              const isSelected = paymentMethod === method.id;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => handlePaymentChange(method.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3.5 rounded-2xl',
                    'border-2 transition-all text-left',
                    isSelected
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-border bg-muted/50 hover:border-gray-300'
                  )}
                >
                  <span className="text-xl flex-shrink-0">{method.label.charAt(0)}</span>
                  <span className={cn('flex-1 text-sm font-medium', isSelected && 'text-blue-700')}>
                    {method.label}
                  </span>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Ссылка на историю */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Поездки
          </h2>
          <button
            type="button"
            onClick={() => navigate('/taxi/history')}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-muted/50 border border-border hover:bg-muted transition-colors"
          >
            <span className="text-sm font-medium">История поездок</span>
            <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
          </button>

          <button
            type="button"
            onClick={() => navigate('/taxi/driver')}
            className="w-full mt-2 flex items-center justify-between p-3.5 rounded-2xl bg-muted/50 border border-border hover:bg-muted transition-colors"
          >
            <span className="text-sm font-medium flex items-center gap-2">
              <Car className="h-4 w-4" />
              Режим водителя
            </span>
            <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
          </button>
        </section>
      </div>
    </div>
  );
}
