import { useState, useRef, useCallback } from 'react';
import { MapPin, Navigation, Plus, ChevronDown, Tag, X, Loader2, Car } from 'lucide-react';
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

// ─── Преобразование AddressSuggestion → TaxiAddress ─────────────────────────
function suggestionToAddress(s: AddressSuggestion): TaxiAddress {
  return {
    id: s.id,
    address: s.address,
    shortAddress: s.shortAddress,
    coordinates: s.coordinates,
  };
}

// ─── Главный компонент ────────────────────────────────────────────────────────
export function OrderBottomSheet({
  order,
  trackingProgress = 0,
  trackingEta = 0,
  trackingDistanceLeft = 0,
  onDriverCall,
  onDriverChat,
}: OrderBottomSheetProps) {
  const [promoInput, setPromoInput] = useState('');
  const [promoFocused, setPromoFocused] = useState(false);
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

  // ─── Выбор адреса откуда ─────────────────────────────────────────────────
  const handlePickupSelect = useCallback(
    (suggestion: AddressSuggestion) => {
      setPickup(suggestionToAddress(suggestion));
    },
    [setPickup]
  );

  // ─── Выбор адреса куда ───────────────────────────────────────────────────
  const handleDestinationSelect = useCallback(
    async (suggestion: AddressSuggestion) => {
      const addr = suggestionToAddress(suggestion);
      await setDestination(addr, pickup ?? undefined);
    },
    [setDestination, pickup]
  );

  // ─── Применить промокод ──────────────────────────────────────────────────
  const handleApplyPromo = useCallback(async () => {
    if (promoInput.trim()) {
      await applyPromo(promoInput.trim());
    }
  }, [promoInput, applyPromo]);

  // ─── Рендер контента по статусу ──────────────────────────────────────────

  // idle — начальный экран
  if (status === 'idle') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Куда едем?</h2>
        <button
          type="button"
          onClick={startSelectingRoute}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-4',
            'bg-muted/50 hover:bg-muted rounded-2xl',
            'text-left transition-colors'
          )}
        >
          <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center flex-shrink-0">
            <MapPin className="h-4 w-4 text-white" />
          </div>
          <span className="text-muted-foreground">Куда вы хотите ехать?</span>
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={startSelectingRoute}
            className="flex items-center gap-2.5 px-4 py-3 bg-muted/50 hover:bg-muted rounded-2xl text-sm font-medium transition-colors"
          >
            <span className="text-lg">🏠</span> Домой
          </button>
          <button
            type="button"
            onClick={startSelectingRoute}
            className="flex items-center gap-2.5 px-4 py-3 bg-muted/50 hover:bg-muted rounded-2xl text-sm font-medium transition-colors"
          >
            <span className="text-lg">💼</span> На работу
          </button>
        </div>
      </div>
    );
  }

  // selecting_route — ввод маршрута
  if (status === 'selecting_route') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <button type="button" onClick={goBack} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <ChevronDown className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-bold">Маршрут</h2>
        </div>

        {/* Поля ввода: от — до */}
        <div className="relative bg-muted/50 rounded-2xl overflow-hidden">
          {/* Линия соединения */}
          <div className="absolute left-[1.85rem] top-[3.4rem] bottom-[calc(50%+0.5rem)] w-0.5 bg-gray-300 z-10" />

          {/* Откуда */}
          <div className="flex items-center border-b border-border/50">
            <div className="pl-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />
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
              <div className="w-3 h-3 rounded-full bg-red-500 ring-2 ring-white" />
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
          <div key={stop.id} className="flex items-center gap-2 bg-muted/50 rounded-xl px-3">
            <MapPin className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <span className="flex-1 text-sm py-2.5 truncate">{stop.address}</span>
            <button
              type="button"
              onClick={() => removeStop(i)}
              className="p-1 rounded-full hover:bg-muted"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        ))}
      </div>
    );
  }

  // selecting_tariff — выбор тарифа и подтверждение заказа
  if (status === 'selecting_tariff') {
    return (
      <div className="space-y-4">
        {/* Маршрут (компактный) */}
        <div className="flex items-center gap-2 text-sm">
          <button type="button" onClick={goBack} className="p-1.5 rounded-full hover:bg-muted">
            <ChevronDown className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <span className="text-muted-foreground truncate">{pickup?.shortAddress ?? pickup?.address}</span>
            <span className="text-muted-foreground mx-1">→</span>
            <span className="font-medium truncate">{destination?.shortAddress ?? destination?.address}</span>
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
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Промокод"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
              className="w-full pl-9 pr-3 py-2.5 text-sm border-2 border-border rounded-xl bg-background outline-none focus:border-blue-400 transition-colors"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-xl"
            onClick={handleApplyPromo}
            disabled={!promoInput.trim() || isLoading}
          >
            Применить
          </Button>
        </div>

        {/* Ошибка */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
            <span className="flex-1">{error}</span>
            <button type="button" onClick={clearError}><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Кнопка заказать */}
        <Button
          className="w-full h-14 text-base font-semibold rounded-2xl"
          onClick={createAndSearchDriver}
          disabled={!selectedEstimate || isLoading}
        >
          {isLoading ? (
            <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Подождите…</>
          ) : (
            <>🚗 Заказать — {selectedEstimate ? `${Math.round(selectedEstimate.estimatedPrice)} ₽` : ''}</>
          )}
        </Button>
      </div>
    );
  }

  // searching_driver — поиск водителя
  if (status === 'searching_driver') {
    return (
      <div className="space-y-4 py-4 text-center">
        {/* Анимация поиска */}
        <div className="relative w-20 h-20 mx-auto">
          <div className="absolute inset-0 rounded-full bg-blue-100 animate-ping opacity-60" />
          <div className="absolute inset-2 rounded-full bg-blue-200 animate-ping animation-delay-150 opacity-60" />
          <div className="relative w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center shadow-xl">
            <Car className="h-8 w-8 text-white" />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold">Ищем водителя</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Подбираем лучшего водителя рядом с вами
          </p>
        </div>

        {/* Компактный маршрут */}
        <div className="bg-muted/50 rounded-xl px-4 py-3 text-sm text-left">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground truncate">{pickup?.shortAddress}</span>
          </div>
          <div className="ml-1 pl-[0.2rem] border-l-2 border-dashed border-gray-300 h-3 my-0.5" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="font-medium truncate">{destination?.shortAddress}</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full h-12 rounded-2xl border-2 text-red-600 border-red-200 hover:bg-red-50"
          onClick={() => cancelOrder('changed_plans')}
        >
          Отменить поиск
        </Button>
      </div>
    );
  }

  // driver_found — водитель найден
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
          className="w-full h-12 rounded-2xl border-2 text-red-600 border-red-200 hover:bg-red-50 text-sm"
          onClick={() => cancelOrder('changed_plans')}
        >
          Отменить поездку
        </Button>
      </div>
    );
  }

  // driver_arrived — водитель на месте (PIN-код)
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

        {/* PIN-код */}
        <div className="bg-blue-50 border-2 border-blue-100 rounded-2xl p-4 text-center">
          <p className="text-sm text-blue-700 mb-2">Покажите PIN водителю</p>
          <div className="flex items-center justify-center gap-3">
            {activeOrder.pinCode.split('').map((digit, i) => (
              <div
                key={i}
                className="w-12 h-14 rounded-xl bg-white border-2 border-blue-300 flex items-center justify-center text-2xl font-bold text-blue-700 shadow-sm"
              >
                {digit}
              </div>
            ))}
          </div>
          <p className="text-xs text-blue-600 mt-3">
            Водитель введёт ваш PIN для подтверждения посадки
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-2xl border-2 text-red-600 border-red-200 hover:bg-red-50 text-sm"
            onClick={() => cancelOrder('changed_plans')}
          >
            Отменить
          </Button>
          <Button
            className="flex-[2] h-12 rounded-2xl"
            onClick={() => startTrip(activeOrder.pinCode)}
          >
            Начать поездку
          </Button>
        </div>
      </div>
    );
  }

  // in_trip — поездка
  if (status === 'in_trip') {
    if (!activeOrder) return null;

    return (
      <TripTracker
        pickupAddress={activeOrder.pickup.shortAddress ?? activeOrder.pickup.address}
        destinationAddress={activeOrder.destination?.shortAddress ?? activeOrder.destination?.address ?? '—'}
        progress={trackingProgress}
        etaMinutes={trackingEta}
        distanceLeft={trackingDistanceLeft}
      />
    );
  }

  // completed — поездка завершена
  if (status === 'completed') {
    if (!activeOrder) return null;

    return (
      <div className="space-y-4 py-2 text-center">
        <div className="text-5xl">🎉</div>
        <div>
          <h3 className="text-xl font-bold">Поездка завершена!</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Вы прибыли в {activeOrder.destination?.shortAddress}
          </p>
        </div>
        <div className="text-3xl font-bold">
          {Math.round(activeOrder.finalPrice ?? activeOrder.estimatedPrice)} ₽
        </div>
        <Button
          className="w-full h-12 rounded-2xl"
          onClick={completeTrip}
        >
          Оценить поездку
        </Button>
      </div>
    );
  }

  // rating — оценка
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
