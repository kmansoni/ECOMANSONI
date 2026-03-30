import { useState, useCallback } from 'react';
import { MapPin, Navigation, ChevronDown, Tag, X, Loader2, Car, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { UseTaxiOrderReturn } from '@/hooks/taxi/useTaxiOrder';
import type { AddressSuggestion, TaxiAddress, CancellationReason } from '@/types/taxi';
import { AddressInput } from './AddressInput';
import { TariffSelector } from './TariffSelector';
import { PriceEstimate } from './PriceEstimate';
import { DriverCard } from './DriverCard';
import { TripTracker } from './TripTracker';
import { RatingSheet } from './RatingSheet';

// ─── Типы ──────────────────────────────────────────────────────────────────────
interface OrderBottomSheetProps {
  order: UseTaxiOrderReturn;
  trackingProgress?: number;
  trackingEta?: number;
  trackingDistanceLeft?: number;
  onDriverCall?: () => void;
  onDriverChat?: () => void;
}

function suggestionToAddress(s: AddressSuggestion): TaxiAddress {
  return {
    id: s.id,
    address: s.address,
    shortAddress: s.shortAddress,
    coordinates: s.coordinates,
  };
}

// ─── Главный компонент (Яндекс Go стиль — тёмная тема) ──────────────────────
export function OrderBottomSheet({
  order,
  trackingProgress = 0,
  trackingEta = 0,
  trackingDistanceLeft = 0,
  onDriverCall,
  onDriverChat,
}: OrderBottomSheetProps) {
  const [promoInput, setPromoInput] = useState('');
  const [cancellationReason, setCancellationReason] = useState<CancellationReason>('changed_plans');

  const {
    status,
    pickup,
    destination,
    stops,
    selectedTariff,
    tariffEstimates,
    selectedEstimate,
    paymentMethod,
    promoCode,
    order: activeOrder,
    isLoading,
    error,
    setPickup,
    setDestination,
    addStop,
    removeStop,
    selectTariff,
    setPaymentMethod,
    applyPromo,
    startSelectingRoute,
    goBack,
    createAndSearchDriver,
    cancelOrder,
    driverArrived,
    startTrip,
    completeTrip,
    submitRating,
    skipRating,
    clearError,
  } = order;

  const handlePickupSelect = useCallback(
    (suggestion: AddressSuggestion) => {
      setPickup(suggestionToAddress(suggestion));
    },
    [setPickup]
  );

  const handleDestinationSelect = useCallback(
    async (suggestion: AddressSuggestion) => {
      const addr = suggestionToAddress(suggestion);
      await setDestination(addr, pickup ?? undefined);
    },
    [setDestination, pickup]
  );

  const handleApplyPromo = useCallback(async () => {
    if (promoInput.trim()) {
      await applyPromo(promoInput.trim());
    }
  }, [promoInput, applyPromo]);

  // ─── idle — начальный экран (Яндекс Go стиль) ──────────────────────────
  if (status === 'idle') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">Куда едем?</h2>
        <button
          type="button"
          onClick={startSelectingRoute}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-4',
            'bg-white/8 hover:bg-white/12 rounded-2xl',
            'text-left transition-colors border border-white/5'
          )}
        >
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Search className="h-4 w-4 text-amber-400" />
          </div>
          <span className="text-white/50">Введите адрес назначения</span>
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={startSelectingRoute}
            className="flex items-center gap-2.5 px-4 py-3.5 bg-white/6 hover:bg-white/10 rounded-2xl text-sm font-medium transition-colors text-white border border-white/5"
          >
            <span className="text-lg">🏠</span> Домой
          </button>
          <button
            type="button"
            onClick={startSelectingRoute}
            className="flex items-center gap-2.5 px-4 py-3.5 bg-white/6 hover:bg-white/10 rounded-2xl text-sm font-medium transition-colors text-white border border-white/5"
          >
            <span className="text-lg">💼</span> На работу
          </button>
        </div>
      </div>
    );
  }

  // ─── selecting_route — ввод маршрута ──────────────────────────────────────
  if (status === 'selecting_route') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <button type="button" onClick={goBack} className="p-1.5 rounded-xl hover:bg-white/10 transition-colors">
            <ChevronDown className="h-5 w-5 text-white" />
          </button>
          <h2 className="text-lg font-bold text-white">Маршрут</h2>
        </div>

        <div className="relative bg-white/6 rounded-2xl overflow-hidden border border-white/5">
          {/* Линия соединения */}
          <div className="absolute left-[1.85rem] top-[3.4rem] bottom-[calc(50%+0.5rem)] w-0.5 bg-white/15 z-10" />

          {/* Откуда */}
          <div className="flex items-center border-b border-white/5">
            <div className="pl-3">
              <div className="w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-emerald-400/30" />
            </div>
            <AddressInput
              label="Откуда"
              value={pickup?.address ?? ''}
              placeholder="Откуда едем?"
              onSelect={handlePickupSelect}
              className="flex-1"
            />
          </div>

          {/* Куда */}
          <div className="flex items-center">
            <div className="pl-3">
              <div className="w-3.5 h-3.5 rounded-full bg-rose-400 ring-2 ring-rose-400/30" />
            </div>
            <AddressInput
              label="Куда"
              value={destination?.address ?? ''}
              placeholder="Куда едем?"
              onSelect={handleDestinationSelect}
              className="flex-1"
              autoFocus
            />
          </div>
        </div>

        {/* Промежуточные остановки */}
        {stops.map((stop, i) => (
          <div key={stop.id} className="flex items-center gap-2 bg-white/6 rounded-xl px-3 border border-white/5">
            <MapPin className="h-4 w-4 text-amber-400 flex-shrink-0" />
            <span className="flex-1 text-sm py-2.5 truncate text-white/80">{stop.address}</span>
            <button
              type="button"
              onClick={() => removeStop(i)}
              className="p-1 rounded-full hover:bg-white/10"
            >
              <X className="h-3.5 w-3.5 text-white/40" />
            </button>
          </div>
        ))}
      </div>
    );
  }

  // ─── selecting_tariff — выбор тарифа ──────────────────────────────────────
  if (status === 'selecting_tariff') {
    return (
      <div className="space-y-4">
        {/* Маршрут (компактный) */}
        <div className="flex items-center gap-2 text-sm">
          <button type="button" onClick={goBack} className="p-1.5 rounded-xl hover:bg-white/10">
            <ChevronDown className="h-5 w-5 text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <span className="text-white/50 truncate">{pickup?.shortAddress ?? pickup?.address}</span>
            <span className="text-amber-400 mx-1.5">&rarr;</span>
            <span className="font-medium text-white truncate">{destination?.shortAddress ?? destination?.address}</span>
          </div>
        </div>

        {/* Тарифы */}
        <TariffSelector
          estimates={tariffEstimates}
          selectedTariff={selectedTariff}
          onSelect={selectTariff}
          isLoading={isLoading && tariffEstimates.length === 0}
        />

        {/* Детали цены */}
        {selectedEstimate && (
          <PriceEstimate
            estimate={selectedEstimate}
            paymentMethod={paymentMethod}
            promoCode={promoCode}
          />
        )}

        {/* Промокод */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input
              type="text"
              placeholder="Промокод"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-white/10 rounded-xl bg-white/6 text-white placeholder:text-white/30 outline-none focus:border-amber-400/50 transition-colors"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-xl border-white/10 text-white hover:bg-white/10"
            onClick={handleApplyPromo}
            disabled={!promoInput.trim() || isLoading}
          >
            ОК
          </Button>
        </div>

        {/* Ошибка */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
            <span className="flex-1">{error}</span>
            <button type="button" onClick={clearError}><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Кнопка заказать — Яндекс-жёлтая */}
        <Button
          className="w-full h-14 text-base font-bold rounded-2xl bg-amber-400 hover:bg-amber-500 text-gray-950 shadow-lg shadow-amber-400/20"
          onClick={createAndSearchDriver}
          disabled={!selectedEstimate || isLoading}
        >
          {isLoading ? (
            <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Подождите...</>
          ) : (
            <>Заказать{selectedEstimate ? ` — ${Math.round(selectedEstimate.estimatedPrice)} \u20BD` : ''}</>
          )}
        </Button>
      </div>
    );
  }

  // ─── searching_driver — поиск водителя ────────────────────────────────────
  if (status === 'searching_driver') {
    return (
      <div className="space-y-4 py-4 text-center">
        {/* Анимация поиска — Яндекс-стиль */}
        <div className="relative w-20 h-20 mx-auto">
          <div className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping opacity-60" />
          <div className="absolute inset-2 rounded-full bg-amber-400/30 animate-ping" style={{ animationDelay: '0.3s' }} />
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-xl shadow-amber-400/30">
            <Car className="h-8 w-8 text-gray-950" />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-white">Ищем водителя</h3>
          <p className="text-sm text-white/40 mt-1">
            Подбираем лучшего водителя рядом с вами
          </p>
        </div>

        {/* Маршрут */}
        <div className="bg-white/6 rounded-xl px-4 py-3 text-sm text-left border border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-white/50 truncate">{pickup?.shortAddress}</span>
          </div>
          <div className="ml-1 pl-[0.2rem] border-l-2 border-dashed border-white/10 h-3 my-0.5" />
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
            <span className="font-medium text-white truncate">{destination?.shortAddress}</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full h-12 rounded-2xl border-2 text-rose-400 border-rose-400/20 hover:bg-rose-400/10 bg-transparent"
          onClick={() => cancelOrder('changed_plans')}
        >
          Отменить поиск
        </Button>
      </div>
    );
  }

  // ─── driver_found — водитель найден ──────────────────────────────────────
  if (status === 'driver_found' || status === 'driver_arriving') {
    if (!activeOrder?.driver) return null;

    return (
      <div className="space-y-4">
        <DriverCard
          driver={activeOrder.driver}
          status={status === 'driver_found' ? 'arriving' : 'arriving'}
          onCall={onDriverCall}
          onChat={onDriverChat}
        />

        <Button
          variant="outline"
          className="w-full h-12 rounded-2xl border-2 text-rose-400 border-rose-400/20 hover:bg-rose-400/10 bg-transparent text-sm"
          onClick={() => cancelOrder('changed_plans')}
        >
          Отменить поездку
        </Button>
      </div>
    );
  }

  // ─── driver_arrived — PIN-код ─────────────────────────────────────────────
  if (status === 'driver_arrived') {
    if (!activeOrder?.driver || !activeOrder.pinCode) return null;

    return (
      <div className="space-y-4">
        <DriverCard
          driver={activeOrder.driver}
          status="arrived"
          onCall={onDriverCall}
          onChat={onDriverChat}
        />

        {/* PIN-код — Яндекс-стиль */}
        <div className="bg-amber-400/10 border border-amber-400/20 rounded-2xl p-4 text-center">
          <p className="text-sm text-amber-300 mb-2">Покажите PIN водителю</p>
          <div className="flex items-center justify-center gap-3">
            {activeOrder.pinCode.split('').map((digit, i) => (
              <div
                key={i}
                className="w-12 h-14 rounded-xl bg-gray-900 border-2 border-amber-400/40 flex items-center justify-center text-2xl font-bold text-amber-400 shadow-sm"
              >
                {digit}
              </div>
            ))}
          </div>
          <p className="text-xs text-white/30 mt-3">
            Водитель введёт ваш PIN для подтверждения посадки
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-2xl border-2 text-rose-400 border-rose-400/20 hover:bg-rose-400/10 bg-transparent text-sm"
            onClick={() => cancelOrder('changed_plans')}
          >
            Отменить
          </Button>
          <Button
            className="flex-[2] h-12 rounded-2xl bg-amber-400 hover:bg-amber-500 text-gray-950 font-bold"
            onClick={() => startTrip(activeOrder.pinCode)}
          >
            Начать поездку
          </Button>
        </div>
      </div>
    );
  }

  // ─── in_trip — поездка ────────────────────────────────────────────────────
  if (status === 'in_trip') {
    if (!activeOrder) return null;

    return (
      <TripTracker
        pickupAddress={activeOrder.pickup.shortAddress ?? activeOrder.pickup.address}
        destinationAddress={activeOrder.destination?.shortAddress ?? activeOrder.destination?.address ?? '\u2014'}
        progress={trackingProgress}
        etaMinutes={trackingEta}
        distanceLeft={trackingDistanceLeft}
      />
    );
  }

  // ─── completed — поездка завершена ────────────────────────────────────────
  if (status === 'completed') {
    if (!activeOrder) return null;

    return (
      <div className="space-y-4 py-2 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-400/15 flex items-center justify-center">
          <span className="text-3xl">✓</span>
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">Поездка завершена</h3>
          <p className="text-white/40 text-sm mt-1">
            Вы прибыли в {activeOrder.destination?.shortAddress}
          </p>
        </div>
        <div className="text-3xl font-bold text-amber-400">
          {Math.round(activeOrder.finalPrice ?? activeOrder.estimatedPrice)} ₽
        </div>
        <Button
          className="w-full h-12 rounded-2xl bg-amber-400 hover:bg-amber-500 text-gray-950 font-bold"
          onClick={completeTrip}
        >
          Оценить поездку
        </Button>
      </div>
    );
  }

  // ─── rating — оценка ──────────────────────────────────────────────────────
  if (status === 'rating') {
    if (!activeOrder?.driver) {
      skipRating();
      return null;
    }

    return (
      <RatingSheet
        driverName={activeOrder.driver.name}
        tripPrice={activeOrder.finalPrice ?? activeOrder.estimatedPrice}
        onSubmit={submitRating}
        onSkip={skipRating}
        isSubmitting={isLoading}
      />
    );
  }

  return null;
}
